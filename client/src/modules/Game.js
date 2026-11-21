// =========================================================
// GAME CONFIG
// =========================================================

import Phaser from "phaser";
import { SETTINGS } from "../../../shared-data/Constants.js";
import { preload } from "./Processes/Preload.js";
import { create } from "./Processes/Create.js";
import { update } from "./Processes/Update.js";
import { loadHome } from "./Processes/Home.js";
import { createLogin } from "./Processes/Login.js";
import { variable } from "./GameValues/LocalVariables.js";
import { normalizeGameMode } from "../../../shared-data/GameModes.js";

class LoginScene extends Phaser.Scene {

    constructor() {
        super("LoginScene");
    }

    create() {
        createLogin.call(this);
    }
}

class HomeScene extends Phaser.Scene {
    constructor() {
        super("Home");
    }

    create() {
        loadHome.call(this);
    }
}

class GameScene extends Phaser.Scene {
    constructor() {
        super("Game");
    }

    preload() {
        preload.call(this);
    }

    create(data) {
        variable.gameMode = normalizeGameMode(data?.mode);
        variable.identity = data?.identity === "guest" ? "guest" : "account";
        // Every game session starts a fresh run; FFA XP in particular never
        // carries over from an earlier FFA session.
        variable.ffaXP = 0;
        variable.runXP = 0;

        if (data?.username) {
            variable.username = data.username;
        }
        if (data?.xp != null) {
            variable.persistentXP = data.xp;
        }
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
            // See PHYSICS_FPS in Constants.js: keeps a fast-moving body (e.g.
            // Fastfall) from covering more distance than a block's thickness
            // within a single physics substep and tunneling through it.
            fps: SETTINGS.PHYSICS_FPS,
        },
    },

    scene: [HomeScene, LoginScene, GameScene],
};

export const game = new Phaser.Game(config);
