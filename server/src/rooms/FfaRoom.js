import { BattleRoom } from "./BattleRoom.js";
import { GAME_MODES } from "../../../shared-data/GameModes.js";

// Free-for-All PvP arena. Same networking, reconnection, health/regen, death
// and dev-command handling as the main room; the differences are all decided
// by `mode`, which is fixed here on the server:
//   - HeadlessGame runs with PvP on and no enemies,
//   - progression comes from each player's temporary ffaXP, earned only by
//     server-credited kills, kept through deaths/respawns in this room and
//     discarded when the player leaves (or the arena is disposed),
//   - nothing is ever sent to a client to persist.
export class FfaRoom extends BattleRoom {
    static mode = GAME_MODES.FFA;
}
