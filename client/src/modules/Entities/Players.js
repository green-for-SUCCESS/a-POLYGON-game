import Phaser from "phaser";

import { allBlocks, groundBlocks, stoneObjects, spikePositions,} from "../../../../shared-data/Environment.js";
import { SETTINGS } from "../../../../shared-data/Constants.js";
import { variable } from "../GameValues/LocalVariables.js";

// =====================================================
// CREATE PLAYER
// =====================================================

export function createPlayer(id, x, y,) {
    const isLocal = (id === variable.playerId);

    const sprite = variable.sceneRef.physics.add.sprite(
        x,
        y,
        "player"
    );

    sprite.setCollideWorldBounds(true);
    sprite.isFastFalling = false;
    sprite.setDepth(1000);

    const player = {
        id,
        sprite,
        health: SETTINGS.PLAYER_MAX_HEALTH,
        isLocal
    };

    variable.allPlayers[id] = player;

    // Temporary compatibility with your existing code.
    // You'll remove variable.sceneRef once everything uses allPlayers.
    if (isLocal) {
        variable.player = sprite;
        variable.playerHealth = SETTINGS.PLAYER_MAX_HEALTH;
        variable.myId = id;

        // CAMERA

        variable.sceneRef.cameras.main.startFollow(
            variable.player,
            true
            );
        
        variable.sceneRef.cameras.main.setLerp(
            SETTINGS.CAMERA_LERP_X,
            SETTINGS.CAMERA_LERP_Y
        );
    
        variable.sceneRef.cameras.main.setDeadzone(
            window.innerWidth * SETTINGS.CAMERA_DEADZONE_X,
            window.innerHeight * SETTINGS.CAMERA_DEADZONE_Y
        );
    
        // COLLISION
    
        groundBlocks.forEach(block => {
        variable.sceneRef.physics.add.collider(variable.player, block);
        });

        // HEALTH BAR
    
        variable.healthBarBg = variable.sceneRef.add.rectangle(
        20,
        100,
        300,
        30,
        0x444444
        );
    
        variable.healthBarBg.setOrigin(0, 0);
        variable.healthBarBg.setScrollFactor(0);
        variable.healthBarBg.setDepth(3000);
    
        variable.healthBarFill = variable.sceneRef.add.rectangle(
        20,
        100,
        300,
        30,
        0x00ff00
        );
    
        variable.healthBarFill.setOrigin(0, 0);
        variable.healthBarFill.setScrollFactor(0);
        variable.healthBarFill.setDepth(3001);
    
        variable.healthBarDelayed = variable.sceneRef.add.rectangle(
        20,
        100,
        300,
        30,
        0xff0000
        );
    
        variable.healthBarDelayed.setOrigin(0, 0);
        variable.healthBarDelayed.setScrollFactor(0);
        variable.healthBarDelayed.setDepth(3000);
    
        updateHealthBar();
    } else {
        // REMOTE PLAYER: Completely disable physics body calculations
        // This stops gravity, collisions, and velocity acceleration on remote clients
        sprite.body.enable = false; 
    }
    

    return player;
}

// =================================================
// PLAYER MOVEMENT
// =================================================
export function playerMovementCheck() {
    // LEFT - RIGHT

    if (!variable.player.isFastFalling) {

    
        let accelX = 0;
        let accelY = 0;

        if (variable.cursors.left.isDown || variable.wasd.A.isDown) {
            accelX -= SETTINGS.PLAYER_MOVE_FORCE / SETTINGS.PLAYER_MASS;
        }
        else if (variable.cursors.right.isDown || variable.wasd.D.isDown) {
            accelX += SETTINGS.PLAYER_MOVE_FORCE / SETTINGS.PLAYER_MASS;
        }

        const dragAccelX =
            SETTINGS.PLAYER_DRAG_COEFFICIENT *
            variable.player.body.velocity.x;

        accelX -= dragAccelX;

        variable.player.body.velocity.x += accelX;

        const dragAccelY =
            SETTINGS.PLAYER_VERTICAL_DRAG_COEFFICIENT *
            variable.player.body.velocity.y;

        accelY -= dragAccelY;

        variable.player.body.velocity.y += accelY;

        // JUMP

        if (
            (
                variable.cursors.up.isDown ||
                variable.wasd.W.isDown
            ) &&
            variable.player.body.touching.down
        ) {
            variable.player.setVelocityY(
                SETTINGS.JUMP_STRENGTH
            );
        }
    }

    // FAST FALL

    if (
        (
            variable.cursors.down.isDown ||
            variable.wasd.S.isDown
        ) &&
        !variable.player.body.touching.down
    ) {
    
        if (!variable.player.isFastFalling) {
        
            variable.player.isFastFalling = true;
            variable.player.setVelocityX(0);
            variable.player.setAccelerationX(0);
        
            variable.player.setVelocityY(
                SETTINGS.PLAYER_FASTFALL_SPEED
            );
        }
    }

    else {
    
        variable.player.isFastFalling = false;
    }
}

