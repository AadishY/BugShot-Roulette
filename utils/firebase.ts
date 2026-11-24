import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, Auth } from 'firebase/auth';
import {
    getFirestore,
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    Firestore
} from 'firebase/firestore';
import { getAnalytics, isSupported, Analytics } from 'firebase/analytics';

// Firebase configuration from environment variables
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || ""
};

export const isFirebaseConfigured = (): boolean => {
    return Boolean(
        firebaseConfig.apiKey &&
        firebaseConfig.projectId &&
        firebaseConfig.apiKey !== "your_firebase_api_key" &&
        firebaseConfig.projectId !== "your_firebase_project_id"
    );
};

// Initialize Firebase safely
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let analytics: Analytics | null = null;

try {
    if (!getApps().length) {
        // If config is not yet supplied in .env, initialize with fallback placeholder so app builds cleanly
        app = initializeApp(
            isFirebaseConfigured()
                ? firebaseConfig
                : {
                    apiKey: "AIzaSyDemoPlaceholderKeyForBuildSafety000",
                    authDomain: "bugshot-roulette.firebaseapp.com",
                    projectId: "bugshot-roulette",
                    storageBucket: "bugshot-roulette.appspot.com",
                    messagingSenderId: "1234567890",
                    appId: "1:1234567890:web:abcdef123456"
                }
        );
    } else {
        app = getApp();
    }

    auth = getAuth(app);

    // Initialize Firestore with robust persistent offline cache and multi-tab synchronization
    try {
        db = initializeFirestore(app, {
            localCache: persistentLocalCache({
                tabManager: persistentMultipleTabManager()
            })
        });
    } catch {
        db = getFirestore(app);
    }

    if (typeof window !== 'undefined' && isFirebaseConfigured()) {
        isSupported().then(supported => {
            if (supported) {
                analytics = getAnalytics(app);
            }
        }).catch(() => {});
    }
} catch (error) {
    console.warn("[Firebase] Initialization warning:", error);
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
    prompt: 'select_account'
});

export { app, auth, db, analytics };

