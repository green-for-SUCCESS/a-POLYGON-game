import Body from "../../node_modules/phaser/src/physics/arcade/Body.js";

import { SETTINGS, ENEMY_STATE } from "../../../shared-data/Constants.js";
import { getEnemyBodyMetrics } from "../../../shared-data/Geometry.js";
import { applyKnockbackToVelocity } from "../../../shared-data/Combat.js";
import { stepDragVelocity } from "../../../shared-data/Movement.js";

function enemyCenterX(enemy) {
    return enemy.x + enemy.width / 2;
}

function enemyCenterY(enemy) {
    return enemy.y + enemy.height / 2;
}

export function createEnemy(world, { x, rarity, stats }) {
    const metrics = getEnemyBodyMetrics(rarity);
    const enemy = new Body(world);

    enemy.x = x - metrics.width / 2;
    enemy.y = SETTINGS.ENTITY_SPAWN_HEIGHT - metrics.height / 2;
    enemy.setSize(metrics.width, metrics.height, false);

    world.add(enemy);

    enemy.rarity = rarity;
    enemy.radius = metrics.radius;
    enemy.apothem = metrics.apothem;
    enemy.health = stats.health;
    enemy.maxHealth = stats.health;
    enemy.damage = stats.damage;
    enemy.xp = stats.xp;
    enemy.stunRemaining = 0;
    enemy.mass = stats.mass;

    enemy.state = ENEMY_STATE.IDLE;
    enemy.setCollideWorldBounds(true);
    enemy.setBounce(0);

    enemy.direction = 1;
    enemy.patrolTimer =
        Math.random() *
            (SETTINGS.ENEMY_PATROL_DECISION_MAX - SETTINGS.ENEMY_PATROL_DECISION_MIN + 1) +
        SETTINGS.ENEMY_PATROL_DECISION_MIN;
    enemy.walkTimer = 0;
    enemy.walking = false;
    enemy.attackCooldown = 0;

    // AI writes intent only; stepEnemyMovement turns it into force -> velocity.
    enemy.moveIntent = 0;
    enemy.moveForceScale = SETTINGS.ENEMY_PATROL_FORCE_SCALE;

    for (const ground of world.staticBodies) {
        world.addCollider(enemy, ground);
    }

    return enemy;
}

export { enemyCenterX, enemyCenterY };

// Force -> acceleration (÷ mass) -> velocity, with drag always applied, same
// model as the player. Knockback impulses added to body.velocity decay through
// this same drag. Position is never touched; Arcade integrates velocity.
export function stepEnemyMovement(enemies, deltaMs) {
    const dt = Math.max(0, deltaMs) / 1000;

    for (const [, { body }] of enemies) {
        const force = body.moveIntent * SETTINGS.ENEMY_MOVE_FORCE * body.moveForceScale;

        body.velocity.x = stepDragVelocity(
            body.velocity.x,
            force,
            body.mass,
            SETTINGS.ENEMY_DRAG_COEFFICIENT,
            dt
        );
    }
}

export function updateEnemyAI(enemies, players, deltaMs) {
    for (const [, { body: enemy }] of enemies) {
        if (enemy.stunRemaining > 0) {
            enemy.stunRemaining -= deltaMs;
            enemy.moveIntent = 0;
            continue;
        }

        if (enemy.state !== ENEMY_STATE.IDLE) continue;

        if (enemy.attackCooldown > 0) {
            enemy.attackCooldown -= deltaMs;
            if (enemy.attackCooldown < 0) enemy.attackCooldown = 0;
        }

        const nearest = _nearestPlayer(enemy, players);

        if (!nearest) {
            _patrol(enemy, deltaMs);
            continue;
        }

        const { player, dist, dx } = nearest;

        if (dist <= SETTINGS.ENEMY_ATTACK_RANGE / 2 && enemy.attackCooldown <= 0) {
            startEnemyAttack(enemy, player, players);
            continue;
        }

        if (dist < SETTINGS.ENEMY_FRONT_RANGE) {
            enemy.walking = false;
            const chaseDir = dx > 0 ? 1 : -1;
            enemy.direction = chaseDir;
            enemy.moveIntent = chaseDir;
            enemy.moveForceScale = 1;
        } else {
            _patrol(enemy, deltaMs);
        }
    }
}

function _nearestPlayer(enemy, players) {
    let nearestDist = Infinity;
    let nearestPlayer = null;
    let nearestDx = 0;

    const cx = enemyCenterX(enemy);
    const cy = enemyCenterY(enemy);

    for (const [, player] of players) {
        if (player.health <= 0) continue;
        if (!player.spawnExited) continue;

        const dx = player.x - cx;
        const dy = player.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < nearestDist) {
            nearestDist = dist;
            nearestPlayer = player;
            nearestDx = dx;
        }
    }

    if (!nearestPlayer) return null;
    return { player: nearestPlayer, dist: nearestDist, dx: nearestDx };
}

function _patrol(enemy, deltaMs) {
    enemy.moveForceScale = SETTINGS.ENEMY_PATROL_FORCE_SCALE;

    if (!enemy.walking) {
        enemy.patrolTimer -= deltaMs;
    }

    if (enemy.patrolTimer <= 0) {
        enemy.patrolTimer =
            Math.random() *
                (SETTINGS.ENEMY_PATROL_DECISION_MAX - SETTINGS.ENEMY_PATROL_DECISION_MIN + 1) +
            SETTINGS.ENEMY_PATROL_DECISION_MIN;

        if (Math.random() < SETTINGS.ENEMY_PATROL_MOVE_CHANCE) {
            enemy.walking = true;
            enemy.direction = Math.random() < 0.5 ? -1 : 1;
            enemy.walkTimer = Math.random() * (1200 - 300 + 1) + 300;
        } else {
            enemy.walking = false;
        }
    }

    if (enemy.walking) {
        enemy.moveIntent = enemy.direction;
        enemy.walkTimer -= deltaMs;

        if (enemy.walkTimer <= 0) {
            enemy.walking = false;
            enemy.moveIntent = 0;
            enemy.patrolTimer = Math.random() * (2000 - 500 + 1) + 500;
        }
    } else {
        enemy.moveIntent = 0;
    }
}

