import { Room } from "colyseus";
import { BattleRoomState } from "./schema/BattleRoomState.js";
import { PlayerState } from "./schema/PlayerState.js";
import { EnemyState } from "./schema/EnemyState.js";
import { HeadlessGame } from "../headless/HeadlessGame.js";
import { SETTINGS } from "../../../shared-data/Constants.js";

export class BattleRoom extends Room {

    state = new BattleRoomState();

    onCreate(options) {
        this.game = new HeadlessGame();
        this.game.setPlayers(this.state.players);

        // Tracks which players are currently dead (awaiting respawn)
        this._deadPlayers = new Set();

        this.onMessage("updatePosition", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.health <= 0) {
                return;
            }

            player.x = data.x;
            player.y = data.y;
            player.isFastFalling = !!data.isFastFalling;
        });

        this.setSimulationInterval((deltaTime) => {
            this.game.update(deltaTime);
            this.game.resolveFastFallHits();
            this._syncEnemies();
            this._dispatchKnockbacks();
            this._checkDeaths();
        });
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

    _checkDeaths() {
        for (const [sessionId, player] of this.state.players) {
            if (player.health <= 0 && !this._deadPlayers.has(sessionId)) {
                this._deadPlayers.add(sessionId);

                this.clock.setTimeout(() => {
                    if (!this.state.players.has(sessionId)) return;

                    const p = this.state.players.get(sessionId);
                    p.health = SETTINGS.PLAYER_MAX_HEALTH;
                    p.x = SETTINGS.PLAYER_START_X;
                    p.y = 700;
                    p.isFastFalling = false;

                    this._deadPlayers.delete(sessionId);
                }, SETTINGS.PLAYER_RESPAWN_DELAY);
            }
        }
    }

    _syncEnemies() {
        for (const [id] of this.game.enemies) {
            if (!this.state.enemies.has(id)) {
                this.state.enemies.set(id, new EnemyState());
            }
        }

        for (const id of [...this.state.enemies.keys()]) {
            if (!this.game.enemies.has(id)) {
                this.state.enemies.delete(id);
            }
        }

        this.game.syncEnemiesTo(this.state.enemies);
    }

    onJoin(client) {
        const player = new PlayerState();

        player.x = 100;
        player.y = SETTINGS.ENTITY_SPAWN_HEIGHT;

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
