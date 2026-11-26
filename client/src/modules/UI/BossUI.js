// =====================================================
// BOSS UI: spawn notification + proximity health bar
// =====================================================
//
// Purely presentation. The server says when a boss spawns ("bossSpawned"
// broadcast, once per boss) and owns the boss's health (synced EnemyState);
// this only displays them.

import { SETTINGS } from "../../../../shared-data/Constants.js";
import { isBossRarity } from "../../../../shared-data/Progression.js";
import { variable } from "../GameValues/LocalVariables.js";

const NOTICE_DURATION_MS = 4000;
const BAR_WIDTH_FRACTION = 0.5;   // of screen width
const BAR_MAX_WIDTH = 640;
const BAR_HEIGHT = 18;
const NOTICE_Y = 24;
const BAR_Y = 92;                 // below the notification area

// Boss ids already announced on this client, so a duplicate or re-delivered
// event never replays the banner.
const announced = new Set();
let notice = null;
let bar = null;

// ---------------- Spawn notification ----------------

export function showBossSpawnNotice(bossId) {
    const scene = variable.sceneRef;
    if (!scene || !scene.sys?.isActive()) {
        return;
    }
    const key = String(bossId ?? "");
    if (announced.has(key)) {
        return;
    }
    announced.add(key);

    hideBossSpawnNotice();

    const text = scene.add.text(scene.scale.width / 2, NOTICE_Y, "BOSS HAS SPAWNED!", {
        fontSize: "44px",
        fontFamily: "Ubuntu",
        fontStyle: "bold",
        color: "#ff2a2a",
        stroke: "#000000",
        strokeThickness: 6,
    });
    text.setOrigin(0.5, 0).setScrollFactor(0).setDepth(4500);

    // Smooth pulse (fade + slight scale) to draw the eye without covering play.
    const pulse = scene.tweens.add({
        targets: text,
        alpha: { from: 1, to: 0.35 },
        scale: { from: 1, to: 1.06 },
        duration: 420,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
    });

    const timer = scene.time.delayedCall(NOTICE_DURATION_MS, hideBossSpawnNotice);
    notice = { text, pulse, timer };
}

function hideBossSpawnNotice() {
    if (!notice) {
        return;
    }
    notice.pulse?.remove();
    notice.timer?.remove(false);
    notice.text?.destroy();
    notice = null;
}

// ---------------- Health bar ----------------

function createBar(scene) {
    const width = Math.min(BAR_MAX_WIDTH, scene.scale.width * BAR_WIDTH_FRACTION);
    const x = scene.scale.width / 2 - width / 2;

    const bg = scene.add.rectangle(x - 3, BAR_Y - 3, width + 6, BAR_HEIGHT + 6, 0x000000, 0.75)
        .setOrigin(0, 0).setStrokeStyle(2, 0xff22ff, 1);
    const lag = scene.add.rectangle(x, BAR_Y, width, BAR_HEIGHT, 0xffffff, 0.35).setOrigin(0, 0);
    const fill = scene.add.rectangle(x, BAR_Y, width, BAR_HEIGHT, 0xff22ff, 1).setOrigin(0, 0);
    const label = scene.add.text(scene.scale.width / 2, BAR_Y - 6, "", {
        fontSize: "16px",
        fontFamily: "Ubuntu",
        fontStyle: "bold",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
    }).setOrigin(0.5, 1);

    for (const obj of [bg, lag, fill, label]) {
        obj.setScrollFactor(0).setDepth(4400);
    }
    return { scene, bg, lag, fill, label, width, shown: 1, lagShown: 1 };
}

function destroyBar() {
    if (!bar) {
        return;
    }
    for (const obj of [bar.bg, bar.lag, bar.fill, bar.label]) {
        obj.destroy();
    }
    bar = null;
}

// Called every frame. Each client decides for itself whether its own player
// is within BOSS_HEALTH_BAR_RANGE of the (one) live boss; health comes from
// the synced, server-authoritative enemy state.
export function updateBossHealthBar(delta = 16) {
    const scene = variable.sceneRef;
    const me = variable.player;
    const boss = (variable.enemyVisuals || []).find((v) => isBossRarity(v.rarity));

    const inRange = boss && me && me.active &&
        Math.hypot(boss.x - me.x, boss.y - me.y) <= SETTINGS.BOSS_HEALTH_BAR_RANGE;

    if (!scene || !inRange || !(boss.maxHealth > 0)) {
        destroyBar();
        return;
    }

    if (!bar || bar.scene !== scene) {
        destroyBar();
        bar = createBar(scene);
    }

    const target = Math.max(0, Math.min(1, boss.health / boss.maxHealth));
    // Smooth toward the authoritative value; the pale "lag" bar trails it.
    const k = Math.min(1, delta / 120);
    bar.shown += (target - bar.shown) * k;
    bar.lagShown += (bar.shown - bar.lagShown) * Math.min(1, delta / 600);
    if (bar.lagShown < bar.shown) {
        bar.lagShown = bar.shown;
    }
    bar.fill.width = bar.width * bar.shown;
    bar.lag.width = bar.width * bar.lagShown;
    bar.label.setText(
        `BOSS (Rarity ${boss.rarity})  ${Math.ceil(Math.max(0, boss.health)).toLocaleString("en-US")} / ${Math.round(boss.maxHealth).toLocaleString("en-US")}`
    );
}

// A new Game scene (or leaving the game) starts clean.
export function resetBossUI() {
    hideBossSpawnNotice();
    destroyBar();
}
