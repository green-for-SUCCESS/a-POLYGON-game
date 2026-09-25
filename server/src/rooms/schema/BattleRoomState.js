import { schema } from "@colyseus/schema";
import { PlayerState } from "./PlayerState.js";
import { EnemyState } from "./EnemyState.js";

export const BattleRoomState = schema({
    players: {
        map: PlayerState,
        default: new Map(),
    },

    enemies: {
        array: EnemyState,
        default: [],
    },
});
