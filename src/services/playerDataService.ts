import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import type { AudioSettings, MatchSummary, PlayerProfileData, PlayerRole } from '../shared/types.ts';
import { db, handleFirestoreError, OperationType } from './firebase.ts';

export interface LeaderboardRow {
  id: string;
  playerId: string;
  displayName: string;
  partnerName: string;
  role: PlayerRole;
  score: number;
  ordersCompleted: number;
  stars: number;
}

function sanitizeDisplayName(name: string | null | undefined): string {
  const cleaned = (name ?? 'Chef').replace(/[^\w \-]/g, '').trim().slice(0, 32);
  return cleaned.length > 0 ? cleaned : 'Player';
}

function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return 0.7;
  return Math.max(0, Math.min(1, Number(v.toFixed(2))));
}

function generateSafeDocId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.replace(/[^a-zA-Z0-9_\-]/g, '');
}

export async function loadOrCreatePlayerProfile(
  user: User,
  localAudio: AudioSettings
): Promise<PlayerProfileData> {
  const path = `players/${user.uid}`;
  const ref = doc(db, 'players', user.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      return {
        uid: user.uid,
        displayName: String(data.displayName ?? sanitizeDisplayName(user.displayName)),
        preferredRole: data.preferredRole === 'waiter' ? 'waiter' : 'chef',
        bestScore: Number(data.bestScore ?? 0),
        gamesPlayed: Number(data.gamesPlayed ?? 0),
        totalOrdersServed: Number(data.totalOrdersServed ?? 0),
        masterVolume: clampVolume(Number(data.masterVolume ?? localAudio.masterVolume)),
        musicVolume: clampVolume(Number(data.musicVolume ?? localAudio.musicVolume)),
        sfxVolume: clampVolume(Number(data.sfxVolume ?? localAudio.sfxVolume)),
        muted: Boolean(data.muted ?? localAudio.muted),
      };
    }

    const fresh: PlayerProfileData = {
      uid: user.uid,
      displayName: sanitizeDisplayName(user.displayName),
      preferredRole: 'chef',
      bestScore: 0,
      gamesPlayed: 0,
      totalOrdersServed: 0,
      masterVolume: clampVolume(localAudio.masterVolume),
      musicVolume: clampVolume(localAudio.musicVolume),
      sfxVolume: clampVolume(localAudio.sfxVolume),
      muted: Boolean(localAudio.muted),
    };

    if (user.emailVerified) {
      await setDoc(ref, {
        ...fresh,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return fresh;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function savePlayerPreferences(
  user: User,
  displayName: string,
  preferredRole: PlayerRole,
  audio: AudioSettings
): Promise<void> {
  if (!user.emailVerified) return;
  const path = `players/${user.uid}`;
  const ref = doc(db, 'players', user.uid);
  try {
    await updateDoc(ref, {
      displayName: sanitizeDisplayName(displayName),
      preferredRole: preferredRole === 'waiter' ? 'waiter' : 'chef',
      masterVolume: clampVolume(audio.masterVolume),
      musicVolume: clampVolume(audio.musicVolume),
      sfxVolume: clampVolume(audio.sfxVolume),
      muted: Boolean(audio.muted),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function recordMatchResult(
  user: User,
  profile: PlayerProfileData,
  summary: MatchSummary
): Promise<PlayerProfileData> {
  if (!user.emailVerified) return profile;

  const updatedProfile: PlayerProfileData = {
    ...profile,
    preferredRole: summary.myRole,
    bestScore: Math.max(profile.bestScore, Math.min(1000000, Math.max(0, Math.round(summary.score)))),
    gamesPlayed: Math.min(100000, profile.gamesPlayed + 1),
    totalOrdersServed: Math.min(1000000, profile.totalOrdersServed + Math.max(0, Math.round(summary.ordersCompleted))),
  };

  const playerPath = `players/${user.uid}`;
  try {
    await updateDoc(doc(db, 'players', user.uid), {
      bestScore: updatedProfile.bestScore,
      gamesPlayed: updatedProfile.gamesPlayed,
      totalOrdersServed: updatedProfile.totalOrdersServed,
      preferredRole: updatedProfile.preferredRole,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, playerPath);
  }

  const partnerName = sanitizeDisplayName(
    summary.myRole === 'chef' ? summary.waiterName : summary.chefName
  );
  const matchId = generateSafeDocId('match');
  const matchPath = `players/${user.uid}/matches/${matchId}`;
  try {
    await setDoc(doc(db, 'players', user.uid, 'matches', matchId), {
      ownerId: user.uid,
      roomCode: summary.roomCode.slice(0, 12).padEnd(4, '0'),
      partnerName,
      role: summary.myRole,
      score: Math.min(1000000, Math.max(0, Math.round(summary.score))),
      ordersCompleted: Math.min(500, Math.max(0, Math.round(summary.ordersCompleted))),
      ordersBurned: Math.min(500, Math.max(0, Math.round(summary.ordersBurned))),
      stars: Math.min(3, Math.max(0, Math.round(summary.stars))),
      durationSeconds: Math.min(1800, Math.max(10, Math.round(summary.durationSeconds || 150))),
      mode: summary.mode,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, matchPath);
  }

  if (summary.score > 0) {
    const lbId = generateSafeDocId('lb');
    const lbPath = `leaderboard/${lbId}`;
    try {
      await setDoc(doc(db, 'leaderboard', lbId), {
        playerId: user.uid,
        displayName: sanitizeDisplayName(profile.displayName),
        partnerName,
        role: summary.myRole,
        score: Math.min(1000000, Math.max(0, Math.round(summary.score))),
        ordersCompleted: Math.min(500, Math.max(0, Math.round(summary.ordersCompleted))),
        stars: Math.min(3, Math.max(0, Math.round(summary.stars))),
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, lbPath);
    }
  }

  return updatedProfile;
}

export async function fetchTopLeaderboard(): Promise<LeaderboardRow[]> {
  const path = 'leaderboard';
  try {
    const q = query(collection(db, 'leaderboard'), orderBy('score', 'desc'), limit(8));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        playerId: String(data.playerId ?? ''),
        displayName: String(data.displayName ?? 'Player'),
        partnerName: String(data.partnerName ?? 'Partner'),
        role: data.role === 'waiter' ? 'waiter' : 'chef',
        score: Number(data.score ?? 0),
        ordersCompleted: Number(data.ordersCompleted ?? 0),
        stars: Number(data.stars ?? 0),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
