import { knockbackVelocity } from "../../../../shared-data/Combat.js";

export function applyKnockback(pusher, pushed, strength) {
    if (!pushed?.body) return;

    const knock = knockbackVelocity(pusher.x, pusher.y, pushed.x, pushed.y, strength);
    pushed.body.velocity.x += knock.vx;
    pushed.body.velocity.y += knock.vy / 4;
}
