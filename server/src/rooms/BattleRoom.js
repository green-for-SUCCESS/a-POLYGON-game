import { Room, ServerError } from "colyseus";
import { BattleRoomState } from "./schema/BattleRoomState.js";
import { PlayerState } from "./schema/PlayerState.js";
import { EnemyState } from "./schema/EnemyState.js";
import { HeadlessGame } from "../headless/HeadlessGame.js";
import { toXP, xpToString, parseXPInput, formatXP } from "../../../shared-data/XPMath.js";
import { GAME_MODES } from "../../../shared-data/GameModes.js";
import { verifyIdToken, isUidBanned, banUsername, unbanUsername, getXPFreeze, setXPFreeze, applyXPEventsForUid, isFirebaseAdminConfigured } from "../firebaseAdmin.js";

// Unacknowledged XP events are re-sent this often (a client that missed one
// because of a dropped message or a failed save gets another chance; the
// event id makes a duplicate harmless).
const XP_EVENT_RESEND_MS = 10000;
// Per-player cap, so a client that never acknowledges can't grow this forever.
const MAX_UNACKED_XP_EVENTS = 200;

export class BattleRoom extends Room {

    // The game mode is a property of the room TYPE (FfaRoom overrides it),
    // fixed on the server. Nothing a client sends can change it.
    static mode = GAME_MODES.MAIN;

    state = new BattleRoomState();

    // Rejects the connection before any room/player state is created for it.
    // Returning a falsy value here fails the join with AUTH_FAILED.
    async onAuth(client, options) {
        const idToken = typeof options?.idToken === "string" ? options.idToken : null;
        if (!idToken) {
            // No verified identity presented — same as today's anonymous/guest
            // play. A ban keyed only by a free-text username would be
            // meaningless (trivially bypassed by renaming), so unverified
            // connections simply aren't bannable yet.
            return true;
        }

        const decoded = await verifyIdToken(idToken);
        if (!decoded?.uid) {
            // Token didn't verify; don't hard-fail the join over it, just
            // treat them as unauthenticated (consistent with existing
            // "guest" behavior elsewhere in this project).
            return true;
        }

        if (await isUidBanned(decoded.uid)) {
            throw new ServerError(403, "You are banned from this server.");
        }

        return { uid: decoded.uid };
    }

    // Defining this makes Colyseus wrap the simulation tick, every message
    // handler, clock timers and the lifecycle hooks in try/catch. Without
    // it, one exception in any of them (a malformed client message was
    // enough) escaped to Node and killed the whole process, disconnecting
    // every player until the host restarted it.
    onUncaughtException(error, methodName) {
        // Colyseus wraps the original error; its `cause` has the real stack.
        console.error(
            `[room ${this.roomId} mode=${this.mode}] Uncaught error in ${methodName}:`,
            error?.cause?.stack || error?.stack || error
        );
    }

    onCreate(options) {
        this.mode = this.constructor.mode;
        this.state.mode = this.mode;

        // The main world is an always-on simulation, not something that only
        // exists while someone's connected: zones keep spawning/ticking with
        // zero players, so don't let Colyseus tear the room down when it's
        // empty. An FFA arena has nothing worth keeping once everyone has
        // left (every run in it is over), so it is disposed as usual.
        this.autoDispose = this.mode !== GAME_MODES.MAIN;

        this.game = new HeadlessGame({ mode: this.mode });
        this.game.setPlayers(this.state.players);
        this._pendingDevAuthResults = [];

        this.onMessage("updatePosition", (client, data) => {
            this.game.applyPlayerInput(client.sessionId, data);
        });

        this.onMessage("suicide", (client) => {
            this.game.killPlayer(client.sessionId);
        });

        this.onMessage("respawn", (client) => {
            this.game.respawnPlayer(client.sessionId);
        });

        this.onMessage("slash", (client, data) => {
            this.game.applyPlayerSlash(client.sessionId, data);
        });

        // The client confirms each XP event once its save provider has
        // applied it (or already had it).
        this.onMessage("persistAck", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            const eventId = typeof data?.eventId === "string" ? data.eventId : null;
            if (player?._unackedXP && eventId) {
                player._unackedXP.delete(eventId);
            }
        });

        this._xpEventSeq = 0;
        this._lastXPResendAt = 0;
        // Server-side XP saves started by onLeave that haven't finished yet.
        this._pendingXPSaves = new Set();

