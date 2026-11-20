/**
 * Shared Multiplayer Room Protocol, Validation & State Machine.
 * Used identically by the authoritative Socket.IO backend (RoomManager)
 * and the React/Phaser frontend so room codes, transitions, and invite text
 * stay 100% consistent.
 */

export type RoomStatus =
  | 'CREATING'
  | 'WAITING'
  | 'READY'
  | 'STARTING'
  | 'IN_GAME'
  | 'CLOSED'
  | 'ERROR';

export type ConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

/** Unambiguous characters (excludes 0, O, 1, I) for readable mobile room codes. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_PREFIX = 'LK';
export const ROOM_CODE_SUFFIX_LENGTH = 4;
export const DEFAULT_SELECTED_MAP = 'burger_cafe';

const CANONICAL_ROOM_CODE_RE = /^LK-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;
const EMBEDDED_CODE_RE = /\bLK[\s-]?([A-Z0-9]{4})\b/i;

/**
 * Extracts and normalizes a Love Kitchen room code to canonical `LK-XXXX` format.
 * Supports:
 * - "lk7k2p" -> "LK-7K2P"
 * - "LK 7K2P" -> "LK-7K2P"
 * - "LK-7K2P" -> "LK-7K2P"
 * - Pasted invite text: "Yuk main Love Kitchen bareng! Join room aku dengan kode LK-7K2P." -> "LK-7K2P"
 */
export function normalizeRoomCode(raw: string): string {
  const trimmed = String(raw ?? '').trim().toUpperCase();
  if (!trimmed) return '';

  // Try extracting an embedded LK-XXXX code (great for pasted invite messages or URLs)
  const embedded = trimmed.match(EMBEDDED_CODE_RE);
  if (embedded && embedded[1]) {
    return `${ROOM_CODE_PREFIX}-${embedded[1].toUpperCase()}`;
  }

  // Strip spaces, hyphens, and punctuation from direct code entry
  const alnum = trimmed.replace(/[^A-Z0-9]/g, '');
  if (alnum.startsWith(ROOM_CODE_PREFIX) && alnum.length === 6) {
    return `${ROOM_CODE_PREFIX}-${alnum.slice(2)}`;
  }

  // If user typed only the 4-character suffix, leave as cleaned alphanumeric so validation can decide
  if (alnum.length <= 6 && alnum.startsWith(ROOM_CODE_PREFIX) && alnum.length > 2) {
    return `${ROOM_CODE_PREFIX}-${alnum.slice(2)}`;
  }

  return trimmed;
}

/**
 * Validates that a normalized code matches the strict canonical `LK-XXXX` format
 * using unambiguous characters.
 */
export function isValidRoomCode(raw: string): boolean {
  const normalized = normalizeRoomCode(raw);
  return CANONICAL_ROOM_CODE_RE.test(normalized);
}

/**
 * Generates a single random `LK-XXXX` room code using unambiguous characters.
 */
export function generateFormattedRoomCode(randomFn: () => number = Math.random): string {
  let suffix = '';
  for (let i = 0; i < ROOM_CODE_SUFFIX_LENGTH; i++) {
    const idx = Math.floor(randomFn() * ROOM_CODE_ALPHABET.length);
    suffix += ROOM_CODE_ALPHABET[Math.min(idx, ROOM_CODE_ALPHABET.length - 1)];
  }
  return `${ROOM_CODE_PREFIX}-${suffix}`;
}

/**
 * Strict authoritative room state machine transitions.
 */
export const VALID_ROOM_TRANSITIONS: Readonly<Record<RoomStatus, readonly RoomStatus[]>> = {
  CREATING: ['WAITING', 'CLOSED', 'ERROR'],
  WAITING: ['READY', 'CLOSED', 'ERROR'],
  READY: ['WAITING', 'STARTING', 'CLOSED', 'ERROR'],
  STARTING: ['IN_GAME', 'READY', 'WAITING', 'CLOSED', 'ERROR'],
  IN_GAME: ['WAITING', 'READY', 'CLOSED', 'ERROR'],
  CLOSED: [],
  ERROR: ['CLOSED'],
};

export function canTransitionRoomStatus(from: RoomStatus, to: RoomStatus): boolean {
  if (from === to) return true;
  return VALID_ROOM_TRANSITIONS[from].includes(to);
}

/**
 * Builds the player-friendly Indonesian invitation text for sharing via Web Share API or clipboard.
 */
export function buildInviteMessage(roomCode: string): string {
  const cleanCode = normalizeRoomCode(roomCode) || roomCode;
  return `Yuk main Love Kitchen bareng! Join room aku dengan kode ${cleanCode}.`;
}

/**
 * Maps internal RoomStatus to a readable Indonesian badge label for the Waiting Room UI.
 */
export function getRoomStatusLabel(status: RoomStatus): string {
  switch (status) {
    case 'CREATING':
      return 'Membuat Room...';
    case 'WAITING':
      return 'Menunggu Partner';
    case 'READY':
      return 'Siap Dimulai';
    case 'STARTING':
      return 'Memulai Game...';
    case 'IN_GAME':
      return 'Sedang Bermain';
    case 'CLOSED':
      return 'Room Ditutup';
    case 'ERROR':
      return 'Terjadi Kesalahan';
  }
}

export function getConnectionStatusLabel(status: ConnectionStatus): string {
  switch (status) {
    case 'CONNECTING':
      return 'Menghubungkan...';
    case 'CONNECTED':
      return 'Terhubung';
    case 'DISCONNECTED':
      return 'Terputus';
    case 'ERROR':
      return 'Koneksi Error';
  }
}
