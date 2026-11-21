import * as Colyseus from "@colyseus/sdk";
import { Callbacks, CloseCode } from "@colyseus/sdk";

import { variable } from "../GameValues/LocalVariables.js";

import { createPlayer, applyPlayerPolygon, handleLocalPlayerDeath, playPlayerDeathAnimation, respawnPlayer, updateHealthBar, updateProgressHud, setRemotePlayerName, setRemotePlayerHealth, killRemotePlayer, reviveRemotePlayer, destroyPlayer } from "../Entities/Players.js";
import { getSession, persistXP } from "./FirebaseConfig.js";
import { applyKnockback } from "../Logic/Physics.js";
import { playSlashEffect } from "../Entities/Effects.js";
import { getPlayerLevelFromState, sanitizeXP } from "../../../../shared-data/Progression.js";
import { GAME_MODES, ROOM_NAMES, normalizeGameMode } from "../../../../shared-data/GameModes.js";
import { loadGuestProfile, saveGuestXP } from "./GuestStore.js";
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

        try {
            const room = await attemptConnect();
            hideConnectionStatus();
            return room;
        } catch (e) {
            attempt++;
            console.error(`❌ Connection attempt ${attempt} failed:`, e);

            // A network failure is not an auth failure — say which server it was.
            if (import.meta.env.MODE !== "production" && isDevBuild()) {
                variable.devLog.push(`✗ Unable to connect to the Colyseus server at ${SERVER_URL} (attempt ${attempt}). Is it running?`);
            }

            if (attempt >= MAX_AUTO_RETRIES) {
                await new Promise((resolve) => {
                    showConnectionStatus("Couldn't reach the server. Click to retry.", "error", () => {
                        attempt = 0;
                        resolve();
                    });
                });
                continue;
            }

            const delaySeconds = Math.min(10, 2 ** (attempt - 1));
            showConnectionStatus(`Connecting to the server… retrying in ${delaySeconds}s`, "warn");
            await new Promise((r) => setTimeout(r, delaySeconds * 1000));
        } finally {
            clearTimeout(slowNotice);
        }
    }
}

