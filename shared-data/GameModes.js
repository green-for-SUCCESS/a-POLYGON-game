// Game modes. The server decides a room's mode from the room type the client
// joined (see server/src/app.config.js), never from a client-sent flag, and
// syncs it to clients as BattleRoomState.mode.
export const GAME_MODES = Object.freeze({
    MAIN: "main",
    FFA: "ffa",
});

// Colyseus room type names, one per mode.
export const ROOM_NAMES = Object.freeze({
    [GAME_MODES.MAIN]: "battle",
    [GAME_MODES.FFA]: "ffa",
});

export function normalizeGameMode(mode) {
    return mode === GAME_MODES.FFA ? GAME_MODES.FFA : GAME_MODES.MAIN;
}
