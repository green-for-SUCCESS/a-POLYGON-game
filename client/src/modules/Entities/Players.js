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

    
        let accel = 0;
    
        if (variable.cursors.left.isDown || variable.wasd.A.isDown) {
            accel -= SETTINGS.PLAYER_MOVE_FORCE / SETTINGS.PLAYER_MASS;
        }
        else if (variable.cursors.right.isDown || variable.wasd.D.isDown) {
            accel += SETTINGS.PLAYER_MOVE_FORCE / SETTINGS.PLAYER_MASS;
        }
    
        const dragAccel =
        SETTINGS.PLAYER_DRAG_COEFFICIENT *
            variable.player.body.velocity.x;
        
            accel -= dragAccel;
    
        variable.player.body.velocity.x += accel;
    
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

    // Respawn is triggered by the server sending health > 0 back.
    // In singleplayer / offline mode, call respawnPlayer() directly instead.
}

// =====================================================
// PLAYER SPAWN
// =====================================================

export function respawnPlayer({ immediate = false } = {}) {

    let x = SETTINGS.PLAYER_START_X;

    let y =
    window.innerHeight
        - 32
        - (variable.grassScaledHeight / 2)
        - (SETTINGS.PLAYER_SIZE / 2)
        - 20;
    
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