export function startEnemyAttack(enemy, targetPlayer, allPlayers) {
    enemy.state = ENEMY_STATE.WINDUP;
    // Existing attack commitment: the enemy plants its feet when winding up.
    enemy.moveIntent = 0;
    enemy.setVelocity(0, 0);

    enemy.attackDirection = Math.atan2(
        targetPlayer.y - enemyCenterY(enemy),
        targetPlayer.x - enemyCenterX(enemy)
    );

    enemy._attackTimeout = SETTINGS.ENEMY_ATTACK_DELAY;
    enemy._attackPlayers = allPlayers;
}

export function tickEnemyAttack(enemy, deltaMs) {
    if (enemy.stunRemaining > 0) {
        return;
    }

    if (enemy.state === ENEMY_STATE.WINDUP) {
        enemy._attackTimeout -= deltaMs;

        if (enemy._attackTimeout <= 0) {
            return _executeEnemyAttack(enemy);
        }
    } else if (enemy.state === ENEMY_STATE.ATTACK) {
        enemy._attackDurationRemaining -= deltaMs;

        if (enemy._attackDurationRemaining <= 0) {
            enemy.state = ENEMY_STATE.COOLDOWN;
            enemy._cooldownRemaining = SETTINGS.ENEMY_ATTACK_COOLDOWN;
        }
    } else if (enemy.state === ENEMY_STATE.COOLDOWN) {
        enemy._cooldownRemaining -= deltaMs;

        if (enemy._cooldownRemaining <= 0) {
            enemy.state = ENEMY_STATE.IDLE;
            enemy.attackCooldown = SETTINGS.ENEMY_ATTACK_COOLDOWN;
        }
    }
}

function _executeEnemyAttack(enemy) {
    enemy.state = ENEMY_STATE.ATTACK;
    enemy.attackOriginX = enemyCenterX(enemy);
    enemy.attackOriginY = enemyCenterY(enemy);
    enemy._attackDurationRemaining = SETTINGS.ENEMY_ATTACK_DURATION;

    return _damagePlayersInFan(enemy, enemy._attackPlayers);
}

// Single hit path for every player attack on an enemy. Knockback is mass-aware;
// stun is opt-in per attack (Fastfall passes stunMs > 0, Slash passes 0).
export function applyEnemyHit(body, { damage, fromX, fromY, strength, stunMs = 0 }) {
    body.health -= damage;

    applyKnockbackToVelocity(
        body.velocity,
        fromX,
        fromY,
        enemyCenterX(body),
        enemyCenterY(body),
        strength,
        { mass: body.mass }
    );

    if (stunMs > 0) {
        body.stunRemaining = Math.max(body.stunRemaining || 0, stunMs);
    }
}

// Player Slash attack: a narrow directional arc (PLAYER_SLASH_ARC is much
// smaller than ENEMY_ATTACK_SWEEP), tested with a dot product against each
// enemy's normalized direction from the origin rather than atan2, since this
// runs against every live enemy (up to MAX_ENEMIES) on every click.
export function applySlashToEnemies(enemies, originX, originY, dirX, dirY, damage) {
    const halfArcRad = (SETTINGS.PLAYER_SLASH_ARC / 2) * (Math.PI / 180);
    const cosHalfArc = Math.cos(halfArcRad);
    const deadIds = [];

    for (const [id, { body }] of enemies) {
        const ex = enemyCenterX(body);
        const ey = enemyCenterY(body);
        const dx = ex - originX;
        const dy = ey - originY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > SETTINGS.PLAYER_SLASH_RANGE || distance < 1e-6) {
            continue;
        }

        const dot = (dx / distance) * dirX + (dy / distance) * dirY;
        if (dot < cosHalfArc) {
            continue;
        }

        // Slash: damage + knockback, never stun.
        applyEnemyHit(body, { damage, fromX: originX, fromY: originY, strength: SETTINGS.PLAYER_SLASH_KNOCKBACK, stunMs: 0 });

        if (body.health <= 0) {
            deadIds.push(id);
        }
    }

    return deadIds;
}

function _damagePlayersInFan(enemy, players) {
    const halfSweep = (SETTINGS.ENEMY_ATTACK_SWEEP / 2) * (Math.PI / 180);
    const hits = [];

    for (const [sessionId, player] of players) {
        if (player.health <= 0) continue;
        if (!player.spawnExited) continue;

        const dx = player.x - enemy.attackOriginX;
        const dy = player.y - enemy.attackOriginY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > SETTINGS.ENEMY_ATTACK_RANGE) continue;

        const playerAngle = Math.atan2(dy, dx);
        let angleDiff = playerAngle - enemy.attackDirection;

        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        if (Math.abs(angleDiff) <= halfSweep) {
            player.health = Math.max(0, player.health - enemy.damage);
            hits.push({
                sessionId,
                pusherX: enemy.attackOriginX,
                pusherY: enemy.attackOriginY,
                strength: SETTINGS.ENEMY_KNOCKBACK,
            });
        }
    }

    return hits;
}
