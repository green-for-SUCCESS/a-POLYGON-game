// =====================================================
// GUEST PROFILE (local-only persistence)
// =====================================================
//
// Guest Mode keeps a player's persistent main-mode progression in this
// browser profile's localStorage instead of a Firebase account. It is only a
// local convenience identity: nothing here is sent to Firebase, the guest id
// is never sent to the server, and the server treats a guest like any other
// unauthenticated connection (the same validation and gameplay rules apply).
//
// Only data that should survive a reload is stored: the guest id, the
// display name, persistent XP (earned in main mode and FFA alike) and the
// ids of recently applied XP events (so a resent event never counts twice).
// Level and polygon shape are derived from XP. Runtime/combat state, room
// objects and developer tokens are never written here.

import { sanitizeXP } from "../../../../shared-data/Progression.js";
import { applyXPEvent } from "../../../../shared-data/XPEvents.js";

const STORAGE_KEY = "apg.guestProfile";
const CORRUPT_KEY_PREFIX = "apg.guestProfile.corrupt.";
export const GUEST_SAVE_VERSION = 1;

const GUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Used when localStorage is unavailable (private browsing, blocked storage):
// the guest can still play, but progress only lasts for this page session.
let memoryProfile = null;

function generateGuestId() {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi?.randomUUID) {
        return cryptoApi.randomUUID();
    }

    // RFC 4122 v4 layout from 16 random bytes.
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Fits the server's player-name rule (3-16 of [a-zA-Z0-9._-]).
function guestNameFor(guestId) {
    return `Guest-${guestId.replace(/-/g, "").slice(0, 6)}`;
}

function createProfile() {
    const guestId = generateGuestId();
    const now = Date.now();
    return {
        version: GUEST_SAVE_VERSION,
        guestId,
        name: guestNameFor(guestId),
        xp: 0,
        xpEventIds: [],
        createdAt: now,
        updatedAt: now,
    };
}

// Validates a parsed save and fills defaults for missing/invalid fields.
// Unknown fields are kept, so a save written by a newer build isn't
// stripped by this one. Returns null if nothing usable is left.
function normalizeProfile(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return null;
    }

    const guestId = typeof raw.guestId === "string" && GUEST_ID_PATTERN.test(raw.guestId)
        ? raw.guestId.toLowerCase()
        : generateGuestId();

    const now = Date.now();
    return {
        ...raw,
        version: Number.isInteger(raw.version) && raw.version > GUEST_SAVE_VERSION
            ? raw.version
            : GUEST_SAVE_VERSION,
        guestId,
        name: guestNameFor(guestId),
        xp: sanitizeXP(raw.xp),
        xpEventIds: Array.isArray(raw.xpEventIds)
            ? raw.xpEventIds.filter((id) => typeof id === "string").slice(-200)
            : [],
        createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : now,
        updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
    };
}

function getStorage() {
    try {
        const storage = globalThis.localStorage;
        if (!storage) {
            return null;
        }
        // Some browsers expose localStorage but throw on use.
        const probe = "__apg_probe__";
        storage.setItem(probe, "1");
        storage.removeItem(probe);
        return storage;
    } catch {
        return null;
    }
}

function writeProfile(storage, profile) {
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(profile));
        return true;
    } catch (e) {
        console.error("Could not save guest profile:", e);
        return false;
    }
}

// Returns { profile, status } where status is:
//   "loaded"      existing save restored
//   "created"     no save yet, a new guest profile was made
//   "recovered"   the save was unreadable; it was backed up under
//                 apg.guestProfile.corrupt.<time> and a fresh one started
//   "repaired"    the save parsed but some fields were invalid and were fixed
//   "unavailable" localStorage can't be used; progress lasts this session only
export function loadGuestProfile() {
    const storage = getStorage();
    if (!storage) {
        memoryProfile = memoryProfile || createProfile();
        return { profile: { ...memoryProfile }, status: "unavailable" };
    }

    let rawText = null;
    try {
        rawText = storage.getItem(STORAGE_KEY);
    } catch {
        rawText = null;
    }

    if (rawText == null) {
        const profile = createProfile();
        writeProfile(storage, profile);
        return { profile, status: "created" };
    }

    let parsed;
    try {
        parsed = JSON.parse(rawText);
    } catch {
        parsed = undefined;
    }

    const profile = normalizeProfile(parsed);
    if (!profile) {
        // Don't silently destroy what was there: keep a copy before starting
        // over, so it can still be recovered by hand.
        try {
            storage.setItem(CORRUPT_KEY_PREFIX + Date.now(), rawText);
        } catch {
        }
        const fresh = createProfile();
        writeProfile(storage, fresh);
        return { profile: fresh, status: "recovered" };
    }

    const repaired = parsed.guestId !== profile.guestId
        || parsed.xp !== profile.xp
        || (parsed.xpEventIds !== undefined && !Array.isArray(parsed.xpEventIds))
        || parsed.name !== profile.name
        || parsed.version !== profile.version;
    if (repaired) {
        writeProfile(storage, profile);
    }

    return { profile, status: repaired ? "repaired" : "loaded" };
}

// Applies one persistent-XP event from the server (main-mode XP banked at
// death, an FFA kill reward, a dev command) to the guest save. Same rules as
// the account path (shared-data/XPEvents.js): "add" increments what is
// stored now, and an event id already recorded is skipped, so a resent or
// duplicated event never counts twice. Returns true once the event is in the
// save (or already was). Never touches Firebase.
export function applyGuestXPEvent(event) {
    const storage = getStorage();

    if (!storage) {
        const base = memoryProfile || createProfile();
        const result = applyXPEvent(base, event);
        memoryProfile = { ...base, xp: result.xp, xpEventIds: result.xpEventIds, updatedAt: Date.now() };
        return true;
    }

    const { profile } = loadGuestProfile();
    const result = applyXPEvent(profile, event);
    if (!result.applied) {
        return true; // already applied earlier
    }
    return writeProfile(storage, {
        ...profile,
        xp: result.xp,
        xpEventIds: result.xpEventIds,
        updatedAt: Date.now(),
    });
}
