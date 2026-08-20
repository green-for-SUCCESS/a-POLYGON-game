import { schema } from "@colyseus/schema";

export const EnemyState = schema({
    x: { type: "number", default: 0 },
    y: { type: "number", default: 0 },
    velocityX: { type: "number", default: 0 },
    velocityY: { type: "number", default: 0 },
    state: { type: "number", default: 0 },
    attackDirection: { type: "number", default: 0 },
});
