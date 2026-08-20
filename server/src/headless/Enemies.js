import Body from "../../node_modules/phaser/src/physics/arcade/Body.js";

import { SETTINGS, ENEMY_STATE } from "../../../shared-data/Constants.js";

// =====================================================
// ENEMY SPAWN
// =====================================================

export function createEnemy(world) {
    const x = Math.floor(
        Math.random() * (SETTINGS.WORLD_WIDTH - 200) + 100
    );

    const enemy = new Body(world);

    enemy.x = x;
    enemy.y = SETTINGS.ENTITY_SPAWN_HEIGHT;

    enemy.setSize(SETTINGS.PLAYER_SIZE, SETTINGS.PLAYER_SIZE, false);

    world.add(enemy);

    enemy.state = ENEMY_STATE.IDLE;
    enemy.setCollideWorldBounds(true);
    enemy.setBounce(0);

    enemy.direction = 1;
    enemy.patrolTimer =
        Math.random() *
        (
            SETTINGS.ENEMY_PATROL_DECISION_MAX -
            SETTINGS.ENEMY_PATROL_DECISION_MIN + 1
        ) +
        SETTINGS.ENEMY_PATROL_DECISION_MIN;
    enemy.walkTimer = 0;
    enemy.walking = false;

    enemy.attackCooldown = 0;

    for (const ground of world.staticBodies) {
        world.addCollider(enemy, ground);
    }

    return enemy;
}

// =====================================================
// ENEMY AI
// =====================================================

// players is a Colyseus MapSchema of PlayerState ({ x, y, health })
export function updateEnemyAI(enemies, players, deltaMs) {
    for (const [, { body: enemy }] of enemies) {
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

function _enemyCenterX(enemy) {
    return enemy.x + SETTINGS.PLAYER_SIZE / 2;
}

function _enemyCenterY(enemy) {
    return enemy.y + SETTINGS.PLAYER_SIZE / 2;
}

function _nearestPlayer(enemy, players) {
    let nearestDist = Infinity;
    let nearestPlayer = null;
    let nearestDx = 0;

    const cx = _enemyCenterX(enemy);
    const cy = _enemyCenterY(enemy);

    for (const [, player] of players) {
        if (player.health <= 0) continue;

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
            enemy.walkTimer =
                Math.random() * (1200 - 300 + 1) + 300;
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
            enemy.patrolTimer =
                Math.random() * (2000 - 500 + 1) + 500;
        }
    } else {
        enemy.setVelocityX(0);
    }
}

// =====================================================
// ENEMY ATTACK
// =====================================================

export function startEnemyAttack(enemy, targetPlayer, allPlayers) {
    enemy.state = ENEMY_STATE.WINDUP;
    enemy.setVelocity(0, 0);

    enemy.attackDirection = Math.atan2(
        targetPlayer.y - _enemyCenterY(enemy),
        targetPlayer.x - _enemyCenterX(enemy)
    );

    enemy._attackTimeout = SETTINGS.ENEMY_ATTACK_DELAY;
    enemy._attackPlayers = allPlayers;
}

// Called from HeadlessGame.update() each tick to advance attack state timers
export function tickEnemyAttack(enemy, deltaMs) {
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
    enemy.attackOriginX = _enemyCenterX(enemy);
    enemy.attackOriginY = _enemyCenterY(enemy);
    enemy._attackDurationRemaining = SETTINGS.ENEMY_ATTACK_DURATION;

    return _damagePlayersInFan(enemy, enemy._attackPlayers);
}

function _damagePlayersInFan(enemy, players) {
    const halfSweep = (SETTINGS.ENEMY_ATTACK_SWEEP / 2) * (Math.PI / 180);
    const hits = [];

    for (const [sessionId, player] of players) {
        if (player.health <= 0) continue;

        const dx = player.x - enemy.attackOriginX;
        const dy = player.y - enemy.attackOriginY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > SETTINGS.ENEMY_ATTACK_RANGE) continue;

        const playerAngle = Math.atan2(dy, dx);
        let angleDiff = playerAngle - enemy.attackDirection;

        // Wrap angle to [-PI, PI]
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        if (Math.abs(angleDiff) <= halfSweep) {
            player.health = Math.max(0, player.health - SETTINGS.ENEMY_ATTACK_DAMAGE);
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
