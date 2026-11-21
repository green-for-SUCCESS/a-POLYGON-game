import { SETTINGS, ENEMY_STATE, ENEMY_RARITY_COLORS } from "../../../../shared-data/Constants.js";
import { getEnemyRadius } from "../../../../shared-data/Geometry.js";
import { variable } from "../GameValues/LocalVariables.js";
import { playDeathPop } from "./Effects.js";

const HIT_FLASH_DURATION = 100; // ms

// Keyed by the server's enemy id. The server only ever removes an enemy
// from its state when it dies (HeadlessGame._killEnemy), so an id that was
// here last frame and is gone now is a death — not a guess from position
// jumps, which is what the old nearest-match lookup relied on.
const visualsById = new Map();
let frameStamp = 0;
let trackedScene = null;

export function applyEnemySnapshot(snapshot) {
    const scene = variable.sceneRef;
    if (!scene) {
        return;
    }

    // Returning to the Game scene builds a fresh scene; the previous scene's
    // sprites were destroyed with it, so drop them without animating.
    if (scene !== trackedScene) {
        visualsById.clear();
        trackedScene = scene;
    }

    frameStamp++;
    const live = variable.enemyVisuals;
    live.length = 0;

    for (const snap of snapshot) {
        let visual = visualsById.get(snap.id);

        if (!visual) {
            visual = createEnemyVisual(scene, snap);
            visualsById.set(snap.id, visual);
        } else {
            visual.x = snap.x;
            visual.y = snap.y;
            visual.state = snap.state;
            visual.attackDirection = snap.attackDirection;
            visual.velocityX = snap.velocityX;
            visual.velocityY = snap.velocityY;
            visual.sprite.setPosition(snap.x, snap.y);

            // A hit that doesn't kill the enemy previously had almost no visible
            // feedback (health was never even synced to the client). Flash white
            // briefly whenever health drops, so Slash/Fastfall hits are obvious.
            if (snap.health < visual.health) {
                visual.flashUntil = Date.now() + HIT_FLASH_DURATION;
            }
            visual.health = snap.health ?? visual.health;
            visual.maxHealth = snap.maxHealth ?? visual.maxHealth;

            if (visual.flashUntil && Date.now() < visual.flashUntil) {
                visual.sprite.setTint(0xffffff);
            } else {
                visual.flashUntil = 0;
                applyStateTint(visual);
            }
        }

        visual.seenFrame = frameStamp;
        live.push(visual);
    }

    if (visualsById.size !== live.length) {
        for (const [id, visual] of visualsById) {
            if (visual.seenFrame !== frameStamp) {
                visualsById.delete(id);
                playEnemyDeath(scene, visual);
            }
        }
    }
}

// The pop runs on the enemy's own sprite. The visual has already left
// visualsById, so nothing else touches it and a later snapshot can't restart
// or interrupt it.
function playEnemyDeath(scene, visual) {
    playDeathPop(scene, visual.sprite);
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
        health: snap.health ?? 0,
        maxHealth: snap.maxHealth ?? 0,
        flashUntil: 0,
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
    for (const visual of visualsById.values()) {
        visual.sprite.destroy();
    }
    visualsById.clear();
    variable.enemyVisuals.length = 0;
}
