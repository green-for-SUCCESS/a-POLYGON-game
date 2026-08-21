// =====================================================
// PRELOAD
// =====================================================

import { SETTINGS } from "../../../../shared-data/Constants.js";

export function preload() {
    const base = import.meta.env.BASE_URL;

    this.load.image('grass', `${base}assets/Grass.png`);
    this.load.image('stone', `${base}assets/Stone.png`);
    this.load.image('spike', `${base}assets/Spikes.png`);

    // PLAYER

    const p = this.add.graphics();

    p.fillStyle(0x00ff00, 1);

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

    // ENEMY

    const e = this.add.graphics();

    e.fillStyle(0xff0000, 1);

    e.fillRect(
        0,
        0,
        SETTINGS.PLAYER_SIZE,
        SETTINGS.PLAYER_SIZE
    );

    e.generateTexture(
        'enemy',
        SETTINGS.PLAYER_SIZE,
        SETTINGS.PLAYER_SIZE
    );

    e.destroy();

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