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

// Area of a regular polygon: A = n * s^2 / (4 * tan(pi/n))
export function getRegularPolygonArea(sideLength, sides) {
    return (sides * sideLength * sideLength) / (4 * Math.tan(Math.PI / sides));
}

// Inverse of the above: the side length that gives a regular n-gon area A.
export function getRegularPolygonSideForArea(area, sides) {
    return Math.sqrt((area * 4 * Math.tan(Math.PI / sides)) / sides);
}

const PLAYER_MIN_SIDES = 3;
const PLAYER_MAX_SIDES = 7;

// Level 1 -> triangle, Level 5+ -> heptagon (capped). Never more than 7 sides.
export function getPlayerSides(level) {
    const lvl = Math.max(1, level | 0);
    return Math.min(PLAYER_MIN_SIDES + (lvl - 1), PLAYER_MAX_SIDES);
}

// The player's Level-1 triangle is defined to be IDENTICAL to the enemy
// Triangle (rarity 0): same side count, same side length, same area. Every
// later level keeps this exact area while gaining sides, so the polygon gets
// rounder (and its side length shrinks) but never bigger or smaller overall.
export function getPlayerTargetArea() {
    return getRegularPolygonArea(SETTINGS.ENEMY_SIDE_LENGTH, PLAYER_MIN_SIDES);
}

export function getPlayerSideLength(level) {
    return getRegularPolygonSideForArea(getPlayerTargetArea(), getPlayerSides(level));
}

export function getPlayerPolygonMetrics(level) {
    const sides = getPlayerSides(level);
    const sideLength = getPlayerSideLength(level);
    return { sides, sideLength, ...getRegularPolygonMetrics(sides, sideLength) };
}