        this._registerDevMessages();

        this.setSimulationInterval((deltaTime) => {
            this.game.update(deltaTime);
            this._syncEnemies();
            this._dispatchKnockbacks();
            this._dispatchFastfallDenials();
            this._dispatchPersists();
            this._resendUnackedXP();
            this._dispatchDevAuthResults();
        });
    }

    // Sending this straight from onJoin races the client: the server can
    // dispatch it before the client's joinOrCreate() promise even resolves,
    // which is before Network.js/DevTools.js get a chance to call
    // room.onMessage(...) for it — so it arrives with nothing listening and
    // is silently dropped. Queuing it and flushing on the next simulation
    // tick (same pattern as knockback/persistXP below) guarantees the client
    // has long since registered its listeners by the time it's sent.
    _dispatchDevAuthResults() {
        for (const event of this._pendingDevAuthResults) {
            const client = this.clients.find((c) => c.sessionId === event.sessionId);
            client?.send("devAuthResult", { ok: event.ok, reason: event.reason });
        }
        this._pendingDevAuthResults = [];
    }

    // ---------------------------------------------------------------
    // Developer-only commands. `isDeveloper` is set in onJoin only when the
    // connecting client presented a devToken that matches the server's own
    // DEV_SECRET — never trusted from the client beyond that one check, and
    // every handler re-checks it (a normal production client never sends a
    // devToken at all, so it never gets this flag in the first place).
    // ---------------------------------------------------------------
    _registerDevMessages() {
        this.onMessage("devBan", async (client, data) => {
            if (!client.userData?.isDeveloper) {
                return;
            }

            this._devReply(client, await this._handleDevBan(data));
        });

        this.onMessage("devUnban", async (client, data) => {
            if (!client.userData?.isDeveloper) {
                return;
            }

            this._devReply(client, await this._handleDevUnban(data));
        });

        this.onMessage("devGiveXP", (client, data) => {
            if (!client.userData?.isDeveloper) {
                return;
            }

            this._devReply(client, this._handleDevXPCommand(client, data, "give"));
        });

        this.onMessage("devSetXP", (client, data) => {
            if (!client.userData?.isDeveloper) {
                return;
            }

            this._devReply(client, this._handleDevXPCommand(client, data, "set"));
        });

        this.onMessage("devToggleFreezeXP", (client, data) => {
            if (!client.userData?.isDeveloper) {
                return;
            }

            this._devReply(client, this._handleDevToggleFreezeXP(data));
        });
    }

    _devReply(client, message) {
        client.send("devReply", { message });
    }

    _findSessionIdByUsername(username) {
        const needle = String(username || "").trim().toLowerCase();
        if (!needle) {
            return null;
        }

        for (const [sessionId, player] of this.state.players) {
            if ((player.name || "").toLowerCase() === needle) {
                return sessionId;
            }
        }

        return null;
    }

    // Shared by every command that takes an optional target username:
    // resolves to that connected player, or to the issuing developer
    // themselves when no username is given. Only ever resolves to an
    // actual connected session's PlayerState, never an arbitrary
    // client-supplied id.
    _resolveTarget(client, username) {
        if (!username) {
            return { sessionId: client.sessionId, player: this.state.players.get(client.sessionId) };
        }

        const sessionId = this._findSessionIdByUsername(username);
        if (!sessionId) {
            return { error: `Player not found: "${username}"` };
        }

        return { sessionId, player: this.state.players.get(sessionId) };
    }

    _forceDisconnect(sessionId, reason) {
        const target = this.clients.find((c) => c.sessionId === sessionId);
        if (!target) {
            return;
        }

        target.send("devKicked", { reason });
        target.leave(4000, reason);
    }

    async _handleDevBan(data) {
        const username = String(data?.username || "").trim();
        if (!username) {
            return "Usage: /ban <player> [time_in_hours]";
        }

        let hours;
        if (data?.hours != null && data.hours !== "") {
            hours = Number(data.hours);
            if (!Number.isFinite(hours) || hours <= 0) {
                return `Invalid duration: "${data.hours}". Use a positive number of hours, or omit it for a permanent ban.`;
            }
        } else {
            hours = null;
        }

        // The ban record alone only blocks *future* verified-identity joins;
        // also disconnect them immediately if they're currently connected.
        const sessionId = this._findSessionIdByUsername(username);
        if (sessionId) {
            this._forceDisconnect(sessionId, "Banned by a developer.");
        }

        const result = await banUsername(username, hours);
        if (!result.ok) {
            return `Ban failed: ${result.error}`;
        }

        return hours
            ? `Banned "${username}" for ${hours} hour(s).`
            : `Banned "${username}" permanently.`;
    }

    async _handleDevUnban(data) {
        const username = String(data?.username || "").trim();
        if (!username) {
            return "Usage: /unban <player>";
        }

        const result = await unbanUsername(username);
        if (!result.ok) {
            return `Unban failed: ${result.error}`;
        }

        return result.wasAlreadyUnbanned
            ? `"${username}" was not banned.`
            : `Unbanned "${username}".`;
    }

    _handleDevXPCommand(client, data, mode) {
        // Exact, arbitrary-length whole numbers (or integer scientific
        // notation like 1e250), parsed as BigInt: no precision is lost and
        // nothing becomes Infinity. Negative, non-numeric, fractional and
        // above-10^250 amounts are rejected, not clamped.
        const usage = `Usage: /${mode === "give" ? "givexp <amount> [player]" : "setxp <amount> [player]"}`;
        if (data?.amount === undefined || data?.amount === null || data?.amount === "") {
            return usage;
        }
        const parsed = parseXPInput(data.amount);
        if (!parsed.ok) {
            return `${parsed.error} ${usage}`;
        }
        const amount = parsed.value;

        const username = String(data?.username || "").trim();
        const target = this._resolveTarget(client, username);
        if (target.error) {
            return target.error;
        }

        const result = mode === "give"
            ? this.game.devGiveXP(target.sessionId, amount)
            : this.game.devSetXP(target.sessionId, amount);

        if (!result.ok) {
            return result.error;
        }

        const who = username || target.player?.name || "you";
        return mode === "give"
            ? `Gave ${formatXP(amount)} XP to ${who} (now ${formatXP(result.xp)} XP${result.capped ? ", capped at the 10^250 maximum" : ""}).`
            : `Set ${who}'s XP to ${formatXP(result.xp)}.`;
    }

    _handleDevToggleFreezeXP(data) {
        const username = String(data?.username || "").trim();
        if (!username) {
            return "Usage: /togglefreezexp <player>";
        }

        const sessionId = this._findSessionIdByUsername(username);
        if (!sessionId) {
            return `Player not found: "${username}"`;
        }

        const nextState = !this.game.isXPFrozen(sessionId);
        this.game.setXPFrozen(sessionId, nextState);

        // Durable only for verified accounts (same identity caveat as bans —
        // an anonymous/guest session has no uid to key a Firestore doc on,
        // so for them this is in-memory for the current connection only).
        const target = this.clients.find((c) => c.sessionId === sessionId);
        if (target?.auth?.uid) {
            setXPFreeze(target.auth.uid, nextState).catch(() => {});
        }

        return nextState
            ? `XP freezing enabled for ${username}`
            : `XP freezing disabled for ${username}`;
    }

    _dispatchFastfallDenials() {
        for (const event of this.game.flushFastfallDenials()) {
            const client = this.clients.find((c) => c.sessionId === event.sessionId);
            client?.send("fastfallDenied");
        }
    }

    _syncEnemies() {
        const snapshot = this.game.getEnemySnapshot();
        const enemies = this.state.enemies;

        while (enemies.length > snapshot.length) {
            enemies.pop();
        }

        while (enemies.length < snapshot.length) {
            enemies.push(new EnemyState());
        }

        for (let i = 0; i < snapshot.length; i++) {
            const enemyState = enemies.at?.(i) ?? enemies[i];
            const snap = snapshot[i];
            if (!enemyState || !snap) {
                continue;
            }
            enemyState.id = snap.id;
            enemyState.x = snap.x;
            enemyState.y = snap.y;
            enemyState.rarity = snap.rarity;
            enemyState.velocityX = snap.velocityX;
            enemyState.velocityY = snap.velocityY;
            enemyState.state = snap.state;
            enemyState.attackDirection = snap.attackDirection;
            enemyState.health = snap.health;
            enemyState.maxHealth = snap.maxHealth;
        }
    }

    _dispatchKnockbacks() {
        for (const event of this.game.flushKnockbacks()) {
            let client = null;

            for (const c of this.clients) {
                if (c.sessionId === event.sessionId) {
                    client = c;
                    break;
                }
            }

            if (!client) {
                continue;
            }

            client.send("knockback", {
                x: event.pusherX,
                y: event.pusherY,
                strength: event.strength,
            });
        }
    }

    // Every persistent-XP change becomes an event with an id that is unique
    // to this room instance (roomIds are random, so ids never repeat across
    // rooms or server restarts). The player's client applies it to its save
    // provider idempotently and acknowledges it; until then it is kept here
    // and re-sent. See shared-data/XPEvents.js.
    _dispatchPersists() {
        for (const pending of this.game.flushPersists()) {
            const player = this.state.players.get(pending.sessionId);
            if (!player) {
                continue;
            }

            const event = {
                eventId: `${this.roomId}:${pending.sessionId}:${++this._xpEventSeq}`,
                kind: pending.kind,
                amount: pending.amount,
            };

            player._unackedXP = player._unackedXP || new Map();
            player._unackedXP.set(event.eventId, { event, sentAt: Date.now() });
            if (player._unackedXP.size > MAX_UNACKED_XP_EVENTS) {
                const oldest = player._unackedXP.keys().next().value;
                player._unackedXP.delete(oldest);
                console.warn(`[room ${this.roomId}] ${pending.sessionId} is not acknowledging XP events; dropped the oldest.`);
            }

            this._sendXPEvent(pending.sessionId, player, event);
        }
    }

    _sendXPEvent(sessionId, player, event) {
        const client = this.clients.find((c) => c.sessionId === sessionId);
        // `xp` is the server's resulting total, for display only; providers
        // apply `kind`/`amount`, never overwrite with it.
        client?.send("persistXP", { ...event, xp: player.xp });
    }

    _resendUnackedXP(force = false) {
        const now = Date.now();
        if (!force && now - this._lastXPResendAt < XP_EVENT_RESEND_MS) {
            return;
        }
        this._lastXPResendAt = now;

        for (const [sessionId, player] of this.state.players) {
            if (!player._unackedXP?.size) {
                continue;
            }
            for (const entry of player._unackedXP.values()) {
                if (force || now - entry.sentAt >= XP_EVENT_RESEND_MS) {
                    entry.sentAt = now;
                    this._sendXPEvent(sessionId, player, entry.event);
                }
            }
        }
    }

    // A reconnecting client may have missed events while it was away.
    onReconnect(client) {
        const player = this.state.players.get(client.sessionId);
        if (!player?._unackedXP?.size) {
            return;
        }
        for (const entry of player._unackedXP.values()) {
            entry.sentAt = Date.now();
            this._sendXPEvent(client.sessionId, player, entry.event);
        }
    }

    async onJoin(client, options) {
        const player = new PlayerState();
        player.name = sanitizePlayerName(options?.username || options?.name);
        // The player's persistent XP, loaded by their client from their save
        // provider (Firestore account or local guest save), in every mode:
        // FFA keeps the player's level and adds to it.
        // Exact decimal string (may exceed 2^53 after developer commands).
        player.xp = xpToString(toXP(options?.xp));
        this.game.applyRunStart(player);
        // Restore a durable /togglefreezexp setting for returning verified
        // accounts; anonymous/guest sessions simply start unfrozen (there's
        // no uid to have persisted it against in the first place).
        player.xpFrozen = client.auth?.uid ? await getXPFreeze(client.auth.uid) : false;

        this.state.players.set(client.sessionId, player);

        // Developer authorization: only ever granted server-side, only when
        // DEV_SECRET is actually configured and the presented token matches
        // it exactly. A normal production client build never sends a
        // devToken at all, so this never fires for regular players even if
        // someone inspects/forges messages against the normal client.
        const devSecret = process.env.DEV_SECRET;
        const presented = typeof options?.devToken === "string" ? options.devToken : null;
        client.userData = {
            isDeveloper: Boolean(devSecret && presented && presented === devSecret),
        };

        // A dev-build client always presents SOME devToken (even an empty one
        // would be a bug in the build), so this only ever fires for clients
        // that are actually trying to authenticate as a developer. Without
        // this, a devToken/DEV_SECRET mismatch fails completely silently —
        // every admin command just silently does nothing, with
        // no way to tell "this is broken" from "this never happened".
        if (presented != null) {
            const reason = !devSecret
                ? "Server configuration error: DEV_SECRET is not set on the server."
                : !client.userData.isDeveloper
                    ? "Developer token mismatch: devToken did not match the server's DEV_SECRET."
                    : null;

            // Presence/outcome only — never the secret or the token.
            console.log(
                `[devauth] ${client.sessionId}: token presented=yes, server DEV_SECRET configured=${devSecret ? "yes" : "no"}, ` +
                `result=${client.userData.isDeveloper ? "authorized" : (devSecret ? "mismatch" : "no-server-secret")}`
            );

            this._pendingDevAuthResults.push({
                sessionId: client.sessionId,
                ok: client.userData.isDeveloper,
                reason,
            });
        }

        // (Used to dump the whole players map on every join.)
        console.log(`[room ${this.roomId} mode=${this.mode}] ${client.sessionId} joined (${this.state.players.size} players).`);
    }

    // This is the actual root cause of "a brief internet drop kills the
    // whole session": Colyseus calls onDrop() (not onLeave()) for an abrupt
    // disconnect, specifically so allowReconnection() can be offered here.
    // Without this, the client's seat is torn down the instant the socket
    // closes, so the SDK's own automatic reconnect (already on by default —
    // exponential backoff, up to 15 attempts) always arrives to find nothing
    // to reconnect to, failing immediately with "seat reservation expired"
    // (confirmed by direct testing before this fix).
    async onDrop(client) {
        // Covers the SDK's own ~15-attempt exponential-backoff retry window
        // with room to spare. PlayerState is left completely untouched while
        // this is pending — Colyseus skips onJoin() on a successful
        // reconnect (calling onReconnect instead, which we don't need), so
        // the run just resumes exactly where it left off.
        try {
            await this.allowReconnection(client, 30);
        } catch {
            // Reconnection window expired or failed; onLeave() below (which
            // Colyseus calls automatically once this rejects) does the
            // actual cleanup.
        }
    }

    // Called once a player is truly gone: either they left on purpose (the
    // "Main Menu" button, which calls room.leave() -> CloseCode.CONSENTED),
    // or onDrop()'s reconnection window above expired/failed.
    onLeave(client) {
        const player = this.state.players.get(client.sessionId);
        const unacked = player?._unackedXP?.size
            ? [...player._unackedXP.values()].map((entry) => entry.event)
            : [];
        this.state.players.delete(client.sessionId);

        if (unacked.length === 0) {
            return;
        }

        // The client left before confirming these were saved. For a verified
        // account the server can save them itself (same idempotent events, so
        // it doesn't matter if the client also got them through). A guest's
        // save lives only in their browser, so there is nothing more the
        // server can do; say so instead of silently losing it.
        const uid = client.auth?.uid;
        if (uid && isFirebaseAdminConfigured()) {
            // Tracked so onDispose (which Colyseus awaits during a graceful
            // shutdown, e.g. on redeploy) can wait for it; onLeave's own
            // promise is not awaited on that path when several players leave.
            const save = applyXPEventsForUid(uid, unacked).then((result) => {
                if (!result.ok) {
                    console.error(`[room ${this.roomId}] Could not save ${unacked.length} unconfirmed XP event(s) for uid ${uid}: ${result.error}`);
                }
            });
            this._pendingXPSaves.add(save);
            save.finally(() => this._pendingXPSaves.delete(save));
            return save;
        } else {
            console.warn(
                `[room ${this.roomId}] ${client.sessionId} left with ${unacked.length} XP event(s) not confirmed as saved` +
                (uid ? " (Firebase Admin is not configured, so the server can't save them)." : " (guest or unverified player).")
            );
        }
    }

    onDispose() {
        console.log("room", this.roomId, "disposing...");

        if (!this._pendingXPSaves?.size) {
            return;
        }
        // Let in-flight server-side XP saves finish before the room (and,
        // on shutdown, the process) goes away. Bounded so a hung Firestore
        // call can't block shutdown forever.
        return Promise.race([
            Promise.allSettled([...this._pendingXPSaves]),
            new Promise((resolve) => setTimeout(resolve, 10000)),
        ]);
    }
}

function sanitizePlayerName(raw) {
    const name = typeof raw === "string" ? raw.trim() : "";

    if (!/^[a-zA-Z0-9._-]{3,16}$/.test(name)) {
        return "Player";
    }

    return name;
}
