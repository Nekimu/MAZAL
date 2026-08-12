import { initializeApp } from "firebase/app";
import { initializeFirestore, doc, getDocFromServer } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged, User } from "firebase/auth";
import firebaseConfig from "../firebase-applet-config.json";

// Read from localStorage to check for client-side configuration overrides
let storedConfig: any = null;
try {
  const cached = localStorage.getItem("custom_firebase_config");
  if (cached) {
    storedConfig = JSON.parse(cached);
  }
} catch (e) {
  console.error("Error reading custom_firebase_config from localStorage", e);
}

// 1. Priority: LocalStorage overrides
// 2. Priority: Env variables (VITE_*)
// 3. Priority: Default AI Studio config (firebase-applet-config.json)
const metaEnv = (import.meta as any).env || {};

export const config = {
  projectId: storedConfig?.projectId || metaEnv.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId,
  appId: storedConfig?.appId || metaEnv.VITE_FIREBASE_APP_ID || firebaseConfig.appId,
  apiKey: storedConfig?.apiKey || metaEnv.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey,
  authDomain: storedConfig?.authDomain || metaEnv.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfig.authDomain,
  storageBucket: storedConfig?.storageBucket || metaEnv.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfig.storageBucket,
  messagingSenderId: storedConfig?.messagingSenderId || metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfig.messagingSenderId,
};

export const databaseId = storedConfig?.firestoreDatabaseId !== undefined
  ? storedConfig.firestoreDatabaseId
  : (metaEnv.VITE_FIREBASE_DATABASE_ID !== undefined
    ? metaEnv.VITE_FIREBASE_DATABASE_ID
    : (firebaseConfig.firestoreDatabaseId || "(default)"));

const app = initializeApp(config);

// CRITICAL: Initialize Firestore with the specific database ID from the config file and force long polling
export const firestore = databaseId 
  ? initializeFirestore(app, { experimentalForceLongPolling: true }, databaseId)
  : initializeFirestore(app, { experimentalForceLongPolling: true });

// Initialize Authentication
export const auth = getAuth(app);

let authInitPromise: Promise<User | null> | null = null;

/**
 * Ensures that the Firebase Auth state is initialized and we have attempted 
 * anonymous sign-in before proceeding with Firestore operations.
 */
export function ensureAuth(): Promise<User | null> {
  if (authInitPromise) return authInitPromise;

  authInitPromise = new Promise((resolve) => {
    // If already signed in, resolve immediately
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }

    let resolved = false;

    // Listen for auth state change
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && !resolved) {
        resolved = true;
        unsubscribe();
        resolve(user);
      }
    });

    // Trigger anonymous sign in
    signInAnonymously(auth)
      .then((userCredential) => {
        if (!resolved) {
          resolved = true;
          unsubscribe();
          resolve(userCredential.user);
        }
      })
      .catch((error) => {
        console.warn("Firebase Anonymous Auth failed:", error);
        if (!resolved) {
          resolved = true;
          unsubscribe();
          resolve(null);
        }
      });

    // Fallback safety timeout (5 seconds) to prevent hanging
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        unsubscribe();
        console.warn("Firebase Auth initialization timed out.");
        resolve(auth.currentUser || null);
      }
    }, 5000);
  });

  return authInitPromise;
}

async function testConnection() {
  try {
    // Wait for Auth initialization to complete first, giving the connection time to establish
    await ensureAuth();
  } catch (e) {
    console.warn("Auth check during connection test:", e);
  }

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      // Use a document path that is matched under our firestore.rules (isSignedIn() is true, and anonymous auth is ready)
      await getDocFromServer(doc(firestore, 'products', 'test_connection'));
      console.log("Firebase connection test successful!");
      return;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const isOffline = errorMsg.toLowerCase().includes('offline');
      if (isOffline) {
        if (attempt < 5) {
          console.warn(`Firebase connection attempt ${attempt} failed (offline). Retrying in 2s...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        console.warn("Firebase connection test: maximum retry limit reached. Continuing in offline/cache mode.");
      } else {
        // Any other error (e.g., Document not found / Permission Denied) means we successfully connected to the Firestore backend
        console.log("Firebase connection test successful (received backend response):", errorMsg);
        return;
      }
    }
  }
}
testConnection();


