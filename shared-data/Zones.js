import { SETTINGS } from "./Constants.js";

const COMBAT_ZONE_COUNT = 4;

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
        {
            id: "peaceful",
            name: "Peaceful",
            cap: SETTINGS.ZONE_PEACEFUL_CAP,
            spawnChancePerSecond: SETTINGS.ZONE_PEACEFUL_SPAWN_CHANCE,
            color: 0x3d9a5a,
            protected: false,
        },
        {
            id: "restless",
            name: "Restless",
            cap: SETTINGS.ZONE_RESTLESS_CAP,
            spawnChancePerSecond: SETTINGS.ZONE_RESTLESS_SPAWN_CHANCE,
            color: 0xd6b43a,
            protected: false,
        },
        {
            id: "chaotic",
            name: "Chaotic",
            cap: SETTINGS.ZONE_CHAOTIC_CAP,
            spawnChancePerSecond: SETTINGS.ZONE_CHAOTIC_SPAWN_CHANCE,
            color: 0xe07a2f,
            protected: false,
        },
        {
            id: "anarchic",
            name: "Anarchic",
            cap: SETTINGS.ZONE_ANARCHIC_CAP,
            spawnChancePerSecond: SETTINGS.ZONE_ANARCHIC_SPAWN_CHANCE,
            color: 0xc62828,
            protected: false,
        },
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
