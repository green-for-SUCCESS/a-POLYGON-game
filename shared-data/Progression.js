import { SETTINGS } from "./Constants.js";

export function rollEnemyRarity(
    maxRarity = SETTINGS.ENEMY_RARITY_MAX,
    upgradeChance = SETTINGS.ENEMY_RARITY_UPGRADE_CHANCE,
    random = Math.random
) {
    let rarity = 0;

    while (rarity < maxRarity && random() < upgradeChance) {
        rarity += 1;
    }

    return rarity;
}

export function getEnemyStats(rarity) {
    const r = Math.max(0, rarity | 0);

    return {
        health: Math.round(SETTINGS.ENEMY_BASE_HEALTH * SETTINGS.ENEMY_HEALTH_GROWTH ** r),
        damage: Math.round(SETTINGS.ENEMY_BASE_DAMAGE * SETTINGS.ENEMY_DAMAGE_GROWTH ** r),
        xp: Math.round(SETTINGS.ENEMY_BASE_XP * SETTINGS.ENEMY_XP_GROWTH ** r),
    };
}

export function getTotalXPForLevel(level) {
    const lvl = Math.max(1, level | 0);

    if (lvl <= 1) {
        return 0;
    }

    const base = SETTINGS.LEVEL_XP_BASE;
    const growth = SETTINGS.LEVEL_XP_GROWTH;

    return base * (growth ** (lvl - 1) - 1) / (growth - 1);
}

export function getLevelFromXP(xp) {
    const amount = Math.max(0, Number(xp) || 0);
    const base = SETTINGS.LEVEL_XP_BASE;
    const growth = SETTINGS.LEVEL_XP_GROWTH;

    if (amount < base) {
        return 1;
    }

    const level = Math.floor(
        1 + Math.log(amount * (growth - 1) / base + 1) / Math.log(growth)
    );

    return Math.max(1, level);
}

export function getXPToNextLevel(level, xp) {
    return Math.max(0, getTotalXPForLevel(level + 1) - Math.max(0, Number(xp) || 0));
}

export function getRunXPTotal(persistentXP, runXP) {
    return Math.max(0, Number(persistentXP) || 0) + Math.max(0, Number(runXP) || 0);
}

export function getPlayerStats(level) {
    const t = Math.max(0, (level | 0) - 1);

    return {
        maxHealth: Math.round(
            SETTINGS.PLAYER_BASE_MAX_HEALTH * SETTINGS.PLAYER_HEALTH_GROWTH ** t
        ),
        damage: Math.round(
            SETTINGS.PLAYER_BASE_DAMAGE * SETTINGS.PLAYER_DAMAGE_GROWTH ** t
        ),
        fastfallDamage: Math.round(
            SETTINGS.PLAYER_FASTFALL_DAMAGE * SETTINGS.PLAYER_FASTFALL_DAMAGE_GROWTH ** t
        ),
        fastfallRadius: SETTINGS.PLAYER_FASTFALL_RADIUS,
        fastfallKnockback:
            SETTINGS.PLAYER_FASTFALL_KNOCKBACK * SETTINGS.PLAYER_FASTFALL_KNOCKBACK_GROWTH ** t,
        fastfallStunDuration: SETTINGS.PLAYER_FASTFALL_STUN,
    };
}

export function getPlayerStatsFromXP(xp) {
    return getPlayerStats(getLevelFromXP(xp));
}
