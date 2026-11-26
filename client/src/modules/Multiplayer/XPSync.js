// =====================================================
// XP SYNC: applying the server's persistent-XP events to the right store
// =====================================================
//
// The server sends every persistent-XP change as an event
// { eventId, kind: "add" | "set" | "max", amount } (see
// shared-data/XPEvents.js). This module applies each one to exactly one
// provider, chosen by the identity the connection was opened with:
//
//   guest   -> this browser's guest save (GuestStore.js), synchronously
//   account -> the signed-in user's Firestore doc, in a transaction
//
// and reports success so the client can acknowledge it to the server.
//
// Account events are written to a durable per-account queue in localStorage
// BEFORE the Firestore write, and only removed once Firestore has applied
// them. A failed or interrupted save is therefore retried (with backoff, and
// again on the next connection) instead of being lost, and because every
// event carries an id that the stored record remembers, a retry or resend
// is never counted twice.

import { applyXPEventToAccount } from "./FirebaseConfig.js";
import { applyGuestXPEvent } from "./GuestStore.js";
import { normalizeXPEvent } from "../../../../shared-data/XPEvents.js";
import { toXP } from "../../../../shared-data/XPMath.js";

const PENDING_PREFIX = "apg.pendingXPEvents.";
const LEGACY_PENDING_KEY = "pendingPersistXP"; // absolute total, older clients
// Kept far below XP_EVENT_HISTORY (see XPEvents.js), and events older than
// MAX_PENDING_AGE_MS are dropped, so a retried event's id is always still in
// the stored record's history and can't be applied twice.
const MAX_PENDING = 200;
const MAX_PENDING_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_DELAYS_MS = [1000, 3000, 10000, 30000];

// In-memory fallback when localStorage can't be used (or can be read but
// not written, e.g. quota full).
const memoryQueues = new Map();
let storageWritable = true;
// Events applied during this page session (a second guard against
// double-applying a resend if Firestore rules ever reject the id list).
const appliedThisSession = new Set();

let accountChain = Promise.resolve();
const retryTimers = new Map();

// The Firestore write. Swappable only so automated tests can exercise the
// queue/retry/dedupe logic without a live Firebase project.
let applyToAccount = applyXPEventToAccount;
export function setAccountXPApplierForTests(fn) {
    applyToAccount = fn || applyXPEventToAccount;
}

function pendingKey(uid) {
    return PENDING_PREFIX + uid;
}

function normalizeQueued(entry) {
    const event = normalizeXPEvent(entry);
    if (!event) {
        return null;
    }
    const queuedAt = Number.isFinite(entry.queuedAt) ? entry.queuedAt : Date.now();
    if (Date.now() - queuedAt > MAX_PENDING_AGE_MS) {
        console.warn(`Dropped XP event ${event.eventId}: it could not be saved for over a week.`);
        return null;
    }
    return { ...event, queuedAt };
}

function readQueue(uid) {
    if (!storageWritable) {
        return [...(memoryQueues.get(uid) || [])];
    }
    try {
        const raw = localStorage.getItem(pendingKey(uid));
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.map(normalizeQueued).filter(Boolean) : [];
    } catch {
        return [...(memoryQueues.get(uid) || [])];
    }
}

function writeQueue(uid, queue) {
    const trimmed = queue.slice(-MAX_PENDING);
    memoryQueues.set(uid, trimmed);
    try {
        if (trimmed.length) {
            localStorage.setItem(pendingKey(uid), JSON.stringify(trimmed));
        } else {
            localStorage.removeItem(pendingKey(uid));
        }
    } catch {
        // Can't persist it: keep using the in-memory copy for this page
        // session (the server also keeps re-sending until it's acknowledged).
        storageWritable = false;
    }
}

function enqueue(uid, event) {
    const queue = readQueue(uid);
    if (!queue.some((e) => e.eventId === event.eventId)) {
        queue.push({ ...event, queuedAt: Date.now() });
        writeQueue(uid, queue);
    }
}

