// Persistent-XP change events.
//
// The server never asks a save provider to overwrite XP with an absolute
// total any more. Every change (main-mode XP banked at death, an FFA kill
// reward, a developer /givexp or /setxp) is sent as an event with a unique,
// server-generated id:
//
//   { eventId: "<roomId>:<sessionId>:<seq>", kind: "add" | "set", amount }
//
// A provider (Firestore for accounts, localStorage for guests, or the
// server's own Firebase Admin fallback) applies it with applyXPEvent inside
// one atomic read-modify-write, and records the id. That makes saving:
//   - idempotent: a retried, resent or duplicated event is applied once;
//   - stale-write safe: "add" increments whatever is stored now, so a slow
//     or late save can never put an older total back over a newer one;
//   - correct across sessions: two rooms adding XP for the same player both
//     count, instead of the last writer winning.
//
// "set" exists only for /setxp. "max" exists only to migrate one legacy
// pending value saved by older clients (an absolute total of unknown age),
// which must never lower the stored XP.

import { sanitizeXP } from "./Progression.js";

// How many applied ids a record remembers. Must stay well above the most
// events a client can still have queued (client XPSync MAX_PENDING) plus
// what other sessions apply meanwhile, so a queued event's id can never
// have aged out of the record by the time it is retried.
export const XP_EVENT_HISTORY = 1000;

const KINDS = new Set(["add", "set", "max"]);
const EVENT_ID_PATTERN = /^[A-Za-z0-9:._-]{1,128}$/;

export function isValidXPEvent(event) {
    return Boolean(event)
        && typeof event.eventId === "string"
        && EVENT_ID_PATTERN.test(event.eventId)
        && KINDS.has(event.kind)
        && Number.isFinite(Number(event.amount))
        && Number(event.amount) >= 0;
}

export function normalizeXPEvent(event) {
    if (!isValidXPEvent(event)) {
        return null;
    }
    return { eventId: event.eventId, kind: event.kind, amount: sanitizeXP(event.amount) };
}

function readEventIds(record) {
    const ids = record?.xpEventIds;
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
}

// Pure: returns the new { xp, xpEventIds } and whether the event changed
// anything. Never mutates `record`.
export function applyXPEvent(record, event) {
    const current = sanitizeXP(record?.xp);
    const ids = readEventIds(record);
    const normalized = normalizeXPEvent(event);

    if (!normalized || ids.includes(normalized.eventId)) {
        return { xp: current, xpEventIds: ids, applied: false };
    }

    let xp;
    if (normalized.kind === "set") {
        xp = normalized.amount;
    } else if (normalized.kind === "max") {
        xp = Math.max(current, normalized.amount);
    } else {
        xp = sanitizeXP(current + normalized.amount);
    }

    return {
        xp,
        xpEventIds: [...ids, normalized.eventId].slice(-XP_EVENT_HISTORY),
        applied: true,
    };
}
