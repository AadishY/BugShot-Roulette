# BugShot Roulette — Full Project Architecture & AI Continuation Guide

This document provides a comprehensive technical overview of the BugShot Roulette codebase for AI agents, developers, and maintainers. Consult this guide before making major architectural changes, refactoring modules, or introducing new features.

---

## 1. Project Overview & Tech Stack

BugShot Roulette is a high-fidelity psychological horror strategy web game inspired by *Buckshot Roulette*. Players gamble their lives against an intelligent dealer (or up to 3 other players in multiplayer) using a 12-gauge pump-action shotgun loaded with a hidden sequence of live and blank rounds.

- **Frontend Core**: React 18, TypeScript, Tailwind CSS, Vite 5
- **3D Graphics Engine**: Three.js (WebGL 2.0, Draco-compressed GLB models, PCF/PCFSoft shadow mapping)
- **Audio Engine**: Web Audio API (`audioManager.ts`), procedural pitch shifts, spatial panning, adaptive BGM crossfading
- **Networking & Real-Time Sync**: Socket.io (WebSocket with HTTP polling fallback), Node/Express server with rooms map
- **Persistence & Cloud Backend**: 
  - Primary: Google Firebase Auth + Firestore (`utils/firebaseService.ts`)
  - Compatibility: Upstash Redis transparent compatibility bridge (`utils/redisService.ts`)
  - Local: Offline PWA Service Worker caching (`public/sw.js`) and IndexedDB/LocalStorage fallback cache

---

## 2. Directory Structure & Key Files

```
BugShot-Roulette/
├── App.tsx                        # Root app orchestrator, top-level layout, settings, and socket bindings
├── index.html                     # HTML5 entrypoint, CRT overlay, PWA meta tags, PWA update listener
├── constants.ts                   # Game constants, item descriptions, max HP, default settings
├── types.ts                       # Complete TypeScript declarations (GameState, ItemType, Settings, Presets)
├── vite.config.ts                 # Vite bundler configuration, manual chunking, HMR ports
│
├── components/                    # Primary React components
│   ├── GameUI.tsx                 # In-match UI orchestrator (Status, Controls, Inventory, Loot, Modals)
│   ├── ThreeScene.tsx             # Three.js canvas wrapper, animation loop, resize/DPR management
│   ├── LoadingScreen.tsx          # Cybernetic initialization screen with progress and warnings
│   ├── MultiplayerLobby.tsx       # Room creation, player slot management, advanced rules/weights
│   ├── MultiplayerSelection.tsx   # Join via Room Code, Public Browser, or Quick Match
│   ├── SettingsMenu.tsx           # Graphics presets (Potato/Balanced/High/Ultra), UI scale, Audio sliders
│   ├── TutorialGuide.tsx          # Interactive in-game rulebook and item encyclopedia
│   └── ui/                        # Modular UI components
│       ├── BootScreen.tsx         # Vintage BIOS/terminal boot animation (Space/Enter/Escape to skip)
│       ├── IntroScreen.tsx        # Title screen / Main Menu (Singleplayer, Multiplayer, Modals)
│       ├── StatusDisplay.tsx      # Clean in-match HUD (Player/Dealer HP bars, chamber counter)
│       ├── Controls.tsx           # Gun grab & Shoot target controls (Opponent, Self, Seat 3/4)
│       ├── Inventory.tsx          # Player item tray with action buttons and category badges
│       ├── LootOverlay.tsx        # Turn-start item distribution cinematic overlay
│       ├── ProfileModal.tsx       # Player stats, carrier details, DiceBear avatar selector
│       ├── LeaderboardModal.tsx   # Global Firestore rankings and match performance metrics
│       ├── AdminDashboardModal.tsx# Developer diagnostics, room monitor, ban/broadcast controls
│       └── MigrationModal.tsx     # 1-click legacy Upstash -> Firebase Gmail binding modal
│
├── hooks/                         # Core game logic and networking hooks
│   ├── useGameLogic.ts            # Single-player & match state machine, chamber management, shot resolution
│   ├── useDealerAI.ts             # Minimax-inspired Dealer AI heuristic tree and item usage
│   ├── useMultiplayer.ts          # Socket.io connection, room join/leave, state sync, ping monitor
│   └── useOnlineStatus.ts         # Browser network connectivity watcher
│
├── utils/                         # Utilities and subsystems
│   ├── audioManager.ts            # Sound effects, ambient tracks, jackpot loop, volume controls
│   ├── firebaseService.ts         # Firebase Auth, Firestore queries, offline cache fallbacks
│   ├── redisService.ts            # Upstash compatibility layer (bridges calls to Firebase)
│   ├── socketOptimizer.ts         # Batching and debouncing of frequent socket emissions
│   ├── statsManager.ts            # Career statistics calculations (accuracy, win streaks, damage)
│   ├── game/                      # Gameplay logic submodules
│   │   ├── inventory.ts           # Item drop distributions, weighted pools, item usage logic
│   │   ├── itemActions.ts         # Execution of item effects (Cuffs, Saw, Inverter, Mirror, etc.)
│   │   └── shooting.ts            # Chamber shot execution, blood/flash triggers, damage calculation
│   └── three/                     # Three.js 3D rendering pipeline
│       ├── sceneSetup.ts          # Renderer creation, camera setup, scene teardown (`cleanScene`)
│       ├── lighting.ts            # 4-preset lighting rigs and shadow map size allocation
│       ├── glbPreloader.ts        # Draco-compressed GLB caching and texture atlas manager
│       ├── gun.ts                 # Shotgun model, pump animation, aiming IK
│       ├── dealer.ts              # Dealer 3D model, breathing animation, head tracking
│       ├── player.ts              # Player 3D hands and seat representation
│       └── environment.ts         # Grungy basement bunker environment, table, props
│
├── public/                        # Static assets served directly
│   ├── sw.js                      # Offline-first Service Worker with versioned caching & skipWaiting
│   ├── manifest.json              # PWA manifest (standalone, landscape-preferred)
│   ├── models/                    # Draco GLTF/GLB 3D models (shotgun, dealer, table, props)
│   └── sounds/                    # Compressed audio assets (gunshot, pump, click, heartbeat, music)
│
└── server/                        # Backend Node.js / Express server
    ├── index.js                   # WebSocket server, multiplayer room state machine, REST proxies
    └── Dockerfile                 # Container image specification for Hugging Face Spaces / Cloud Run
```

