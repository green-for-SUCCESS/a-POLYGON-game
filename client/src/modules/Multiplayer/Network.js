import * as Colyseus from "@colyseus/sdk";
import { Callbacks } from "@colyseus/sdk";

import { variable } from "../GameValues/LocalVariables.js";

import { createPlayer, shatterPlayer, respawnPlayer, updateHealthBar, updateProgressHud, setRemotePlayerName, setRemotePlayerHealth, killRemotePlayer, reviveRemotePlayer, destroyPlayer } from "../Entities/Players.js";
import { getSession, persistXP } from "./FirebaseConfig.js";
import { applyKnockback } from "../Logic/Physics.js";
import { SETTINGS } from "../../../../shared-data/Constants.js";

export const client = new Colyseus.Client("https://a-polygon-game.onrender.com");

export async function connect() {
    try {
        let username = variable.username || "";
        let xp = variable.persistentXP || 0;

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
        } catch {
        }

        const room = await client.joinOrCreate("battle", { username, xp });

        console.log("✅ Connected!");
        console.log("Room:", room.roomId);

        variable.room = room
        variable.playerId = room.sessionId;

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

        room.onMessage("persistXP", (data) => {
            const nextXP = Math.max(0, Math.floor(Number(data?.xp) || 0));
            variable.persistentXP = nextXP;
            variable.runXP = 0;
            updateProgressHud();
            persistXP(nextXP).catch(() => {});
        });

        const callbacks = Callbacks.get(room);

        callbacks.onAdd("players", (playerState, sessionId) => {
            const p = createPlayer(sessionId, playerState.x, playerState.y);

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

                    const prevHealth = remote.health;
                    const nextHealth = playerState.health;
                    setRemotePlayerHealth(remote, nextHealth);

                    if (prevHealth > 0 && nextHealth <= 0) {
                        killRemotePlayer(remote);
                    } else if (prevHealth <= 0 && nextHealth > 0) {
                        reviveRemotePlayer(remote);
                    }
                }

                if (isLocal) {
                    const prev = variable.playerHealth;
                    const next = playerState.health;

                    applyLocalPlayerState(playerState);
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
    catch (e) {
        console.error("❌ Connection failed:", e);
        if (e && e.data) {
            console.log("Server response:", e.data);
        }
    }
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
    updateProgressHud();
}