// =================================================
// HEALTH BAR
// =================================================
export function updateHealthBar() {
    const percent =
    Phaser.Math.Clamp(
            variable.playerHealth / SETTINGS.PLAYER_MAX_HEALTH,
            0,
            1
        );

    
        variable.healthBarTargetWidth = 300 * percent;

    variable.healthBarFill.width = 300 * percent;
}

export function damagePlayer(amount) {

    if (!variable.player.active) return;
    if (variable.playerSpawnProtected) {
        return;
    }

    variable.playerHealth -= amount;


    updateHealthBar();


    if (variable.playerHealth <= 0) {

    
        variable.playerHealth = 0;

    
        updateHealthBar();

        if (variable.room) {
            variable.room.send("suicide");
        }

    
        shatterPlayer();
    }
}

// =====================================================
// PLAYER SHATTER EFFECT
// =====================================================

export function shatterPlayer() {
    // prevent duplicate deaths
    if (!variable.player.active) return;

    const deathVX = variable.player.body.velocity.x;
    const deathVY = variable.player.body.velocity.y;

    const pixelSize = 5;

    const piecesPerRow =
    SETTINGS.PLAYER_SIZE / pixelSize;
    
        const startX =
    variable.player.x - SETTINGS.PLAYER_SIZE / 2;
    
        const startY =
    variable.player.y - SETTINGS.PLAYER_SIZE / 2;
    
        // hide player
    variable.player.disableBody(true, true);

    // create chunks
    for (let py = 0; py < piecesPerRow; py++) {
    
        for (let px = 0; px < piecesPerRow; px++) {
        
            const pixel =
            variable.sceneRef.physics.add.image(
                    startX + px * pixelSize,
                    startY + py * pixelSize,
                    'player'
                );
            
                pixel.setDisplaySize(
                pixelSize,
                pixelSize
            );
        
            // =================================================
            // EXPLOSION VELOCITY
            // =================================================
        
            const dirX =
            (px - piecesPerRow / 2)
                * Phaser.Math.FloatBetween(35, 75);
            
                const dirY =
            (py - piecesPerRow / 2)
                * Phaser.Math.FloatBetween(20, 50);
            
                const horizontalSpeed =
            dirX
                + Phaser.Math.Between(-120, 120)
                + deathVX * 0.25;
            
                const verticalSpeed =
            -900
                + dirY
                + Phaser.Math.Between(-350, 150)
                + deathVY * 0.25;
            
                pixel.setVelocity(
                horizontalSpeed,
                verticalSpeed
            );
        
            // delayed turbulence
            variable.sceneRef.time.delayedCall(
                Phaser.Math.Between(50, 180),
                () => {
                
                    if (!pixel.body) return;
                
                    pixel.setVelocityX(
                        pixel.body.velocity.x
                        + Phaser.Math.Between(-40, 40)
                    );
                }
            );
        
            // =================================================
            // PHYSICS
            // =================================================
        
            pixel.setBounce(0.96);
        
            pixel.setDrag(40);
        
            pixel.setMass(0.1);
        
            pixel.setFriction(1, 0);
        
            // slower falling
            pixel.body.setGravityY(
                SETTINGS.GRAVITY * 0.28
            );
        
            // no spinning
            pixel.setAngularVelocity(0);
        
            pixel.setAngularDrag(99999);
        
            variable.deathPixels.push(pixel);
        }
    }

    showDeathScreen();
}

// =====================================================
// DEATH SCREEN
// =====================================================