---

## 3. Core Game State Machine (`hooks/useGameLogic.ts`)

The game lifecycle flows through distinct phases defined in `types.ts`:

```
[BOOT] ───────────────► [INTRO] ───────────────► [ROUND_START]
 (BootScreen)         (IntroScreen/Menu)       (Load Chamber & Items)
                                                       │
                                                       ▼
                                                  [LOOTING]
                                            (LootOverlay distributes)
                                                       │
                                                       ▼
                                                [PLAYER_TURN] ◄──┐
                                                (or DEALER_TURN) │
                                                       │         │
                                                       ▼         │ (Chamber has shells)
                                                  [SHOOTING] ────┘
                                                       │
                                                       │ (Chamber empty or HP <= 0)
                                                       ▼
                                                  [GAME_OVER]
```

### Turn Resolution Rules:
1. **Shooting Opponent**:
   - If Live: Deals 1 damage (or 2 if `isSawedActive`). Turn transfers to opponent (unless opponent is handcuffed).
   - If Blank: Deals 0 damage. Turn transfers to opponent.
2. **Shooting Self**:
   - If Live: Deals 1 damage (or 2 if sawed). Turn transfers to opponent.
   - If Blank: Deals 0 damage. **Player retains their turn!** (Risk/Reward mechanic).
3. **Empty Chamber**:
   - When all shells in the chamber are expended, a new round starts automatically, reloading the chamber and dealing fresh items up to the inventory cap (`MAX_ITEMS = 8`).
4. **Processing Lock Watchdog**:
   - To prevent permanent UI locks during async animations or audio playbacks, `isProcessing` is protected by an 18-second watchdog timer (`processingSafetyTimeoutRef`) that automatically unlocks the game if a transition fails.

---

## 4. Item System & Vault Rules

The game supports 19 unique tactical items defined in `types.ts`.

### Active Gameplay Item Pool (`ACTIVE_ITEMS` in `constants.ts`):
| Item | Category | Effect |
| :--- | :--- | :--- |
| **`GLASS`** | Intel | Magnifies shotgun chamber to inspect the current loaded shell. |
| **`BEER`** | Eject | Racks the shotgun, cleanly ejecting the current shell without firing. |
| **`CIGS`** | Heal | Restores +1 HP (capped at `maxHp`). |
| **`CUFFS`** | Control | Handcuffs target opponent; skips their next turn. |
| **`SAW`** | Damage | Saws off the shotgun barrel; current shell deals double damage (2 HP). |
| **`PHONE`** | Intel | Mysterious call reveals the shell type at a random future chamber index. |
| **`INVERTER`** | Convert | Inverts polarity of current shell (`LIVE` ↔ `BLANK`). |
| **`BIG_INVERTER`**| Convert | Inverts polarity of **all** remaining shells in the shotgun. |
| **`ADRENALINE`** | Theft | Steals an item from the opponent's inventory for immediate use. |
| **`CHOKE`** | Mod | Tightens shotgun spread; increases lethality. |
| **`CONTRACT`** | Blood Pact | High-risk pact: doubles rewards or grants two rare high-tier items. |
| **`LUCKYCHARM`** | Luck | Permanently increases the odds of high-tier items and positive events. |
| **`FLASHBANG`** | Disruptor | Blinds opponent with blinding whiteout and audio tinnitus. |
| **`CRUSHER`** | Annihilate | Hydraulic press permanently crushes and destroys a target opponent item. |
| **`TOTEM`** | Passive Save | Automatically revives the player with 1 HP upon suffering fatal damage. |
| **`MIRROR`** | Echo | Reflects damage or echoes back opponent actions. |
| **`DECK_CARD`** | Arcana | Triggers tarot card draw (`CARD_SELECT` phase) for mystical modifiers. |
| **`JACKPOT`** | Slot Gamble | Spin the casino reels: 12% chance for 3-shot immunity, 38% for 1-shot immunity, 50% loss. |

