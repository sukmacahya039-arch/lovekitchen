# Security Specification — Love Kitchen Firestore Rules

## Data Invariants
1. A `PlayerProfile` at `/players/{playerId}` can ONLY be read, created, or updated by the verified authenticated user whose `request.auth.uid == playerId`.
2. A `MatchRecord` at `/players/{playerId}/matches/{matchId}` requires the parent `/players/{playerId}` document to exist and belong to `request.auth.uid` (Master Gate), is immutable once created, and enforces `ownerId == request.auth.uid`.
3. A `LeaderboardEntry` at `/leaderboard/{entryId}` stores NO PII (only displayName, partnerName, score, stars, ordersCompleted, role, playerId, createdAt), can only be created by the verified player whose `playerId == request.auth.uid`, and is immutable once created.
4. All document IDs must pass `isValidId(id)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars). All strings have strict min/max size bounds. All numeric stats have bounded non-negative ranges. All timestamps must equal `request.time`.

## The "Dirty Dozen" Attack Payloads (Expected: PERMISSION_DENIED)
1. **Identity Spoofing on Profile Create**: Creating `/players/victimUid` as `attackerUid` with `uid: "victimUid"`.
2. **Shadow Field Injection on Profile**: Creating `/players/{uid}` with extra field `isAdmin: true`.
3. **Unverified Email Write**: Writing to `/players/{uid}` with `request.auth.token.email_verified == false`.
4. **Immutable Field Tampering**: Updating `/players/{uid}` trying to mutate `createdAt` or `uid`.
5. **Value Poisoning on Display Name**: Updating `displayName` to a 500-character string or non-string boolean.
6. **Out-of-Bounds Volume / Score Manipulation**: Setting `masterVolume: 99` or `bestScore: -50` or `bestScore: 99999999`.
7. **Cross-User Profile Read**: Authenticated user A attempting `get` on `/players/userB`.
8. **Blanket Collection Scrape**: Authenticated user attempting `list` on `/players`.
9. **Orphaned Match Record**: Creating `/players/{uid}/matches/{matchId}` before parent `/players/{uid}` exists or with `ownerId != request.auth.uid`.
10. **Match History Tampering**: Attempting `update` or `delete` on an existing `/players/{uid}/matches/{matchId}` document.
11. **ID Poisoning**: Attempting `create` at `/leaderboard/bad$id!with/junk...` exceeding 128 chars or failing regex.
12. **Client Timestamp Forgery**: Creating a `LeaderboardEntry` with backdated `createdAt` not matching `request.time`.
