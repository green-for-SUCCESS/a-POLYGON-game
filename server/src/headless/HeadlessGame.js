import World from "../../node_modules/phaser/src/physics/arcade/World.js";
import StaticBody from "../../node_modules/phaser/src/physics/arcade/StaticBody.js";

import { SETTINGS } from "../../../shared-data/Constants.js";
import { blockWidth, blockHeight } from "../../../shared-data/Environment.js";
import { getEnemyStats, getPlayerStatsFromXP, rollEnemyRarity } from "../../../shared-data/Progression.js";
import { clampPlayerOutOfSpawn, getCombatZones, getSpawnZoneEnd, getZoneAtX } from "../../../shared-data/Zones.js";
import { getLinearFalloff, getFastfallCooldown } from "../../../shared-data/Combat.js";
import { createEnemy, updateEnemyAI, tickEnemyAttack, stepEnemyMovement, applySlashToEnemies, applyEnemyHit, enemyCenterX, enemyCenterY } from "./Enemies.js";

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
        this.nextEnemyId = 0;
        this.pendingKnockbacks = [];
        this.pendingPersists = [];
        this.pendingFastfallDenials = [];

        this._setupGround();
    }

    _setupGround() {
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

    applyRunStart(player) {
        const stats = getPlayerStatsFromXP(player.xp || 0);

        player.maxHealth = stats.maxHealth;
        player.health = stats.maxHealth;
        player.runXP = 0;
        player.spawnExited = false;
        player.isFastFalling = false;
        player.x = SETTINGS.PLAYER_START_X;
        player.y = SETTINGS.ENTITY_SPAWN_HEIGHT;
        player._stats = stats;
        player.fastfallArmed = false;
        player.fastfallCooldownRemaining = 0;
        player.fastfallReady = true;
        player.fastfallDenied = false;
        player.slashCooldownRemaining = 0;
        player.runEnded = false;
    }

    applyPlayerInput(sessionId, data) {
        const player = this.players?.get(sessionId);
        if (!player || player.health <= 0) {
            return;
        }

        player.y = data.y;
        this._applyFastfallRequest(sessionId, player, !!data.isFastFalling);
        this._enforceSpawnBoundary(player, data.x);
    }

    // The cooldown is an activation gate: a request made during cooldown never
    // enters the fastfall state (so no armed landing, no AOE, no cooldown restart).
    // A denied request is latched until the client releases Down, so holding or
    // re-pressing Down cannot queue a fastfall for when the cooldown expires.
    _applyFastfallRequest(sessionId, player, requested) {
        if (!requested) {
            player.isFastFalling = false;
            player.fastfallDenied = false;
            return;
        }

        if (player.isFastFalling) {
            return;
        }

        if (player.fastfallDenied) {
            return;
        }

        if (player.fastfallCooldownRemaining > 0) {
            player.fastfallDenied = true;
            this.pendingFastfallDenials.push({ sessionId });
            return;
        }

        player.isFastFalling = true;
        player.fastfallArmed = true;

        // No AOE can happen inside the protected spawn zone, so don't burn the cooldown there.
        if (player.spawnExited) {
            player.fastfallCooldownRemaining = getFastfallCooldown();
            player.fastfallReady = false;
        }
    }

    applyPlayerSlash(sessionId, data) {
        const player = this.players?.get(sessionId);
        if (!player || player.health <= 0 || !player.spawnExited) {
            return;
        }

        if (player.slashCooldownRemaining > 0) {
            return;
        }

        const dx = Number(data?.dx);
        const dy = Number(data?.dy);
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
            return;
        }

        const length = Math.hypot(dx, dy);
        if (length < 1e-6) {
            return;
        }

        const dirX = dx / length;
        const dirY = dy / length;

        player.slashCooldownRemaining = SETTINGS.PLAYER_SLASH_COOLDOWN;
        player.slashDirX = dirX;
        player.slashDirY = dirY;
        player.slashSeq = (player.slashSeq || 0) + 1;

        const stats = player._stats || getPlayerStatsFromXP(player.xp || 0);
        const deadIds = applySlashToEnemies(this.enemies, player.x, player.y, dirX, dirY, stats.damage);

        for (const id of deadIds) {
            this._killEnemy(id, player);
        }
    }

    _enforceSpawnBoundary(player, requestedX = player.x) {
        const spawnEnd = getSpawnZoneEnd();

        if (!player.spawnExited && requestedX >= spawnEnd) {
            player.spawnExited = true;
        }

        player.x = clampPlayerOutOfSpawn(requestedX, player.spawnExited);
    }

    _tickPlayerCooldowns(player, deltaMs) {
        if (player.fastfallCooldownRemaining > 0) {
            player.fastfallCooldownRemaining = Math.max(0, player.fastfallCooldownRemaining - deltaMs);

            if (player.fastfallCooldownRemaining === 0) {
                player.fastfallReady = true;
            }
        }

        if (player.slashCooldownRemaining > 0) {
            player.slashCooldownRemaining = Math.max(0, player.slashCooldownRemaining - deltaMs);
        }
    }

    killPlayer(sessionId) {
        const player = this.players?.get(sessionId);
        if (!player) {
            return;
        }

        player.health = 0;
        this._endRun(sessionId, player);
    }

    respawnPlayer(sessionId) {
        const player = this.players?.get(sessionId);
        if (!player || player.health > 0) {
            return;
        }

        this.applyRunStart(player);
    }

    update(deltaMs) {
        if (this.players) {
            for (const [, player] of this.players) {
                if (player.health > 0) {
                    this._enforceSpawnBoundary(player);
                    this._tickPlayerCooldowns(player, deltaMs);
                }
            }
        }

        this._trySpawnEnemies(deltaMs);
        this._resolveFastFallLandings();

        if (this.players) {
            updateEnemyAI(this.enemies, this.players, deltaMs);
        }

        for (const [, { body }] of this.enemies) {
            const hits = tickEnemyAttack(body, deltaMs);
            if (hits?.length) {
                this.pendingKnockbacks.push(...hits);
            }
        }

        stepEnemyMovement(this.enemies, deltaMs);

        this.world.step(deltaMs / 1000);
        this._collectDeaths();
    }

    _trySpawnEnemies(deltaMs) {
        const dt = Math.max(0, deltaMs) / 1000;
        const occupied = this._occupiedCombatZoneIds();

        for (const zone of getCombatZones()) {
            if (!occupied.has(zone.id)) {
                continue;
            }

            if (this.enemies.size >= SETTINGS.MAX_ENEMIES) {
                return;
            }

            if (this._countEnemiesInZone(zone) >= zone.cap) {
                continue;
            }

            const chance = 1 - Math.pow(1 - zone.spawnChancePerSecond, dt);
            if (Math.random() >= chance) {
                continue;
            }

            this.spawnEnemyInZone(zone);
        }
    }

    _occupiedCombatZoneIds() {
        const occupied = new Set();
        if (!this.players) {
            return occupied;
        }

        for (const [, player] of this.players) {
            if (player.health <= 0 || !player.spawnExited) {
                continue;
            }

            const zone = getZoneAtX(player.x);
            if (zone && !zone.protected) {
                occupied.add(zone.id);
            }
        }

        return occupied;
    }

    _countEnemiesInZone(zone) {
        let count = 0;

        for (const [, { body }] of this.enemies) {
            const x = enemyCenterX(body);
            if (x >= zone.start && (x < zone.end || zone.end >= SETTINGS.WORLD_WIDTH)) {
                count += 1;
            }
        }

        return count;
    }

    spawnEnemyInZone(zone) {
        const padding = 40;
        const minX = zone.start + padding;
        const maxX = Math.max(minX, zone.end - padding);
        const x = minX + Math.random() * (maxX - minX);
        const rarity = rollEnemyRarity();
        const stats = getEnemyStats(rarity);
        const id = String(this.nextEnemyId++);
        const body = createEnemy(this.world, { x, rarity, stats });

        this.enemies.set(id, { body });
        return id;
    }

    _resolveFastFallLandings() {
        if (!this.players) {
            return;
        }

        for (const [, player] of this.players) {
            if (player.health <= 0) {
                player.fastfallArmed = false;
                continue;
            }

            if (player.isFastFalling) {
                continue;
            }

            if (!player.fastfallArmed) {
                continue;
            }

            player.fastfallArmed = false;

            if (this._isNearGround(player.y)) {
                this.applyFastfallLanding(player);
            }
        }
    }

    _isNearGround(playerY) {
        const groundY = SETTINGS.WORLD_HEIGHT - 32;
        return playerY > groundY - SETTINGS.PLAYER_SIZE - 48;
    }

    applyFastfallLanding(player) {
        if (!player.spawnExited) {
            return;
        }

        const stats = player._stats || getPlayerStatsFromXP(player.xp || 0);
        const radius = stats.fastfallRadius;
        const deadIds = [];

        for (const [id, { body }] of this.enemies) {
            const ex = enemyCenterX(body);
            const ey = enemyCenterY(body);
            const dx = ex - player.x;
            const dy = ey - player.y;
            const distance = Math.hypot(dx, dy);

            if (distance > radius) {
                continue;
            }

            const falloff = getLinearFalloff(distance, radius);
            applyEnemyHit(body, {
                damage: stats.fastfallDamage * falloff,
                fromX: player.x,
                fromY: player.y,
                strength: stats.fastfallKnockback * falloff,
                stunMs: stats.fastfallStunDuration * falloff,
            });

            if (body.health <= 0) {
                deadIds.push(id);
            }
        }

        for (const id of deadIds) {
            this._killEnemy(id, player);
        }
    }

    _killEnemy(id, killer) {
        const enemy = this.enemies.get(id);
        if (!enemy) {
            return;
        }

        if (killer && killer.health > 0) {
            killer.runXP = (killer.runXP || 0) + (enemy.body.xp || 0);
        }

        this.world.disableBody(enemy.body);
        this.enemies.delete(id);
    }

    _collectDeaths() {
        if (!this.players) {
            return;
        }

        for (const [sessionId, player] of this.players) {
            if (player.health <= 0) {
                this._endRun(sessionId, player);
            }
        }
    }

    _endRun(sessionId, player) {
        if (player.runEnded) {
            return;
        }

        player.runEnded = true;
        player.health = 0;
        player.xp = (player.xp || 0) + (player.runXP || 0);
        player.runXP = 0;

        this.pendingPersists.push({
            sessionId,
            xp: player.xp,
        });
    }

    flushKnockbacks() {
        const events = this.pendingKnockbacks;
        this.pendingKnockbacks = [];
        return events;
    }

    flushFastfallDenials() {
        const events = this.pendingFastfallDenials;
        this.pendingFastfallDenials = [];
        return events;
    }

    flushPersists() {
        const events = this.pendingPersists;
        this.pendingPersists = [];
        return events;
    }

    getEnemySnapshot() {
        const snapshot = [];

        for (const [, { body }] of this.enemies) {
            snapshot.push({
                x: enemyCenterX(body),
                y: enemyCenterY(body),
                rarity: body.rarity ?? 0,
                velocityX: body.velocity.x,
                velocityY: body.velocity.y,
                state: body.state ?? 0,
                attackDirection: body.attackDirection ?? 0,
                health: body.health ?? 0,
                maxHealth: body.maxHealth ?? 0,
            });
        }

        return snapshot;
    }
}
