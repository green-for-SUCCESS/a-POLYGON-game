import { schema } from "@colyseus/schema";

export const EnemyState = schema({
    // HeadlessGame's own key for this enemy. The array is index-synced, so
    // entries shift when an enemy dies; the client keys its visuals on this
    // instead, which is what makes a death unambiguous to detect.
    id: { type: "number", default: -1 },
    x: { type: "number", default: 0 },
    y: { type: "number", default: 0 },
    rarity: { type: "number", default: 0 },
    velocityX: { type: "number", default: 0 },
    velocityY: { type: "number", default: 0 },
    state: { type: "number", default: 0 },
    attackDirection: { type: "number", default: 0 },
    health: { type: "number", default: 0 },
    maxHealth: { type: "number", default: 0 },
});
