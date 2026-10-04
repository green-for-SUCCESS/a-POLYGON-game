import * as Colyseus from "@colyseus/sdk";
import { Callbacks, CloseCode } from "@colyseus/sdk";

import { variable } from "../GameValues/LocalVariables.js";

import { createPlayer, applyPlayerPolygon, shatterPlayer, respawnPlayer, updateHealthBar, updateProgressHud, setRemotePlayerName, setRemotePlayerHealth, killRemotePlayer, reviveRemotePlayer, destroyPlayer } from "../Entities/Players.js";
import { getSession, persistXP } from "./FirebaseConfig.js";
import { applyKnockback } from "../Logic/Physics.js";
import { playSlashEffect } from "../Entities/Effects.js";
import { getPlayerLevelFromState } from "../../../../shared-data/Progression.js";
import { SETTINGS } from "../../../../shared-data/Constants.js";
import { isDevBuild } from "../Dev/DevFlag.js";
import { showConnectionStatus, hideConnectionStatus } from "./ConnectionStatus.js";

export const client = new Colyseus.Client("https://a-polygon-game.onrender.com");

// Serializes connection attempts: a stray second call to connect() (e.g. a
// manual retry click landing while an auto-retry is still in flight) must
// never race a second joinOrCreate() for the same player, which is how you
// end up with two separate rooms/listener sets for one player.
let connecting = false;
const MAX_AUTO_RETRIES = 5;

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
        try {
            const room = await attemptConnect();
            hideConnectionStatus();
            return room;
        } catch (e) {
            attempt++;
            console.error(`❌ Connection attempt ${attempt} failed:`, e);

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
        }
    }
}

async function attemptConnect() {
    let username = variable.username || "";
    let xp = variable.persistentXP || 0;
    let idToken = null;

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

    const joinOptions = { username, xp, idToken };

    // Only the separate developer build ever sets isDevBuild(true), and
    // only that build's own env has VITE_DEV_SECRET — a normal production
    // build has neither, so this is always omitted for real players.
    if (isDevBuild() && import.meta.env.VITE_DEV_SECRET) {
        joinOptions.devToken = import.meta.env.VITE_DEV_SECRET;
    }

    const room = await client.joinOrCreate("battle", joinOptions);

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
            variable.devLog.push(
                data?.ok
                    ? "✓ Developer authorization confirmed — K/L/R and commands are live."
                    : "✗ Developer authorization FAILED: " + (data?.reason || "unknown reason") + " K/L/R and commands will do nothing."
            );
        });

        room.onMessage("devReply", (data) => {
            variable.devLog.push(String(data?.message ?? ""));
        });

        room.onMessage("devKicked", (data) => {
            variable.devLog.push("You were kicked: " + (data?.reason || "no reason given"));
        });

        room.onMessage("persistXP", (data) => {
            const nextXP = Math.max(0, Math.floor(Number(data?.xp) || 0));
            variable.persistentXP = nextXP;
            variable.runXP = 0;
            updateProgressHud();
            persistXP(nextXP).catch(() => {});
        });

        const callbacks = Callbacks.get(room);

        callbacks.onAdd("players", (playerState, sessionId) => {
            const p = createPlayer(sessionId, playerState.x, playerState.y, playerState);

            if (p.isLocal) {
                applyLocalPlayerState(playerState);
            } else {
                setRemotePlayerName(p, playerState.name);
                setRemotePlayerHealth(p, playerState.health);
                if (playerState.health <= 0) {
                    p.sprite.setVisible(false);
                    p.dead = true;
                }
            }
        
            callbacks.onChange(playerState, () => {
                const isLocal = sessionId === variable.playerId;
                const remote = variable.allPlayers[sessionId];

                if (!isLocal && remote) {
                    remote.targetX = playerState.x;
                    remote.targetY = playerState.y;
                    setRemotePlayerName(remote, playerState.name);
                    applyPlayerPolygon(remote, getPlayerLevelFromState(playerState));

                    const prevHealth = remote.health;
                    const nextHealth = playerState.health;
                    setRemotePlayerHealth(remote, nextHealth);

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
                    variable.playerHealth = next;
                    updateHealthBar();

                    if (prev > 0 && next <= 0) {
                        shatterPlayer();
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

function applyLocalPlayerState(playerState) {
    if (playerState.maxHealth) {
        variable.playerMaxHealth = playerState.maxHealth;
    }

    if (playerState.xp != null) {
        variable.persistentXP = playerState.xp;
    }

    variable.runXP = playerState.runXP ?? 0;
    variable.spawnExited = !!playerState.spawnExited;
    variable.fastfallReady = playerState.fastfallReady !== false;
    updateProgressHud();
}
