import { SETTINGS } from "./Constants.js";

// Display only; every gameplay number comes from SETTINGS (Constants.js).
const COMBAT_ZONE_STYLES = [
    { id: "peaceful", name: "Peaceful", color: 0x3d9a5a },
    { id: "restless", name: "Restless", color: 0xd6b43a },
    { id: "chaotic", name: "Chaotic", color: 0xe07a2f },
    { id: "anarchic", name: "Anarchic", color: 0xc62828 },
];
const COMBAT_ZONE_COUNT = COMBAT_ZONE_STYLES.length;

export function getSpawnZoneEnd() {
    return SETTINGS.SPAWN_ZONE_WIDTH;
}

export function getZones() {
    const spawnEnd = getSpawnZoneEnd();
    const remaining = Math.max(0, SETTINGS.WORLD_WIDTH - spawnEnd);
    const combatWidth = remaining / COMBAT_ZONE_COUNT;

    const defs = [
        {
            id: "spawn",
            name: "Spawn",
            cap: 0,
            spawnChancePerSecond: 0,
            color: 0x4a5560,
            protected: true,
        },
        ...COMBAT_ZONE_STYLES.map((style, i) => {
            const [minRarity, maxRarity] = SETTINGS.ZONE_RARITY_RANGES[i];
            return {
                ...style,
                // Living enemies that originated here (see HeadlessGame).
                cap: SETTINGS.ZONE_ENEMY_CAP,
                // Grows only slightly per zone (linear).
                spawnChancePerSecond: SETTINGS.ZONE_SPAWN_CHANCE_BASE + SETTINGS.ZONE_SPAWN_CHANCE_PER_ZONE * i,
                minRarity,
                maxRarity,
                protected: false,
            };
        }),
    ];

    return defs.map((zone, index) => {
        const start = index === 0 ? 0 : spawnEnd + (index - 1) * combatWidth;
        const end = index === 0 ? spawnEnd : spawnEnd + index * combatWidth;

        return {
            ...zone,
            start,
            end,
            width: end - start,
        };
    });
}

export function getCombatZones() {
    return getZones().filter((zone) => !zone.protected);
}

export function getZoneAtX(x) {
    const zones = getZones();

    for (let i = 0; i < zones.length; i++) {
        if (x < zones[i].end || i === zones.length - 1) {
            return zones[i];
        }
    }

    return zones[zones.length - 1];
}

export function clampPlayerOutOfSpawn(x, spawnExited) {
    if (!spawnExited) {
        return x;
    }

    return Math.max(x, getSpawnZoneEnd());
}
