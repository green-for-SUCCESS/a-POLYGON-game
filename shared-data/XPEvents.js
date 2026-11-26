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

import { toXP, xpToStorage, xpToString, XP_DEV_CAP, XP_REGULAR_CAP } from "./XPMath.js";

// How many applied ids a record remembers. Must stay well above the most
// events a client can still have queued (client XPSync MAX_PENDING) plus
// what other sessions apply meanwhile, so a queued event's id can never
// have aged out of the record by the time it is retried.
export const XP_EVENT_HISTORY = 1000;

// "addRegular": ordinary gameplay XP (death banking, FFA kills, boss
// rewards). The store applies the 10^15 regular cap itself, so two sessions
// of the same player adding at once can't push the saved total past it.
// "add": developer /givexp, bounded only by XP_DEV_CAP.
const KINDS = new Set(["add", "addRegular", "set", "max"]);
const EVENT_ID_PATTERN = /^[A-Za-z0-9:._-]{1,128}$/;

// Amounts travel as decimal strings (exact at any size); plain numbers are
// still accepted from older queued events.
const AMOUNT_PATTERN = /^\d{1,260}$/;

function isValidAmount(amount) {
    if (typeof amount === "number") {
        return Number.isFinite(amount) && amount >= 0;
    }
    return typeof amount === "string" && AMOUNT_PATTERN.test(amount);
}

export function isValidXPEvent(event) {
    return Boolean(event)
        && typeof event.eventId === "string"
        && EVENT_ID_PATTERN.test(event.eventId)
        && KINDS.has(event.kind)
        && isValidAmount(event.amount);
}

// Normalized form: amount as a decimal string, at most XP_DEV_CAP.
export function normalizeXPEvent(event) {
    if (!isValidXPEvent(event)) {
        return null;
    }
    return { eventId: event.eventId, kind: event.kind, amount: xpToString(toXP(event.amount)) };
}

function readEventIds(record) {
    const ids = record?.xpEventIds;
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
}

// Pure: returns the new { xp, xpEventIds } and whether the event changed
// anything. Never mutates `record`. Arithmetic is exact (BigInt); the
// returned xp is in save form (a Number while exact, else a decimal string).
export function applyXPEvent(record, event) {
    const current = toXP(record?.xp);
    const ids = readEventIds(record);
    const normalized = normalizeXPEvent(event);

    if (!normalized || ids.includes(normalized.eventId)) {
        return { xp: xpToStorage(current), xpEventIds: ids, applied: false };
    }

    const amount = toXP(normalized.amount);
    let xp;
    if (normalized.kind === "set") {
        xp = amount;
    } else if (normalized.kind === "max") {
        xp = current > amount ? current : amount;
    } else if (normalized.kind === "addRegular") {
        // Never raises XP that is already at/above the regular cap (e.g. set
        // there by a developer), and never past it otherwise.
        xp = current >= XP_REGULAR_CAP
            ? current
            : (current + amount > XP_REGULAR_CAP ? XP_REGULAR_CAP : current + amount);
    } else {
        // The server already capped gameplay rewards; this only guards the
        // absolute ceiling.
        xp = current + amount > XP_DEV_CAP ? XP_DEV_CAP : current + amount;
    }

    return {
        xp: xpToStorage(xp),
        xpEventIds: [...ids, normalized.eventId].slice(-XP_EVENT_HISTORY),
        applied: true,
    };
}
