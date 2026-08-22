// =========================================================
// GAME CONFIG
// =========================================================

import Phaser from "phaser";
import { SETTINGS } from "../../../shared-data/Constants.js";
import { preload } from "./Processes/Preload.js";
import { create } from "./Processes/Create.js";
import { update } from "./Processes/Update.js";
import { createHome } from "./Processes/Home.js";

export class HomeScene extends Phaser.Scene {
    constructor() {
        super("Home");
    }

    create() {
        createHome.call(this);
    }
}

export class GameScene extends Phaser.Scene {
    constructor() {
        super("Game");
    }

    preload() {
        preload.call(this);
    }

    create() {
        create.call(this);
    }

    update(time, delta) {
        update.call(this, time, delta);
    }
}

const config = {
    type: Phaser.AUTO,

    width: window.innerWidth,
    height: window.innerHeight,

    backgroundColor: "#000000",

    physics: {
        default: "arcade",
        arcade: {
            gravity: { y: SETTINGS.GRAVITY },
            debug: false,
        },
    },

    scene: [HomeScene, GameScene],
};

export const game = new Phaser.Game(config);
