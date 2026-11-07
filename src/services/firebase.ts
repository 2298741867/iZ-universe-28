import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import firebaseConfigFile from '@/firebase-applet-config.json';

const fallbackConfig = {
  projectId: "coffee-spark-ai-barista-43f56",
  appId: "1:12252644240:web:2bdb9e2aadecf854b42915",
  apiKey: "AIzaSyBZLaKdmlgCJvjOsAHTcS9E0ru3mOPgomE",
  authDomain: "coffee-spark-ai-barista-43f56.firebaseapp.com",
  storageBucket: "coffee-spark-ai-barista-43f56.firebasestorage.app",
  messagingSenderId: "12252644240"
};

const firebaseConfig = (firebaseConfigFile && firebaseConfigFile.apiKey)
  ? firebaseConfigFile
  : fallbackConfig;

// Initialize Firebase App safely (singleton)
let appInstance;
try {
  appInstance = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
} catch (e) {
  appInstance = getApps().length > 0 ? getApp() : initializeApp(fallbackConfig);
}

export const auth = getAuth(appInstance);

// Configure Google Auth Provider with Google Drive scopes
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly');
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

const TOKEN_KEY = 'ag_google_drive_access_token';
const TOKEN_TIME_KEY = 'ag_google_drive_token_timestamp';

export function getStoredAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredAccessToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(TOKEN_TIME_KEY, Date.now().toString());
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_TIME_KEY);
  }
}

/**
 * Initiates client-side OAuth popup for Google Drive
 */
export async function signInWithGoogleDrive(): Promise<{ user: User; accessToken: string }> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;

    if (!accessToken) {
      throw new Error('Google did not return an access token for Drive. Please try signing in again.');
    }

    setStoredAccessToken(accessToken);
    return {
      user: result.user,
      accessToken
    };
  } catch (error: any) {
    console.error('Firebase Google Sign-In Error:', error);
    throw error;
  }
}

/**
 * Signs out the current user and clears stored Drive tokens
 */
export async function signOutDrive(): Promise<void> {
  await signOut(auth);
  setStoredAccessToken(null);
}

/**
 * Subscribe to Auth State changes
 */
export function onDriveAuthStateChanged(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
