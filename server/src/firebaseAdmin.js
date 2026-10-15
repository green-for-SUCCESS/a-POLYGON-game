// Optional Firebase Admin integration, used only for two things:
//   1. verifying a client's Firebase ID token (so we know their real uid,
//      not just a free-text username they typed in)
//   2. checking/writing a `bans/{uid}` Firestore doc for the developer
//      /ban command
//
// IMPORTANT: a username alone is NOT a secure identity in this project —
// `options.username` sent on join is arbitrary, unverified client input.
// A ban keyed by username would do nothing but rename-dodge. The only
// identity worth banning is the Firebase uid, which requires the client to
// actually present a verified ID token. Until FIREBASE_SERVICE_ACCOUNT_JSON
// is configured (and a client sends an idToken), this module safely no-ops:
// existing anonymous/unauthenticated play keeps working, but there is no
// real ban enforcement — that's a deliberate, logged limitation, not a bug.
let admin = null;
let initPromise = null;

function ensureInit() {
    if (!initPromise) {
        initPromise = (async () => {
            const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
            if (!raw) {
                console.warn(
                    "[firebaseAdmin] FIREBASE_SERVICE_ACCOUNT_JSON is not set — " +
                    "ID token verification and developer bans are disabled until it is configured."
                );
                return false;
            }

            try {
                const mod = await import("firebase-admin");
                admin = mod.default ?? mod;
                const serviceAccount = JSON.parse(raw);

                if (!admin.apps?.length) {
                    admin.initializeApp({
                        credential: admin.credential.cert(serviceAccount),
                    });
                }

                return true;
            } catch (err) {
                console.error("[firebaseAdmin] Failed to initialize:", err?.message || err);
                admin = null;
                return false;
            }
        })();
    }

    return initPromise;
}

export function isFirebaseAdminConfigured() {
    return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
}

// Returns the decoded token (with `.uid`) if valid, otherwise null.
export async function verifyIdToken(idToken) {
    if (!idToken) {
        return null;
    }

    const ready = await ensureInit();
    if (!ready) {
        return null;
    }

    try {
        return await admin.auth().verifyIdToken(idToken);
    } catch {
        return null;
    }
}

export async function isUidBanned(uid) {
    if (!uid) {
        return false;
    }

    const ready = await ensureInit();
    if (!ready) {
        return false;
    }

    try {
        const ref = admin.firestore().collection("bans").doc(uid);
        const snap = await ref.get();
        if (!snap.exists) {
            return false;
        }

        const { expiresAt } = snap.data() || {};
        if (expiresAt && expiresAt <= Date.now()) {
            // Expired temporary ban — clean it up lazily so it stops
            // blocking access and doesn't linger in Firestore forever.
            ref.delete().catch(() => {});
            return false;
        }

        return true;
    } catch (err) {
        console.error("[firebaseAdmin] isUidBanned failed:", err?.message || err);
        return false;
    }
}

// Reuses the existing usernames/{lowercasedName} -> {uid} mapping that
// claimUsername() already writes client-side (see FirebaseConfig.js).
export async function getUidForUsername(username) {
    if (!username) {
        return null;
    }

    const ready = await ensureInit();
    if (!ready) {
        return null;
    }

    try {
        const snap = await admin.firestore().collection("usernames").doc(username.toLowerCase()).get();
        return snap.exists ? (snap.data()?.uid ?? null) : null;
    } catch (err) {
        console.error("[firebaseAdmin] getUidForUsername failed:", err?.message || err);
        return null;
    }
}

// `hours`: positive finite number for a temporary ban, or null/undefined for
// a permanent ban that stays until an explicit /unban.
export async function banUsername(username, hours) {
    const ready = await ensureInit();
    if (!ready) {
        return { ok: false, error: "Firebase Admin is not configured on the server (FIREBASE_SERVICE_ACCOUNT_JSON)." };
    }

    const uid = await getUidForUsername(username);
    if (!uid) {
        return { ok: false, error: `No account found for username "${username}".` };
    }

    const expiresAt = (hours != null) ? Date.now() + hours * 60 * 60 * 1000 : null;

    try {
        await admin.firestore().collection("bans").doc(uid).set({
            uid,
            username,
            bannedAt: Date.now(),
            expiresAt,
        });

        return { ok: true, uid, expiresAt };
    } catch (err) {
        return { ok: false, error: err?.message || "Failed to write ban record." };
    }
}

export async function unbanUsername(username) {
    const ready = await ensureInit();
    if (!ready) {
        return { ok: false, error: "Firebase Admin is not configured on the server (FIREBASE_SERVICE_ACCOUNT_JSON)." };
    }

    const uid = await getUidForUsername(username);
    if (!uid) {
        return { ok: false, error: `No account found for username "${username}".` };
    }

    try {
        const ref = admin.firestore().collection("bans").doc(uid);
        const snap = await ref.get();
        if (!snap.exists) {
            return { ok: true, uid, wasAlreadyUnbanned: true };
        }

        await ref.delete();
        return { ok: true, uid, wasAlreadyUnbanned: false };
    } catch (err) {
        return { ok: false, error: err?.message || "Failed to remove ban record." };
    }
}

// XP-freeze is stored per-uid so it survives a reconnect or server restart,
// the same way bans do — reuses the exact same Admin/Firestore plumbing
// rather than inventing a second persistence path.
export async function getXPFreeze(uid) {
    if (!uid) {
        return false;
    }

    const ready = await ensureInit();
    if (!ready) {
        return false;
    }

    try {
        const snap = await admin.firestore().collection("devFlags").doc(uid).get();
        return Boolean(snap.exists && snap.data()?.xpFrozen);
    } catch (err) {
        console.error("[firebaseAdmin] getXPFreeze failed:", err?.message || err);
        return false;
    }
}

export async function setXPFreeze(uid, frozen) {
    if (!uid) {
        return;
    }

    const ready = await ensureInit();
    if (!ready) {
        return;
    }

    try {
        await admin.firestore().collection("devFlags").doc(uid).set({ xpFrozen: Boolean(frozen) }, { merge: true });
    } catch (err) {
        console.error("[firebaseAdmin] setXPFreeze failed:", err?.message || err);
    }
}
