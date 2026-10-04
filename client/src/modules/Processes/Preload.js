// =====================================================
// PRELOAD
// =====================================================

import { SETTINGS, ENEMY_RARITY_COLORS } from "../../../../shared-data/Constants.js";
import { getEnemySides, getEnemyRadius, getRegularPolygonPoints, getPlayerSideLength, getRegularPolygonRadius } from "../../../../shared-data/Geometry.js";

export function preload() {
    const base = import.meta.env.BASE_URL;

    this.load.image('grass', `${base}assets/Grass.png`);
    this.load.image('stone', `${base}assets/Stone.png`);
    this.load.image('spike', `${base}assets/Spikes.png`);

    // PLAYER

    const p = this.add.graphics();

    p.fillStyle(0xffffff, 1);

    p.fillRect(
        0,
        0,
        SETTINGS.PLAYER_SIZE,
        SETTINGS.PLAYER_SIZE
    );

    p.generateTexture(
        'player',
        SETTINGS.PLAYER_SIZE,
        SETTINGS.PLAYER_SIZE
    );

    p.destroy();

    // PLAYER POLYGON (per level, white so tint works the same as the old square)
    // Level 1 == a triangle identical to the enemy Triangle; every later level
    // trades side length for side count, keeping area constant (see Geometry.js).
    for (let sides = 3; sides <= 7; sides++) {
        const sideLength = getPlayerSideLength(sides - 2); // level = sides - 2
        const radius = getRegularPolygonRadius(sides, sideLength);
        const size = Math.ceil(radius * 2) + 4;
        const pg = this.add.graphics();
        const points = getRegularPolygonPoints(size / 2, size / 2, sides, radius);

        pg.fillStyle(0xffffff, 1);
        pg.beginPath();
        pg.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            pg.lineTo(points[i].x, points[i].y);
        }
        pg.closePath();
        pg.fillPath();
        pg.generateTexture(`player-${sides}`, size, size);
        pg.destroy();
    }

    for (let rarity = 0; rarity <= SETTINGS.ENEMY_RARITY_MAX; rarity++) {
        const sides = getEnemySides(rarity);
        const radius = getEnemyRadius(rarity);
        const size = Math.ceil(radius * 2) + 4;
        const g = this.add.graphics();
        const points = getRegularPolygonPoints(size / 2, size / 2, sides, radius);

        g.fillStyle(ENEMY_RARITY_COLORS[rarity], 1);
        g.beginPath();
        g.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            g.lineTo(points[i].x, points[i].y);
        }
        g.closePath();
        g.fillPath();
        g.generateTexture(`enemy-${rarity}`, size, size);
        g.destroy();
    }

    // CHECKPOINT WHITE

    const c1 = this.add.graphics();

    c1.fillStyle(0xffffff, 1);

    c1.fillRect(
        0,
        0,
        SETTINGS.CHECKPOINT_SIZE,
        SETTINGS.CHECKPOINT_SIZE
    );

    c1.generateTexture(
        'checkpoint_white',
        SETTINGS.CHECKPOINT_SIZE,
        SETTINGS.CHECKPOINT_SIZE
    );

    c1.destroy();

    // CHECKPOINT BLUE

    const c2 = this.add.graphics();

    c2.fillStyle(0x0000ff, 1);

    c2.fillRect(
        0,
        0,
        SETTINGS.CHECKPOINT_SIZE,
        SETTINGS.CHECKPOINT_SIZE
    );

    c2.generateTexture(
        'checkpoint_blue',
        SETTINGS.CHECKPOINT_SIZE,
        SETTINGS.CHECKPOINT_SIZE
    );

    c2.destroy();
}