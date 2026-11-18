import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  onDriveAuthStateChanged,
  signInWithGoogle,
  signOutDrive
} from '../services/firebase';
import {
  LeaderboardEntry,
  LEADERBOARD_LIMITS,
  subscribeToLeaderboard,
  submitLeaderboardScore,
  updateLeaderboardPilotName,
  deleteLeaderboardEntry
} from '../services/leaderboard';
import {
  Trophy,
  Medal,
  Compass,
  Zap,
  Rocket,
  LogIn,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Edit2,
  Check,
  X,
  ArrowUpDown,
  Users,
  Sparkles
} from 'lucide-react';

interface LeaderboardPanelProps {
  currentFlightTelemetry: {
    score: number;
    distance: number;
    nearMisses: number;
    difficultyTier: number;
  };
  onPlayFlight?: () => void;
}

type SortMetric = 'score' | 'distance' | 'nearMisses';

export const LeaderboardPanel: React.FC<LeaderboardPanelProps> = ({
  currentFlightTelemetry,
  onPlayFlight
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters & sorting
  const [sortBy, setSortBy] = useState<SortMetric>('score');
  const [onlyMyFlights, setOnlyMyFlights] = useState(false);
  const [bestPerPilot, setBestPerPilot] = useState(false);

  // Submission state
  const [pilotNameInput, setPilotNameInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Inline edit / delete confirmation state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState<LeaderboardEntry | null>(null);

  // Track Firebase auth state
  useEffect(() => {
    const unsub = onDriveAuthStateChanged((currentUser) => {
      setUser(currentUser);
      if (currentUser?.displayName && !pilotNameInput) {
        setPilotNameInput(currentUser.displayName.slice(0, LEADERBOARD_LIMITS.MAX_PILOT_NAME));
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to real-time Firestore leaderboard
  useEffect(() => {
    setLoading(true);
    setErrorMsg(null);
    const unsubscribe = subscribeToLeaderboard(
      (data) => {
        setEntries(data);
        setLoading(false);
        setErrorMsg(null);
      },
      (err) => {
        setLoading(false);
        let displayMsg = err.message;
        try {
          const parsed = JSON.parse(err.message);
          displayMsg = parsed.error || err.message;
        } catch {
          // Keep original message
        }
        setErrorMsg(displayMsg);
      }
    );

    return () => unsubscribe();
  }, []);

  // Compute sorted & filtered entries
  const displayedEntries = useMemo(() => {
    let list = [...entries];

    if (onlyMyFlights && user) {
      list = list.filter((e) => e.userId === user.uid);
    }

    // Sort by chosen metric
    list.sort((a, b) => {
      if (sortBy === 'distance') {
        if (b.distance !== a.distance) return b.distance - a.distance;
        return b.score - a.score;
      }
      if (sortBy === 'nearMisses') {
        if (b.nearMisses !== a.nearMisses) return b.nearMisses - a.nearMisses;
        return b.score - a.score;
      }
      if (b.score !== a.score) return b.score - a.score;
      return b.distance - a.distance;
    });

    if (bestPerPilot) {
      const seen = new Set<string>();
      list = list.filter((e) => {
        if (seen.has(e.userId)) return false;
        seen.add(e.userId);
        return true;
      });
    }

    return list;
  }, [entries, sortBy, onlyMyFlights, bestPerPilot, user]);

  // Top summary metrics across all entries
  const summaryStats = useMemo(() => {
    if (entries.length === 0) {
      return { topScore: 0, maxDistance: 0, maxNearMisses: 0, uniquePilots: 0 };
    }
    const uniquePilots = new Set(entries.map((e) => e.userId)).size;
    return {
      topScore: Math.max(...entries.map((e) => e.score)),
      maxDistance: Math.max(...entries.map((e) => e.distance)),
      maxNearMisses: Math.max(...entries.map((e) => e.nearMisses)),
      uniquePilots
    };
  }, [entries]);

  const handleSignIn = async () => {
    setSubmitFeedback(null);
    try {
      const signedIn = await signInWithGoogle();
      if (signedIn.displayName) {
        setPilotNameInput(signedIn.displayName.slice(0, LEADERBOARD_LIMITS.MAX_PILOT_NAME));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      setSubmitFeedback({ text: msg, type: 'error' });
    }
  };

  const handleSubmitRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || submitting) return;

    setSubmitting(true);
    setSubmitFeedback(null);
    try {
      await submitLeaderboardScore({
        pilotName: pilotNameInput || user.displayName || 'AGP-Pilot',
        score: currentFlightTelemetry.score,
        distance: currentFlightTelemetry.distance,
        nearMisses: currentFlightTelemetry.nearMisses,
        difficultyTier: currentFlightTelemetry.difficultyTier
      });
      setSubmitFeedback({
        text: 'Flight telemetry recorded to the global Firestore leaderboard!',
        type: 'success'
      });
    } catch (err: unknown) {
      let msg = err instanceof Error ? err.message : 'Failed to submit flight score.';
      try {
        const parsed = JSON.parse(msg);
        msg = parsed.error || msg;
      } catch {
        // Keep plain string
      }
      setSubmitFeedback({ text: msg, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveRename = async (entryId: string) => {
    if (!editingName.trim()) return;
    try {
      await updateLeaderboardPilotName(entryId, editingName);
      setEditingId(null);
      setSubmitFeedback({ text: 'Pilot callsign updated.', type: 'success' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to rename entry.';
      setSubmitFeedback({ text: msg, type: 'error' });
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteEntry) return;
    try {
      await deleteLeaderboardEntry(confirmDeleteEntry.id);
      setConfirmDeleteEntry(null);
      setSubmitFeedback({ text: 'Flight record deleted from leaderboard.', type: 'success' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete entry.';
      setSubmitFeedback({ text: msg, type: 'error' });
      setConfirmDeleteEntry(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 via-orange-500 to-cyan-400 p-0.5 shadow-lg shadow-amber-500/20 shrink-0 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Trophy className="w-7 h-7 text-amber-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-extrabold tracking-tight text-white font-display">
                  Global Pilot Leaderboard
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/25">
                  Firestore Live Sync
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-1 max-w-2xl">
                Persistent high-score standings tracking wells evaded, astronomical distance traveled (AU),
                and high-risk graviton near-miss maneuvers across all commanders.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!user ? (
              <button
                onClick={handleSignIn}
                className="px-5 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white shadow-lg shadow-indigo-500/25 flex items-center gap-2 transition-all cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign in with Google to Post Scores</span>
              </button>
            ) : (
              <div className="flex items-center gap-3 bg-slate-950/70 border border-slate-800 px-3 py-2 rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-700 text-cyan-300 flex items-center justify-center font-bold text-xs">
                  {(user.displayName || user.email || 'P').charAt(0).toUpperCase()}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="text-xs font-semibold text-white truncate max-w-[140px]">
                    {user.displayName || 'Verified Pilot'}
                  </div>
                  <div className="text-[10px] text-emerald-400">Firestore Authenticated</div>
                </div>
                <button
                  onClick={() => signOutDrive()}
                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-5 border-t border-slate-800/80">
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>Record Score</span>
            </div>
            <div className="text-2xl font-bold font-mono-num text-white mt-1">
              {summaryStats.topScore.toLocaleString()}
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              <span>Furthest Distance</span>
            </div>
            <div className="text-2xl font-bold font-mono-num text-cyan-300 mt-1">
              {summaryStats.maxDistance.toFixed(1)} <span className="text-xs text-slate-500 font-sans">AU</span>
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>Peak Near Misses</span>
            </div>
            <div className="text-2xl font-bold font-mono-num text-emerald-400 mt-1">
              {summaryStats.maxNearMisses}
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              <span>Ranked Pilots</span>
            </div>
            <div className="text-2xl font-bold font-mono-num text-indigo-300 mt-1">
              {summaryStats.uniquePilots}
            </div>
          </div>
        </div>
      </div>

      {/* Submit Current / Latest Flight Telemetry Card */}
      <div className="bg-slate-900/70 border border-cyan-500/30 rounded-2xl p-5 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Rocket className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-white font-display uppercase tracking-wider">
                Record Latest Flight Telemetry
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              Current flight buffer: <strong className="text-white">{currentFlightTelemetry.score}</strong> pts ·{' '}
              <strong className="text-cyan-300">{currentFlightTelemetry.distance.toFixed(1)} AU</strong> ·{' '}
              <strong className="text-emerald-400">{currentFlightTelemetry.nearMisses}</strong> near misses ·{' '}
              <strong className="text-sky-400">Tier {currentFlightTelemetry.difficultyTier}</strong>
            </p>
          </div>

          {user ? (
            <form onSubmit={handleSubmitRun} className="flex flex-wrap items-center gap-2.5">
              <input
                type="text"
                required
                maxLength={LEADERBOARD_LIMITS.MAX_PILOT_NAME}
                value={pilotNameInput}
                onChange={(e) => setPilotNameInput(e.target.value)}
                placeholder="Pilot Callsign (1-40 chars)"
                className="bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 min-w-[200px]"
              />
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-xl font-bold text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{submitting ? 'Publishing...' : 'Publish Flight Record'}</span>
              </button>
              {onPlayFlight && (
                <button
                  type="button"
                  onClick={onPlayFlight}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
                >
                  Fly Again
                </button>
              )}
            </form>
          ) : (
            <button
              onClick={handleSignIn}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer flex items-center gap-1.5 w-fit"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In to Publish Score</span>
            </button>
          )}
        </div>

        {submitFeedback && (
          <div
            className={`mt-3 p-3 rounded-xl text-xs flex items-center gap-2 border ${
              submitFeedback.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
            }`}
          >
            {submitFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{submitFeedback.text}</span>
          </div>
        )}
      </div>

      {/* Firestore Error Alert if any */}
      {errorMsg && (
        <div className="bg-rose-950/60 border border-rose-500/40 rounded-xl p-4 text-xs text-rose-200 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>Unable to sync leaderboard: {errorMsg}</span>
        </div>
      )}

      {/* Leaderboard Controls & Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {/* Toolbar */}
        <div className="px-5 py-3.5 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1 mr-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-cyan-400" />
              <span>Rank By:</span>
            </span>
            {(
              [
                { id: 'score', label: 'Top Score' },
                { id: 'distance', label: 'Distance (AU)' },
                { id: 'nearMisses', label: 'Near Misses' }
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSortBy(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  sortBy === opt.id
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setBestPerPilot(!bestPerPilot)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                bestPerPilot
                  ? 'bg-indigo-500/20 border-indigo-400/50 text-indigo-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Best Per Pilot
            </button>

            {user && (
              <button
                onClick={() => setOnlyMyFlights(!onlyMyFlights)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                  onlyMyFlights
                    ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                My Flights Only
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-16 text-center text-xs text-slate-400">
              Synchronizing telemetry standings with Firestore...
            </div>
          ) : displayedEntries.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <Medal className="w-10 h-10 text-slate-600 mx-auto" />
              <div className="text-sm font-semibold text-slate-300">
                No flight records recorded yet
              </div>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Complete a flight in the 3D Antigravity Simulator and publish your score, distance, and near-miss telemetry!
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-slate-800 font-semibold">
                <tr>
                  <th className="px-5 py-3.5 w-16">Rank</th>
                  <th className="px-5 py-3.5">Pilot Callsign</th>
                  <th className="px-5 py-3.5 text-right">Score</th>
                  <th className="px-5 py-3.5 text-right">Distance</th>
                  <th className="px-5 py-3.5 text-right">Near Misses</th>
                  <th className="px-5 py-3.5 text-center">Surge Tier</th>
                  <th className="px-5 py-3.5 text-right">Recorded</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono-num text-slate-300">
                {displayedEntries.map((entry, idx) => {
                  const isOwn = Boolean(user && entry.userId === user.uid);
                  const rank = idx + 1;
                  const rankColor =
                    rank === 1
                      ? 'text-amber-400 bg-amber-500/10 border-amber-500/40'
                      : rank === 2
                      ? 'text-slate-200 bg-slate-500/15 border-slate-400/40'
                      : rank === 3
                      ? 'text-orange-400 bg-orange-500/10 border-orange-500/40'
                      : 'text-slate-400 bg-slate-900 border-slate-800';

                  return (
                    <tr
                      key={entry.id}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isOwn ? 'bg-cyan-950/20' : ''
                      }`}
                    >
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border text-xs font-bold ${rankColor}`}
                        >
                          #{rank}
                        </span>
                      </td>

                      <td className="px-5 py-3.5 font-sans">
                        {editingId === entry.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              maxLength={LEADERBOARD_LIMITS.MAX_PILOT_NAME}
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="bg-slate-950 border border-cyan-500/60 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none w-36"
                            />
                            <button
                              onClick={() => handleSaveRename(entry.id)}
                              className="p-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 cursor-pointer"
                              title="Save callsign"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{entry.pilotName}</span>
                            {isOwn && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                                YOU
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-3.5 text-right font-bold text-white">
                        {entry.score.toLocaleString()}
                      </td>

                      <td className="px-5 py-3.5 text-right text-cyan-300 font-semibold">
                        {entry.distance.toFixed(1)} AU
                      </td>

                      <td className="px-5 py-3.5 text-right text-emerald-400 font-semibold">
                        {entry.nearMisses}
                      </td>

                      <td className="px-5 py-3.5 text-center">
                        <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 border border-slate-700 text-sky-400">
                          T-{entry.difficultyTier}
                        </span>
                      </td>

                      <td className="px-5 py-3.5 text-right text-slate-400 text-[11px] font-sans">
                        {entry.createdAt
                          ? entry.createdAt.toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })
                          : 'Just now'}
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        {isOwn ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => {
                                setEditingId(entry.id);
                                setEditingName(entry.pilotName);
                              }}
                              className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                              title="Edit Callsign"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteEntry(entry)}
                              className="p-1.5 rounded hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                              title="Delete Flight Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-600 text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDeleteEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/30 text-rose-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">Delete Leaderboard Record?</h3>
                <p className="text-[11px] text-slate-400">
                  This removes your flight run permanently from Firestore.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-1">
              <div className="font-bold text-white">{confirmDeleteEntry.pilotName}</div>
              <div className="text-slate-400">
                Score: {confirmDeleteEntry.score} · Distance: {confirmDeleteEntry.distance.toFixed(1)} AU · Near Misses: {confirmDeleteEntry.nearMisses}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteEntry(null)}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
