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
        const snap = await admin.firestore().collection("bans").doc(uid).get();
        return snap.exists;
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

export async function banUsername(username, reason) {
    const ready = await ensureInit();
    if (!ready) {
        return { ok: false, error: "Firebase Admin is not configured on the server (FIREBASE_SERVICE_ACCOUNT_JSON)." };
    }

    const uid = await getUidForUsername(username);
    if (!uid) {
        return { ok: false, error: `No account found for username "${username}".` };
    }

    try {
        await admin.firestore().collection("bans").doc(uid).set({
            uid,
            username,
            reason: reason || null,
            bannedAt: Date.now(),
        });

        return { ok: true, uid };
    } catch (err) {
        return { ok: false, error: err?.message || "Failed to write ban record." };
    }
}
