import { schema } from "@colyseus/schema";

export const PlayerState = schema({
    x: { type: "number", default: 0 },
    y: { type: "number", default: 0 },
    health: { type: "number", default: 100 },
    maxHealth: { type: "number", default: 100 },
    isFastFalling: { type: "boolean", default: false },
    name: { type: "string", default: "Player" },
    xp: { type: "number", default: 0 },
    runXP: { type: "number", default: 0 },
    spawnExited: { type: "boolean", default: false },
});
