# LOVE KITCHEN – 2.5D Co-Op Restaurant Rush

Game restoran cooperative multiplayer 2 pemain bergaya **2.5D Isometric Cartoon** menggunakan **Phaser 3**, **TypeScript**, **Vite**, **Node.js + Express + Socket.IO**, **PWA**, dan persistensi cloud.

## Fitur Utama

- **9 Scene Lengkap (Phaser 3)**:
  1. `BootScene`
  2. `PreloadScene` (loading screen + generator sprite 2.5D cartoon)
  3. `MainMenuScene` (logo, ilustrasi Chef & Waiter, Play Online, Create Room, Join Room, Settings, How To Play)
  4. `LobbyScene` (room code real-time, matchmaking online, dan opsi Solo Practice)
  5. `CharacterSelectionScene` (pemilihan peran Player 1 Chef Cowok & Player 2 Waiter Wanita + Ready sync)
  6. `RestaurantScene` (gameplay 2.5D isometric real-time co-op dengan dapur & ruang makan)
  7. `PauseScene` (jeda tersinkronisasi)
  8. `ResultScene` (bintang 0–3, rincian skor, bonus tip, rematch, dan leaderboard)
  9. `SettingsScene` (master/musik/SFX slider, mute, uji suara, profil pemain, dan install PWA)
- **Multiplayer Real-Time (Socket.IO)**:
  - Server otoritatif (`server/multiplayer/RoomManager.ts` & `GameSimulation.ts`).
  - Matchmaking `PLAY ONLINE`, `CREATE ROOM` dengan kode 6 karakter, dan `JOIN ROOM`.
  - Mode `Solo Practice` opsional agar 1 pemain dapat mencoba kontrol Chef & Waiter sekaligus (tekan `Tab` atau tombol Swap).
- **Gameplay Co-Op 2 Peran**:
  - **Player 1 (Chef Cowok)**: Mengambil bahan mentah, memasak di Grill/Pot/Oven/Wok, mencegah gosong, membuang makanan gosong, dan meletakkan hidangan siap saji ke Serving Pass.
  - **Player 2 (Waiter Wanita)**: Menyambut & mendudukkan tamu, mencatat pesanan ke antrean dapur, mengambil hidangan dari Serving Pass, mengantar ke meja, menerima pembayaran + tip, dan membersihkan meja kotor.
- **PWA Siap Install di Android & Desktop**:
  - Web App Manifest (`vite-plugin-pwa`), service worker Workbox, ikon 192px/512px/maskable/apple-touch-icon, indikator offline, dan tombol **Install PWA** langsung di UI.

## Struktur Folder

```text
├── server.ts                         # Express + HTTP + Socket.IO + Vite server (Port 3000)
├── server/
│   └── multiplayer/
│       ├── GameSimulation.ts         # Simulasi dapur & ruang makan otoritatif
│       └── RoomManager.ts            # Manajemen room, matchmaking, role & sync
├── public/                           # Ikon PWA (SVG & PNG 180/192/512/maskable)
├── src/
│   ├── shared/                       # Tipe TypeScript, resep menu, dan peta layout 12x8
│   ├── services/                     # Firebase Auth & Firestore persistence
│   ├── hooks/                        # usePWAInstall, useOnlineStatus
│   ├── components/                   # GameShell, PWAInstallButton, OfflineIndicator, screens/*
│   └── game/
│       ├── config/phaserConfig.ts    # Konfigurasi Phaser 3 responsive 16:9
│       ├── assets/ProceduralAssets.ts# Generator sprite 2.5D isometric cartoon
│       ├── scenes/                   # 9 Phaser 3 scenes
│       └── systems/                  # audio, character, customer, kitchen, cooking, order, restaurant, multiplayer, ui
└── firestore.rules                   # Aturan keamanan Firestore tervalidasi ESLint
```

## Cara Instalasi & Menjalankan

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Salin konfigurasi environment**:
   ```bash
   cp .env.example .env
   ```

3. **Jalankan mode development (Frontend Vite + Backend Socket.IO di port 3000)**:
   ```bash
   npm run dev
   ```
   Buka `http://localhost:3000` di browser atau di dua tab berbeda untuk mencoba Co-Op 2 pemain secara langsung.

4. **TypeScript Check & Production Build**:
   ```bash
   npm run lint
   npm run build
   npm start
   ```
