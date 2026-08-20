import { variable } from "../GameValues/LocalVariables.js";
import { SETTINGS } from "../../../../shared-data/Constants.js";

// =====================================================
// KNOCKBACK
// =====================================================
// pusher only needs { x, y } (enemy origin from the server).
// pushed must be a Phaser sprite with a physics body.
export function applyKnockback(pusher, pushed, strength) {
    if (!pushed?.body) return;

    const dx = pushed.x - pusher.x;
    const dy = pushed.y - pusher.y;

    const length = Math.sqrt(dx * dx + dy * dy);

    if (length === 0) return;

    pushed.body.velocity.x += (dx / length) * strength;
    pushed.body.velocity.y += (dy / length / 4) * strength;
}

