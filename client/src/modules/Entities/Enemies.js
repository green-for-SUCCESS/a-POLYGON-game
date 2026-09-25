import { SETTINGS, ENEMY_STATE, ENEMY_RARITY_COLORS } from "../../../../shared-data/Constants.js";
import { getEnemyRadius } from "../../../../shared-data/Geometry.js";
import { variable } from "../GameValues/LocalVariables.js";
import { shatterAt } from "./Effects.js";

const MATCH_DISTANCE = 140;

export function applyEnemySnapshot(snapshot) {
    const scene = variable.sceneRef;
    if (!scene) {
        return;
    }

    const visuals = variable.enemyVisuals || [];
    const used = new Set();
    const next = [];

    for (const snap of snapshot) {
        let bestIndex = -1;
        let bestDist = MATCH_DISTANCE;

        for (let i = 0; i < visuals.length; i++) {
            if (used.has(i)) continue;
            const visual = visuals[i];
            if (visual.rarity !== snap.rarity) continue;

            const dist = Math.hypot(visual.x - snap.x, visual.y - snap.y);
            if (dist < bestDist) {
                bestDist = dist;
                bestIndex = i;
            }
        }

        if (bestIndex >= 0) {
            used.add(bestIndex);
            const visual = visuals[bestIndex];
            visual.x = snap.x;
            visual.y = snap.y;
            visual.state = snap.state;
            visual.attackDirection = snap.attackDirection;
            visual.velocityX = snap.velocityX;
            visual.velocityY = snap.velocityY;
            visual.sprite.setPosition(snap.x, snap.y);
            applyStateTint(visual);
            next.push(visual);
        } else {
            next.push(createEnemyVisual(scene, snap));
        }
    }

    for (let i = 0; i < visuals.length; i++) {
        if (used.has(i)) continue;
        const visual = visuals[i];
        shatterAt(
            visual.x,
            visual.y,
            visual.velocityX ?? 0,
            visual.velocityY ?? 0,
            `enemy-${visual.rarity}`,
            ENEMY_RARITY_COLORS[visual.rarity]
        );
        visual.sprite.destroy();
    }

    variable.enemyVisuals = next;
}

function createEnemyVisual(scene, snap) {
    const rarity = snap.rarity ?? 0;
    const radius = getEnemyRadius(rarity);
    const sprite = scene.add.image(snap.x, snap.y, `enemy-${rarity}`);
    sprite.setDisplaySize(radius * 2, radius * 2);
    sprite.setDepth(500);

    const visual = {
        sprite,
        rarity,
        x: snap.x,
        y: snap.y,
        state: snap.state ?? ENEMY_STATE.IDLE,
        attackDirection: snap.attackDirection ?? 0,
        velocityX: snap.velocityX ?? 0,
        velocityY: snap.velocityY ?? 0,
    };

    applyStateTint(visual);
    return visual;
}

function applyStateTint(visual) {
    const tints = {
        [ENEMY_STATE.IDLE]: ENEMY_RARITY_COLORS[visual.rarity] ?? 0xffffff,
        [ENEMY_STATE.WINDUP]: 0xffaa00,
        [ENEMY_STATE.ATTACK]: 0xff0000,
        [ENEMY_STATE.COOLDOWN]: 0xaaaaaa,
    };

    visual.sprite.setTint(tints[visual.state] ?? 0xffffff);
}

export function drawEnemyDebug(graphics) {
    if (!SETTINGS.DEBUG_ENEMY_ATTACKS || !graphics) {
        return;
    }

    graphics.clear();

    if (!variable.enemyVisuals) {
        return;
    }

    for (const visual of variable.enemyVisuals) {
        if (visual.state !== ENEMY_STATE.WINDUP && visual.state !== ENEMY_STATE.ATTACK) {
            continue;
        }

        const range = SETTINGS.ENEMY_ATTACK_RANGE;
        const halfSweep = (SETTINGS.ENEMY_ATTACK_SWEEP / 2) * (Math.PI / 180);
        const dir = visual.attackDirection || 0;

        graphics.fillStyle(visual.state === ENEMY_STATE.ATTACK ? 0xff0000 : 0xffaa00, 0.18);
        graphics.beginPath();
        graphics.moveTo(visual.x, visual.y);
        graphics.arc(
            visual.x,
            visual.y,
            range,
            dir - halfSweep,
            dir + halfSweep,
            false
        );
        graphics.closePath();
        graphics.fillPath();
    }
}

export function clearEnemyVisuals() {
    for (const visual of variable.enemyVisuals) {
        visual.sprite.destroy();
    }
    variable.enemyVisuals = [];
}
