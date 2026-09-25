import { SETTINGS } from "../../../../shared-data/Constants.js";
import { getZones } from "../../../../shared-data/Zones.js";
import { variable } from "../GameValues/LocalVariables.js";

const PAD_LEFT = 300;
const PAD_RIGHT = 24;
const TOP = 16;
const HEIGHT = 28;

export function createMinimap(scene) {
    const graphics = scene.add.graphics();
    graphics.setScrollFactor(0);
    graphics.setDepth(2500);

    const labels = getZones().map((zone) => {
        const text = scene.add.text(0, TOP + HEIGHT / 2, zone.name, {
            fontSize: "12px",
            fontFamily: "Ubuntu",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 3,
        });
        text.setOrigin(0.5, 0.5);
        text.setScrollFactor(0);
        text.setDepth(2501);
        return text;
    });

    variable.minimap = {
        graphics,
        labels,
        width: Math.max(200, scene.scale.width - PAD_LEFT - PAD_RIGHT),
    };

    drawMinimap();
}

export function drawMinimap() {
    const minimap = variable.minimap;
    if (!minimap) {
        return;
    }

    const viewWidth = variable.sceneRef?.scale.width ?? SETTINGS.WORLD_WIDTH;
    const width = Math.max(200, viewWidth - PAD_LEFT - PAD_RIGHT);
    minimap.width = width;

    const { graphics, labels } = minimap;
    const zones = getZones();
    const worldWidth = SETTINGS.WORLD_WIDTH;
    const x0 = PAD_LEFT;

    graphics.clear();
    graphics.fillStyle(0x111111, 0.92);
    graphics.fillRoundedRect(x0 - 4, TOP - 4, width + 8, HEIGHT + 18, 6);
    graphics.lineStyle(2, 0xffffff, 0.85);
    graphics.strokeRoundedRect(x0 - 4, TOP - 4, width + 8, HEIGHT + 18, 6);

    let cursor = x0;
    zones.forEach((zone, index) => {
        const zoneWidth = (zone.width / worldWidth) * width;
        graphics.fillStyle(zone.color, 0.95);
        graphics.fillRect(cursor, TOP, zoneWidth, HEIGHT);
        graphics.lineStyle(1, 0x000000, 0.35);
        graphics.strokeRect(cursor, TOP, zoneWidth, HEIGHT);

        const label = labels[index];
        if (zoneWidth < 36) {
            label.setText(zone.name[0]);
        } else {
            label.setText(zone.name);
        }
        label.setPosition(cursor + zoneWidth / 2, TOP + HEIGHT / 2);
        label.setVisible(zoneWidth > 14);
        cursor += zoneWidth;
    });

    const playerX = variable.player?.x ?? SETTINGS.PLAYER_START_X;
    const markerX = x0 + (playerX / worldWidth) * width;
    graphics.fillStyle(0xffffff, 1);
    graphics.lineStyle(1, 0x000000, 1);
    graphics.fillTriangle(
        markerX,
        TOP + HEIGHT + 2,
        markerX - 6,
        TOP + HEIGHT + 14,
        markerX + 6,
        TOP + HEIGHT + 14
    );
    graphics.strokeTriangle(
        markerX,
        TOP + HEIGHT + 2,
        markerX - 6,
        TOP + HEIGHT + 14,
        markerX + 6,
        TOP + HEIGHT + 14
    );
}
