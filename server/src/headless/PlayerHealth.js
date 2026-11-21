import { SETTINGS } from "../../../shared-data/Constants.js";

// Server-authoritative player health: the only place player health goes down
// from damage, and the only place it regenerates. Clients just render the
// synced value.
//
// Health stays a whole number (damage and maxHealth are integers), so regen
// banks fractional HP in player.regenCarry and only applies whole points.
// That keeps healing exactly time-based (~4 HP over a second no matter how
// many ticks it is split across) while the synced health changes only when a
// whole point is gained, instead of sending a float every tick.

export function resetPlayerHealthTimers(player) {
    player.msSinceDamage = 0;
    player.regenCarry = 0;
}

// Every source of damage goes through here; it is what restarts the regen
// delay. A hit that deals no damage does not count as taking damage.
export function applyPlayerDamage(player, amount) {
    if (!(amount > 0)) {
        return;
    }

    player.health = Math.max(0, player.health - amount);
    resetPlayerHealthTimers(player);
}

// Base rate plus a bonus hook for future stat modifiers (e.g. corner relics):
// set player.healRateBonus and it is picked up here. Level does not affect it.
export function getPlayerHealRate(player) {
    return SETTINGS.PLAYER_REGEN_RATE + (player.healRateBonus || 0);
}

export function tickPlayerRegen(player, deltaMs) {
    if (player.health <= 0 || player.runEnded) {
        player.regenCarry = 0;
        return;
    }

    const prevIdleMs = player.msSinceDamage || 0;
    player.msSinceDamage = prevIdleMs + deltaMs;

    if (player.health >= player.maxHealth) {
        // At full health: nothing to heal, and no banked backlog.
        player.regenCarry = 0;
        return;
    }

    // Only the part of this tick that falls after the delay heals, so healing
    // starts at exactly PLAYER_REGEN_DELAY even across a long tick.
    const healMs = Math.min(deltaMs, player.msSinceDamage - SETTINGS.PLAYER_REGEN_DELAY);
    if (healMs <= 0) {
        return;
    }

    player.regenCarry = (player.regenCarry || 0) + getPlayerHealRate(player) * healMs / 1000;

    const whole = Math.floor(player.regenCarry);
    if (whole <= 0) {
        return;
    }

    player.regenCarry -= whole;
    player.health = Math.min(player.maxHealth, player.health + whole);

    if (player.health >= player.maxHealth) {
        player.regenCarry = 0;
    }
}
