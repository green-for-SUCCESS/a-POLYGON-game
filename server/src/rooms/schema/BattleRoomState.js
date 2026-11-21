import { schema } from "@colyseus/schema";
import { PlayerState } from "./PlayerState.js";
import { EnemyState } from "./EnemyState.js";

export const BattleRoomState = schema({
    // Set by the server from the room type (BattleRoom / FfaRoom). Declared
    // first so it is decoded before any player is added on the client.
    mode: { type: "string", default: "main" },

    players: {
        map: PlayerState,
        default: new Map(),
    },

    enemies: {
        array: EnemyState,
        default: [],
    },
});
