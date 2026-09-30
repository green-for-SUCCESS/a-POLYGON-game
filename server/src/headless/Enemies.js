import Body from "../../node_modules/phaser/src/physics/arcade/Body.js";

import { SETTINGS, ENEMY_STATE } from "../../../shared-data/Constants.js";
import { getEnemyBodyMetrics } from "../../../shared-data/Geometry.js";
import { applyKnockbackToVelocity } from "../../../shared-data/Combat.js";

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

    for (const ground of world.staticBodies) {
        world.addCollider(enemy, ground);
    }

    return enemy;
}

export { enemyCenterX, enemyCenterY };

export function updateEnemyAI(enemies, players, deltaMs) {
    for (const [, { body: enemy }] of enemies) {
        if (enemy.stunRemaining > 0) {
            enemy.stunRemaining -= deltaMs;
            _decayKnockbackVelocity(enemy, deltaMs);
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
            enemy.setVelocityX(
                SETTINGS.ENEMY_PATROL_SPEED * SETTINGS.ENEMY_CHASE_SPEED_MULT * chaseDir
            );
        } else {
            _patrol(enemy, deltaMs);
        }
    }
}

// Only runs while an enemy is stunned (i.e. exactly the window during which AI
// has ceded control of its velocity to a knockback impulse). Decays horizontal
// speed so a hit doesn't send the enemy sliding at near-full velocity for the
// whole stun duration. Vertical velocity is left alone — gravity/ground
// collision already resolve it.
function _decayKnockbackVelocity(enemy, deltaMs) {
    const decay = Math.pow(SETTINGS.ENEMY_KNOCKBACK_VELOCITY_DECAY, deltaMs / 1000);
    enemy.velocity.x *= decay;
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
        enemy.setVelocityX(SETTINGS.ENEMY_PATROL_SPEED * enemy.direction);
        enemy.walkTimer -= deltaMs;

        if (enemy.walkTimer <= 0) {
            enemy.walking = false;
            enemy.setVelocityX(0);
            enemy.patrolTimer = Math.random() * (2000 - 500 + 1) + 500;
        }
    } else {
        enemy.setVelocityX(0);
    }
}

export function startEnemyAttack(enemy, targetPlayer, allPlayers) {
    enemy.state = ENEMY_STATE.WINDUP;
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

        body.health -= damage;
        applyKnockbackToVelocity(body.velocity, originX, originY, ex, ey, SETTINGS.PLAYER_SLASH_KNOCKBACK);

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
