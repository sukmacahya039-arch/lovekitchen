import { ENTRANCE_DOOR_POS, QUEUE_SLOTS, type GridCoord } from '../../../shared/layout.ts';
import type { TableType } from '../table/TableConfig.ts';

export type CustomerGenderPresentation = 'male' | 'female' | 'child';
export type CustomerHairStyle = 'short' | 'ponytail' | 'bob' | 'curly' | 'cap';
export type CustomerAccessory = 'none' | 'glasses' | 'bow' | 'hat' | 'scarf';

export interface CustomerProfile {
  id: string;
  name: string;
  appearanceId: string;
  genderPresentation: CustomerGenderPresentation;
  hairStyle: CustomerHairStyle;
  hairColor: number;
  outfitId: string;
  shirtColor: number;
  pantsColor: number;
  skinTone: number;
  accessories: CustomerAccessory;
  movementSpeed: number; // tiles/sec
  patience: number; // seconds baseline
  eatingDuration: number; // seconds
  preferredTableType?: TableType;
}

export type QueueOverflowPolicy = 'block_spawn' | 'turn_away_at_door';

export interface CustomerSystemConfig {
  spawningEnabled: boolean; // whether automatic spawning is active
  spawnInterval: number; // initial seconds between spawns
  minSpawnInterval: number; // fastest cooldown under difficulty progression
  maxCustomers: number; // max total active customers in restaurant
  maxQueueSize: number; // max queued customer groups (or slots)
  customerSpeed: number; // default tiles/sec
  queueSpacing: number; // grid tile spacing between queue positions
  tableSearchTimeout: number; // seconds searching before falling back to queue
  customerPatience: number; // baseline waiting patience (seconds)
  queuePatience: number; // queue waiting patience (seconds)
  waiterPatience: number; // waiting for waiter/order patience (seconds)
  foodPatience: number; // waiting for cooked food patience (seconds)
  billPatience: number; // waiting for bill patience (seconds)
  eatingDuration: number; // seconds spent eating
  seatingDuration: number; // seconds for seating animation
  browsingDuration: number; // seconds browsing menu before ready to order
  standUpDuration: number; // seconds for stand-up animation
  exitDelay: number; // seconds fade/exit animation at door
  reservationTimeoutMs: number; // table reservation lock timeout
  stuckTimeoutSec: number; // seconds without progress before reroute recovery
  autoSeatFromQueue: boolean; // if true, front queued group auto-claims newly available tables
  queueOverflowPolicy: QueueOverflowPolicy;
  groupSizeWeights: Array<{ size: 1 | 2 | 3 | 4; weight: number }>;
  entrancePos: GridCoord;
  exitPos: GridCoord;
  queueSlots: GridCoord[];
}