### Vaulted / Inactive Items:
- **`REMOTE`** (Chamber Cycle): **Temporarily Vaulted from gameplay item drops.**
  - Excluded from `ACTIVE_ITEMS` and all loot distribution pools in `utils/game/inventory.ts`.
  - Maintained in `constants.ts`, `TutorialGuide.tsx`, and `types.ts` so documentation and guides remain complete.

---

## 5. 3D Graphics Engine & 4-Tier Presets (`types.ts`, `utils/three/`)

Graphics performance is strictly stratified into 4 presets selectable in `SettingsMenu.tsx`:

```
┌────────────────────────────────────────────────────────────────────────┐
│                          GRAPHICS PRESETS                             │
├─────────────────┬──────────┬──────────────┬──────────────┬─────────────┤
│ Preset          │ DPR      │ Shadow Map   │ Materials    │ Lighting    │
├─────────────────┼──────────┼──────────────┼──────────────┼─────────────┤
│ 1. Potato / Low │ <= 0.85  │ Disabled     │ MeshBasic    │ Ambient only│
│ 2. Balanced     │ <= 1.0   │ 512x512 PCF  │ MeshLambert  │ Selective   │
│ 3. High         │ <= 1.5   │ 1024x1024 PCF│ MeshStandard │ Full Rig    │
│ 4. Ultra        │ <= 2.0   │ 2048x2048 PCF│ Full PBR     │ Cinematic   │
└─────────────────┴──────────┴──────────────┴──────────────┴─────────────┘
```

### Scene Optimization Rules:
1. **Background Throttling**: When `document.hidden` is true, the `requestAnimationFrame` render loop is cancelled completely (0% CPU/GPU usage when tab is inactive).
2. **2D Modal Overlay Pausing**: When full-screen modals (`SettingsMenu`, `TutorialGuide`, `Scoreboard`) are open, `<ThreeScene isPaused={true}>` skips render calls and particle calculations.
3. **Memory Disposal**: Always call `geometry.dispose()`, `material.dispose()`, and `texture.dispose()` on model unmount or replacement. Preloaded models in `glbPreloader.ts` are cached; cloned instances must be disposed on scene teardown.
4. **Context Recovery**: Listen for `webglcontextlost` and `webglcontextrestored`. Textures and materials re-upload automatically on restored context.

---

## 6. Multiplayer Networking & Room State (`server/index.js`, `hooks/useMultiplayer.ts`)

- **Topology**: Client-Server with room-scoped message broadcasting.
- **Perspective Inversion**: For 2-player matches, the remote player sees themselves as `PLAYER` and their rival as `DEALER`. Perspective coordinates and turn owner tags are inverted automatically before UI consumption.
- **Authoritative Flow**:
  - The Room Host generates the randomized shell chamber and item loot batches and broadcasts them via `SYNC_STATE` or `GAME_START`.
  - Non-host clients send action intents (`FIRE_SHOT`, `USE_ITEM`), which the host executes and synchronizes.
- **Heartbeat & Resiliency**:
  - 25-second ping-pong heartbeat keeps WebSocket connections alive through Cloudflare and Hugging Face proxies.
  - Automatic reconnection backoff (up to 5 attempts) restores match session if temporary packet loss occurs.

---

## 7. PWA, Service Worker & Offline Playability (`public/sw.js`)

- **Cache Versioning**: Cache keys increment with each release (e.g., `bugshot-v7-assets`, `bugshot-v7-models`).
- **Immediate Takeover**: `self.skipWaiting()` is called on install and `clients.claim()` on activate so new updates take effect without requiring manual cache clears.
- **Update Notification**: `index.html` listens for `navigator.serviceWorker.oncontrollerchange` to notify the user or reload smoothly when a new build is deployed.
- **Offline Single-Player**: Core JavaScript bundles, CSS, fonts, audio files, and 3D Draco models are stored in cache-first storage, enabling full single-player gameplay without an internet connection.

---

## 8. Guidelines for Future AI Assistants & Developers

1. **Protect the In-Match HUD**: Do NOT restore combat logs or persistent "X LIVE, Y BLANK" pill meters to the center of `StatusDisplay.tsx`. The in-match HUD must remain minimal and suspenseful, displaying only the total shell count (`liveCount + blankCount`).
2. **Clean Event Cleanup**: Every `useEffect` that attaches a listener (`window.addEventListener`), starts a timer (`setTimeout`/`setInterval`), or creates an AudioContext must return a comprehensive cleanup callback.
3. **Safe Processing Locks**: Never set `isProcessing(true)` without a matching `try / finally` or watchdog timeout that guarantees `isProcessing(false)` is reached.
4. **Preserve Compatibility**: Keep `utils/redisService.ts` and legacy user schemas intact. Never delete legacy Upstash fallback bindings in `utils/firebaseService.ts`.
5. **Always Verify Builds**: Run `npx tsc --noEmit && npm run build` before concluding any turn to guarantee 0 TypeScript errors and clean bundle output.
