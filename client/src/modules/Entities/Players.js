import Phaser from "phaser";

import { allBlocks, groundBlocks, stoneObjects, spikePositions,} from "../../../../shared-data/Environment.js";
import { SETTINGS } from "../../../../shared-data/Constants.js";
import { getRunXPTotal, getLevelProgress, getPlayerLevelFromState } from "../../../../shared-data/Progression.js";
import { getPlayerSides, getPlayerSideLengthForSides, getRegularPolygonRadius, getRegularPolygonMetrics, getRegularPolygonPoints } from "../../../../shared-data/Geometry.js";
import { getSpawnZoneEnd } from "../../../../shared-data/Zones.js";
import { variable } from "../GameValues/LocalVariables.js";
import { playDeathPop } from "./Effects.js";
import { GAME_MODES } from "../../../../shared-data/GameModes.js";

// =====================================================
// PLAYER POLYGON (level -> sides, constant area)
// =====================================================

const TEXTURE_PADDING = 4;

function polygonTextureSize(radius) {
    return Math.ceil(radius * 2) + TEXTURE_PADDING;
}

// The level-1 triangle has always been drawn at this scale (its texture
// squeezed into a 2r box, the same as the enemy Triangle still is). Every
// side count uses this one scale, so the drawn polygon keeps the same area
// at every evolution instead of drifting with each texture's padding.
const TRIANGLE_RADIUS = getRegularPolygonRadius(3, getPlayerSideLengthForSides(3));
const PLAYER_RENDER_SCALE = (TRIANGLE_RADIUS * 2) / polygonTextureSize(TRIANGLE_RADIUS);

// Textures are made on first use and cached in the game-wide texture
// manager, so each side count is generated once no matter how many players
// reach it — there is no upper limit on sides.
function ensurePlayerTexture(scene, sides) {
    const key = `player-${sides}`;
    if (scene.textures.exists(key)) {
        return key;
    }

    const radius = getRegularPolygonRadius(sides, getPlayerSideLengthForSides(sides));
    const size = polygonTextureSize(radius);
    const points = getRegularPolygonPoints(size / 2, size / 2, sides, radius);
    const g = scene.add.graphics();

    g.fillStyle(0xffffff, 1); // white, so the local/remote tint applies as before
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        g.lineTo(points[i].x, points[i].y);
    }
    g.closePath();
    g.fillPath();
    g.generateTexture(key, size, size);
    g.destroy();

    return key;
}

// Purely cosmetic (+ this client's own, non-authoritative collision box):
// the level that drives this comes from the server's synced xp/runXP, and
// the shape is derived from that level alone, so a jump of many levels at
// once, a reconnect, or a late joiner all land on the right polygon.
export function applyPlayerPolygon(player, level) {
    const sides = getPlayerSides(level);
    if (player.sides === sides) {
        return;
    }

    const sideLength = getPlayerSideLengthForSides(sides);
    const radius = getRegularPolygonRadius(sides, sideLength);
    const metrics = getRegularPolygonMetrics(sides, sideLength);
    const sprite = player.sprite;
    const displaySize = polygonTextureSize(radius) * PLAYER_RENDER_SCALE;

    sprite.setTexture(ensurePlayerTexture(sprite.scene, sides));
    sprite.setDisplaySize(displaySize, displaySize);

    if (sprite.body) {
        sprite.body.setSize(metrics.width, metrics.height, true);

        if (player.bodyHeight != null) {
            // Keep the polygon's bottom edge anchored where it was: area is
            // constant across levels, but the bounding-box height still
            // changes shape to shape, so without this the sprite would pop
            // up/down relative to the ground on every level-up.
            sprite.y -= (metrics.height - player.bodyHeight) / 2;
        }
    }

    player.sides = sides;
    player.bodyHeight = metrics.height;
}

// =====================================================
// CREATE PLAYER
// =====================================================

