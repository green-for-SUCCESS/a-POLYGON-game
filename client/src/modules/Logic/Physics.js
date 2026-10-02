import { SETTINGS } from "../../../../shared-data/Constants.js";
import { applyKnockbackToVelocity } from "../../../../shared-data/Combat.js";

export function applyKnockback(pusher, pushed, strength) {
    if (!pushed?.body) return;

    applyKnockbackToVelocity(pushed.body.velocity, pusher.x, pusher.y, pushed.x, pushed.y, strength, { verticalScale: 0.25, mass: SETTINGS.PLAYER_MASS });
}
