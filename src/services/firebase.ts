import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer
} from 'firebase/firestore';
import firebaseConfigFile from '@/firebase-applet-config.json';

const fallbackConfig = {
  projectId: "coffee-spark-ai-barista-43f56",
  appId: "1:12252644240:web:2bdb9e2aadecf854b42915",
  apiKey: "AIzaSyBZLaKdmlgCJvjOsAHTcS9E0ru3mOPgomE",
  authDomain: "coffee-spark-ai-barista-43f56.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-antigravitymulti-ac53aed9-7aa3-48c6-b8da-fea8da03570c",
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
} catch {
  appInstance = getApps().length > 0 ? getApp() : initializeApp(fallbackConfig);
}

export const db = getFirestore(
  appInstance,
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId || fallbackConfig.firestoreDatabaseId
);
export const auth = getAuth(appInstance);

// Validate Firestore connection on startup
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration: client is offline.');
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Standard Google Auth Provider for leaderboard / profile sign-in
export const basicGoogleProvider = new GoogleAuthProvider();
basicGoogleProvider.setCustomParameters({
  prompt: 'select_account'
});

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
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredAccessToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(TOKEN_TIME_KEY, Date.now().toString());
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_TIME_KEY);
    }
  } catch {
    // Ignore storage restriction errors in sandboxed frames
  }
}

/**
 * Initiates standard Google Sign-In popup (for Leaderboard & Auth)
 */
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, basicGoogleProvider);
  return result.user;
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
  } catch (error: unknown) {
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
