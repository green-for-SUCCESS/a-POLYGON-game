import { SETTINGS } from "../../../../shared-data/Constants.js";
import { variable } from "../GameValues/LocalVariables.js";

const DEATH_POP_DURATION = 200; // ms
const DEATH_POP_SCALE = 1.6;

// =====================================================
// DEATH POP (enemies and players)
// A quick grow-and-fade on a display object, which is destroyed when the
// tween finishes. No particles, physics bodies or timers: one tween each.
// The caller must hand over an object nothing else will touch again (an
// enemy's own sprite once it's dropped, or a player's death snapshot).
// =====================================================
export function playDeathPop(scene, target) {
    scene.tweens.add({
        targets: target,
        scaleX: target.scaleX * DEATH_POP_SCALE,
        scaleY: target.scaleY * DEATH_POP_SCALE,
        alpha: 0,
        duration: DEATH_POP_DURATION,
        ease: "Quad.easeOut",
        onComplete: () => target.destroy(),
    });
}

// =====================================================
// SLASH VISUAL (placeholder)
// Purely cosmetic — the real hit detection/damage/knockback
// happens authoritatively in the HeadlessGame.
// =====================================================
export function playSlashEffect(x, y, dirX, dirY) {
    if (!variable.sceneRef) return;

    const length = SETTINGS.PLAYER_SLASH_RANGE;
    const halfArc = (SETTINGS.PLAYER_SLASH_ARC / 2) * (Math.PI / 180);
    const dir = Math.atan2(dirY, dirX);

    const graphics = variable.sceneRef.add.graphics();
    graphics.setDepth(1500);
    graphics.fillStyle(0xffffff, 0.35);
    graphics.beginPath();
    graphics.moveTo(x, y);
    graphics.arc(x, y, length, dir - halfArc, dir + halfArc, false);
    graphics.closePath();
    graphics.fillPath();

    variable.sceneRef.time.delayedCall(SETTINGS.PLAYER_SLASH_VISUAL_DURATION, () => {
        graphics.destroy();
    });
}
