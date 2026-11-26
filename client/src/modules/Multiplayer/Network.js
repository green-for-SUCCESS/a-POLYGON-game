import * as Colyseus from "@colyseus/sdk";
import { Callbacks, CloseCode } from "@colyseus/sdk";

import { variable } from "../GameValues/LocalVariables.js";

import { createPlayer, applyPlayerPolygon, handleLocalPlayerDeath, playPlayerDeathAnimation, respawnPlayer, updateHealthBar, updateProgressHud, setRemotePlayerName, setRemotePlayerHealth, killRemotePlayer, reviveRemotePlayer, destroyPlayer } from "../Entities/Players.js";
import { waitForAuth, getUserProfile } from "./FirebaseConfig.js";
import { submitXPEvent, flushAccountXP } from "./XPSync.js";
import { applyKnockback } from "../Logic/Physics.js";
import { playSlashEffect } from "../Entities/Effects.js";
import { getPlayerLevelFromState } from "../../../../shared-data/Progression.js";
import { toXP, xpToString } from "../../../../shared-data/XPMath.js";
import { ROOM_NAMES, normalizeGameMode } from "../../../../shared-data/GameModes.js";
import { loadGuestProfile } from "./GuestStore.js";
import { SETTINGS } from "../../../../shared-data/Constants.js";
import { isDevBuild } from "../Dev/DevFlag.js";
import { showConnectionStatus, hideConnectionStatus } from "./ConnectionStatus.js";

// Every build — including the dev-tools build served locally by Vite —
// talks to the deployed Render server. Dev auth is validated there against
// the DEV_SECRET configured in Render's environment settings.
const SERVER_URL = "https://a-polygon-game.onrender.com";

export const client = new Colyseus.Client(SERVER_URL);

// Serializes connection attempts: a stray second call to connect() (e.g. a
// manual retry click landing while an auto-retry is still in flight) must
// never race a second joinOrCreate() for the same player, which is how you
// end up with two separate rooms/listener sets for one player.
let connecting = false;
const MAX_AUTO_RETRIES = 5;
const SLOW_CONNECT_MS = 15000;
// Past this, an unanswered join counts as a failed attempt instead of
// waiting forever. A Render instance that is waking up answers well within
// it; one that is wedged or down never does.
const JOIN_TIMEOUT_MS = 30000;
// Bumped whenever an attempt is abandoned (timed out). A join that resolves
// after being abandoned is left immediately, so a timeout can never leave a
// second, ghost session behind.
let attemptGeneration = 0;

class JoinTimeoutError extends Error {
    constructor() {
        super(`No answer from the server within ${JOIN_TIMEOUT_MS / 1000}s.`);
        this.name = "JoinTimeoutError";
    }
}

// Turns a failed connection attempt into a message that says WHICH stage
// failed. Never includes tokens or secrets.
function describeConnectError(e) {
    const message = String(e?.message || e || "");
    const code = typeof e?.code === "number" ? e.code : null;

    if (e instanceof JoinTimeoutError) {
        return "The server isn't responding (it may be starting up, overloaded or down).";
    }
    if (e?.name === "StaleJoinError") {
        return "Discarded an outdated connection; reconnecting with the current session.";
    }
    if (/not defined/i.test(message)) {
        return "The server doesn't offer this game mode (it may be running an older version).";
    }
    if (code === 403 || /banned/i.test(message)) {
        return `The server refused the connection: ${message}`;
    }
    if (code === 401 || /auth/i.test(message)) {
        return "The server rejected this login. Try signing in again.";
    }
    if (code === 4010) {
        return "The connection dropped while joining (your network may have gone offline).";
    }
    if (code === 4001) {
        return "The server is restarting. It should be back shortly.";
    }
    if (code != null && code >= 4000 && code < 5000) {
        return `The server couldn't set up the game room (code ${code}): ${message}`;
    }
    if (code != null && code >= 1000 && code < 4000) {
        return `The connection to the server closed during setup (WebSocket code ${code}).`;
    }
    if (e instanceof TypeError || /fetch|network|ERR_/i.test(message)) {
        return "Couldn't reach the server (offline, DNS failure, or the server refused the connection).";
    }
    return `Couldn't connect to the server: ${message || "unknown error"}`;
}

export async function connect() {
    if (connecting) {
        return;
    }

    connecting = true;
    try {
        return await connectWithRetry();
    } finally {
        connecting = false;
    }
}

