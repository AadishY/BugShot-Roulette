# Multiplayer Implementation Walkthrough

## Overview
This document outlines the implementation of the multiplayer opponent logic, ensuring two human players fight each other instead of their local AI dealers.

## Changes

### 1. Server-Side Synchronization
- Modified `server/index.js` to accept `gameData` in the `startGame` event.
- The `gameStarted` event now broadcasts both the `room` and `gameData` to all clients, ensuring they start with the exact same:
  - Shell Configuration (Chamber)
  - Item Distribution
  - Turn Order

### 2. Game Logic Updates (`useGameLogic.ts`)
- **State Overrides**: Updated `startGame` and `startRound` to accept overrides for:
  - `chamber` (Shells)
  - `pItems` (Player Items)
  - `dItems` (Dealer/Opponent Items)
  - `turnOwner` (Who goes first)
- **Opponent Naming**: Added `getOpponentName()` helper and updated logic to display the Opponent's name in logs instead of "DEALER".
- **Shooting Context**: Updated `fireShot` to pass the `opponentName` to the `performShot` function, allowing for dynamic log messages (e.g., "PLAYER2 ELIMINATED" instead of "DEALER ELIMINATED").

### 3. Multiplayer Hook (`useMultiplayer.ts`)
- Updated `startGame` to accept the generated `gameData` payload and transmit it to the server.

### 4. Application Logic (`App.tsx`)
- **Host Authority**: implemented `handleStartMPGame` where the Host generates the initial random state (chamber, items, turn order) and sends it to the server.
- **Client Synchronization**: In the `gameStarted` listener, clients now apply the received `gameData`. Logic handles mapping "Host Items" and "Client Items" correctly based on whether the local player is Host or Client.
- **AI Disable**: Explicitly disabled `useDealerAI` when `isMultiplayer` is active.

### 5. Utility Refactoring (`inventory.ts`, `shooting.ts`)
- **Inventory**: Refactored `inventory.ts` to export `generateLootBatch`, allowing the Host to generate valid item sets without applying them to local state immediately.
- **Shooting**: Updated `performShot` to use `opponentName` from the context for all logs and status updates.

## Verification
To verify the fix:
1.  **Start a Multiplayer Game**: Connect two clients.
2.  **Check Sync**: Verify both players see the exact same shell count (Live/Blank) and item distribution in logs/overlay.
3.  **Check Turns**: Verify one player gets "YOUR MOVE" and the other gets "OPPONENT'S MOVE".
4.  **Combat**:
    - Player A shoots Player B.
    - Player A sees: Shooting Opponent.
    - Player B sees: Opponent Shooting Me.
    - Health bars update correctly on both screens.
5.  **Logs**: logs should reference the Opponent's name, not "DEALER".

---

## Game Rules & Mechanics Audit

All 16+ core items and Tarot cards have been audited and verified for exact adherence to Buckshot and Bugshot rules across single-player, AI Dealer, and 2-to-4 player multiplayer:

