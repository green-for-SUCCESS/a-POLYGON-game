import { SETTINGS } from "./Constants.js";

export function getEnemySides(rarity) {
    const clamped = Math.max(0, Math.min(SETTINGS.ENEMY_RARITY_MAX, rarity | 0));
    return 3 + clamped;
}

export function getRegularPolygonRadius(sides, sideLength = SETTINGS.ENEMY_SIDE_LENGTH) {
    return sideLength / (2 * Math.sin(Math.PI / sides));
}

export function getEnemyRadius(rarity) {
    return getRegularPolygonRadius(getEnemySides(rarity));
}

export function getRegularPolygonPoints(cx, cy, sides, radius) {
    const points = [];
    const rotation = -Math.PI / 2;

    for (let i = 0; i < sides; i++) {
        const angle = rotation + (i * 2 * Math.PI) / sides;
        points.push({
            x: cx + Math.cos(angle) * radius,
            y: cy + Math.sin(angle) * radius,
        });
    }

    return points;
}
