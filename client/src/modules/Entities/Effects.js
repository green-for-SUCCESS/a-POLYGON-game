import Phaser from "phaser";
import { SETTINGS } from "../../../../shared-data/Constants.js";
import { variable } from "../GameValues/LocalVariables.js";

// =====================================================
// GENERIC SHATTER EFFECT
// Spawns a pixel-explosion at (x, y) using the given texture key.
// vx / vy are the velocity of the object that died, used to
// add momentum to the chunks.
// =====================================================
export function shatterAt(x, y, vx, vy, textureKey, tint) {
    if (!variable.sceneRef) return;

    const pixelSize = 5;
    const piecesPerRow = SETTINGS.PLAYER_SIZE / pixelSize;

    const startX = x - SETTINGS.PLAYER_SIZE / 2;
    const startY = y - SETTINGS.PLAYER_SIZE / 2;

    for (let py = 0; py < piecesPerRow; py++) {
        for (let px = 0; px < piecesPerRow; px++) {

            const pixel = variable.sceneRef.physics.add.image(
                startX + px * pixelSize,
                startY + py * pixelSize,
                textureKey
            );

            pixel.setDisplaySize(pixelSize, pixelSize);

            if (tint != null) {
                pixel.setTint(tint);
            }

            const dirX = (px - piecesPerRow / 2) * Phaser.Math.FloatBetween(30, 70);
            const dirY = (py - piecesPerRow / 2) * Phaser.Math.FloatBetween(20, 45);

            pixel.setVelocity(
                dirX + Phaser.Math.Between(-100, 100) + vx * 0.25,
                -900 + dirY + Phaser.Math.Between(-300, 120) + vy * 0.25
            );

            // Delayed turbulence
            variable.sceneRef.time.delayedCall(
                Phaser.Math.Between(50, 180),
                () => {
                    if (!pixel.body) return;
                    pixel.setVelocityX(pixel.body.velocity.x + Phaser.Math.Between(-40, 40));
                }
            );
            
            pixel.setBounce(0.96);
            pixel.setDrag(40);
            pixel.setMass(0.1);
            pixel.setFriction(1, 0);
            pixel.body.setGravityY(SETTINGS.GRAVITY * 0.28);
            pixel.setAngularVelocity(0);
            pixel.setAngularDrag(99999);

            variable.sceneRef.time.delayedCall(SETTINGS.PLAYER_RESPAWN_DELAY, () => {
                if (pixel && pixel.active) pixel.destroy();
            });
        }
    }
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
