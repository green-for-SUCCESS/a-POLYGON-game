import { BattleRoom } from "./BattleRoom.js";
import { GAME_MODES } from "../../../shared-data/GameModes.js";

// Free-for-All PvP arena. Same networking, reconnection, health/regen, death,
// persistence and dev-command handling as the main room; the differences are
// decided by `mode`, which is fixed here on the server:
//   - HeadlessGame runs with PvP on and no enemies,
//   - players keep their persistent XP/level, and each server-credited kill
//     adds XP to it, saved immediately through the same XP-event path main
//     mode uses (Firestore for accounts, localStorage for guests).
export class FfaRoom extends BattleRoom {
    static mode = GAME_MODES.FFA;
}
