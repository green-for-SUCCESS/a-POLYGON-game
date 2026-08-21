import * as Colyseus from "@colyseus/sdk";
import { Callbacks } from "@colyseus/sdk";

import { variable } from "../GameValues/LocalVariables.js";

import { createPlayer, shatterPlayer, respawnPlayer, updateHealthBar } from "../Entities/Players.js";
import { createRemoteEnemy, removeRemoteEnemy, updateRemoteEnemy } from "../Entities/Enemies.js";
import { shatterAt } from "../Entities/Effects.js";
import { applyKnockback } from "../Logic/Physics.js";
import { SETTINGS } from "../../../../shared-data/Constants.js";

export const client = new Colyseus.Client("https://a-polygon-game.onrender.com");

export async function connect() {
    try {
        const room = await client.joinOrCreate("battle");

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

        const callbacks = Callbacks.get(room);

        callbacks.onAdd("players", (playerState, sessionId) => {
            // Spawns local or remote player based on sessionId match
            const p = createPlayer(sessionId, playerState.x, playerState.y);
        
            callbacks.onChange(playerState, () => {
                const isLocal = sessionId === variable.playerId;

                if (!isLocal && variable.allPlayers[sessionId]) {
                    variable.allPlayers[sessionId].targetX = playerState.x;
                    variable.allPlayers[sessionId].targetY = playerState.y;
                }

                if (isLocal) {
                    const prev = variable.playerHealth;
                    const next = playerState.health;

                    variable.playerHealth = next;
                    updateHealthBar();

                    if (prev > 0 && next <= 0) {
                        // Server killed us — trigger visual death (no auto-respawn)
                        shatterPlayer();
                    } else if (prev <= 0 && next > 0) {
                        // Server already waited the respawn delay — re-enable immediately
                        respawnPlayer({ immediate: true });
                    }
                }
            });
        });

        callbacks.onRemove("players", (player, sessionId) => {
            console.log("Player left:", sessionId);

            if (variable.allPlayers[sessionId]) {
                // Destroy the visual sprite in Phaser
                variable.allPlayers[sessionId].sprite.destroy();
                
                // Remove from local reference
                delete variable.allPlayers[sessionId];
            }
        });

        callbacks.onAdd("enemies", (enemyState, enemyId) => {
            createRemoteEnemy(enemyId, enemyState.x, enemyState.y);

            callbacks.onChange(enemyState, () => {
                updateRemoteEnemy(enemyId, enemyState.x, enemyState.y, enemyState.state);
            });
        });

        callbacks.onRemove("enemies", (enemyState, enemyId) => {
            shatterAt(
                enemyState.x,
                enemyState.y,
                enemyState.velocityX ?? 0,
                enemyState.velocityY ?? 0,
                "enemy"
            );
            removeRemoteEnemy(enemyId);
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