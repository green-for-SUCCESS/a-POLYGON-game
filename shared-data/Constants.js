// =========================================================
// ADJUSTABLE GAME SETTINGS
// =========================================================

export const SETTINGS = {

    // ---------------- WORLD ----------------
    WORLD_WIDTH: 25000,
    WORLD_HEIGHT: 2080,
    GRAVITY: 2000,

    // ---------------- ENTITIES ----------------
    ENTITY_SPAWN_HEIGHT: 1800,

    // ---------------- PLAYER ----------------
    PLAYER_SIZE: 50,
    PLAYER_START_X: 100,

    PLAYER_MASS: 1,
    PLAYER_MOVE_FORCE: 300,
    PLAYER_DRAG_COEFFICIENT: 0.4,
    PLAYER_VERTICAL_DRAG_COEFFICIENT: 0.015,
    PLAYER_FASTFALL_SPEED: 3000,
    JUMP_STRENGTH: -1250,

    PLAYER_RESPAWN_DELAY: 3000,
    PLAYER_RESPAWN_FREEZE_DELAY: 1000,

    // ---------------- SPIKES ----------------
    SPIKE_DAMAGE: 50,
    SPIKE_KNOCKBACK: 4000,

    // ---------------- ZONES ----------------
    SPAWN_ZONE_WIDTH: 500,

    ZONE_PEACEFUL_CAP: 50,
    ZONE_PEACEFUL_SPAWN_CHANCE: 0.25,

    ZONE_RESTLESS_CAP: 100,
    ZONE_RESTLESS_SPAWN_CHANCE: 0.50,

    ZONE_CHAOTIC_CAP: 200,
    ZONE_CHAOTIC_SPAWN_CHANCE: 0.75,

    ZONE_ANARCHIC_CAP: 400,
    ZONE_ANARCHIC_SPAWN_CHANCE: 1.00,

    // ---------------- ENEMY RARITY / SHAPE ----------------
    ENEMY_RARITY_MAX: 4,
    ENEMY_RARITY_UPGRADE_CHANCE: 0.25,
    ENEMY_SIDE_LENGTH: 36,

    // ---------------- ENEMY STATS ----------------
    ENEMY_BASE_HEALTH: 48,
    ENEMY_HEALTH_GROWTH: 2.5,
    ENEMY_BASE_DAMAGE: 2,
    ENEMY_DAMAGE_GROWTH: 2.5,
    ENEMY_BASE_XP: 2,
    ENEMY_XP_GROWTH: 4,

    // ---------------- SPAWNING ----------------
    MAX_ENEMIES: 300,

    // ---------------- ENEMY AI ----------------
    ENEMY_PATROL_SPEED: 200,
    ENEMY_CHASE_SPEED_MULT: 4,

    ENEMY_FRONT_RANGE: 600,
    ENEMY_BACK_RANGE: 200,

    ENEMY_PATROL_DECISION_MIN: 500,
    ENEMY_PATROL_DECISION_MAX: 2000,
    ENEMY_PATROL_MOVE_CHANCE: 0.6,

    ENEMY_VISION_STEP: 8,

    ENEMY_ATTACK_RANGE: 150,
    ENEMY_ATTACK_SWEEP: 90,      // degrees
    ENEMY_ATTACK_DELAY: 100,     // ms
    ENEMY_ATTACK_COOLDOWN: 300, // ms
    ENEMY_ATTACK_DURATION: 150,
    ENEMY_KNOCKBACK: 1000,

    // ---------------- PLAYER PROGRESSION ----------------
    LEVEL_XP_BASE: 100,
    LEVEL_XP_GROWTH: 1.25,

    PLAYER_BASE_MAX_HEALTH: 20,
    PLAYER_HEALTH_GROWTH: 1.05,
    PLAYER_BASE_DAMAGE: 2,
    PLAYER_DAMAGE_GROWTH: 1.05,

    // ---------------- FASTFALL ----------------
    PLAYER_FASTFALL_DAMAGE: 16,
    PLAYER_FASTFALL_DAMAGE_GROWTH: 1.15,
    PLAYER_FASTFALL_RADIUS: 180,
    PLAYER_FASTFALL_KNOCKBACK: 900,
    PLAYER_FASTFALL_KNOCKBACK_GROWTH: 1.08,
    PLAYER_FASTFALL_STUN: 500,

    // ---------------- CHECKPOINT ----------------
    CHECKPOINT_SIZE: 32,
    CHECKPOINT_STORAGE_KEY: 'variable.lastCheckpoint',

    // ---------------- CAMERA ----------------
    CAMERA_LERP_X: 0.15,
    CAMERA_LERP_Y: 0.25,

    CAMERA_DEADZONE_X: 0.25,
    CAMERA_DEADZONE_Y: 0.5,

    // ---------------- TEXTURE SCALE ----------------
    BLOCK_SCALE: 0.0625,

    // ---------------- HEALTH (legacy alias) ----------------
    PLAYER_MAX_HEALTH: 40,
    PLAYER_DAMAGE_COOLDOWN: 1000,

    // ---------------- DEBUG ----------------
    DEBUG_ENEMY_ATTACKS: true,
};

export const ENEMY_STATE = {
    IDLE: 0,
    WINDUP: 1,
    ATTACK: 2,
    COOLDOWN: 3
};

export const ENEMY_RARITY_COLORS = [
    0xff4444,
    0xffaa33,
    0x44dd66,
    0x4488ff,
    0xcc55ff,
];
