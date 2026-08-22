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

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();

export function waitForAuth() {
    return new Promise((resolve) => {
        const unsub = onAuthStateChanged(auth, (user) => {
            unsub();
            resolve(user);
        });
    });
}

export async function getUserProfile(uid) {
    const snap = await getDoc(doc(db, "users", uid));
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
    const result = await signInWithPopup(auth, googleProvider);
    const profile = await getUserProfile(result.user.uid);

    return {
        user: result.user,
        username: profile?.username ?? null
    };
}

export async function signOut() {
    await firebaseSignOut(auth);
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

    const key = username.toLowerCase();

    await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", uid);
        const nameRef = doc(db, "usernames", key);

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