async function attemptConnect() {
    let username = variable.username || "";
    let xp = variable.persistentXP || 0;
    let idToken = null;

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
        xp = profile.xp;
        variable.username = profile.name;
        variable.persistentXP = profile.xp;
    } else {
        try {
            const session = await getSession();
            if (session?.username) {
                username = session.username;
                variable.username = session.username;
            }
            if (session?.xp != null) {
                xp = session.xp;
                variable.persistentXP = session.xp;
            }
            if (session?.user) {
                // Lets the server verify who this is (for ban checks) instead
                // of trusting the free-text username alone. Safe to send from
                // every build: it's the player's own per-session token, not a
                // secret, and the server only uses it to read their uid.
                idToken = await session.user.getIdToken();
            }
        } catch {
        }
    }

    // The mode is chosen by which room type we join; the server enforces
    // that room's rules. FFA ignores persistent XP, so it isn't sent there.
    const requestedMode = normalizeGameMode(variable.gameMode);
    const joinOptions = { username, idToken };
    if (requestedMode === GAME_MODES.MAIN) {
        joinOptions.xp = xp;
    }

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
    if (variable.identity !== identity || normalizeGameMode(variable.gameMode) !== requestedMode) {
        room.leave();
        throw new Error("Discarded a join started for a different session.");
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

        room.onMessage("persistXP", (data) => {
            // Only main mode has persistent progression. The server never
            // sends this from an FFA room; ignoring it here as well means FFA
            // XP can't reach a save even if that ever changed.
            if (syncGameMode(room) !== GAME_MODES.MAIN) {
                return;
            }

            const nextXP = sanitizeXP(data?.xp);
            variable.persistentXP = nextXP;
            variable.runXP = 0;
            updateProgressHud();
            saveProgress(identity, nextXP);
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
                const mode = syncGameMode(room);

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
                    applyPlayerPolygon(remote, getPlayerLevelFromState(playerState, mode));

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
                        applyPlayerPolygon(remote, getPlayerLevelFromState(playerState, mode));
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
        
    // A player who just died while offline (or whose connection drops the
    // instant they do) shouldn't lose XP they already earned just because
    // this one write failed — try again a few times, and if that's still
    // not enough, stash it so a later page load can finish the job instead
    // of silently discarding it. Firebase accounts only: guest saves are
    // local and synchronous, so they never leave anything pending.
    if (identity !== "guest") {
        flushPendingXP();
    }

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

// Persistent main-mode progression goes to exactly one provider: the one
// this connection was opened for (Home screen choice), not whether Firebase
// happens to have a signed-in user.
function saveProgress(identity, xp) {
    if (identity === "guest") {
        saveGuestXP(xp);
        return;
    }

    persistXPWithRetry(xp);
}

const PENDING_XP_KEY = "pendingPersistXP";
const PERSIST_RETRY_DELAYS_MS = [1000, 3000, 10000];

async function persistXPWithRetry(xp, attempt = 0) {
    try {
        await persistXP(xp);
        clearPendingXP(xp);
    } catch (e) {
        console.error(`❌ persistXP failed (attempt ${attempt + 1}):`, e);

        if (attempt < PERSIST_RETRY_DELAYS_MS.length) {
            setTimeout(() => persistXPWithRetry(xp, attempt + 1), PERSIST_RETRY_DELAYS_MS[attempt]);
        } else {
            savePendingXP(xp);
        }
    }
}

function savePendingXP(xp) {
    try {
        // Never stash a value lower than whatever's already pending —
        // another failed save earlier in the same outage may have recorded
        // a higher (more up to date) amount already.
        const existing = Number(localStorage.getItem(PENDING_XP_KEY));
        if (!Number.isFinite(existing) || xp > existing) {
            localStorage.setItem(PENDING_XP_KEY, String(xp));
        }
    } catch {
        // localStorage unavailable (private browsing, etc.) — nothing more
        // we can do locally; the attempt was already logged above.
    }
}

function clearPendingXP(savedXp) {
    try {
        const existing = Number(localStorage.getItem(PENDING_XP_KEY));
        if (Number.isFinite(existing) && existing <= savedXp) {
            localStorage.removeItem(PENDING_XP_KEY);
        }
    } catch {
    }
}

// Runs once per successful connection: if a previous session left XP that
// never made it to Firestore, retry it now rather than leaving it stranded
// in localStorage forever.
function flushPendingXP() {
    let pending;
    try {
        pending = Number(localStorage.getItem(PENDING_XP_KEY));
    } catch {
        return;
    }

    if (Number.isFinite(pending) && pending > 0) {
        persistXPWithRetry(pending);
    }
}

// Developer build only. Reports whether the client side of dev auth is
// configured and whether the token is actually on this join request, so a
// missing/misnamed env var shows up in the dev console instead of commands
// silently doing nothing. Never prints the token itself.
function logDevTokenDiagnostic(joinOptions) {
    const mode = import.meta.env.MODE;
    const message = !import.meta.env.VITE_DEV_SECRET
        ? `✗ Client developer configuration is missing: VITE_DEV_SECRET is not set (Vite mode "${mode}"). Set it in client/.env.devtools and restart the dev server.`
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

    if (variable.gameMode === GAME_MODES.FFA) {
        // FFA progression is the run's temporary XP. The persistent XP held
        // on this client is left exactly as it was.
        variable.ffaXP = sanitizeXP(playerState.ffaXP);
    } else {
        if (playerState.xp != null) {
            variable.persistentXP = playerState.xp;
        }
        variable.runXP = playerState.runXP ?? 0;
    }

    variable.spawnExited = !!playerState.spawnExited;
    variable.fastfallReady = playerState.fastfallReady !== false;
    updateProgressHud();
}
