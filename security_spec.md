# Antigravity Leaderboard Firestore Security Specification

## 1. Data Invariants
1. **Identity Integrity**: Every document in `/leaderboard/{entryId}` MUST have `userId == request.auth.uid`. Pilots cannot submit or delete entries on behalf of other users.
2. **Verified Authentication**: Only authenticated users with verified emails (`request.auth.token.email_verified == true`) can create or delete leaderboard records.
3. **Strict Schema & No Shadow Fields**: Documents MUST contain exact required keys `['userId', 'pilotName', 'score', 'distance', 'nearMisses', 'difficultyTier', 'isPublic', 'createdAt', 'updatedAt']` and no additional fields.
4. **Numeric & String Bounds**:
   - `pilotName`: 1–40 characters.
   - `score`: integer in `[0, 1000000]`.
   - `distance`: number in `[0, 1000000]`.
   - `nearMisses`: integer in `[0, 100000]`.
   - `difficultyTier`: integer in `[1, 1000]`.
5. **PII Isolation**: No email addresses, phone numbers, or sensitive user PII are ever stored in `/leaderboard/{entryId}`.
6. **Temporal Integrity**: `createdAt` and `updatedAt` MUST equal `request.time`.
7. **Immutable Scores & Safe Updates**: Once submitted, flight metrics (`score`, `distance`, `nearMisses`, `difficultyTier`, `userId`, `createdAt`) cannot be altered; only `pilotName` and `updatedAt` may be updated by the owning pilot.
8. **Query Enforcement**: `list` queries MUST enforce `resource.data.isPublic == true` and `request.query.limit <= 50`.

## 2. The "Dirty Dozen" Attack Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Write**: `create` to `/leaderboard/run_1` when `request.auth == null`.
2. **Unverified Email Write**: `create` when `request.auth.token.email_verified == false`.
3. **Identity Spoofing**: `create` with `userId: "other_user_uid"` != `request.auth.uid`.
4. **Shadow / Ghost Field Injection**: `create` containing extra field `isAdmin: true` or `verified: true`.
5. **ID Poisoning**: `create` at `/leaderboard/invalid$id*with#junk` or 200-char ID failing `isValidId(entryId)`.
6. **Resource Exhaustion (1MB String)**: `create` with `pilotName` exceeding 40 characters.
7. **Negative / Infinite Score Forgery**: `create` with `score: -10` or `score: 999999999`.
8. **Invalid Distance Type**: `create` with `distance: "100AU"` (string instead of number).
9. **Client-Forged Timestamp**: `create` with `createdAt` set to a past/future timestamp instead of `request.time`.
10. **Unauthorized Score Tampering (Update)**: Owner attempts `update` changing `score` or `distance` or `nearMisses`.
11. **Unauthorized Delete**: User A attempts to `delete` User B's `/leaderboard/run_b`.
12. **Unbounded Query Scraping**: `list` query without `where('isPublic', '==', true)` or with `.limit(500)`.
