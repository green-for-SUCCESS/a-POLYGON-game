import { Room, ServerError } from "colyseus";
import { BattleRoomState } from "./schema/BattleRoomState.js";
import { PlayerState } from "./schema/PlayerState.js";
import { EnemyState } from "./schema/EnemyState.js";
import { HeadlessGame } from "../headless/HeadlessGame.js";
import { verifyIdToken, isUidBanned, banUsername } from "../firebaseAdmin.js";

export class BattleRoom extends Room {

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

    onCreate(options) {
        // The world is an always-on simulation, not something that only exists
        // while someone's connected: zones keep spawning/ticking with zero
        // players, so don't let Colyseus tear the room down when it's empty.
        this.autoDispose = false;

        this.game = new HeadlessGame();
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

        this._registerDevMessages();

        this.setSimulationInterval((deltaTime) => {
            this.game.update(deltaTime);
            this._syncEnemies();
            this._dispatchKnockbacks();
            this._dispatchFastfallDenials();
            this._dispatchPersists();
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
        this.onMessage("devAdjustLevel", (client, data) => {
            if (!client.userData?.isDeveloper) {
                return;
            }

            const delta = Math.trunc(Number(data?.delta) || 0);
            if (delta === 0) {
                return;
            }

            this.game.devAdjustLevel(client.sessionId, delta);
        });

        this.onMessage("devResetLevel", (client) => {
            if (!client.userData?.isDeveloper) {
                return;
            }

            this.game.devResetLevel(client.sessionId);
        });

        this.onMessage("devKick", (client, data) => {
            if (!client.userData?.isDeveloper) {
                return;
            }

            this._devReply(client, this._handleDevKick(String(data?.username || "")));
        });

        this.onMessage("devBan", async (client, data) => {
            if (!client.userData?.isDeveloper) {
                return;
            }

            this._devReply(client, await this._handleDevBan(String(data?.username || "")));
        });
    }

    _devReply(client, message) {
        client.send("devReply", { message });
    }

    _findSessionIdByUsername(username) {
        const needle = username.trim().toLowerCase();
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

    _handleDevKick(username) {
        const sessionId = this._findSessionIdByUsername(username);
        if (!sessionId) {
            return `Player not found: "${username}"`;
        }

        const target = this.clients.find((c) => c.sessionId === sessionId);
        if (!target) {
            return `Player not found: "${username}"`;
        }

        target.send("devKicked", { reason: "Kicked by a developer." });
        target.leave(4000, "Kicked by a developer.");

        return `Kicked "${username}".`;
    }

    async _handleDevBan(username) {
        // Also kick them immediately if they're currently connected — the
        // ban record alone only blocks *future* verified-identity joins.
        this._handleDevKick(username);

        const result = await banUsername(username.trim());
        if (!result.ok) {
            return `Ban failed: ${result.error}`;
        }

        return `Banned "${username}" (uid ${result.uid}).`;
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

    _dispatchPersists() {
        for (const event of this.game.flushPersists()) {
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

            client.send("persistXP", { xp: event.xp });
        }
    }

    onJoin(client, options) {
        const player = new PlayerState();
        player.name = sanitizePlayerName(options?.username || options?.name);
        player.xp = Math.max(0, Math.floor(Number(options?.xp) || 0));
        this.game.applyRunStart(player);

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
        // every K/L/R press and every admin command just does nothing, with
        // no way to tell "this is broken" from "this never happened".
        if (presented != null) {
            this._pendingDevAuthResults.push({
                sessionId: client.sessionId,
                ok: client.userData.isDeveloper,
                reason: !devSecret
                    ? "Server has no DEV_SECRET configured."
                    : !client.userData.isDeveloper
                        ? "devToken did not match the server's DEV_SECRET."
                        : null,
            });
        }

        console.log("Players in room:", this.state.players);
        console.log("Player added:", client.sessionId);
        console.log(client.sessionId, "joined!");
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
        this.state.players.delete(client.sessionId);
    }

    onDispose() {
        console.log("room", this.roomId, "disposing...");
    }
}

function sanitizePlayerName(raw) {
    const name = typeof raw === "string" ? raw.trim() : "";

    if (!/^[a-zA-Z0-9._-]{3,16}$/.test(name)) {
        return "Player";
    }

    return name;
}
