import { SETTINGS } from "./Constants.js";
import { toXP, xpRatio, XP_DEV_CAP } from "./XPMath.js";

// =====================================================
// ENEMY RARITY
// =====================================================
//
// Ordinary rarities run 0..ENEMY_RARITY_MAX (12); zones spawn only inside
// their own [minRarity, maxRarity] range. ENEMY_BOSS_RARITY (13) is special:
// it is reached only when an enemy that rolled rarity 12 upgrades with
// ENEMY_BOSS_CHANCE, and only while no other boss is alive (the server
// enforces that), never by an ordinary rarity roll.

export function rollEnemyRarity(
    maxRarity = SETTINGS.ENEMY_RARITY_MAX,
    upgradeChance = SETTINGS.ENEMY_RARITY_UPGRADE_CHANCE,
    random = Math.random,
    minRarity = 0
) {
    let rarity = minRarity;

    // Each step is one independent upgrade chance, bounded by maxRarity, so
    // upgrades can't compound past the zone's range.
    while (rarity < maxRarity && random() < upgradeChance) {
        rarity += 1;
    }

    return rarity;
}

// The rarity for an enemy spawned by `zone` ({ minRarity, maxRarity }).
// `bossAvailable` is false while a boss is already alive.
export function rollZoneRarity(zone, { random = Math.random, bossAvailable = true } = {}) {
    const minRarity = Math.max(0, Math.min(SETTINGS.ENEMY_RARITY_MAX, zone.minRarity | 0));
    const maxRarity = Math.max(minRarity, Math.min(SETTINGS.ENEMY_RARITY_MAX, zone.maxRarity | 0));
    let rarity = rollEnemyRarity(maxRarity, SETTINGS.ENEMY_RARITY_UPGRADE_CHANCE, random, minRarity);

    // Only an enemy that is already rarity 12 can become the boss.
    if (rarity === SETTINGS.ENEMY_RARITY_MAX && bossAvailable && random() < SETTINGS.ENEMY_BOSS_CHANCE) {
        rarity = SETTINGS.ENEMY_BOSS_RARITY;
    }

    return rarity;
}

export function isBossRarity(rarity) {
    return rarity === SETTINGS.ENEMY_BOSS_RARITY;
}

function clampRarity(rarity) {
    return Math.max(0, Math.min(SETTINGS.ENEMY_BOSS_RARITY, rarity | 0));
}

// How many times each "growth per rarity" constant is applied. Ordinary
// rarity r: r + 1 times (unchanged). The boss applies the stat growth 5 more
// times than rarity 12, and the XP growth only 2 more times.
export function getEnemyStatExponent(rarity) {
    const r = clampRarity(rarity);
    return isBossRarity(r)
        ? (SETTINGS.ENEMY_RARITY_MAX + 1) + SETTINGS.ENEMY_BOSS_STAT_STEPS
        : r + 1;
}

export function getEnemyXPExponent(rarity) {
    const r = clampRarity(rarity);
    return isBossRarity(r)
        ? (SETTINGS.ENEMY_RARITY_MAX + 1) + SETTINGS.ENEMY_BOSS_XP_STEPS
        : r + 1;
}

export function getEnemyStats(rarity) {
    const statExp = getEnemyStatExponent(rarity);
    const xpExp = getEnemyXPExponent(rarity);

    return {
        health: Math.round(SETTINGS.ENEMY_BASE_HEALTH * SETTINGS.ENEMY_HEALTH_GROWTH ** statExp),
        damage: Math.round(SETTINGS.ENEMY_BASE_DAMAGE * SETTINGS.ENEMY_DAMAGE_GROWTH ** statExp),
        xp: Math.round(SETTINGS.ENEMY_BASE_XP * SETTINGS.ENEMY_XP_GROWTH ** xpExp),
        mass: SETTINGS.ENEMY_BASE_MASS * SETTINGS.ENEMY_MASS_GROWTH ** statExp,
    };
}

// Shared boss credit. `damageBy` maps player id -> total damage that player
// actually dealt to the boss. Everyone at or above BOSS_REWARD_MIN_SHARE of
// the boss's max health gets the full boss XP (not split); anyone strictly
// above BOSS_REWARD_BONUS_SHARE gets it multiplied by ENEMY_XP_GROWTH ^
// BOSS_REWARD_BONUS_XP_STEPS. Returns Map(playerId -> reward Number).
export function computeBossRewards(maxHealth, damageBy, bossXP) {
    const rewards = new Map();
    if (!(maxHealth > 0) || !damageBy) {
        return rewards;
    }

    const bonus = SETTINGS.ENEMY_XP_GROWTH ** SETTINGS.BOSS_REWARD_BONUS_XP_STEPS;
    for (const [playerId, dealt] of damageBy) {
        if (!(dealt >= maxHealth * SETTINGS.BOSS_REWARD_MIN_SHARE)) {
            continue;
        }
        const exceptional = dealt > maxHealth * SETTINGS.BOSS_REWARD_BONUS_SHARE;
        rewards.set(playerId, Math.round(exceptional ? bossXP * bonus : bossXP));
    }
    return rewards;
}