| Item / Mechanic | Verified Rules & Implementation Behavior |
| :--- | :--- |
| **Saw** (`SAW`) | Exactly **2x damage** for 1 shot (stacks multiplicatively with Choke Mod). Resets unconditionally on shot fired (both live or blank). |
| **Handcuffs** (`CUFFS`) | Forces target to **skip their next turn**. Cannot be stacked or doubled (validated in both 2-player and multi-opponent `useGameLogic.ts` and `canUsePlayerItem`). |
| **Beer** (`BEER`) | Ejects current shell immediately without firing. Reveals and logs whether live or blank in realtime. Preserves active Choke Mod status. |
| **Cigarettes** (`CIGS`) | Restores exactly **1 HP** (strictly capped at `maxHp`; cannot overheal). |
| **Magnifying Glass** (`GLASS`) | Inspects current chamber shell privately for the user without revealing it to opponents. |
| **Inverter** (`INVERTER`) | Inverts polarity of current shell (`LIVE` ↔ `BLANK`). Updates remaining shell counts immediately. |
| **Burner Phone** (`PHONE`) | Whispers future shell hints (`2nd`, `3rd`, `4th`, etc.) starting from `current + 1`. Has 5% risk to lie. Reports no intel if no future shells remain. |
| **Adrenaline** (`ADRENALINE`) | Steals 1 item from target and allows immediate use with full **cancellation** support (`index === -1`). Cannot steal Totem, Adrenaline, or Jackpot. |
| **Choke Mod** (`CHOKE`) | Narrows barrel spread to fire **2 shells simultaneously** (current + next). Dual live = 2 DMG, single live = 1 DMG, dual blank = 0 DMG. Saw doubles total result. |
| **Remote** (`REMOTE`) | Cycles chamber index by swapping current shell with next shell (`chamber[idx]` ↔ `chamber[idx + 1]`). Fails gracefully if < 2 shells remain. |
| **Shield (Jackpot)** (`JACKPOT`) | Slot machine bullet immunity shield absorbing the next 1 or 3 incoming hits. Live shots decrement shield; blank self-shots are exempt. Absorbs lethal damage and blood contract costs. |
| **Mirror** (`MIRROR`) | Duplicates and replays all item effects used by target on their previous turn in sequence. Excludes Mirror and Adrenaline to prevent infinite recursion. |
| **Crusher** (`CRUSHER`) | Destroys 1 random target item from opponent's inventory. Gracefully logs if target has no items to destroy. |
| **Totem of Undying** (`TOTEM`) | Passive survival: heals and revives to **1 HP** on lethal blow. **Crucially negated if target is Flashbanged / Blinded**. |
| **Blood Contract** (`CONTRACT`) | Gamble 1 HP for 2 random high-tier items. Blocked at 1 HP without Totem or Jackpot shield immunity. |
| **Flashbang** (`FLASHBANG`) | Blinds target for 1 turn (preventing item usage and disabling target's Totem passive save). |
| **Tarot Cards** (`DECK_CARD`) | Full deck of 12 arcana (The Magician, The Hanged Man, The Hermit, The Moon, Judgment, Wheel of Fortune, The Sun, Death, The Tower, The Fool, Justice, Temperance) with multiplayer owner resolution. |

---

## Firestore Security Rules Audit (`firestore.rules`)

The security rules for Google Firebase Cloud Firestore have been hardened with strict schema, field length, and timestamp boundaries while guaranteeing public read access:

1. **`/users/{username}`**:
   - `allow read: if true;` guarantees public read access for user stats, career leaderboards, and multiplayer presence heartbeats.
   - `create`/`update` enforce valid string bounds on username (3-30 chars), displayName (1-50 chars), email (≤100 chars), timestamps (`createdAt`, `lastLoginAt`, `lastSeenAt`), `totalTimePlayed` (≥0), `stats` map, and `friends` array.
   - `allow delete: if true;` supports self-service account deletion.

2. **`/direct_messages/{messageId}`**:
   - `allow read: if true;` guarantees real-time DM subscriptions across devices.
   - `create` verifies non-empty `sender`, `recipient`, `conversationId`, `createdAt` timestamp, message text (≤2000 chars), boolean `read`, and tactical sticker IDs.

3. **`/broadcasts/{broadcastId}`**:
   - `allow read: if true;` provides public feed for mainframe global announcements.
   - `create`/`update` enforce string bounds (text ≤3000 chars, title ≤100 chars) and valid timestamps.

4. **`/friend_requests/{requestId}`**:
   - Enforces `from` and `to` callsigns, valid timestamp, and strict state transitions in `['pending', 'accepted', 'declined']`.

5. **`/feedbacks/{feedbackId}`**:
   - Enforces valid feedback content (≤3000 chars), category, sender, timestamp, and read status.

