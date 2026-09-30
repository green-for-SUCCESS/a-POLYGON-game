import { applyKnockbackToVelocity } from "../../../../shared-data/Combat.js";

export function applyKnockback(pusher, pushed, strength) {
    if (!pushed?.body) return;

    applyKnockbackToVelocity(pushed.body.velocity, pusher.x, pusher.y, pushed.x, pushed.y, strength, 0.25);
}
