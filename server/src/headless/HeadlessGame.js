import World from "../../node_modules/phaser/src/physics/arcade/World.js";
import StaticBody from "../../node_modules/phaser/src/physics/arcade/StaticBody.js";

import { SETTINGS } from "../../../shared-data/Constants.js";
import { blockWidth, blockHeight } from "../../../shared-data/Environment.js";
import { getEnemyStats, getPlayerStatsFromXP, getLevelFromXP, rollEnemyRarity, sanitizeXP } from "../../../shared-data/Progression.js";
import { clampPlayerOutOfSpawn, getCombatZones, getSpawnZoneEnd } from "../../../shared-data/Zones.js";
import { getLinearFalloff, getFastfallCooldown } from "../../../shared-data/Combat.js";
import { createEnemy, updateEnemyAI, tickEnemyAttack, stepEnemyMovement, applySlashToEnemies, applyEnemyHit, enemyCenterX, enemyCenterY } from "./Enemies.js";
import { applyPlayerDamage, resetPlayerHealthTimers, tickPlayerRegen } from "./PlayerHealth.js";
import { GAME_MODES, normalizeGameMode } from "../../../shared-data/GameModes.js";

export class HeadlessGame {

    // `mode` comes from the room type on the server (BattleRoom / FfaRoom),
    // never from a client. Both modes use the player's one persistent XP.
    // Main mode: enemies, XP banked at death. FFA: no enemies, PvP on, and
    // each server-credited kill is added to persistent XP and saved at once.
    constructor({ mode = GAME_MODES.MAIN } = {}) {
        this.mode = normalizeGameMode(mode);
        this.isFFA = this.mode === GAME_MODES.FFA;

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
            // See PHYSICS_FPS: a fixed-step rate high enough that no body can
            // cross the ground's thickness within a single physics substep.
            fps: SETTINGS.PHYSICS_FPS,
            // The only collisions here are explicit enemy-vs-ground collider
            // pairs, which never query the dynamic R-tree. With the tree on,
            // Phaser rebuilt it from every body on every substep (240/s) for
            // nothing.
            useTree: false,
        });

        this._simTimeMs = 0;

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

    // The XP that sets this player's level/stats: their persistent XP, in
    // every mode (main-mode run XP only counts once it is banked at death).
    _progressXP(player) {
        return player.xp || 0;
    }

    // The one place persistent XP changes are queued for saving. BattleRoom
    // gives each one a unique event id and sends it to the player's client,
    // which applies it to Firestore (account) or localStorage (guest)
    // idempotently. `kind` is "add" (amount is a delta) or "set" (/setxp).
    _queueXPEvent(sessionId, kind, amount) {
        if (!(amount > 0) && kind === "add") {
            return;
        }
        this.pendingPersists.push({ sessionId, kind, amount: sanitizeXP(amount) });
    }

    applyRunStart(player) {
        const stats = getPlayerStatsFromXP(this._progressXP(player));

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
        player.lastPvpHit = null;
        resetPlayerHealthTimers(player);
    }

    applyPlayerInput(sessionId, data) {
        const player = this.players?.get(sessionId);
        if (!player || player.health <= 0) {
            return;
        }

        // Positions feed hit detection (PvE and, in FFA, PvP), so a
        // non-numeric/NaN/Infinite position is dropped rather than stored:
        // NaN would make every range/arc comparison false and hit everyone.
        const x = Number(data?.x);
        const y = Number(data?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return;
        }

        player.y = y;
        this._applyFastfallRequest(sessionId, player, !!data.isFastFalling);
        this._enforceSpawnBoundary(player, x);
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

        const stats = player._stats || getPlayerStatsFromXP(this._progressXP(player));
        const deadIds = applySlashToEnemies(this.enemies, player.x, player.y, dirX, dirY, stats.damage);

        for (const id of deadIds) {
            this._killEnemy(id, player);
        }

        if (this.isFFA) {
            this._slashPlayers(sessionId, player, dirX, dirY, stats.damage);
        }
    }

    // ---------------------------------------------------------------
    // PvP (FFA only). Same Slash arc/range and Fastfall radius/falloff that
    // enemies are hit with, applied to other players. Every hit goes through
    // applyPlayerDamage (resets the target's regen delay and records who hit
    // them); kill credit is decided only in _endRun.
    // ---------------------------------------------------------------
    _slashPlayers(attackerId, attacker, dirX, dirY, damage) {
        if (!Number.isFinite(attacker.x) || !Number.isFinite(attacker.y)) {
            return;
        }

        const cosHalfArc = Math.cos((SETTINGS.PLAYER_SLASH_ARC / 2) * (Math.PI / 180));

        for (const [targetId, target] of this.players) {
            if (!this._canHitPlayer(attackerId, targetId, target)) {
                continue;
            }

            const dx = target.x - attacker.x;
            const dy = target.y - attacker.y;
            const distance = Math.hypot(dx, dy);
            if (!Number.isFinite(distance) || distance > SETTINGS.PLAYER_SLASH_RANGE || distance < 1e-6) {
                continue;
            }

            if (!((dx / distance) * dirX + (dy / distance) * dirY >= cosHalfArc)) {
                continue;
            }

            this._hitPlayer(attackerId, attacker, targetId, target, damage, SETTINGS.PLAYER_SLASH_KNOCKBACK);
        }
    }

    _fastfallPlayers(attackerId, attacker, stats) {
        const radius = stats.fastfallRadius;
        if (!Number.isFinite(attacker.x) || !Number.isFinite(attacker.y)) {
            return;
        }

        for (const [targetId, target] of this.players) {
            if (!this._canHitPlayer(attackerId, targetId, target)) {
                continue;
            }

            const distance = Math.hypot(target.x - attacker.x, target.y - attacker.y);
            if (!(distance <= radius)) {
                continue;
            }

            const falloff = getLinearFalloff(distance, radius);
            this._hitPlayer(
                attackerId,
                attacker,
                targetId,
                target,
                Math.round(stats.fastfallDamage * falloff),
                stats.fastfallKnockback * falloff
            );
        }
    }

    // No self-hits, no hitting the dead, and the spawn zone stays a safe zone.
    _canHitPlayer(attackerId, targetId, target) {
        return targetId !== attackerId
            && target.health > 0
            && !target.runEnded
            && target.spawnExited;
    }

    _hitPlayer(attackerId, attacker, targetId, target, damage, knockback) {
        applyPlayerDamage(target, damage, { attackerId, atMs: this._simTimeMs });

        if (knockback > 0) {
            // Same client-side knockback message enemy hits already use.
            this.pendingKnockbacks.push({
                sessionId: targetId,
                pusherX: attacker.x,
                pusherY: attacker.y,
                strength: knockback,
            });
        }

        if (target.health <= 0) {
            this._endRun(targetId, target);
        }
    }

    // Called exactly once per victim death, from _endRun (guarded by runEnded).
    _creditFFAKill(victimId, victim) {
        const hit = victim.lastPvpHit;
        victim.lastPvpHit = null;

        if (!hit || hit.attackerId === victimId) {
            return;
        }

        if (this._simTimeMs - hit.atMs > SETTINGS.FFA_KILL_CREDIT_WINDOW) {
            return;
        }

        // Only a player still in this room can be credited.
        const killer = this.players?.get(hit.attackerId);
        if (!killer || killer.xpFrozen) {
            return;
        }

        // Farming guard: repeatedly killing the same player (e.g. two of
        // your own tabs trading kills) only pays once per cooldown.
        const now = this._simTimeMs;
        killer.recentVictims = killer.recentVictims || new Map();
        for (const [id, at] of killer.recentVictims) {
            if (now - at >= SETTINGS.FFA_REPEAT_KILL_COOLDOWN) {
                killer.recentVictims.delete(id);
            }
        }
        if (killer.recentVictims.has(victimId)) {
            return;
        }
        killer.recentVictims.set(victimId, now);

        // Scales with the victim's LEVEL (not their XP), so stronger players
        // are worth more without rewards compounding: XP thresholds grow
        // exponentially while this grows linearly with level. Capped at the
        // killer's own level: a player's join XP comes from their client, so
        // a victim claiming a huge level must not be able to pour persistent
        // XP into someone else's account. (A killer inflating their own
        // claim gains nothing here; their save only ever receives deltas.)
        const victimLevel = Math.min(getLevelFromXP(victim.xp || 0), getLevelFromXP(killer.xp || 0));
        const reward = SETTINGS.FFA_KILL_XP_PER_VICTIM_LEVEL * victimLevel;

        // Added to the killer's persistent XP and queued for saving right
        // away, so it survives leaving FFA, a disconnect, or a later death.
        killer.xp = sanitizeXP((killer.xp || 0) + reward);
        this._queueXPEvent(hit.attackerId, "add", reward);

        // Level up straight away. Max health rises by what the new level
        // adds, without a free full heal; this is not damage, so the
        // killer's regen timer is untouched.
        const stats = getPlayerStatsFromXP(killer.xp);
        killer._stats = stats;
        if (killer.health > 0 && !killer.runEnded) {
            const gained = Math.max(0, stats.maxHealth - (killer.maxHealth || 0));
            killer.maxHealth = stats.maxHealth;
            killer.health = Math.min(killer.maxHealth, killer.health + gained);
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

    // ---------------------------------------------------------------
    // Developer-only commands (BattleRoom only calls these after verifying
    // the connection authenticated as a developer). Unlike the old K/L/R
    // session-only shortcuts they replaced, /givexp and /setxp are meant to actually
    // persist — they apply through the exact same authoritative
    // recalculation + persistence path a normal death does (set xp ->
    // recompute level/stats -> queue one pendingPersists entry), so there is
    // no separate dev-only XP/database mechanism to keep in sync.
    // ---------------------------------------------------------------
    _applyAuthoritativeXP(sessionId, player, xp, kind, amount) {
        player.xp = sanitizeXP(xp);

        const stats = getPlayerStatsFromXP(this._progressXP(player));
        player._stats = stats;
        player.maxHealth = stats.maxHealth;
        if (player.health > 0) {
            player.health = stats.maxHealth;
        }

        // One controlled persistence operation per command, through the
        // same event queue the rest of the game uses — not a second ad hoc
        // database write path.
        this._queueXPEvent(sessionId, kind, amount);
    }

    // Deliberately bypasses xpFrozen: the freeze blocks *ordinary* gameplay
    // XP income (see _killEnemy), not an explicit developer command.
    devGiveXP(sessionId, amount) {
        const player = this.players?.get(sessionId);
        if (!player || !Number.isFinite(amount)) {
            return { ok: false, error: "Invalid amount." };
        }

        const before = this._progressXP(player);
        const after = sanitizeXP(before + amount);
        if (after >= before) {
            this._applyAuthoritativeXP(sessionId, player, after, "add", after - before);
        } else {
            // A negative /givexp lowers XP; saved as an explicit set.
            this._applyAuthoritativeXP(sessionId, player, after, "set", after);
        }
        return { ok: true, xp: this._progressXP(player) };
    }

    devSetXP(sessionId, amount) {
        const player = this.players?.get(sessionId);
        if (!player || !Number.isFinite(amount) || amount < 0) {
            return { ok: false, error: "Invalid amount." };
        }

        this._applyAuthoritativeXP(sessionId, player, amount, "set", sanitizeXP(amount));
        return { ok: true, xp: this._progressXP(player) };
    }

    // Returns the new state, or null if the target isn't currently connected.
    setXPFrozen(sessionId, frozen) {
        const player = this.players?.get(sessionId);
        if (!player) {
            return null;
        }

        player.xpFrozen = Boolean(frozen);
        return player.xpFrozen;
    }

    isXPFrozen(sessionId) {
        return Boolean(this.players?.get(sessionId)?.xpFrozen);
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

        // After this tick's enemy attacks, so a hit landing now restarts the
        // regen delay before any healing is applied for the tick.
        if (this.players) {
            for (const [, player] of this.players) {
                tickPlayerRegen(player, deltaMs);
            }
        }

        stepEnemyMovement(this.enemies, deltaMs);

        // world.update() (not world.step()) is what makes this safe at high
        // velocity/lag: it subdivides deltaMs into fixed PHYSICS_FPS-sized
        // substeps internally (Phaser's own accumulator, the same mechanism
        // the client's Scene already uses every frame), instead of doing one
        // big discrete AABB check that a fast body could skip clean over.
        // Capped: Phaser runs deltaMs / (1000 / PHYSICS_FPS) substeps with no
        // upper bound, so after a stall (CPU throttling, GC, a slow host) one
        // huge delta made the next tick slower still, the next delta bigger,
        // and so on until the event loop never got back to serving HTTP or
        // WebSocket traffic. Past the cap the physics world simply runs a
        // little behind real time for that tick instead.
        this._simTimeMs += deltaMs;
        const physicsDelta = Math.min(Math.max(0, deltaMs), SETTINGS.MAX_PHYSICS_CATCHUP_MS);
        this._physicsTimeMs = (this._physicsTimeMs || 0) + physicsDelta;
        this.world.update(this._physicsTimeMs, physicsDelta);
        this._collectDeaths();
    }

    // Zones simulate continuously, with or without anyone present — the world
    // doesn't wait for a player to "turn a zone on". Spawn probability is pure
    // time-based (1 - (1-chancePerSecond)^dt), the same math regardless of
    // who's watching, so a zone left running for an hour alone behaves exactly
    // like the same hour with a player standing in it.
    _trySpawnEnemies(deltaMs) {
        if (this.isFFA) {
            return; // FFA is player-vs-player only.
        }

        const dt = Math.max(0, deltaMs) / 1000;

        for (const zone of getCombatZones()) {
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

        const stats = player._stats || getPlayerStatsFromXP(this._progressXP(player));
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

        if (this.isFFA) {
            this._fastfallPlayers(this._sessionIdOf(player), player, stats);
        }
    }

    _sessionIdOf(player) {
        for (const [sessionId, p] of this.players) {
            if (p === player) {
                return sessionId;
            }
        }
        return null;
    }

    _killEnemy(id, killer) {
        const enemy = this.enemies.get(id);
        if (!enemy) {
            return;
        }

        // /togglefreezexp blocks *ordinary* XP income specifically — every
        // gameplay path that grants XP funnels through this one line, so
        // gating it here covers all of them, present and future.
        if (!this.isFFA && killer && killer.health > 0 && !killer.xpFrozen) {
            killer.runXP = (killer.runXP || 0) + (enemy.body.xp || 0);
        }

        // Remove the enemy's ground collider(s) too. disableBody alone left
        // every killed enemy's Collider (and through it the body) in
        // world.colliders forever: memory grew with every kill and each
        // physics substep iterated all of them, so the server got steadily
        // slower the longer people played until it stopped responding.
        for (const collider of enemy.body.groundColliders || []) {
            this.world.removeCollider(collider);
        }
        enemy.body.groundColliders = null;

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
        // Synced death counter: each death is a distinct event for clients,
        // even if the respawn lands in the same state patch as the death.
        player.deathCount = (player.deathCount || 0) + 1;
        resetPlayerHealthTimers(player);

        if (this.isFFA) {
            // FFA: the victim keeps their XP (rewards were already saved as
            // they were earned); the killer, if any, is credited once here.
            this._creditFFAKill(sessionId, player);
            return;
        }

        const banked = player.runXP || 0;
        player.xp = sanitizeXP((player.xp || 0) + banked);
        player.runXP = 0;
        this._queueXPEvent(sessionId, "add", banked);
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

        for (const [id, { body }] of this.enemies) {
            snapshot.push({
                id: Number(id),
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
