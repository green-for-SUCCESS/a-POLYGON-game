import World from "../../node_modules/phaser/src/physics/arcade/World.js";
import StaticBody from "../../node_modules/phaser/src/physics/arcade/StaticBody.js";

import { SETTINGS } from "../../../shared-data/Constants.js";
import { blockWidth, blockHeight } from "../../../shared-data/Environment.js";
import { createEnemy, updateEnemyAI, tickEnemyAttack } from "./Enemies.js";

const SPAWN_INTERVAL_MS = 1000;
export class HeadlessGame {

    constructor() {
        const fakeScene = {
            sys: {
                scale: {
                    width: SETTINGS.WORLD_WIDTH,
                    height: SETTINGS.WORLD_HEIGHT,
                },
            },
        };

        this.world = new World(fakeScene, {
            gravity: { x: 0, y: SETTINGS.GRAVITY },
            width: SETTINGS.WORLD_WIDTH,
            height: SETTINGS.WORLD_HEIGHT,
        });

        this.enemies = new Map();
        this.players = null;
        this.enemySpawnTimer = 0;
        this.nextEnemyId = 0;
        this.pendingKnockbacks = [];

        this._setupGround();
    }

    _setupGround() {
        // One continuous floor avoids seam gaps and StaticBody setter
        // double-inserts that were letting enemies fall through the tiles.
        const groundTop = SETTINGS.WORLD_HEIGHT - 32 - blockHeight / 2;
        const ground = new StaticBody(this.world);

        ground.setSize(SETTINGS.WORLD_WIDTH + blockWidth, blockHeight, false);
        ground.position.set(-blockWidth / 2, groundTop);
        ground.updateCenter();

        this.world.add(ground);
    }

    setPlayers(players) {
        this.players = players;
    }

    update(deltaMs) {
        this.enemySpawnTimer += deltaMs;

        while (this.enemySpawnTimer >= SPAWN_INTERVAL_MS) {
            this.enemySpawnTimer -= SPAWN_INTERVAL_MS;
            this._trySpawnEnemy();
        }

        if (this.players) {
            updateEnemyAI(this.enemies, this.players, deltaMs);
        }

        for (const [, { body }] of this.enemies) {
            const hits = tickEnemyAttack(body, deltaMs);
            if (hits?.length) {
                this.pendingKnockbacks.push(...hits);
            }
        }

        this.world.step(deltaMs / 1000);
    }

    resolveFastFallHits() {
        if (!this.players) {
            return;
        }

        const size = SETTINGS.PLAYER_SIZE;
        const hitIds = new Set();

        for (const [sessionId, player] of this.players) {
            if (!player.isFastFalling || player.health <= 0) {
                continue;
            }

            for (const [id, { body }] of this.enemies) {
                const enemyX = body.x + size / 2;
                const enemyY = body.y + size / 2;

                if (
                    Math.abs(player.x - enemyX) < size &&
                    Math.abs(player.y - enemyY) < size
                ) {
                    hitIds.add(id);
                    this.pendingKnockbacks.push({
                        sessionId,
                        pusherX: enemyX,
                        pusherY: enemyY,
                        strength: SETTINGS.ENEMY_KNOCKBACK,
                    });
                }
            }
        }

        for (const id of hitIds) {
            this._killEnemy(id);
        }
    }

    flushKnockbacks() {
        const events = this.pendingKnockbacks;
        this.pendingKnockbacks = [];
        return events;
    }

    _killEnemy(id) {
        const enemy = this.enemies.get(id);

        if (!enemy) {
            return;
        }

        this.world.disableBody(enemy.body);
        this.enemies.delete(id);
    }

    _trySpawnEnemy() {
        if (this.enemies.size >= SETTINGS.MAX_ENEMIES) {
            return;
        }

        if (Math.random() >= SETTINGS.ENEMY_SPAWN_CHANCE) {
            return;
        }

        this.spawnEnemy();
    }

    spawnEnemy() {
        const id = String(this.nextEnemyId++);
        const body = createEnemy(this.world);

        this.enemies.set(id, { body });

        return id;
    }

    syncEnemiesTo(enemiesState) {
        for (const [id, { body }] of this.enemies) {
            const enemyState = enemiesState.get(id);

            if (!enemyState) {
                continue;
            }

            // body x/y are top-left; store sprite-center coords for clients
            enemyState.x = body.x + SETTINGS.PLAYER_SIZE / 2;
            enemyState.y = body.y + SETTINGS.PLAYER_SIZE / 2;
            enemyState.velocityX = body.velocity.x;
            enemyState.velocityY = body.velocity.y;
            enemyState.state = body.state ?? 0;
            enemyState.attackDirection = body.attackDirection ?? 0;
        }
    }
}
