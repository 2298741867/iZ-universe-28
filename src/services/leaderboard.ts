import {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';

// Synchronized validation constants matching firebase-blueprint.json and firestore.rules
export const LEADERBOARD_LIMITS = {
  MIN_PILOT_NAME: 1,
  MAX_PILOT_NAME: 40,
  MAX_SCORE: 1000000,
  MAX_DISTANCE: 1000000,
  MAX_NEAR_MISSES: 100000,
  MIN_TIER: 1,
  MAX_TIER: 1000,
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/
} as const;

export interface LeaderboardEntry {
  id: string;
  userId: string;
  pilotName: string;
  score: number;
  distance: number;
  nearMisses: number;
  difficultyTier: number;
  isPublic: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface SubmitScoreInput {
  pilotName: string;
  score: number;
  distance: number;
  nearMisses: number;
  difficultyTier: number;
}

export function sanitizePilotName(rawName: string): string {
  const trimmed = rawName.trim().slice(0, LEADERBOARD_LIMITS.MAX_PILOT_NAME);
  return trimmed.length >= LEADERBOARD_LIMITS.MIN_PILOT_NAME ? trimmed : 'AGP-Pilot';
}

export function sanitizeScorePayload(input: SubmitScoreInput) {
  const pilotName = sanitizePilotName(input.pilotName);
  const score = Math.max(0, Math.min(LEADERBOARD_LIMITS.MAX_SCORE, Math.round(Number(input.score) || 0)));
  const distance = Math.max(
    0,
    Math.min(LEADERBOARD_LIMITS.MAX_DISTANCE, Math.round((Number(input.distance) || 0) * 100) / 100)
  );
  const nearMisses = Math.max(
    0,
    Math.min(LEADERBOARD_LIMITS.MAX_NEAR_MISSES, Math.round(Number(input.nearMisses) || 0))
  );
  const difficultyTier = Math.max(
    LEADERBOARD_LIMITS.MIN_TIER,
    Math.min(LEADERBOARD_LIMITS.MAX_TIER, Math.round(Number(input.difficultyTier) || 1))
  );

  return { pilotName, score, distance, nearMisses, difficultyTier };
}

function parseTimestamp(val: unknown): Date | null {
  if (val instanceof Timestamp) return val.toDate();
  if (val && typeof (val as { toDate?: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate();
  }
  return null;
}

/**
 * Subscribe to real-time top 50 leaderboard entries from Firestore.
 */
export function subscribeToLeaderboard(
  onData: (entries: LeaderboardEntry[]) => void,
  onError: (error: Error) => void
): () => void {
  const path = 'leaderboard';
  const q = query(
    collection(db, path),
    where('score', '>=', 0),
    orderBy('score', 'desc'),
    limit(50)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const entries: LeaderboardEntry[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          userId: String(data.userId || ''),
          pilotName: String(data.pilotName || 'Unknown Pilot'),
          score: Number(data.score || 0),
          distance: Number(data.distance || 0),
          nearMisses: Number(data.nearMisses || 0),
          difficultyTier: Number(data.difficultyTier || 1),
          isPublic: Boolean(data.isPublic ?? true),
          createdAt: parseTimestamp(data.createdAt),
          updatedAt: parseTimestamp(data.updatedAt)
        };
      });
      onData(entries);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

/**
 * Persist a verified pilot flight run to Firestore `/leaderboard/{entryId}`.
 */
export async function submitLeaderboardScore(input: SubmitScoreInput): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in with Google before submitting a score to the global leaderboard.');
  }

  const sanitized = sanitizeScorePayload(input);
  const randSuffix = Math.random().toString(36).slice(2, 8).replace(/[^a-zA-Z0-9]/g, 'x');
  const entryId = `run_${Date.now()}_${randSuffix}`;
  const docPath = `leaderboard/${entryId}`;

  try {
    await setDoc(doc(db, 'leaderboard', entryId), {
      userId: user.uid,
      pilotName: sanitized.pilotName,
      score: sanitized.score,
      distance: sanitized.distance,
      nearMisses: sanitized.nearMisses,
      difficultyTier: sanitized.difficultyTier,
      isPublic: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return entryId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

/**
 * Update the pilot callsign on an existing entry owned by the signed-in user.
 */
export async function updateLeaderboardPilotName(entryId: string, newPilotName: string): Promise<void> {
  if (!LEADERBOARD_LIMITS.ID_PATTERN.test(entryId)) {
    throw new Error('Invalid leaderboard entry ID.');
  }

  const pilotName = sanitizePilotName(newPilotName);
  const docPath = `leaderboard/${entryId}`;

  try {
    await updateDoc(doc(db, 'leaderboard', entryId), {
      pilotName,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

/**
 * Delete a leaderboard entry owned by the signed-in user.
 */
export async function deleteLeaderboardEntry(entryId: string): Promise<void> {
  if (!LEADERBOARD_LIMITS.ID_PATTERN.test(entryId)) {
    throw new Error('Invalid leaderboard entry ID.');
  }

  const docPath = `leaderboard/${entryId}`;
  try {
    await deleteDoc(doc(db, 'leaderboard', entryId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}
