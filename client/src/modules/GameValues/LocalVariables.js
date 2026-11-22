// =====================================================
// GAME VARIABLES
// =====================================================

export const variable = {
    room: null,
    player: null,
    playerId: null,
    username: null,
    allPlayers: {},
    cursors: null,
    wasd: null,
    groundBlocks: [],
    stoneBlocks: [],
    spikeBlocks: [],
    platforms: [],
    enemySpawnTimer: 0,
    checkpoints: [],
    lastCheckpoint: null,
    playerHealth: 0,
    healthBarBg: null,
    healthBarFill: null,
    healthBarDelayed: null,
    healthBarTargetWidth: 300,
    playerSpawnProtected: false,
    sightGraphics: null,
    grassScale: null,
    grassScaledWidth: null,
    grassScaledHeight: null,
    stoneScale: null,
    stoneW: null,
    stoneH: null,
    blockWidth: null,
    blockHeight: null,
    deathScreen: null,
    // Set while a death this client predicted (spikes / offline suicide path)
    // waits for the server's matching deathCount. See Network.js.
    localDeathPendingCount: null,
    localDeathPendingUntil: 0,
    // True between a reconnect handshake and the state the server re-sends.
    awaitingReconnectState: false,
    sceneRef: null,
    enemies: {},
    enemyVisuals: [],
    xpHud: null,
    playerMaxHealth: 100,
    spawnExited: false,
    fastfallReady: true,
    fastfallBlocked: false,
    persistentXP: 0,
    runXP: 0,
    // Which mode this game session plays ("main" | "ffa", see
    // shared-data/GameModes.js). Requested from the Home screen, then
    // replaced by the server's own room state once connected.
    gameMode: "main",
    // Where persistent progression lives for this session: "account"
    // (Firebase) or "guest" (this browser's localStorage, GuestStore.js).
    identity: "account",
    allBlocks: [],
    // Harmless in a normal build (never pushed to — the server only sends
    // dev-* messages to a client that presented a devToken). The dev
    // console (modules/Dev/DevTools.js) drains this; kept here instead of
    // in that dev-only module so Network.js can register the listener
    // immediately on connect without importing dev-only UI code.
    devLog: [],
    // Dev console only: null = waiting for the server's devAuthResult,
    // true/false = its answer. UI gating only; the server enforces it.
    devAuthorized: null,
}