function removeFromQueue(uid, eventId) {
    writeQueue(uid, readQueue(uid).filter((e) => e.eventId !== eventId));
}

function rememberApplied(eventId) {
    appliedThisSession.add(eventId);
    if (appliedThisSession.size > 1000) {
        appliedThisSession.delete(appliedThisSession.values().next().value);
    }
}

// Older clients stored a single absolute XP total under one shared key when
// a save failed. It can't be turned into a delta safely, so it is applied as
// "max" (never lowers the stored XP) to the account that is signed in now.
function migrateLegacyPending(uid) {
    try {
        const raw = localStorage.getItem(LEGACY_PENDING_KEY);
        if (raw == null) {
            return;
        }
        const value = toXP(raw);
        if (value > 0n) {
            enqueue(uid, { eventId: `legacy-${uid}-${value}`, kind: "max", amount: value.toString() });
        }
        localStorage.removeItem(LEGACY_PENDING_KEY);
    } catch {
    }
}

// Applies every queued event for this account, oldest first. Serialized so
// two flushes never interleave. Resolves with how many were saved.
function processAccountQueue(uid, onSaved) {
    accountChain = accountChain.then(async () => {
        let saved = 0;
        for (const event of readQueue(uid)) {
            try {
                if (!appliedThisSession.has(event.eventId)) {
                    await applyToAccount(uid, event);
                    rememberApplied(event.eventId);
                }
                removeFromQueue(uid, event.eventId);
                saved++;
                onSaved?.(event.eventId);
            } catch (e) {
                if (e?.code === "account-changed") {
                    // Another account is signed in now. Keep these queued for
                    // their owner; they are flushed when that uid connects.
                    console.warn("XP events are queued for an account that is no longer signed in; they'll be saved when it signs in again.");
                    return saved;
                }
                console.error("❌ Saving XP to your account failed; it will be retried:", e);
                scheduleRetry(uid, onSaved);
                return saved;
            }
        }
        retryTimers.delete(uid);
        return saved;
    });
    return accountChain;
}

function scheduleRetry(uid, onSaved) {
    const state = retryTimers.get(uid) || { attempt: 0, timer: null };
    if (state.timer) {
        return;
    }
    const delay = RETRY_DELAYS_MS[Math.min(state.attempt, RETRY_DELAYS_MS.length - 1)];
    state.attempt++;
    state.timer = setTimeout(() => {
        state.timer = null;
        processAccountQueue(uid, onSaved);
    }, delay);
    retryTimers.set(uid, state);
}

// Applies one server event to the provider for `identity`. `onSaved(eventId)`
// is called once the event is durably applied (or was already), which is
// when the caller acknowledges it to the server.
export function submitXPEvent({ identity, uid, event, onSaved }) {
    const normalized = normalizeXPEvent(event);
    if (!normalized) {
        console.warn("Ignored a malformed XP event from the server.");
        return;
    }

    if (identity === "guest") {
        // Never touches Firebase.
        if (applyGuestXPEvent(normalized)) {
            onSaved?.(normalized.eventId);
        }
        return;
    }

    if (!uid) {
        console.error("❌ Can't save XP: no signed-in account for this session.");
        return;
    }

    enqueue(uid, normalized);
    processAccountQueue(uid, onSaved);
}

// Called before joining a room as `uid`: finishes any saves still queued
// from earlier (including ones a previous page load couldn't complete), so
// the XP read for the join already includes them. Bounded by `timeoutMs`;
// anything not done by then keeps retrying in the background.
export async function flushAccountXP(uid, { timeoutMs = 5000, onSaved } = {}) {
    if (!uid) {
        return 0;
    }
    migrateLegacyPending(uid);
    if (readQueue(uid).length === 0) {
        await Promise.race([accountChain, new Promise((r) => setTimeout(r, timeoutMs))]);
        return 0;
    }
    return Promise.race([
        processAccountQueue(uid, onSaved),
        new Promise((r) => setTimeout(() => r(0), timeoutMs)),
    ]);
}
