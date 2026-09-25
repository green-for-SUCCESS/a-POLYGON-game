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
