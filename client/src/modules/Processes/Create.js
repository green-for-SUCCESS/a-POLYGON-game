// =====================================================
// CREATE
// =====================================================

import { SETTINGS } from "../../../../shared-data/Constants.js";
import { blockWidth, blockHeight, allBlocks, groundBlocks, stoneObjects, spikePositions } from "../../../../shared-data/Environment.js";
import { connect } from "../Multiplayer/Network.js";
import { createPlayer, updateHealthBar, damagePlayer } from "../Entities/Players.js";
import { applyKnockback } from "../Logic/Physics.js";
import { variable } from "../GameValues/LocalVariables.js";

export function create() {

    variable.sceneRef = this;

    connect();

    const groundY = SETTINGS.WORLD_HEIGHT - 32;

    this.cameras.main.setBounds(
        0,
        0,
        SETTINGS.WORLD_WIDTH,
        SETTINGS.WORLD_HEIGHT
    );

    this.physics.world.setBounds(
        0,
        0,
        SETTINGS.WORLD_WIDTH,
        SETTINGS.WORLD_HEIGHT
    );

    // =================================================
    // SCALE
    // =================================================

    variable.grassScale = SETTINGS.BLOCK_SCALE;

    const grassTexture = this.textures.get('grass');

    variable.grassScaledWidth =
    grassTexture.getSourceImage().width * variable.grassScale;
    
        variable.grassScaledHeight =
    grassTexture.getSourceImage().height * variable.grassScale;
    
        const stoneTexture = this.textures.get('stone');

    variable.blockWidth = stoneTexture.getSourceImage().width;
    variable.blockHeight = stoneTexture.getSourceImage().height;

    variable.stoneScale = SETTINGS.BLOCK_SCALE;

    variable.stoneW = variable.blockWidth * variable.stoneScale;
    variable.stoneH = variable.blockHeight * variable.stoneScale;

    // =================================================
    // GROUND
    // =================================================

    for (
        let x = 0;
        x < SETTINGS.WORLD_WIDTH;
        x += variable.grassScaledWidth
    ) {
    
        const block = this.physics.add.image(
            x,
            groundY,
            'grass'
        );
    
        block.setScale(variable.grassScale);
    
        block.setImmovable(true);
    
        block.body.setAllowGravity(false);
    
        groundBlocks.push(block);
        allBlocks.push(block);
    }

    // =================================================
    // PLAYER
    // =================================================

    const playerY =
    groundY
    - (variable.grassScaledHeight / 2)
    - (SETTINGS.PLAYER_SIZE / 2)
    - 20;

    // =================================================
    // PLATFORMS
    // =================================================

    stoneObjects.forEach(obj => {
    
        let plat = [];
    
        for (let i = 0; i < obj.width; i++) {
        
            const s = this.physics.add.image(
                obj.x + i * variable.stoneW - variable.stoneW / 2,
                obj.y - variable.stoneH / 2,
                'stone'
            );
        
            s.setScale(variable.stoneScale);
        
            s.setImmovable(true);
        
            s.body.setAllowGravity(false);
        
            this.physics.add.collider(variable.player, s);
        
            stoneObjects.push(s);
        
            plat.push(s);
        
            allBlocks.push(s);
        }
    
        variable.platforms.push(plat);
    });

    // =================================================
    // SPIKES
    // =================================================

    spikePositions.forEach(pos => {
    
        const sp = this.physics.add.image(
            pos.x - variable.stoneH / 2,
            pos.y - variable.stoneH * 1.5,
            'spike'
        );
    
        sp.setDisplaySize(variable.stoneW, variable.stoneH);
    
        sp.setImmovable(true);
    
        sp.body.setAllowGravity(false);
    
        this.physics.add.overlap(
            variable.player,
            sp,
            () => {
                if (variable.player.body.touching.right || variable.player.body.touching.left) {
                    if (variable.player.body.touching.right) {
                        applyKnockback({x: variable.player.x + 1, y: variable.player.y}, variable.player, SETTINGS.SPIKE_KNOCKBACK);
                    }
                    if (variable.player.body.touching.left) {
                        applyKnockback({x: variable.player.x - 1, y: variable.player.y}, variable.player, SETTINGS.SPIKE_KNOCKBACK);
                    }
                }
                else {
                    if (variable.player.body.touching.down) {
                        applyKnockback({x: variable.player.x, y: variable.player.y + 1}, variable.player, SETTINGS.SPIKE_KNOCKBACK);
                    }
                    if (variable.player.body.touching.up) {
                        applyKnockback({x: variable.player.x, y: variable.player.y - 1}, variable.player, SETTINGS.SPIKE_KNOCKBACK);
                    }
                }
                damagePlayer(SETTINGS.SPIKE_DAMAGE);
            }
        );
        sp.setDepth(500)
    
        spikePositions.push(sp);
    
        allBlocks.push(sp);
    });

    // =================================================
    // CONTROLS
    // =================================================

    variable.cursors = this.input.keyboard.createCursorKeys();

    variable.wasd = this.input.keyboard.addKeys('W,S,A,D');

    // =================================================
    // ENEMY GRAPHICS
    // =================================================

    variable.sightGraphics = this.add.graphics().setDepth(1000);

    // =================================================
    // SUICIDE BUTTON
    // =================================================

    const btnX = 20;
    const btnY = 20;
    const btnW = 260;
    const btnH = 70;
    const btnRadius = 20;

    const btnBg = this.add.graphics();

    function drawButton(color) {
    
        btnBg.clear();
    
        btnBg.fillStyle(color, 0.95);
    
        btnBg.fillRoundedRect(
            btnX,
            btnY,
            btnW,
            btnH,
            btnRadius
        );
    
        btnBg.lineStyle(3, 0xffffff, 1);
    
        btnBg.strokeRoundedRect(
            btnX,
            btnY,
            btnW,
            btnH,
            btnRadius
        );
    }

    drawButton(0x222222);

    btnBg.setScrollFactor(0);

    btnBg.setDepth(2000);

    const btnHit = this.add.rectangle(
        btnX,
        btnY,
        btnW,
        btnH,
        0x000000,
        0
    );

    btnHit
    .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .setScrollFactor(0)
        .setDepth(2001);
    
        const btnText = this.add.text(
        btnX + btnW / 2,
        btnY + btnH / 2,
        'SUICIDE',
        {
            fontSize: '32px',
            fontFamily: 'Ubuntu',
            color: '#ffffff'
        }
    );

    btnText
    .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(2002);
    
        btnHit.on('pointerdown', () => {
        drawButton(0x1a1a1a);
    });

    btnHit.on('pointerup', () => {
    
        drawButton(0x222222);
        
        damagePlayer(SETTINGS.PLAYER_MAX_HEALTH);
    });

    // =================================================
    // ENEMY DEBUG GRAPHICS
    // =================================================

    this.enemyDebugGraphics = this.add.graphics();
    this.enemyDebugGraphics.setDepth(9999);
}