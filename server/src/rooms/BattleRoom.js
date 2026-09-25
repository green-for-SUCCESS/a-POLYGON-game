import { Room } from "colyseus";
import { BattleRoomState } from "./schema/BattleRoomState.js";
import { PlayerState } from "./schema/PlayerState.js";
import { EnemyState } from "./schema/EnemyState.js";
import { HeadlessGame } from "../headless/HeadlessGame.js";

export class BattleRoom extends Room {

    state = new BattleRoomState();

    onCreate(options) {
        this.game = new HeadlessGame();
        this.game.setPlayers(this.state.players);

        this.onMessage("updatePosition", (client, data) => {
            this.game.applyPlayerInput(client.sessionId, data);
        });

        this.onMessage("suicide", (client) => {
            this.game.killPlayer(client.sessionId);
        });

        this.onMessage("respawn", (client) => {
            this.game.respawnPlayer(client.sessionId);
        });

        this.setSimulationInterval((deltaTime) => {
            this.game.update(deltaTime);
            this._syncEnemies();
            this._dispatchKnockbacks();
            this._dispatchPersists();
        });
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

        console.log("Players in room:", this.state.players);
        console.log("Player added:", client.sessionId);
        console.log(client.sessionId, "joined!");
    }

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
