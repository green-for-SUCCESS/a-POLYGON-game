import { SETTINGS } from "./Constants.js";

export function getLinearFalloff(distance, radius) {
    if (radius <= 0) {
        return 0;
    }

    return Math.max(0, 1 - distance / radius);
}

export function knockbackVelocity(fromX, fromY, toX, toY, strength) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const distance = Math.max(Math.hypot(dx, dy), 1);

    return {
        vx: (dx / distance) * strength,
        vy: (dy / distance) * strength,
        distance,
    };
}

// Shared apply step for both the client (Phaser sprite/body) and the
// headless simulation (raw Arcade Body): both only need an object with a
// mutable {x, y} velocity, so this works without any Phaser GameObject.
// `strength` is an impulse (velocity change for a mass-1 body): dv = strength / mass,
// so heavier targets are pushed proportionally less by the same hit.
export function applyKnockbackToVelocity(velocity, fromX, fromY, toX, toY, strength, { verticalScale = 1, mass = 1 } = {}) {
    const knock = knockbackVelocity(fromX, fromY, toX, toY, strength);
    const invMass = 1 / Math.max(mass, 1e-6);

    velocity.x += knock.vx * invMass;
    velocity.y += knock.vy * verticalScale * invMass;

    return knock;
}

// Fastfall cooldown is a fixed base value that never scales with player level.
// cooldownReduction is a placeholder hook for future item modifiers — it is
// currently always 0, but callers won't need to change once items exist.
export function getFastfallCooldown(cooldownReduction = 0) {
    return Math.max(
        SETTINGS.PLAYER_FASTFALL_MIN_COOLDOWN,
        SETTINGS.PLAYER_FASTFALL_COOLDOWN - cooldownReduction
    );
}
