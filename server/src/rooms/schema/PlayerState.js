import { schema } from "@colyseus/schema";

export const PlayerState = schema({
    x: { type: "number", default: 0 },
    y: { type: "number", default: 0 },
    health: { type: "number", default: 100 },
    // Incremented by the server on every death (HeadlessGame._endRun). The
    // client plays the death animation when this changes, not by inferring
    // death from health, which can miss a death + respawn in one patch.
    deathCount: { type: "number", default: 0 },
    maxHealth: { type: "number", default: 100 },
    isFastFalling: { type: "boolean", default: false },
    fastfallReady: { type: "boolean", default: true },
    name: { type: "string", default: "Player" },
    xp: { type: "number", default: 0 },
    runXP: { type: "number", default: 0 },
    spawnExited: { type: "boolean", default: false },
    slashDirX: { type: "number", default: 0 },
    slashDirY: { type: "number", default: 0 },
    slashSeq: { type: "number", default: 0 },
});