// =====================================================
// LEVELS (exact for any XP up to XP_DEV_CAP)
// =====================================================
//
// Total XP to reach level L is base * (growth^(L-1) - 1) / (growth - 1).
// With the configured base and growth written as exact fractions, each
// threshold is an exact rational number; the XP needed is its ceiling. These
// are computed with BigInt and cached, so a level is exactly "the highest
// level whose threshold this XP has reached" at any size (10^250 is about
// level 2,580), with no floating-point error at any boundary.

function gcd(a, b) {
    while (b) {
        [a, b] = [b, a % b];
    }
    return a < 0n ? -a : a;
}

function toFraction(value) {
    const text = String(value);
    if (!/^\d+(\.\d+)?$/.test(text)) {
        throw new Error(`Level setting must be a plain decimal number, got ${text}`);
    }
    const [whole, decimals = ""] = text.split(".");
    let num = BigInt(whole + decimals);
    let den = 10n ** BigInt(decimals.length);
    const g = gcd(num, den);
    return [num / g, den / g];
}

const [BASE_NUM, BASE_DEN] = toFraction(SETTINGS.LEVEL_XP_BASE);
const [GROWTH_NUM, GROWTH_DEN] = toFraction(SETTINGS.LEVEL_XP_GROWTH);

// thresholds[L] = XP needed for level L (thresholds[1] = 0).
const thresholds = [0n, 0n];
let numPow = GROWTH_NUM; // GROWTH_NUM ^ (L - 1) for the next L to compute
let denPow = GROWTH_DEN;

function extendThresholds() {
    // T = base * (gn^n - gd^n) * gd / (gd^n * (gn - gd)), with n = L - 1
    const numerator = BASE_NUM * (numPow - denPow) * GROWTH_DEN;
    const denominator = BASE_DEN * denPow * (GROWTH_NUM - GROWTH_DEN);
    thresholds.push((numerator + denominator - 1n) / denominator);
    numPow *= GROWTH_NUM;
    denPow *= GROWTH_DEN;
}

// XP needed to reach `level` (BigInt).
export function getMinXPForLevel(level) {
    const lvl = Math.max(1, Math.floor(Number(level)) || 1);
    while (thresholds.length <= lvl) {
        extendThresholds();
    }
    return thresholds[lvl];
}

// Approximate Number form, for code that only needs a rough figure.
export function getTotalXPForLevel(level) {
    return Number(getMinXPForLevel(level));
}

export function getLevelFromXP(xp) {
    const amount = toXP(xp);

    // Make sure the cache reaches past this XP.
    while (thresholds[thresholds.length - 1] <= amount && thresholds[thresholds.length - 1] <= XP_DEV_CAP) {
        extendThresholds();
    }

    // Highest L with thresholds[L] <= amount.
    let lo = 1;
    let hi = thresholds.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (thresholds[mid] <= amount) {
            lo = mid;
        } else {
            hi = mid - 1;
        }
    }
    return lo;
}

export function getXPToNextLevel(level, xp) {
    const remaining = getMinXPForLevel(level + 1) - toXP(xp);
    return remaining > 0n ? remaining : 0n;
}

// Persistent XP plus unbanked run XP, as an exact BigInt.
export function getRunXPTotal(persistentXP, runXP) {
    return toXP(persistentXP) + toXP(runXP);
}

// Single source of truth for "level + progress bar" math, used by the in-game
// HUD and the Home screen alike, so they can never disagree. intoLevel/span
// are BigInt (format them with formatXP); progress is a Number in [0, 1].
export function getLevelProgress(xp) {
    const amount = toXP(xp);
    const level = getLevelFromXP(amount);
    const levelStartXP = getMinXPForLevel(level);
    const levelEndXP = getMinXPForLevel(level + 1);
    const intoLevel = amount - levelStartXP;
    const span = levelEndXP - levelStartXP;
    const progress = xpRatio(intoLevel, span);

    return { level, xp: amount, intoLevel, span, progress };
}

// The one place that turns a player's authoritative state (persistent xp
// plus any unbanked main-mode run XP) into their current level, so the HUD,
// polygon shape, etc. never compute it differently. The same in every mode.
export function getPlayerLevelFromState(state) {
    return getLevelFromXP(getRunXPTotal(state?.xp, state?.runXP));
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
