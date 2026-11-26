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
    // Persistent XP as an exact decimal string: it can exceed what a Number
    // holds exactly (developer commands go up to 10^250). runXP is a
    // string for the same reason.
    xp: { type: "string", default: "0" },
    // Unbanked run XP, also an exact decimal string (gameplay XP can reach
    // 10^50, beyond what a Number holds exactly).
    runXP: { type: "string", default: "0" },
    spawnExited: { type: "boolean", default: false },
    slashDirX: { type: "number", default: 0 },
    slashDirY: { type: "number", default: 0 },
    slashSeq: { type: "number", default: 0 },
});
