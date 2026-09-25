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

// Rotate so an edge midpoint faces +Y (canvas down). That edge is horizontal
// and is the lowest part of the polygon for every n >= 3.
export function getRegularPolygonRotation(sides) {
    return Math.PI / 2 - Math.PI / sides;
}

export function getRegularPolygonPoints(cx, cy, sides, radius) {
    const points = [];
    const rotation = getRegularPolygonRotation(sides);

    for (let i = 0; i < sides; i++) {
        const angle = rotation + (i * 2 * Math.PI) / sides;
        points.push({
            x: cx + Math.cos(angle) * radius,
            y: cy + Math.sin(angle) * radius,
        });
    }

    return points;
}

export function getRegularPolygonMetrics(sides, sideLength = SETTINGS.ENEMY_SIDE_LENGTH) {
    const radius = getRegularPolygonRadius(sides, sideLength);
    const points = getRegularPolygonPoints(0, 0, sides, radius);

    let maxAbsX = 0;
    let maxY = -Infinity;

    for (const point of points) {
        maxAbsX = Math.max(maxAbsX, Math.abs(point.x));
        maxY = Math.max(maxY, point.y);
    }

    return {
        radius,
        apothem: radius * Math.cos(Math.PI / sides),
        width: maxAbsX * 2,
        height: maxY * 2,
    };
}

export function getEnemyBodyMetrics(rarity) {
    return getRegularPolygonMetrics(getEnemySides(rarity));
}
