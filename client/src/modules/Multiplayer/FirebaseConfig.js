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

let redirectResultChecked = false;

function usesRedirectSignIn() {
    const { hostname } = window.location;
    return hostname !== "localhost" && hostname !== "127.0.0.1";
}

export async function getSession() {
    if (!redirectResultChecked) {
        redirectResultChecked = true;

        try {
            const { auth: firebaseAuth } = getFirebase();
            await getRedirectResult(firebaseAuth);
        } catch {
        }
    }

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
    const provider = new GoogleAuthProvider();

    // GitHub Pages sends COOP: same-origin, which breaks popup polling.
    if (usesRedirectSignIn()) {
        await signInWithPopup(firebaseAuth, provider);
        return { user: null, username: null, redirecting: true };
    }

    const result = await signInWithPopup(firebaseAuth, provider);
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