// The initial join is the one network call nothing else here recovers from
// on its own (unlike a mid-session drop, which Colyseus's own reconnection —
// now that the server actually grants a reconnection window, see
// BattleRoom.onDrop — already handles). A handful of short, backed-off
// retries covers a brief "server not reachable yet" blip; past that, this
// waits for an explicit click rather than retrying forever in the background.
async function connectWithRetry() {
    let attempt = 0;

    for (;;) {
        // If the server accepts the connection but never answers (e.g. the
        // Render instance is waking up or down), the join request neither
        // succeeds nor fails, so nothing below would ever say so. Report it
        // without abandoning the request — aborting and retrying could leave a
        // second session behind if the first one eventually goes through.
        const slowNotice = setTimeout(() => {
            showConnectionStatus("Still waiting for the server… it may be starting up or unavailable.", "warn");
            if (import.meta.env.MODE !== "production" && isDevBuild()) {
                variable.devLog.push(`… No response from ${SERVER_URL} after ${SLOW_CONNECT_MS / 1000}s. The server may be starting up or unavailable.`);
            }
        }, SLOW_CONNECT_MS);

        const generation = ++attemptGeneration;
        let joinTimer = null;

        try {
            const room = await Promise.race([
                attemptConnect(generation),
                new Promise((_, reject) => {
                    joinTimer = setTimeout(() => reject(new JoinTimeoutError()), JOIN_TIMEOUT_MS);
                }),
            ]);
            hideConnectionStatus();
            return room;
        } catch (e) {
            if (e instanceof JoinTimeoutError) {
                // Abandon it: if it ever completes, attemptConnect sees the
                // newer generation and leaves that room straight away.
                attemptGeneration++;
            }

            attempt++;
            const reason = describeConnectError(e);
            console.error(`❌ Connection attempt ${attempt} failed: ${reason}`, e);

            if (import.meta.env.MODE !== "production" && isDevBuild()) {
                variable.devLog.push(`✗ Attempt ${attempt} to ${SERVER_URL} failed: ${reason}`);
            }

            if (attempt >= MAX_AUTO_RETRIES) {
                await new Promise((resolve) => {
                    showConnectionStatus(`${reason} Click to retry.`, "error", () => {
                        attempt = 0;
                        resolve();
                    });
                });
                continue;
            }

            const delaySeconds = Math.min(10, 2 ** (attempt - 1));
            showConnectionStatus(`${reason} Retrying in ${delaySeconds}s…`, "warn");
            await new Promise((r) => setTimeout(r, delaySeconds * 1000));
        } finally {
            clearTimeout(slowNotice);
            clearTimeout(joinTimer);
        }
    }
}

