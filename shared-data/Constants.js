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

    // ---------------- SPAWNING ----------------
    ENEMY_SPAWN_CHANCE: 1,   // 100% chance every second
    MAX_ENEMIES: 200,

    // ---------------- ENEMY ----------------
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
    ENEMY_ATTACK_DAMAGE: 20,
    ENEMY_ATTACK_DURATION: 150,
    ENEMY_KNOCKBACK: 1000,

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

    // ---------------- HEALTH ----------------
    PLAYER_MAX_HEALTH: 100,
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