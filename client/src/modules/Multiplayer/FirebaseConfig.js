// =====================================================
// FIREBASE
// =====================================================

import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut as firebaseSignOut,
    onAuthStateChanged
} from "firebase/auth";
import {
    getFirestore,
    doc,
    getDoc,
    runTransaction,
    serverTimestamp
} from "firebase/firestore";
import { sanitizeXP } from "../../../../shared-data/Progression.js";
import { applyXPEvent } from "../../../../shared-data/XPEvents.js";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCvzct-ZRgpPee92JSq8EXjOVRrMLN0zCs",
  authDomain: "a-polygon-game.firebaseapp.com",
  projectId: "a-polygon-game",
  storageBucket: "a-polygon-game.firebasestorage.app",
  messagingSenderId: "1048084235974",
  appId: "1:1048084235974:web:380d9434a7c189610df9c7",
  measurementId: "G-YPVHREB7BG"
};

let app = null;
let auth = null;
let db = null;

function isConfigured() {
    return typeof firebaseConfig.apiKey === "string"
        && firebaseConfig.apiKey.startsWith("AIza")
        && Boolean(firebaseConfig.projectId);
}

function getFirebase() {
    if (!isConfigured()) {
        throw new Error(
            "Firebase is not configured. Paste your web app config into FirebaseInit.js (or set VITE_FIREBASE_* and rebuild)."
        );
    }

    if (!app) {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
    }

    return { app, auth, db };
}

export function waitForAuth() {
    if (!isConfigured()) {
        return Promise.resolve(null);
    }

    const { auth: firebaseAuth } = getFirebase();

    return new Promise((resolve) => {
        const unsub = onAuthStateChanged(firebaseAuth, (user) => {
            unsub();
            resolve(user);
        });
    });
}

export async function getUserProfile(uid) {
    const { db: firestore } = getFirebase();
    const snap = await getDoc(doc(firestore, "users", uid));
    return snap.exists() ? snap.data() : null;
}


export async function getSession() {
    const user = await waitForAuth();

    if (!user) {
        return { user: null, username: null, xp: 0 };
    }

    const profile = await getUserProfile(user.uid);

    return {
        user,
        username: profile?.username ?? null,
        xp: sanitizeXP(profile?.xp)
    };
}

export async function signInWithGoogle() {
    const { auth: firebaseAuth } = getFirebase();
    const result = await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
    const profile = await getUserProfile(result.user.uid);

    return {
        user: result.user,
        username: profile?.username ?? null,
        xp: sanitizeXP(profile?.xp)
    };
}

export async function signOut() {
    if (!isConfigured()) {
        return;
    }

    const { auth: firebaseAuth } = getFirebase();
    await firebaseSignOut(firebaseAuth);
}

export function validateUsername(username) {
    if (!username) {
        return "Please enter a username.";
    }

    if (/\s/.test(username) || !/^[a-zA-Z0-9._-]+$/.test(username)) {
        return "Username can only use letters, numbers, periods, hyphens, and underscores.";
    }

    if (username.length < 3 || username.length > 16) {
        return "Username must be 3-16 characters.";
    }

    // Reserved for Guest Mode display names (Guest-xxxxxx), so an account
    // can't be mistaken for a guest or the other way round.
    if (/^guest[-_.]/i.test(username)) {
        return "Usernames starting with \"Guest-\" are reserved for guests.";
    }

    return null;
}

export async function claimUsername(uid, username) {
    const error = validateUsername(username);

    if (error) {
        throw new Error(error);
    }

    const { db: firestore } = getFirebase();
    const key = username.toLowerCase();

    await runTransaction(firestore, async (transaction) => {
        const userRef = doc(firestore, "users", uid);
        const nameRef = doc(firestore, "usernames", key);

        const userSnap = await transaction.get(userRef);

        if (userSnap.exists() && userSnap.data().username) {
            throw new Error("You already have a username.");
        }

        const nameSnap = await transaction.get(nameRef);

        if (nameSnap.exists()) {
            throw new Error("That username is already taken.");
        }

        transaction.set(nameRef, { uid });
        transaction.set(userRef, {
            username,
            xp: 0,
            createdAt: serverTimestamp()
        });
    });

    return username;
}

// Applies one persistent-XP event (shared-data/XPEvents.js) to the signed-in
// user's doc inside a Firestore transaction: read the stored xp and the ids
// of recently applied events, apply, write both back. "add" therefore acts
// as an atomic increment (a delayed or retried save can never overwrite a
// newer total), and an event id that is already recorded is skipped, so a
// retry or a resend never counts twice.
export async function applyXPEventToAccount(uid, event) {
    const user = await waitForAuth();
    if (!user || user.uid !== uid) {
        // Never write one account's XP into whoever happens to be signed in.
        const error = new Error("The signed-in account changed.");
        error.code = "account-changed";
        throw error;
    }

    const { db: firestore } = getFirebase();
    const ref = doc(firestore, "users", uid);

    try {
        return await runTransaction(firestore, async (transaction) => {
            const snap = await transaction.get(ref);
            const result = applyXPEvent(snap.exists() ? snap.data() : {}, event);
            if (result.applied) {
                // xp and the applied-event ids are always written together:
                // saving xp without the id would let the same event be
                // applied again (by a retry, another tab, or the server).
                transaction.set(ref, { xp: result.xp, xpEventIds: result.xpEventIds }, { merge: true });
            }
            return result;
        });
    } catch (error) {
        if (error?.code === "permission-denied") {
            console.error(
                "❌ Firestore rules rejected the XP save. users/{uid} must allow the owner to write the " +
                "`xp` and `xpEventIds` fields. The XP stays queued and is retried."
            );
        }
        throw error;
    }
}