export function createPlayer(id, x, y, playerState) {
    const isLocal = (id === variable.playerId);
    const level = getPlayerLevelFromState(playerState, variable.gameMode);
    const sides = getPlayerSides(level);

    const sprite = variable.sceneRef.physics.add.sprite(
        x,
        y,
        ensurePlayerTexture(variable.sceneRef, sides)
    );

    sprite.setCollideWorldBounds(true);
    sprite.isFastFalling = false;
    sprite.setDepth(1000);

    const player = {
        id,
        sprite,
        health: SETTINGS.PLAYER_MAX_HEALTH,
        isLocal,
        targetX: x,
        targetY: y
    };

    applyPlayerPolygon(player, level);

    variable.allPlayers[id] = player;

    // Temporary compatibility with your existing code.
    // You'll remove variable.sceneRef once everything uses allPlayers.
    if (isLocal) {
        sprite.setTint(0x1e90ff);
        variable.player = sprite;
        variable.playerHealth = SETTINGS.PLAYER_BASE_MAX_HEALTH;
        variable.playerMaxHealth = SETTINGS.PLAYER_BASE_MAX_HEALTH;
        variable.myId = id;
        variable.localDeathPendingCount = null;

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
        createProgressHud();
    } else {
        // REMOTE PLAYER: Completely disable physics body calculations
        // This stops gravity, collisions, and velocity acceleration on remote clients
        sprite.setTint(0x00ff00)
        sprite.body.enable = false;
        createRemotePlayerHud(player);
    }
    

    return player;
}

function createProgressHud() {
    if (variable.xpHud) {
        variable.xpHud.destroy();
    }

    variable.xpHud = variable.sceneRef.add.text(
        20,
        138,
        "",
        {
            fontSize: "18px",
            fontFamily: "Ubuntu",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 3
        }
    );
    variable.xpHud.setOrigin(0, 0);
    variable.xpHud.setScrollFactor(0);
    variable.xpHud.setDepth(3001);
    updateProgressHud();
}

export function updateProgressHud() {
    if (!variable.xpHud) {
        return;
    }

    // FFA shows that run's temporary progression; main mode the persistent one.
    const isFFA = variable.gameMode === GAME_MODES.FFA;
    const total = isFFA
        ? variable.ffaXP
        : getRunXPTotal(variable.persistentXP, variable.runXP);
    const { level, intoLevel, span } = getLevelProgress(total);
    const prefix = isFFA ? "FFA " : "";
    variable.xpHud.setText(`${prefix}Lv ${level}  ${Math.floor(intoLevel)}/${Math.floor(span)} XP`);
}

export function enforceLocalSpawnBoundary() {
    if (!variable.player) {
        return;
    }

    const spawnEnd = getSpawnZoneEnd();

    if (!variable.spawnExited && variable.player.x >= spawnEnd) {
        variable.spawnExited = true;
    }

    if (variable.spawnExited && variable.player.x < spawnEnd) {
        variable.player.x = spawnEnd;
        if (variable.player.body?.velocity.x < 0) {
            variable.player.setVelocityX(0);
        }
    }
}

const REMOTE_HP_BAR_WIDTH = 42;
const REMOTE_HP_BAR_HEIGHT = 5;
const REMOTE_HP_BAR_GAP = 6;
const REMOTE_NAME_GAP = 3;

function createRemotePlayerHud(player) {
    const scene = variable.sceneRef;

    const nameTag = scene.add.text(
        player.sprite.x,
        player.sprite.y,
        "Player",
        {
            fontSize: "12px",
            fontFamily: "Ubuntu",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 3
        }
    );
    nameTag.setOrigin(0.5, 1);
    nameTag.setDepth(1002);

    const hpBg = scene.add.rectangle(
        player.sprite.x,
        player.sprite.y,
        REMOTE_HP_BAR_WIDTH,
        REMOTE_HP_BAR_HEIGHT,
        0x222222
    );
    hpBg.setOrigin(0.5, 0.5);
    hpBg.setDepth(1001);

    const hpFill = scene.add.rectangle(
        player.sprite.x - REMOTE_HP_BAR_WIDTH / 2,
        player.sprite.y,
        REMOTE_HP_BAR_WIDTH,
        REMOTE_HP_BAR_HEIGHT,
        0x00ff00
    );
    hpFill.setOrigin(0, 0.5);
    hpFill.setDepth(1002);

    player.nameTag = nameTag;
    player.hpBg = hpBg;
    player.hpFill = hpFill;

    layoutRemotePlayerHud(player);
    updateRemotePlayerHealthBar(player);
}

function layoutRemotePlayerHud(player) {
    if (!player.nameTag) {
        return;
    }

    const x = player.sprite.x;
    const top = player.sprite.y - SETTINGS.PLAYER_SIZE / 2;
    const barY = top - REMOTE_HP_BAR_GAP - REMOTE_HP_BAR_HEIGHT / 2;

    player.hpBg.setPosition(x, barY);
    player.hpFill.setPosition(x - REMOTE_HP_BAR_WIDTH / 2, barY);
    player.nameTag.setPosition(
        x,
        barY - REMOTE_HP_BAR_HEIGHT / 2 - REMOTE_NAME_GAP
    );
}