async function attemptConnect(generation) {
    let username = variable.username || "";
    let xp = xpToString(toXP(variable.persistentXP));
    let idToken = null;
    let accountUid = null;

    // Fixed for the lifetime of this connection: where its progression is
    // saved never follows later changes to the global identity (e.g. the
    // player went back to Home and signed in while this join was pending).
    const identity = variable.identity === "guest" ? "guest" : "account";

    if (identity === "guest") {
        // Guest Mode: progression comes from this browser's local save and
        // nothing touches Firebase (no session lookup, no ID token), even if
        // the browser happens to hold a Firebase sign-in. Re-read on every
        // attempt so a reconnect uses the latest saved XP.
        const { profile } = loadGuestProfile();
        username = profile.name;
        xp = xpToString(toXP(profile.xp));
        variable.username = profile.name;
        variable.persistentXP = xp;
    } else {
        // The uid comes from Firebase Auth on its own, before anything that
        // can fail independently (a Firestore read, a token refresh): if it
        // were only known after the profile read succeeded, one failed read
        // would leave this whole connection with nowhere to save XP.
        let user = null;
        try {
            user = await waitForAuth();
        } catch {
        }

        if (user) {
            accountUid = user.uid;

            try {
                // Lets the server verify who this is (for ban checks) instead
                // of trusting the free-text username alone. Safe to send from
                // every build: it's the player's own per-session token, not a
                // secret, and the server only uses it to read their uid.
                idToken = await user.getIdToken();
            } catch {
            }

            // Finish any XP saves still queued or in flight for this account
            // (e.g. an FFA kill moments before leaving, or a save that failed
            // earlier), THEN read the profile, so the join uses a total that
            // already includes them.
            try {
                await flushAccountXP(accountUid);
            } catch {
            }

            try {
                const profile = await getUserProfile(accountUid);
                if (profile?.username) {
                    username = profile.username;
                    variable.username = profile.username;
                }
                xp = xpToString(toXP(profile?.xp));
                variable.persistentXP = xp;
            } catch {
                // Keep the XP we already had (from the Home screen); saving
                // still works because accountUid is known.
            }
        }
    }

    // Abandoned (timed out) while still preparing: don't start a join at all.
    if (generation !== attemptGeneration) {
        const stale = new Error("Discarded a join started for a different session.");
        stale.name = "StaleJoinError";
        throw stale;
    }

    // The mode is chosen by which room type we join; the server enforces
    // that room's rules. Both modes start from the player's persistent XP.
    const requestedMode = normalizeGameMode(variable.gameMode);
    const joinOptions = { username, idToken, xp };

    // Only the separate developer build ever sets isDevBuild(true), and
    // only that build's own env has VITE_DEV_SECRET — a normal production
    // build has neither, so this is always omitted for real players.
    // VITE_DEV_SECRET is the only client-side name: Vite loads it from
    // client/.env.devtools under `--mode devtools`.
    if (isDevBuild() && import.meta.env.VITE_DEV_SECRET) {
        joinOptions.devToken = import.meta.env.VITE_DEV_SECRET;
    }

    // MODE is replaced at build time, so the normal production build drops
    // this diagnostic (and its strings) entirely.
    if (import.meta.env.MODE !== "production" && isDevBuild()) {
        logDevTokenDiagnostic(joinOptions);
    }

    const room = await client.joinOrCreate(ROOM_NAMES[requestedMode], joinOptions);

    // A join that was started under a different identity or mode than the
    // session now running is stale (the player changed account/guest or mode
    // while it was pending). Leave it instead of adopting it, so it can never
    // save one provider's XP into the other's store.
    // Likewise for a join that was abandoned by the timeout above.
    if (
        generation !== attemptGeneration ||
        variable.identity !== identity ||
        normalizeGameMode(variable.gameMode) !== requestedMode
    ) {
        room.leave();
        const stale = new Error("Discarded a join started for a different session.");
        stale.name = "StaleJoinError";
        throw stale;
    }

    console.log("✅ Connected!");
    console.log("Room:", room.roomId);

    variable.room = room
    variable.playerId = room.sessionId;

    // The room object (and everything registered on it below) survives a
    // brief drop automatically — Colyseus's client reconnects the same Room
    // instance with exponential backoff, and the server now grants it a
    // real reconnection window (BattleRoom.onDrop), so none of these
    // listeners get re-registered or duplicated by a reconnect. Only a
    // genuinely new connect() call (this function running again) would ever
    // create a second set, and `connecting` above prevents that overlapping
    // with an in-progress one.
    room.onDrop(() => {
        showConnectionStatus("Connection lost — reconnecting…", "warn");
    });

    room.onReconnect(() => {
        hideConnectionStatus();
        // The server re-sends the room state right after this handshake.
        // Deaths that happened while we were away are already over, so that
        // first state only re-baselines each player's deathCount instead of
        // replaying a death pop at a position up to ~30s stale.
        variable.awaitingReconnectState = true;
    });

    // Fires after each decoded state/patch, i.e. after the onChange
    // callbacks below have run for it.
    room.onStateChange(() => {
        variable.awaitingReconnectState = false;
    });

    room.onLeave((code) => {
        // A leave we asked for ourselves (the "Main Menu" button calls
        // room.leave(), which closes with CloseCode.CONSENTED) is expected
        // navigation, not a failure — don't show anything for it. Anything
        // else here means reconnection was exhausted or never possible
        // (e.g. the drop happened in the first few seconds of the room's
        // life), which is a genuine disconnect worth being honest about
        // rather than leaving the game silently frozen.
        if (code === CloseCode.CONSENTED) {
            return;
        }

        variable.room = null;
        showConnectionStatus("Disconnected from server. Click to reconnect.", "error", () => {
            hideConnectionStatus();
            connect();
        });
    });

        room.onMessage("knockback", (data) => {
            if (!variable.player?.active || !variable.player.body) {
                return;
            }

            variable.player.isFastFalling = false;
            applyKnockback(
                { x: data.x, y: data.y },
                variable.player,
                data.strength ?? SETTINGS.ENEMY_KNOCKBACK
            );
        });

        room.onMessage("fastfallDenied", () => {
            variable.fastfallReady = false;
            variable.fastfallBlocked = true;

            if (variable.player?.active && variable.player.body && variable.player.isFastFalling) {
                variable.player.isFastFalling = false;
                variable.player.setVelocityY(0);
            }
        });

        // Registered here (not in DevTools.js, which only polls for the
        // room every 500ms to build its UI) so the listener exists the
        // instant the room does — these can arrive within one simulation
        // tick of joining, which is faster than that poll would notice.
        // No-ops for a normal build/player: the server only ever sends
        // these to a client that presented a devToken on join.
        room.onMessage("devAuthResult", (data) => {
            variable.devAuthorized = Boolean(data?.ok);
            variable.devLog.push(
                data?.ok
                    ? "✓ Developer authorization confirmed — commands are live."
                    : "✗ Developer authorization FAILED: " + (data?.reason || "unknown reason") + " Commands will do nothing."
            );
        });

        room.onMessage("devReply", (data) => {
            variable.devLog.push(String(data?.message ?? ""));
        });

        room.onMessage("devKicked", (data) => {
            variable.devLog.push("You were kicked: " + (data?.reason || "no reason given"));
        });

        // A persistent-XP change (main-mode XP banked at death, an FFA kill
        // reward, a dev command), as an event with a server-generated id. It
        // is applied to this connection's own provider and acknowledged only
        // once saved; the server re-sends unacknowledged ones, and the id
        // makes repeats harmless.
        room.onMessage("persistXP", (data) => {
            if (data?.xp != null) {
                variable.persistentXP = xpToString(toXP(data.xp)); // display only
                updateProgressHud();
            }

            submitXPEvent({
                identity,
                uid: accountUid,
                event: data,
                onSaved: (eventId) => {
                    if (variable.room === room) {
                        room.send("persistAck", { eventId });
                    }
                },
            });
        });

        const callbacks = Callbacks.get(room);

        callbacks.onAdd("players", (playerState, sessionId) => {
            syncGameMode(room);
            const p = createPlayer(sessionId, playerState.x, playerState.y, playerState);
            // Deaths that happened before we saw this player aren't replayed.
            p.deathCount = playerState.deathCount ?? 0;

            if (p.isLocal) {
                applyLocalPlayerState(playerState);
            } else {
                setRemotePlayerName(p, playerState.name);
                setRemotePlayerHealth(p, playerState.health, playerState.maxHealth);
                if (playerState.health <= 0) {
                    p.sprite.setVisible(false);
                    p.dead = true;
                }
            }
        
            callbacks.onChange(playerState, () => {
                const isLocal = sessionId === variable.playerId;
                const remote = variable.allPlayers[sessionId];
                syncGameMode(room);

                // The server bumps deathCount exactly once per death, so this
                // fires once even if the death and the respawn arrive in the
                // same patch (health never visibly reaching 0). It runs before
                // anything below moves or hides the sprite, so the animation
                // plays where the player was last drawn.
                const deathCount = playerState.deathCount ?? 0;
                const pendingDeath = isLocal ? variable.localDeathPendingCount : null;
                if (remote && deathCount !== remote.deathCount) {
                    const died = deathCount > (remote.deathCount ?? 0);
                    remote.deathCount = deathCount;
                    // A local death this client predicted (damagePlayer) has
                    // already played its pop; this is the server confirming it.
                    const alreadyPlayed = pendingDeath != null && deathCount >= pendingDeath;
                    if (died && !alreadyPlayed && !variable.awaitingReconnectState) {
                        playPlayerDeathAnimation(remote);
                    }
                }

                if (!isLocal && remote) {
                    remote.targetX = playerState.x;
                    remote.targetY = playerState.y;
                    setRemotePlayerName(remote, playerState.name);
                    applyPlayerPolygon(remote, getPlayerLevelFromState(playerState));

                    const prevHealth = remote.health;
                    const nextHealth = playerState.health;
                    setRemotePlayerHealth(remote, nextHealth, playerState.maxHealth);

                    if (prevHealth > 0 && nextHealth <= 0) {
                        killRemotePlayer(remote);
                    } else if (prevHealth <= 0 && nextHealth > 0) {
                        reviveRemotePlayer(remote);
                    }

                    if (playerState.slashSeq && playerState.slashSeq !== remote.lastSlashSeq) {
                        remote.lastSlashSeq = playerState.slashSeq;
                        playSlashEffect(
                            remote.targetX,
                            remote.targetY,
                            playerState.slashDirX,
                            playerState.slashDirY
                        );
                    }
                }

                if (isLocal) {
                    const prev = variable.playerHealth;
                    const next = playerState.health;

                    applyLocalPlayerState(playerState);
                    if (remote) {
                        applyPlayerPolygon(remote, getPlayerLevelFromState(playerState));
                    }

                    if (pendingDeath != null) {
                        // After a client-predicted death (damagePlayer sent
                        // "suicide"), patches the server produced before it
                        // processed that message still show us alive. Treating
                        // them as a respawn would revive the player and then
                        // kill them a second time, so hold the death until the
                        // server's deathCount (or its own health of 0) agrees.
                        // The hold is bounded: after a timeout, or on the full
                        // state re-sent after a reconnect, the server is taken
                        // at its word (the old behaviour), so a "suicide" that
                        // never arrived can't leave the player stuck dead.
                        const stillWaiting =
                            deathCount < pendingDeath &&
                            next > 0 &&
                            !variable.awaitingReconnectState &&
                            Date.now() < variable.localDeathPendingUntil;
                        if (stillWaiting) {
                            return;
                        }
                        variable.localDeathPendingCount = null;
                    }

                    variable.playerHealth = next;
                    updateHealthBar();

                    if (prev > 0 && next <= 0) {
                        handleLocalPlayerDeath();
                    } else if (prev <= 0 && next > 0) {
                        respawnPlayer({ immediate: true });
                    }
                }
            });
        });

        callbacks.onRemove("players", (player, sessionId) => {
            console.log("Player left:", sessionId);
            destroyPlayer(sessionId);
        });
        
    return room;
}

