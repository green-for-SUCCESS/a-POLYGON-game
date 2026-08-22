// =====================================================
// FIREBASE
// =====================================================

import { initializeApp } from "firebase/app";
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

// Paste Project settings → Your apps → SDK setup and configuration here.
// Firebase web keys are public; protect the project with Auth domains + Firestore rules.
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || ""
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
        return { user: null, username: null };
    }

    const profile = await getUserProfile(user.uid);

    return {
        user,
        username: profile?.username ?? null
    };
}

export async function signInWithGoogle() {
    const { auth: firebaseAuth } = getFirebase();
    const result = await signInWithPopup(firebaseAuth, new GoogleAuthProvider());
    const profile = await getUserProfile(result.user.uid);

    return {
        user: result.user,
        username: profile?.username ?? null
    };
}

export async function signOut() {
    if (!isConfigured()) {
        return;
    }

    const { auth: firebaseAuth } = getFirebase();
    await firebaseSignOut(firebaseAuth);
}

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,16}$/;

export function validateUsername(username) {
    if (!USERNAME_PATTERN.test(username)) {
        return "Username must be 3-16 letters, numbers, or underscores.";
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
            createdAt: serverTimestamp()
        });
    });

    return username;
}