export function setRemotePlayerName(player, name) {
    if (!player?.nameTag) {
        return;
    }

    const label =
        typeof name === "string" && name.trim()
            ? name.trim()
            : "Player";

    player.nameTag.setText(label);
}

export function setRemotePlayerHealth(player, health, maxHealth) {
    if (!player) {
        return;
    }

    player.health = health;
    if (maxHealth > 0) {
        player.maxHealth = maxHealth;
    }
    updateRemotePlayerHealthBar(player);
}

// =====================================================
// PLAYER DEATH ANIMATION
// The same grow-and-fade as enemies, played on a one-off copy of the
// player's sprite so the real sprite (and its physics body) can be hidden,
// moved and revived straight away without cutting the animation short.
// The copy has no body and nothing else references it; the tween destroys
// it. A sprite that is already hidden has nothing to animate, which is also
// what stops the same death from playing twice (e.g. the offline/local path
// already played it, then the server's deathCount arrives).
// =====================================================
export function playPlayerDeathAnimation(player) {
    const sprite = player?.sprite;
    if (!sprite || !sprite.active || !sprite.visible || !sprite.scene) {
        return;
    }

    const ghost = sprite.scene.add.image(sprite.x, sprite.y, sprite.texture.key);
    ghost.setScale(sprite.scaleX, sprite.scaleY);
    ghost.setRotation(sprite.rotation);
    ghost.setTint(sprite.tintTopLeft);
    ghost.setDepth(sprite.depth);
    ghost.setAlpha(sprite.alpha);

    playDeathPop(sprite.scene, ghost);
}

export function killRemotePlayer(player) {
    if (!player?.sprite || player.dead) {
        return;
    }

    player.dead = true;

    const x = player.targetX ?? player.sprite.x;
    const y = player.targetY ?? player.sprite.y;
    player.sprite.setPosition(x, y);
    player.sprite.setVisible(false);
    player.nameTag?.setVisible(false);
    player.hpBg?.setVisible(false);
    player.hpFill?.setVisible(false);
}

export function reviveRemotePlayer(player) {
    if (!player?.sprite) {
        return;
    }

    player.dead = false;
    player.sprite.setVisible(true);
    updateRemotePlayerHealthBar(player);
}

function updateRemotePlayerHealthBar(player) {
    if (!player.hpFill) {
        return;
    }

    // Max health grows with level, so the bar has to use this player's own
    // synced maximum (the old fixed PLAYER_MAX_HEALTH showed regen and most
    // damage as a permanently full bar).
    const maxHealth = player.maxHealth || SETTINGS.PLAYER_BASE_MAX_HEALTH;
    const percent = Phaser.Math.Clamp(
        player.health / maxHealth,
        0,
        1
    );

    player.hpFill.width = REMOTE_HP_BAR_WIDTH * percent;
    player.hpFill.setFillStyle(
        percent > 0.5 ? 0x00ff00 : percent > 0.25 ? 0xffff00 : 0xff0000
    );

    const visible = player.health > 0;
    player.nameTag.setVisible(visible);
    player.hpBg.setVisible(visible);
    player.hpFill.setVisible(visible);
}

export function updateRemotePlayers() {
    for (const id in variable.allPlayers) {
        const player = variable.allPlayers[id];
        if (player.isLocal) {
            continue;
        }

        if (player.targetX != null && player.targetY != null) {
            player.sprite.setPosition(player.targetX, player.targetY);
        }

        if (!player.dead) {
            layoutRemotePlayerHud(player);
        }
    }
}

export function destroyPlayer(id) {
    const player = variable.allPlayers[id];
    if (!player) {
        return;
    }

    player.sprite.destroy();
    player.nameTag?.destroy();
    player.hpBg?.destroy();
    player.hpFill?.destroy();

    delete variable.allPlayers[id];
}