// The server's mode for this room (BattleRoomState.mode) is authoritative;
// the requested mode is only used until the first state arrives.
function syncGameMode(room) {
    if (room?.state?.mode) {
        variable.gameMode = normalizeGameMode(room.state.mode);
    }
    return variable.gameMode;
}


// Developer build only. Reports whether the client side of dev auth is
// configured and whether the token is actually on this join request, so a
// missing/misnamed env var shows up in the dev console instead of commands
// silently doing nothing. Never prints the token itself.
function logDevTokenDiagnostic(joinOptions) {
    const mode = import.meta.env.MODE;
    // The usual cause is starting Vite with plain `npm run dev` (mode
    // "development") and opening dev.html: the page is the dev build, but
    // Vite only reads client/.env.devtools in mode "devtools".
    const message = !import.meta.env.VITE_DEV_SECRET
        ? (mode !== "devtools"
            ? `✗ No developer token: this dev page is being served in Vite mode "${mode}", and client/.env.devtools is only loaded in mode "devtools". Start it with \`npm run dev:devtools\` (or build:devtools / preview:devtools).`
            : `✗ Client developer configuration is missing: VITE_DEV_SECRET is not set in client/.env.devtools (Vite mode "devtools"). Add it there and restart the dev server.`)
        : !joinOptions.devToken
            ? `✗ Developer token was not included in the connection request (VITE_DEV_SECRET is set, mode "${mode}").`
            : `Dev token sent to ${SERVER_URL} (Vite mode "${mode}"). Waiting for server authorization…`;

    // Without a token the server never replies with devAuthResult, so this
    // is already final; with one, commands stay disabled until it replies.
    variable.devAuthorized = joinOptions.devToken ? null : false;

    console.info(`[devauth] ${message}`);
    variable.devLog.push(message);
}

function applyLocalPlayerState(playerState) {
    if (playerState.maxHealth) {
        variable.playerMaxHealth = playerState.maxHealth;
    }

    // Same in every mode: FFA plays on the player's persistent progression.
    if (playerState.xp != null) {
        variable.persistentXP = xpToString(toXP(playerState.xp));
    }
    variable.runXP = playerState.runXP ?? 0;

    variable.spawnExited = !!playerState.spawnExited;
    variable.fastfallReady = playerState.fastfallReady !== false;
    updateProgressHud();
}