export const CUSTOMER_PROFILES: CustomerProfile[] = [
  {
    id: 'prof_rina',
    name: 'Rina',
    appearanceId: 'female_mint',
    genderPresentation: 'female',
    hairStyle: 'ponytail',
    hairColor: 0x4b2c20,
    outfitId: 'cafe_cardigan_mint',
    shirtColor: 0x5ab4ac,
    pantsColor: 0x3b4d61,
    skinTone: 0xffdfc4,
    accessories: 'bow',
    movementSpeed: 2.85,
    patience: 42,
    eatingDuration: 4.5,
    preferredTableType: 'standard_2',
  },
  {
    id: 'prof_budi',
    name: 'Budi',
    appearanceId: 'male_denim',
    genderPresentation: 'male',
    hairStyle: 'short',
    hairColor: 0x2b2421,
    outfitId: 'polo_sky',
    shirtColor: 0x6c8ae4,
    pantsColor: 0x374151,
    skinTone: 0xf1c29b,
    accessories: 'glasses',
    movementSpeed: 2.75,
    patience: 40,
    eatingDuration: 4.8,
  },
  {
    id: 'prof_sari',
    name: 'Sari',
    appearanceId: 'female_peach',
    genderPresentation: 'female',
    hairStyle: 'bob',
    hairColor: 0x7b3f2a,
    outfitId: 'dress_apricot',
    shirtColor: 0xf6a64d,
    pantsColor: 0x7c4a32,
    skinTone: 0xffdfc4,
    accessories: 'scarf',
    movementSpeed: 2.9,
    patience: 44,
    eatingDuration: 4.4,
    preferredTableType: 'standard_2',
  },
  {
    id: 'prof_dika',
    name: 'Dika',
    appearanceId: 'male_olive',
    genderPresentation: 'male',
    hairStyle: 'cap',
    hairColor: 0x3b2f2f,
    outfitId: 'hoodie_sage',
    shirtColor: 0x86c26c,
    pantsColor: 0x334155,
    skinTone: 0xe6b58a,
    accessories: 'hat',
    movementSpeed: 3.05,
    patience: 38,
    eatingDuration: 4.2,
  },
  {
    id: 'prof_nadia',
    name: 'Nadia',
    appearanceId: 'female_berry',
    genderPresentation: 'female',
    hairStyle: 'curly',
    hairColor: 0x5d2e46,
    outfitId: 'blouse_rose',
    shirtColor: 0xeb6f92,
    pantsColor: 0x4c1d3d,
    skinTone: 0xffe4cc,
    accessories: 'bow',
    movementSpeed: 2.8,
    patience: 45,
    eatingDuration: 4.6,
  },
  {
    id: 'prof_tomi',
    name: 'Tomi',
    appearanceId: 'male_lavender',
    genderPresentation: 'male',
    hairStyle: 'curly',
    hairColor: 0x6e4728,
    outfitId: 'sweater_lilac',
    shirtColor: 0x9b7ede,
    pantsColor: 0x312e81,
    skinTone: 0xf1c29b,
    accessories: 'none',
    movementSpeed: 2.8,
    patience: 42,
    eatingDuration: 4.7,
    preferredTableType: 'family_4',
  },
  {
    id: 'prof_miko',
    name: 'Miko',
    appearanceId: 'child_sunny',
    genderPresentation: 'child',
    hairStyle: 'cap',
    hairColor: 0x5c3a28,
    outfitId: 'tee_sunny',
    shirtColor: 0xfbbf24,
    pantsColor: 0x2563eb,
    skinTone: 0xffe4cc,
    accessories: 'hat',
    movementSpeed: 3.15,
    patience: 36,
    eatingDuration: 4.0,
    preferredTableType: 'family_4',
  },
  {
    id: 'prof_lala',
    name: 'Lala',
    appearanceId: 'child_berry',
    genderPresentation: 'child',
    hairStyle: 'ponytail',
    hairColor: 0x3b2318,
    outfitId: 'overalls_pink',
    shirtColor: 0xf472b6,
    pantsColor: 0x60a5fa,
    skinTone: 0xffdfc4,
    accessories: 'bow',
    movementSpeed: 3.1,
    patience: 38,
    eatingDuration: 4.1,
    preferredTableType: 'family_4',
  },
  {
    id: 'prof_hadi',
    name: 'Hadi',
    appearanceId: 'male_coral',
    genderPresentation: 'male',
    hairStyle: 'short',
    hairColor: 0x4a3728,
    outfitId: 'shirt_coral',
    shirtColor: 0xf97316,
    pantsColor: 0x475569,
    skinTone: 0xd9a074,
    accessories: 'glasses',
    movementSpeed: 2.7,
    patience: 46,
    eatingDuration: 5.0,
  },
  {
    id: 'prof_maya',
    name: 'Maya',
    appearanceId: 'female_sky',
    genderPresentation: 'female',
    hairStyle: 'bob',
    hairColor: 0x1f2937,
    outfitId: 'top_sky',
    shirtColor: 0x38bdf8,
    pantsColor: 0x1e3a5f,
    skinTone: 0xf5cba7,
    accessories: 'scarf',
    movementSpeed: 2.9,
    patience: 43,
    eatingDuration: 4.5,
  },
];

export const DEFAULT_CUSTOMER_CONFIG: CustomerSystemConfig = {
  spawningEnabled: true,
  spawnInterval: 7.5,
  minSpawnInterval: 4.2,
  maxCustomers: 12,
  maxQueueSize: 4,
  customerSpeed: 2.85,
  queueSpacing: 1.0,
  tableSearchTimeout: 1.2,
  customerPatience: 42,
  queuePatience: 38,
  waiterPatience: 36,
  foodPatience: 48,
  billPatience: 30,
  eatingDuration: 4.5,
  seatingDuration: 0.55,
  browsingDuration: 1.5,
  standUpDuration: 0.45,
  exitDelay: 0.45,
  reservationTimeoutMs: 20_000,
  stuckTimeoutSec: 2.4,
  autoSeatFromQueue: true,
  queueOverflowPolicy: 'block_spawn',
  groupSizeWeights: [
    { size: 1, weight: 46 },
    { size: 2, weight: 36 },
    { size: 3, weight: 12 },
    { size: 4, weight: 6 },
  ],
  entrancePos: { col: ENTRANCE_DOOR_POS.col, row: ENTRANCE_DOOR_POS.row },
  exitPos: { col: ENTRANCE_DOOR_POS.col, row: ENTRANCE_DOOR_POS.row },
  queueSlots: QUEUE_SLOTS.map((q) => ({ ...q })),
};
