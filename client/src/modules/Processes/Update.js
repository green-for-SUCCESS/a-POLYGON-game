// =====================================================
// UPDATE
// =====================================================

import Phaser from "phaser";
import { blockWidth, blockHeight, allBlocks, groundBlocks, stoneObjects, spikePositions } from "../../../../shared-data/Environment.js";
import { SETTINGS, ENEMY_STATE } from "../../../../shared-data/Constants.js";
import { variable } from "../GameValues/LocalVariables.js";
import { playerMovementCheck, updateRemotePlayers } from "../Entities/Players.js";

export function update() {

    if (SETTINGS.DEBUG_ENEMY_ATTACKS) {
        this.enemyDebugGraphics.clear();
    }

    if (variable.room) {
        updateRemotePlayers();
    }

    if (!variable.player || !variable.player.body || !variable.room) {
        return;
    }

    if (!variable.player.active || variable.deathScreen) {
        return;
    }

    // =================================================
    // SPAWN PROTECTION
    // =================================================

    if (
        variable.playerSpawnProtected &&
        variable.player.body.touching.down
    ) {
        variable.playerSpawnProtected = false;
    }

    // ================================================
    // PLAYER MOVEMENT AND SYNC
    // ================================================

    // 1. Process physics/input for local player
    playerMovementCheck();

    // 2. Send position to server
    if (variable.player.active) {
        variable.room.send("updatePosition", {
            x: variable.player.x,
            y: variable.player.y,
            isFastFalling: !!variable.player.isFastFalling,
        });
    }

    // Enemy spawn is handled server-side in HeadlessGame

    // =====================================================
    // HEALTH BAR SLIDE
    // =====================================================
    const diff =
    variable.healthBarTargetWidth
        - variable.healthBarDelayed.width;
    
    
        variable.healthBarDelayed.width += diff * 0.08;
    variable.sightGraphics.clear();
}