// =================================================
// PLAYER MOVEMENT
// =================================================
export function playerMovementCheck() {
    // LEFT - RIGHT

    if (!variable.player.isFastFalling) {

    
        let accelX = 0;
        let accelY = 0;

        if (variable.cursors.left.isDown || variable.wasd.A.isDown) {
            accelX -= SETTINGS.PLAYER_MOVE_FORCE / SETTINGS.PLAYER_MASS;
        }
        else if (variable.cursors.right.isDown || variable.wasd.D.isDown) {
            accelX += SETTINGS.PLAYER_MOVE_FORCE / SETTINGS.PLAYER_MASS;
        }

        const dragAccelX =
            SETTINGS.PLAYER_HORIZONTAL_DRAG_COEFFICIENT *
            variable.player.body.velocity.x;

        accelX -= dragAccelX;

        variable.player.body.velocity.x += accelX;

        const dragAccelY =
            SETTINGS.PLAYER_VERTICAL_DRAG_COEFFICIENT *
            variable.player.body.velocity.y;

        accelY -= dragAccelY;

        variable.player.body.velocity.y += accelY;

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
    // Availability comes from the server (variable.fastfallReady, synced from
    // PlayerState). Pressing Down during cooldown latches fastfallBlocked until
    // Down is released, so it can't activate the moment the cooldown expires.

    const downHeld =
        variable.cursors.down.isDown ||
        variable.wasd.S.isDown;

    if (!downHeld) {
        variable.fastfallBlocked = false;
    } else if (!variable.player.isFastFalling && !variable.fastfallReady) {
        variable.fastfallBlocked = true;
    }

    const fastfallAllowed =
        variable.player.isFastFalling ||
        (variable.fastfallReady && !variable.fastfallBlocked);

    if (
        downHeld &&
        fastfallAllowed &&
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
    const maxHealth = variable.playerMaxHealth || SETTINGS.PLAYER_BASE_MAX_HEALTH;
    const percent =
    Phaser.Math.Clamp(
            variable.playerHealth / maxHealth,
            0,
            1
        );

    
        variable.healthBarTargetWidth = 300 * percent;

    variable.healthBarFill.width = 300 * percent;
}

// How long a client-predicted death waits for the server to confirm it
// before trusting the server's "still alive" again (e.g. the "suicide"
// message was lost to a half-open socket or the SDK's reconnect queue).
const LOCAL_DEATH_CONFIRM_TIMEOUT = 2500; // ms

export function damagePlayer(amount) {

    if (!variable.player.active) return;
    if (variable.playerSpawnProtected) {
        return;
    }
    if (!variable.spawnExited) {
        return;
    }

    variable.playerHealth -= amount;


    updateHealthBar();


    if (variable.playerHealth <= 0) {

    
        variable.playerHealth = 0;

    
        updateHealthBar();

        if (variable.room) {
            variable.room.send("suicide");
            // See Network.js: the server's confirmation of this death is
            // the next deathCount; until then stale "alive" patches are ignored.
            const self = variable.allPlayers[variable.myId];
            variable.localDeathPendingCount = (self?.deathCount ?? 0) + 1;
            variable.localDeathPendingUntil = Date.now() + LOCAL_DEATH_CONFIRM_TIMEOUT;
        }

        // Played here so client-side deaths (offline, or spikes) react
        // instantly; Network.js recognises the server's deathCount for this
        // same death (localDeathPendingCount) and doesn't replay it.
        playPlayerDeathAnimation(variable.allPlayers[variable.myId]);
        handleLocalPlayerDeath();
    }
}

// =====================================================
// LOCAL PLAYER DEATH
// Hides the local player and shows the death screen. The visual is
// playPlayerDeathAnimation (called by whoever detected the death first).
// =====================================================

export function handleLocalPlayerDeath() {
    // prevent duplicate deaths
    if (!variable.player.active) return;

    variable.player.disableBody(true, true);
    showDeathScreen();
}

// =====================================================
// DEATH SCREEN
// =====================================================

export function showDeathScreen() {
    if (variable.deathScreen) {
        return;
    }

    const scene = variable.sceneRef;
    const { width, height } = scene.scale;

    const overlay = scene.add.rectangle(
        0,
        0,
        width,
        height,
        0x000000,
        0.72
    );
    overlay.setOrigin(0, 0);
    overlay.setScrollFactor(0);
    overlay.setDepth(5000);

    const title = scene.add.text(
        width / 2,
        height * 0.32,
        "YOU DIED",
        {
            fontSize: "72px",
            fontFamily: "Ubuntu",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 6
        }
    );
    title.setOrigin(0.5);
    title.setScrollFactor(0);
    title.setDepth(5001);

    // BUTTON SETTINGS

    const btnW = 300;
    const btnH = 80;
    const btnRadius = 20;
    const btnGap = 20;

    const btnX = width / 2 - btnW / 2;

    // RESPAWN BUTTON

    const respawnY = height * 0.46;

    const respawnBg = scene.add.graphics();
    respawnBg.setScrollFactor(0);
    respawnBg.setDepth(5001);

    function drawRespawnButton(color) {
        respawnBg.clear();
        respawnBg.fillStyle(color, 0.95);
        respawnBg.fillRoundedRect(
            btnX,
            respawnY,
            btnW,
            btnH,
            btnRadius
        );
        respawnBg.lineStyle(3, 0xffffff, 1);
        respawnBg.strokeRoundedRect(
            btnX,
            respawnY,
            btnW,
            btnH,
            btnRadius
        );
    }

    drawRespawnButton(0x222222);

    const respawnHit = scene.add.rectangle(
        btnX,
        respawnY,
        btnW,
        btnH,
        0x000000,
        0
    );

    respawnHit
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .setScrollFactor(0)
        .setDepth(5002);

    const respawnText = scene.add.text(
        btnX + btnW / 2,
        respawnY + btnH / 2,
        "RESPAWN",
        {
            fontSize: "36px",
            fontFamily: "Ubuntu",
            color: "#ffffff"
        }
    );

    respawnText.setOrigin(0.5);
    respawnText.setScrollFactor(0);
    respawnText.setDepth(5003);

    respawnHit.on("pointerdown", () => {
        drawRespawnButton(0x1a1a1a);
    });

    respawnHit.on("pointerout", () => {
        drawRespawnButton(0x222222);
    });

    respawnHit.on("pointerup", () => {
        drawRespawnButton(0x222222);

        if (variable.room) {
            variable.room.send("respawn");
        } else {
            hideDeathScreen();
            respawnPlayer({ immediate: true });
        }
    });

    // MENU BUTTON

    const menuY = respawnY + btnH + btnGap;

    const menuBg = scene.add.graphics();
    menuBg.setScrollFactor(0);
    menuBg.setDepth(5001);

    function drawMenuButton(color) {
        menuBg.clear();
        menuBg.fillStyle(color, 0.95);
        menuBg.fillRoundedRect(
            btnX,
            menuY,
            btnW,
            btnH,
            btnRadius
        );
        menuBg.lineStyle(3, 0xffffff, 1);
        menuBg.strokeRoundedRect(
            btnX,
            menuY,
            btnW,
            btnH,
            btnRadius
        );
    }

    drawMenuButton(0x222222);

    const menuHit = scene.add.rectangle(
        btnX,
        menuY,
        btnW,
        btnH,
        0x000000,
        0
    );

    menuHit
        .setOrigin(0)
        .setInteractive({ useHandCursor: true })
        .setScrollFactor(0)
        .setDepth(5002);

    const menuText = scene.add.text(
        btnX + btnW / 2,
        menuY + btnH / 2,
        "BACK TO MENU",
        {
            fontSize: "36px",
            fontFamily: "Ubuntu",
            color: "#ffffff"
        }
    );

    menuText.setOrigin(0.5);
    menuText.setScrollFactor(0);
    menuText.setDepth(5003);

    menuHit.on("pointerdown", () => {
        drawMenuButton(0x1a1a1a);
    });

    menuHit.on("pointerout", () => {
        drawMenuButton(0x222222);
    });

    menuHit.on("pointerup", () => {
        drawMenuButton(0x222222);

        hideDeathScreen();

        // If connected to multiplayer, leave the room first.
        if (variable.room) {
            variable.room.leave();
            variable.room = null;
        }

        scene.scene.start("Home");
    });

    // SAVE REFERENCES

    variable.deathScreen = {
        overlay,
        title,

        respawnBg,
        respawnHit,
        respawnText,

        menuBg,
        menuHit,
        menuText
    };
}

export function hideDeathScreen() {
    if (!variable.deathScreen) {
        return;
    }

    const {
        overlay,
        title,

        respawnBg,
        respawnHit,
        respawnText,

        menuBg,
        menuHit,
        menuText
    } = variable.deathScreen;

    overlay.destroy();
    title.destroy();

    respawnBg.destroy();
    respawnHit.destroy();
    respawnText.destroy();

    menuBg.destroy();
    menuHit.destroy();
    menuText.destroy();

    variable.deathScreen = null;
}

// =====================================================
// PLAYER SPAWN
// =====================================================

export function respawnPlayer({ immediate = false } = {}) {

    hideDeathScreen();

    const x = SETTINGS.PLAYER_START_X;
    const y = SETTINGS.ENTITY_SPAWN_HEIGHT;

    const delay = immediate ? 0 : SETTINGS.PLAYER_RESPAWN_DELAY;

    setTimeout(() => {
    
        if (!variable.player || !variable.player.body) return;
    
        variable.player.enableBody(
            true,
            x,
            y,
            true,
            true
        );
    
        variable.playerSpawnProtected = true;
        variable.spawnExited = false;
    
        variable.playerHealth = variable.playerMaxHealth || SETTINGS.PLAYER_BASE_MAX_HEALTH;
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
