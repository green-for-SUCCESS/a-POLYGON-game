// =====================================================
// UPDATE
// =====================================================

import { SETTINGS } from "../../../../shared-data/Constants.js";
import { variable } from "../GameValues/LocalVariables.js";
import { playerMovementCheck, updateRemotePlayers, enforceLocalSpawnBoundary } from "../Entities/Players.js";
import { applyEnemySnapshot, drawEnemyDebug } from "../Entities/Enemies.js";
import { drawMinimap } from "../UI/Minimap.js";

export function update() {

    if (variable.room) {
        updateRemotePlayers();
        applyEnemySnapshot(readEnemySnapshot(variable.room.state?.enemies));
        drawMinimap();
    }

    if (SETTINGS.DEBUG_ENEMY_ATTACKS && this.enemyDebugGraphics) {
        drawEnemyDebug(this.enemyDebugGraphics);
    }

    if (!variable.player || !variable.player.body || !variable.room) {
        return;
    }

    if (!variable.player.active || variable.deathScreen) {
        return;
    }

    if (
        variable.playerSpawnProtected &&
        variable.player.body.touching.down
    ) {
        variable.playerSpawnProtected = false;
    }

    playerMovementCheck();
    enforceLocalSpawnBoundary();

    if (variable.player.active) {
        variable.room.send("updatePosition", {
            x: variable.player.x,
            y: variable.player.y,
            isFastFalling: !!variable.player.isFastFalling,
        });
    }

    const diff =
        variable.healthBarTargetWidth
        - variable.healthBarDelayed.width;

    variable.healthBarDelayed.width += diff * 0.08;
    variable.sightGraphics.clear();
}

function readEnemySnapshot(enemies) {
    const snapshot = [];
    if (!enemies) {
        return snapshot;
    }

    const length = enemies.length ?? 0;
    for (let i = 0; i < length; i++) {
        const enemy = enemies.at?.(i) ?? enemies[i];
        if (!enemy) {
            continue;
        }

        snapshot.push({
            x: enemy.x,
            y: enemy.y,
            rarity: enemy.rarity ?? 0,
            velocityX: enemy.velocityX ?? 0,
            velocityY: enemy.velocityY ?? 0,
            state: enemy.state ?? 0,
            attackDirection: enemy.attackDirection ?? 0,
        });
    }

    return snapshot;
}
