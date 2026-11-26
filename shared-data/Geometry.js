import { SETTINGS } from "./Constants.js";

// Enemies: one side per rarity point from rarity 3 up, capped at
// ENEMY_MAX_SIDES, so the rarity-13 boss is the only 13-sided enemy and
// rarities 0-3 are triangles (zone 1 keeps its triangles).
export const ENEMY_MAX_SIDES = 13;

export function getEnemySides(rarity) {
    return Math.max(3, Math.min(ENEMY_MAX_SIDES, rarity | 0));
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

export const PLAYER_MIN_SIDES = 3;
// Evolution stops here (heptagon). This caps the SHAPE only: levels, XP and
// every level-based stat keep growing past it (see Progression.js). Player
// and enemy side limits are independent (see ENEMY_MAX_SIDES).
export const PLAYER_MAX_SIDES = 7;

// Polygon evolution. Each evolution takes 10 more levels than the previous
// one: triangle -> square takes 15, square -> pentagon 25, pentagon ->
// hexagon 35, and so on. Evolution k therefore costs 5 + 10k levels, so a
// player with 3 + k sides has reached level
//   1 + sum_{i=1..k} (5 + 10i) = 1 + 10k + 5k^2
// (square at 16, pentagon at 41, hexagon at 76, heptagon at 121), after
// which the side count stays at PLAYER_MAX_SIDES. This is the only
// place the thresholds live; everything else derives the shape from the
// level through getPlayerSides.
export function getPlayerEvolutionLevel(sides) {
    const k = Math.max(0, Math.floor(sides) - PLAYER_MIN_SIDES);
    return 1 + 10 * k + 5 * k * k;
}

export function getPlayerSides(level) {
    const lvl = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
    if (lvl >= getPlayerEvolutionLevel(PLAYER_MAX_SIDES)) {
        return PLAYER_MAX_SIDES;
    }

    // Invert 1 + 10k + 5k^2 <= level, then correct for floating-point error
    // so the result always agrees exactly with getPlayerEvolutionLevel.
    let k = Math.max(0, Math.floor((Math.sqrt(80 + 20 * lvl) - 10) / 10));
    while (getPlayerEvolutionLevel(PLAYER_MIN_SIDES + k + 1) <= lvl) {
        k++;
    }
    while (k > 0 && getPlayerEvolutionLevel(PLAYER_MIN_SIDES + k) > lvl) {
        k--;
    }

    return Math.min(PLAYER_MIN_SIDES + k, PLAYER_MAX_SIDES);
}

// The player's Level-1 triangle is defined to be IDENTICAL to the enemy
// Triangle (rarity 0): same side count, same side length, same area. Every
// later level keeps this exact area while gaining sides, so the polygon gets
// rounder (and its side length shrinks) but never bigger or smaller overall.
export function getPlayerTargetArea() {
    return getRegularPolygonArea(SETTINGS.ENEMY_SIDE_LENGTH, PLAYER_MIN_SIDES);
}

export function getPlayerSideLengthForSides(sides) {
    return getRegularPolygonSideForArea(getPlayerTargetArea(), sides);
}

export function getPlayerSideLength(level) {
    return getPlayerSideLengthForSides(getPlayerSides(level));
}

export function getPlayerPolygonMetrics(level) {
    const sides = getPlayerSides(level);
    const sideLength = getPlayerSideLength(level);
    return { sides, sideLength, ...getRegularPolygonMetrics(sides, sideLength) };
}