export function showDeathScreen() {
    if (variable.deathScreen) {
        return;
    }

    const scene = variable.sceneRef;
    const { width, height } = scene.scale;

    const overlay = scene.add.rectangle(
        0,
        0,
        width,
        height,
        0x000000,
        0.72
    );
    overlay.setOrigin(0, 0);
    overlay.setScrollFactor(0);
    overlay.setDepth(5000);

    const title = scene.add.text(
        width / 2,
        height * 0.32,
        "YOU DIED",
        {
            fontSize: "72px",
            fontFamily: "Ubuntu",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 6
        }
    );
    title.setOrigin(0.5);
    title.setScrollFactor(0);
    title.setDepth(5001);

    // BUTTON SETTINGS

    const btnW = 260;
    const btnH = 80;
    const btnRadius = 20;
    const btnGap = 20;

    const btnX = width / 2 - btnW / 2;

    // RESPAWN BUTTON

    const respawnY = height * 0.46;

    const respawnBg = scene.add.graphics();
    respawnBg.setScrollFactor(0);
    respawnBg.setDepth(5001);

    function drawRespawnButton(color) {
        respawnBg.clear();
        respawnBg.fillStyle(color, 0.95);
        respawnBg.fillRoundedRect(
            btnX,
            respawnY,
            btnW,
            btnH,
            btnRadius
        );
        respawnBg.lineStyle(3, 0xffffff, 1);
        respawnBg.strokeRoundedRect(
            btnX,
            respawnY,
            btnW,
            btnH,
            btnRadius
        );
    }

    drawRespawnButton(0x222222);

    const respawnHit = scene.add.rectangle(
        btnX,
        respawnY,
        btnW,
        btnH,
        0x000000,
        0
    );

    respawnHit
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .setScrollFactor(0)
        .setDepth(5002);

    const respawnText = scene.add.text(
        btnX + btnW / 2,
        respawnY + btnH / 2,
        "RESPAWN",
        {
            fontSize: "36px",
            fontFamily: "Ubuntu",
            color: "#ffffff"
        }
    );

    respawnText.setOrigin(0.5);
    respawnText.setScrollFactor(0);
    respawnText.setDepth(5003);

    respawnHit.on("pointerdown", () => {
        drawRespawnButton(0x1a1a1a);
    });

    respawnHit.on("pointerout", () => {
        drawRespawnButton(0x222222);
    });

    respawnHit.on("pointerup", () => {
        drawRespawnButton(0x222222);

        if (variable.room) {
            variable.room.send("respawn");
        } else {
            hideDeathScreen();
            respawnPlayer({ immediate: true });
        }
    });

    // MENU BUTTON

    const menuY = respawnY + btnH + btnGap;

    const menuBg = scene.add.graphics();
    menuBg.setScrollFactor(0);
    menuBg.setDepth(5001);

    function drawMenuButton(color) {
        menuBg.clear();
        menuBg.fillStyle(color, 0.95);
        menuBg.fillRoundedRect(
            btnX,
            menuY,
            btnW,
            btnH,
            btnRadius
        );
        menuBg.lineStyle(3, 0xffffff, 1);
        menuBg.strokeRoundedRect(
            btnX,
            menuY,
            btnW,
            btnH,
            btnRadius
        );
    }

    drawMenuButton(0x222222);

    const menuHit = scene.add.rectangle(
        btnX,
        menuY,
        btnW,
        btnH,
        0x000000,
        0
    );

    menuHit
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .setScrollFactor(0)
        .setDepth(5002);

    const menuText = scene.add.text(
        btnX + btnW / 2,
        menuY + btnH / 2,
        "BACK TO MENU",
        {
            fontSize: "36px",
            fontFamily: "Ubuntu",
            color: "#ffffff"
        }
    );

    menuText.setOrigin(0.5);
    menuText.setScrollFactor(0);
    menuText.setDepth(5003);

    menuHit.on("pointerdown", () => {
        drawMenuButton(0x1a1a1a);
    });

    menuHit.on("pointerout", () => {
        drawMenuButton(0x222222);
    });

    menuHit.on("pointerup", () => {
        drawMenuButton(0x222222);

        hideDeathScreen();

        // If connected to multiplayer, leave the room first.
        if (variable.room) {
            variable.room.leave();
            variable.room = null;
        }

        // Change "Menu" if your actual menu scene has a different name.
        scene.scene.start("Menu");
    });

    // SAVE REFERENCES

    variable.deathScreen = {
        overlay,
        title,

        respawnBg,
        respawnHit,
        respawnText,

        menuBg,
        menuHit,
        menuText
    };
}

export function hideDeathScreen() {
    if (!variable.deathScreen) {
        return;
    }

    const {
        overlay,
        title,

        respawnBg,
        respawnHit,
        respawnText,

        menuBg,
        menuHit,
        menuText
    } = variable.deathScreen;

    overlay.destroy();
    title.destroy();

    respawnBg.destroy();
    respawnHit.destroy();
    respawnText.destroy();

    menuBg.destroy();
    menuHit.destroy();
    menuText.destroy();

    variable.deathScreen = null;
}

// =====================================================
// PLAYER SPAWN
// =====================================================

export function respawnPlayer({ immediate = false } = {}) {

    hideDeathScreen();

    let x = SETTINGS.PLAYER_START_X;

    let y = SETTINGS.ENTITY_SPAWN_HEIGHT;
    
    if (variable.lastCheckpoint) {
        x = variable.lastCheckpoint.x;
        y =
            variable.lastCheckpoint.y
            - SETTINGS.CHECKPOINT_SIZE / 2
            - (SETTINGS.PLAYER_SIZE / 2)
            - 2;
    }

    const delay = immediate ? 0 : SETTINGS.PLAYER_RESPAWN_DELAY;

    setTimeout(() => {
    
        if (!variable.player || !variable.player.body) return;
    
        // remove old death pixels
        variable.deathPixels.forEach(pixel => {
            if (pixel && pixel.active) {
                pixel.destroy();
            }
        });
    
        variable.deathPixels = [];
    
        variable.player.enableBody(
            true,
            x,
            y,
            true,
            true
        );
    
        variable.playerSpawnProtected = true;
    
        variable.playerHealth = SETTINGS.PLAYER_MAX_HEALTH;
        updateHealthBar();
    
        variable.player.setVelocity(0, 0);
        variable.player.isFastFalling = false;
    
        // temporary freeze after spawning
        variable.player.body.enable = false;
    
        setTimeout(() => {
            if (variable.player && variable.player.body) {
                variable.player.body.enable = true;
            }
        }, SETTINGS.PLAYER_RESPAWN_FREEZE_DELAY);
    
    }, delay);

    variable.player.setDepth(1000);
}
