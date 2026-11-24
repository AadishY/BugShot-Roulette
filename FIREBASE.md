# Firebase Architecture & Integration Guide — BugShot Roulette

This document provides complete instructions for configuring, managing, and maintaining the **Firebase Cloud** infrastructure for BugShot Roulette, including authentication workflows, email template specifications, custom domain setup, and state persistence.

---

## 1. System Overview

BugShot Roulette utilizes **Firebase Authentication** and **Cloud Firestore** for state persistence, player telemetry, global rankings, and identity clearance.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          BugShot Web Client                            │
├───────────────────────────────┬────────────────────────────────────────┤
│   Firebase Auth               │   Cloud Firestore                      │
│   • Email/Password & Google   │   • `users/{username}` dossiers        │
│   • Password Reset Flow       │   • Live Combat Telemetry              │
│   • Email Change Verification │   • Direct Messaging & Friend Requests │
│   • Re-authentication Checks  │   • Global Leaderboards                │
└───────────────┬───────────────┴──────────────────┬─────────────────────┘
                │                                  │
                ▼                                  ▼
┌───────────────────────────────┐  ┌─────────────────────────────────────┐
│     Firebase Auth Server      │  │        Cloud Firestore DB           │
│   • Encrypted ID Tokens       │  │        • Sub-millisecond Reads      │
│   • Email Clearance Dispatch  │  │        • Real-time Snapshot Streams │
│   • Action Codes & Expiry     │  │        • Atomic Document Merges     │
└───────────────────────────────┘  └─────────────────────────────────────┘
```

---

## 2. Environment Configuration

Add the Firebase Web configuration keys to your `.env` file (or deployment environment secrets):

```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef123456
```

> **Client Fallback:** If Firebase credentials are missing or the network is offline, the client seamlessly falls back to local storage caching so gameplay is never blocked.

---

## 3. Firebase Console Configuration

### A. Authentication Setup
1. Open the [Firebase Console](https://console.firebase.google.com/) and navigate to **Build** -> **Authentication**.
2. Click **Get Started** and enable the following sign-in providers under the **Sign-in method** tab:
   - **Email/Password**: Enable both "Email/Password" and optionally "Email link (passwordless sign-in)".
   - **Google**: Enable 1-Click Google Sign-In with your project's support email.
3. Under **Settings** -> **Authorized domains**, ensure your deployment origins are whitelisted:
   - `localhost`
   - `127.0.0.1`
   - `your-production-domain.com`
   - `your-project.firebaseapp.com`
   - `your-project.web.app`

### B. Cloud Firestore
1. Navigate to **Build** -> **Firestore Database** and click **Create Database**.
2. Select your preferred region (e.g. `nam5` or `asia-south1`).
3. Deploy the following **Security Rules** (also provided in [`firestore.rules`](file:///c:/Sony/bugshot/BugShot-Roulette/firestore.rules)):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 1. User Profiles & Stats
    match /users/{username} {
      allow read, write: if true;
    }

    // 2. Direct Messages (30-day retention)
    match /direct_messages/{messageId} {
      allow read, write: if true;
    }

    // 3. Global Broadcasts (Permanent & Immortal)
    match /broadcasts/{broadcastId} {
      allow read, write: if true;
    }

    // 4. Friend Requests
    match /friend_requests/{requestId} {
      allow read, write, delete: if true;
    }

    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

---

## 4. User Profile & Stats Schema

Each player dossier in the `users` collection is keyed by their lowercased username (`users/{username}`):

```typescript
interface UserProfile {
    uid: string;                    // Firebase Auth UID
    username: string;               // Unique codename (lowercase ID key)
    displayName: string;            // Formatted agent display name
    email: string;                  // Registered Gmail address
    avatarUrl: string;              // DiceBear or custom avatar URL
    avatarStyle: DicebearStyle;     // 'thumbs' | 'bottts' | 'personas' | 'adventurer'
    avatarSeed: string;             // Deterministic seed for avatar rendering
    isDeveloper: boolean;           // Developer clearance flag
    role: 'developer' | 'player';   // Role identifier
    totalTimePlayed: number;        // Total seconds in combat
    createdAt: number;              // Timestamp of account creation
    lastLoginAt: number;            // Unix timestamp of last login session
    lastSeenAt?: number;            // Real-time online heartbeat timestamp
    playerId?: string;              // Tag format: @username#1234
    needsGmailMigration?: boolean;  // Migration flag for legacy Upstash accounts
    stats: GameStats;               // Complete match statistics and history
}
```

### GameStats Object:
```typescript
interface GameStats {
    wins: number;
    losses: number;
    totalRounds: number;
    shotsFired: number;
    shotsHit: number;
    selfShots: number;
    damageDealt: number;
    itemsUsed: number;
    highestRound: number;
    matchHistory: MatchStats[];
}
```

---

## 5. Client Synchronization Pipeline

- **Automatic Merging**: After every completed single-player or multiplayer match, `statsManager.saveGameStats` persists the match to local storage and invokes `saveUserStatsToFirebase(username, stats)` in `utils/firebaseService.ts`.
- **Match Signatures**: Duplicate match entries are discarded using deterministic match signatures composed of timestamp, score, rounds survived, and deployed agent rosters.
- **Offline Resilience**: If the player is offline or Firebase network calls timeout, stats are safely stored in `localStorage` and will synchronize on the next authenticated session.
- **Real-Time Telemetry**: Operative activity heartbeats update `lastSeenAt` in Firestore for live online presence detection in `ProfileModal.tsx` and `MultiplayerLobby.tsx`.

---

## 6. Upstash Redis to Firebase Cloud Synchronized Accounts

All 20 player accounts from Upstash Redis have been synchronized to Firebase Firestore:

| # | Username | Status / Migration | Role | Player ID |
|---|---|---|---|---|
| 1 | `aadish` | Active (Linked to `aadish14146yadav@gmail.com`) | Developer | `@aadish#8438` |
| 2 | `akatsuki` | Active (Linked to `shreyayadav200411@gmail.com`) | Player | `@akatsuki#3984` |
| 3 | `aditya` | Upstash Migrated (`needsGmailMigration: true`) | Player | `@aditya#3170` |
| 4 | `kathir` | Upstash Migrated (`needsGmailMigration: true`) | Player | `@kathir#8533` |
| 5 | `paarth` | Upstash Migrated (`needsGmailMigration: true`) | Player | `@paarth#5866` |
| 6 | `vijay` | Upstash Migrated (`needsGmailMigration: true`) | Player | `@vijay#6527` |
| 7 | `my` | Upstash Migrated (`needsGmailMigration: true`) | Player | `@my#4500` |
| 8 | `viplord` | Upstash Migrated (`needsGmailMigration: true`) | Player | `@viplord#8898` |
| 9 | `quiet` | Upstash Migrated (`needsGmailMigration: true`) | Player | `@quiet#1402` |
| 10 | `rafa` | Upstash Migrated (`needsGmailMigration: true`) | Player | `@rafa#6971` |
| 11 | `test` | Upstash Migrated (`needsGmailMigration: true`) | Player | `@test#6639` |
| 12 | `test2` | Upstash Migrated (`needsGmailMigration: true`) | Player | `@test2#8700` |
| 13 | `priyanshu01` | Upstash Migrated (`needsGmailMigration: true`) | Player | `@priyanshu01#1425` |
| 14 | `priyanshu123` | Upstash Migrated (`needsGmailMigration: true`) | Player | `@priyanshu123#1734` |
| 15 | `heehee` | Upstash Migrated (`needsGmailMigration: true`) | Player | `@heehee#7252` |
| 16 | `kotaaaaaaa12` | Upstash Migrated (`needsGmailMigration: true`) | Player | `@kotaaaaaaa12#6971` |
| 17 | `huo_jun` | Upstash Migrated (`needsGmailMigration: true`) | Player | `@huojun#7948` |
| 18 | `fwxhsa` | Upstash Migrated (`needsGmailMigration: true`) | Player | `@fwxhsa#1782` |
| 19 | `fwxhsa666` | Upstash Migrated (`needsGmailMigration: true`) | Player | `@fwxhsa666#6384` |
| 20 | `333` | Upstash Migrated (`needsGmailMigration: true`) | Player | `@333#6643` |

---

## 7. Email Templates Specification & Console Configuration

Firebase Authentication provides an automated email dispatch engine for account security and recovery actions. Configure these templates in the Firebase Console to provide players with a seamless, tactical, and branded BugShot experience.

### Console Navigation Path
1. Open the [Firebase Console](https://console.firebase.google.com/).
2. In the left navigation menu, expand **Build** and click **Authentication**.
3. Select the **Templates** tab located between "Users" and "Usage".
4. Choose the template you wish to configure from the list:
   - **Password reset**
   - **Email address change**
   - **Email address verification**

```
Firebase Console
└── Build
    └── Authentication
        └── Templates
            ├── Password reset
            ├── Email address change
            └── Email address verification
```

---

### A. Template 1: Password Reset (Password Recovery Clearance)

#### 1. Purpose & Trigger Conditions
- **Purpose**: Allows players who forgot their password to safely regain access to their BugShot profile, match stats, and rankings.
- **Client Triggers**:
  - `sendPasswordReset(emailOrUsername)` invoked from the **Forgot Password** link on `IntroScreen.tsx`.
  - `sendPasswordReset(email)` invoked from the **Password Recovery** section under the Security tab in `ProfileModal.tsx`.
- **Firebase SDK Method**: `sendPasswordResetEmail(auth, email, actionCodeSettings?)`.
- **Link Lifetime**: Action links generated by Firebase are valid for **1 hour** by default.

#### 2. Console Configuration Fields
- **Sender Name**: `BugShot Roulette Security`
- **Sender Email**: `noreply@<your-project-id>.firebaseapp.com` (or your custom domain)
- **Reply-To**: `aadish14146yadav@gmail.com`
- **Subject**: `[BugShot Roulette] Security Clearance: Reset Your Access Key (%APP_NAME%)`

#### 3. Available Dynamic Template Variables
| Variable | Description | Example Replacement |
|---|---|---|
| `%APP_NAME%` | The application name defined in Firebase settings | `BugShot Roulette` |
| `%DISPLAY_NAME%` | The player's display name or username | `Aadish` |
| `%EMAIL%` | The recipient's registered Gmail address | `operator@gmail.com` |
| `%LINK%` | The secure, single-use action verification URL | `https://.../__/auth/action?mode=resetPassword&oobCode=...` |

#### 4. HTML Email Template (Cyber-Tactical Dark Theme)
Paste the following HTML into the Firebase Console template editor (or custom email handler):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BugShot Security: Password Reset</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0c0a09;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", monospace;
      color: #d6d3d1;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #0c0a09;
      padding: 40px 15px;
    }
    .main {
      background-color: #1c1917;
      margin: 0 auto;
      max-width: 580px;
      border: 1px solid #292524;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
    }
    .header {
      background: linear-gradient(135deg, #292524 0%, #1c1917 100%);
      padding: 28px 32px;
      border-bottom: 1px solid #44403c;
      text-align: center;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      background-color: rgba(220, 38, 38, 0.15);
      border: 1px solid #dc2626;
      color: #ef4444;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      border-radius: 6px;
      margin-bottom: 12px;
    }
    .title {
      color: #ffffff;
      font-size: 22px;
      font-weight: 900;
      letter-spacing: 1px;
      margin: 0;
      text-transform: uppercase;
    }
    .content {
      padding: 32px;
      line-height: 1.6;
      font-size: 14px;
    }
    .callout {
      background-color: #0c0a09;
      border-left: 3px solid #dc2626;
      padding: 14px 18px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
      font-size: 13px;
      color: #a8a29e;
    }
    .button-container {
      text-align: center;
      margin: 32px 0;
    }
    .action-button {
      display: inline-block;
      padding: 14px 36px;
      background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 800;
      font-size: 14px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      border-radius: 10px;
      box-shadow: 0 8px 20px rgba(220, 38, 38, 0.4);
    }
    .footer {
      background-color: #0c0a09;
      padding: 24px 32px;
      border-top: 1px solid #292524;
      font-size: 11px;
      color: #78716c;
      text-align: center;
      line-height: 1.5;
    }
    .footer strong {
      color: #a8a29e;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <table class="main" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td class="header">
          <div class="badge">SECURITY CLEARANCE // PROTOCOL RESET</div>
          <h1 class="title">BugShot Roulette</h1>
        </td>
      </tr>
      <tr>
        <td class="content">
          <p>Operative clearance requested for <strong>%EMAIL%</strong>.</p>
          <p>We received an automated request to reset the access key for your <strong>%APP_NAME%</strong> profile. Click the secure authorization button below to specify your new password:</p>
          
          <div class="button-container">
            <a href="%LINK%" target="_blank" class="action-button">Reset Access Key</a>
          </div>

          <div class="callout">
            <strong>Security Notice:</strong> This single-use authorization link expires in <strong>60 minutes</strong>. If you did not initiate this request, your access key remains safe and you can disregard this transmission.
          </div>

          <p style="font-size: 12px; color: #78716c;">
            If the button above does not activate, copy and paste this verification URL directly into your browser:<br>
            <span style="color: #ef4444; word-break: break-all;">%LINK%</span>
          </p>
        </td>
      </tr>
      <tr>
        <td class="footer">
          BugShot Roulette Terminal &bull; Developed by <strong>Aadish</strong><br>
          This automated security dispatch was sent to %EMAIL%.
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
```

#### 5. Plain Text Template Alternative
```
[BUGSHOT ROULETTE // SECURITY DIRECTIVE]

Operative clearance requested for: %EMAIL%

We received an automated request to reset the access key for your %APP_NAME% profile.
Use the secure authorization link below to set your new password:

%LINK%

SECURITY NOTICE:
- This single-use reset link expires in 60 minutes.
- If you did not request this reset, your account is secure and you can ignore this email.

BugShot Roulette Terminal
Developer: Aadish
```

---

### B. Template 2: Email Address Change (Clearance Transfer)

#### 1. Purpose & Trigger Conditions
- **Purpose**: Dispatches a verification email to a new Gmail address whenever an operative updates their linked email from `ProfileModal.tsx`.
- **Client Trigger**: `updateUserEmail(username, newEmail, currentPassword)` in `utils/firebaseService.ts`.
- **Firebase SDK Method**: `verifyBeforeUpdateEmail(auth.currentUser, cleanEmail, actionCodeSettings?)`.
- **Two-Step Security Principle**:
  1. The user requests an email transfer in the Security tab of `ProfileModal.tsx`.
  2. If session time has elapsed, the client prompts for **re-authentication confirmation** with the operative's current password.
  3. Firebase sends this verification email to the **new** address.
  4. The operative clicks `%LINK%` in the new inbox.
  5. Firebase Auth atomically updates the primary account email to the new address. If the link is never clicked, the previous email remains valid.

#### 2. Console Configuration Fields
- **Sender Name**: `BugShot Roulette Security`
- **Sender Email**: `noreply@<your-project-id>.firebaseapp.com`
- **Reply-To**: `aadish14146yadav@gmail.com`
- **Subject**: `[BugShot Roulette] Action Required: Verify your new email address for %APP_NAME%`

#### 3. Available Dynamic Template Variables
| Variable | Description | Example Replacement |
|---|---|---|
| `%APP_NAME%` | Application name | `BugShot Roulette` |
| `%DISPLAY_NAME%` | Operative display name | `Aadish` |
| `%EMAIL%` | The **new** email address awaiting verification | `new_operator@gmail.com` |
| `%LINK%` | Single-use email update confirmation URL | `https://.../__/auth/action?mode=verifyAndChangeEmail&oobCode=...` |

#### 4. HTML Email Template (Tactical Verification Dark Theme)
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BugShot Security: Verify Email Transfer</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0c0a09;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", monospace;
      color: #d6d3d1;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #0c0a09;
      padding: 40px 15px;
    }
    .main {
      background-color: #1c1917;
      margin: 0 auto;
      max-width: 580px;
      border: 1px solid #292524;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
    }
    .header {
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      padding: 28px 32px;
      border-bottom: 1px solid #334155;
      text-align: center;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      background-color: rgba(6, 182, 212, 0.15);
      border: 1px solid #06b6d4;
      color: #22d3ee;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      border-radius: 6px;
      margin-bottom: 12px;
    }
    .title {
      color: #ffffff;
      font-size: 22px;
      font-weight: 900;
      letter-spacing: 1px;
      margin: 0;
      text-transform: uppercase;
    }
    .content {
      padding: 32px;
      line-height: 1.6;
      font-size: 14px;
    }
    .callout {
      background-color: #0c0a09;
      border-left: 3px solid #06b6d4;
      padding: 14px 18px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
      font-size: 13px;
      color: #94a3b8;
    }
    .button-container {
      text-align: center;
      margin: 32px 0;
    }
    .action-button {
      display: inline-block;
      padding: 14px 36px;
      background: linear-gradient(135deg, #0891b2 0%, #0e7490 100%);
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 800;
      font-size: 14px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      border-radius: 10px;
      box-shadow: 0 8px 20px rgba(6, 182, 212, 0.35);
    }
    .footer {
      background-color: #0c0a09;
      padding: 24px 32px;
      border-top: 1px solid #292524;
      font-size: 11px;
      color: #78716c;
      text-align: center;
      line-height: 1.5;
    }
    .footer strong {
      color: #a8a29e;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <table class="main" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td class="header">
          <div class="badge">IDENTITY CLEARANCE // EMAIL TRANSFER</div>
          <h1 class="title">BugShot Roulette</h1>
        </td>
      </tr>
      <tr>
        <td class="content">
          <p>Operative clearance verification for <strong>%EMAIL%</strong>.</p>
          <p>A request was submitted to link this email address to your <strong>%APP_NAME%</strong> profile. To complete this transfer and authenticate your address, activate the confirmation link below:</p>
          
          <div class="button-container">
            <a href="%LINK%" target="_blank" class="action-button">Confirm New Email Address</a>
          </div>

          <div class="callout">
            <strong>Important:</strong> Until you confirm this transfer, your prior email address will remain bound to your account. If you did not request this update, no action is needed; your dossier remains safe.
          </div>

          <p style="font-size: 12px; color: #78716c;">
            Direct verification URL:<br>
            <span style="color: #22d3ee; word-break: break-all;">%LINK%</span>
          </p>
        </td>
      </tr>
      <tr>
        <td class="footer">
          BugShot Roulette Terminal &bull; Developed by <strong>Aadish</strong><br>
          Automated identity transfer transmission sent to %EMAIL%.
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
```

#### 5. Plain Text Template Alternative
```
[BUGSHOT ROULETTE // EMAIL TRANSFER VERIFICATION]

Operative verification for: %EMAIL%

A request was made to link this email address to your %APP_NAME% account.
To confirm this transfer and verify your email, click the link below:

%LINK%

NOTE:
If you did not authorize this change, you can safely ignore this message.
Your account credentials and prior email address will remain unchanged.

BugShot Roulette Terminal
Developer: Aadish
```

---

### C. Template 3: Email Address Verification (New Operative Verification)

#### 1. Purpose & Trigger Conditions
- **Purpose**: Verifies that a player owns the email address provided during account creation or manual verification.
- **Client Trigger**: `sendVerificationEmail()` in `utils/firebaseService.ts` or triggered post-registration.
- **Firebase SDK Method**: `sendEmailVerification(auth.currentUser, actionCodeSettings?)`.
- **Benefits**:
  - Ensures accurate player contact records.
  - Mitigates automated bot spam and illegitimate account registrations.
  - Allows unlocking verified-only badges or leaderboard clearance flags.

#### 2. Console Configuration Fields
- **Sender Name**: `BugShot Roulette`
- **Sender Email**: `noreply@<your-project-id>.firebaseapp.com`
- **Reply-To**: `aadish14146yadav@gmail.com`
- **Subject**: `[BugShot Roulette] Operative Clearance: Verify Your Email for %APP_NAME%`

#### 3. Available Dynamic Template Variables
| Variable | Description | Example Replacement |
|---|---|---|
| `%APP_NAME%` | Application name | `BugShot Roulette` |
| `%DISPLAY_NAME%` | Operative name | `Aadish` |
| `%EMAIL%` | Registered email address | `operator@gmail.com` |
| `%LINK%` | Single-use email verification URL | `https://.../__/auth/action?mode=verifyEmail&oobCode=...` |

#### 4. HTML Email Template (Emerald Clearance Theme)
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BugShot Security: Verify Your Email</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0c0a09;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", monospace;
      color: #d6d3d1;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #0c0a09;
      padding: 40px 15px;
    }
    .main {
      background-color: #1c1917;
      margin: 0 auto;
      max-width: 580px;
      border: 1px solid #292524;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
    }
    .header {
      background: linear-gradient(135deg, #064e3b 0%, #022c22 100%);
      padding: 28px 32px;
      border-bottom: 1px solid #047857;
      text-align: center;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      background-color: rgba(16, 185, 129, 0.15);
      border: 1px solid #10b981;
      color: #34d399;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      border-radius: 6px;
      margin-bottom: 12px;
    }
    .title {
      color: #ffffff;
      font-size: 22px;
      font-weight: 900;
      letter-spacing: 1px;
      margin: 0;
      text-transform: uppercase;
    }
    .content {
      padding: 32px;
      line-height: 1.6;
      font-size: 14px;
    }
    .callout {
      background-color: #0c0a09;
      border-left: 3px solid #10b981;
      padding: 14px 18px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
      font-size: 13px;
      color: #a7f3d0;
    }
    .button-container {
      text-align: center;
      margin: 32px 0;
    }
    .action-button {
      display: inline-block;
      padding: 14px 36px;
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 800;
      font-size: 14px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      border-radius: 10px;
      box-shadow: 0 8px 20px rgba(16, 185, 129, 0.35);
    }
    .footer {
      background-color: #0c0a09;
      padding: 24px 32px;
      border-top: 1px solid #292524;
      font-size: 11px;
      color: #78716c;
      text-align: center;
      line-height: 1.5;
    }
    .footer strong {
      color: #a8a29e;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <table class="main" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td class="header">
          <div class="badge">OPERATIVE REGISTRATION // CLEARANCE VERIFICATION</div>
          <h1 class="title">BugShot Roulette</h1>
        </td>
      </tr>
      <tr>
        <td class="content">
          <p>Welcome to the chamber, Operative <strong>%DISPLAY_NAME%</strong>.</p>
          <p>To finalize your profile registration and unlock verified rank status for <strong>%APP_NAME%</strong>, please confirm that this Gmail address belongs to you:</p>
          
          <div class="button-container">
            <a href="%LINK%" target="_blank" class="action-button">Verify Email Address</a>
          </div>

          <div class="callout">
            <strong>Welcome Bonus:</strong> Verifying your email ensures instant password recovery and safeguards your match records and leaderboard standings against account collisions.
          </div>

          <p style="font-size: 12px; color: #78716c;">
            Direct verification link:<br>
            <span style="color: #34d399; word-break: break-all;">%LINK%</span>
          </p>
        </td>
      </tr>
      <tr>
        <td class="footer">
          BugShot Roulette Terminal &bull; Developed by <strong>Aadish</strong><br>
          Verification clearance transmission dispatched to %EMAIL%.
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
```

#### 5. Plain Text Template Alternative
```
[BUGSHOT ROULETTE // OPERATIVE VERIFICATION]

Welcome to BugShot Roulette, Operative %DISPLAY_NAME%.

To finalize your account registration and confirm %EMAIL% as your primary address,
click the verification link below:

%LINK%

Verifying your email ensures instant password recovery and protects your global ranking records.

BugShot Roulette Terminal
Developer: Aadish
```

---

## 8. Custom Domain & SMTP Configuration (100% Inbox Placement)

By default, Firebase emails are sent from `noreply@<project-id>.firebaseapp.com`. While functional, these emails can sometimes trigger aggressive anti-spam algorithms in Gmail or Yahoo. Configuring a **custom domain** or **custom SMTP** achieves 100% delivery directly into the primary inbox.

### A. Custom Email Domain Setup in Firebase
1. In Firebase Console, navigate to **Authentication** -> **Templates**.
2. Click the **Edit icon** on any template, then click **Customize domain** (or navigate to **Settings** -> **SMTP & Custom Domain**).
3. Enter your custom sender address (e.g. `security@bugshot.aadish.dev`).
4. Firebase will generate 3 sets of DNS records that you must add to your DNS provider (Cloudflare, GoDaddy, Namecheap, etc.):
   - **TXT (SPF Record)**: Authorizes Firebase/Google servers to dispatch email on behalf of your domain.
     ```
     Type: TXT
     Host: @ (or sub-domain)
     Value: v=spf1 include:_spf.google.com ~all
     ```
   - **CNAME (DKIM Records)**: Provides cryptographic key signatures confirming message authenticity.
     ```
     Type: CNAME
     Host: firebase1._domainkey
     Value: mail-firebase1-your-domain.dkim.google.com
     ```
   - **TXT (DMARC Record)**:
     ```
     Type: TXT
     Host: _dmarc
     Value: v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@your-domain.com
     ```
5. Click **Verify**. DNS propagation typically completes within 5 to 60 minutes.

### B. Connecting a Dedicated SMTP Provider (SendGrid / Mailgun / AWS SES)
Firebase Extensions allow routing all authentication emails through a production SMTP service:
1. In Firebase Console, go to **Extensions** -> **Explore extensions**.
2. Install the official **Trigger Email from Firestore** extension or configure custom SMTP settings under **Authentication Settings**.
3. Supply your SMTP host, port (`587` / `465`), user, and API token.

---

## 9. Spam Filter Mitigations & Client UX Strategy

Automated security emails from new or development Firebase projects often encounter heuristic spam filtering. BugShot Roulette employs client-side UX safeguards to guide operatives smoothly:

### 1. Interactive Spam Notification Modals
The client includes dedicated warning dialogs triggered immediately upon dispatch:
- **`showSpamNoticeModal`** in `components/ui/ProfileModal.tsx` and `IntroScreen.tsx`:
  - Alerts players that Firebase security emails may route to the **Spam** or **Promotions** folder in Gmail.
  - Advises waiting up to 60 seconds and clicking "Report Not Spam" to guarantee future transmissions arrive in Primary.
- **`showEmailVerificationModal`** in `components/ui/ProfileModal.tsx`:
  - Explicitly shows the destination email address and reminds the player to confirm the link to finalize their email update.

### 2. Best Practices for Players
- If an email does not appear in your **Primary** inbox, check **Spam** or **Promotions**.
- Search for `BugShot Roulette` or `firebaseapp.com` in your Gmail search bar.
- Add the sender address (`noreply@<project-id>.firebaseapp.com`) to your Google Contacts to whitelist future transmissions.

---

## 10. Local Testing & Verification Checklist

To test password reset, email change, and email verification without incurring quota or sending live emails:

### A. Testing via Firebase Auth Emulator
1. Start the Firebase Local Emulator Suite:
   ```bash
   firebase emulators:start --only auth
   ```
2. Open the Emulator UI at `http://localhost:4000/auth`.
3. Dispatch a password reset or email update from the application.
4. The generated email and action link (`%LINK%`) will immediately display in the Emulator UI under the "Emails" log without sending actual messages over the internet.

### B. Production Verification Checklist
- [x] `sendPasswordReset` accepts both registered email addresses and username lookups.
- [x] `updateUserEmail` verifies email syntax and enforces single-account uniqueness.
- [x] `updateUserEmail` handles `auth/requires-recent-login` by prompting for password re-authentication.
- [x] `ProfileModal.tsx` contains interactive UI for updating Gmail address and resetting passwords.
- [x] Client displays spam notification modals for password resets and email verification links.
- [x] Full HTML and plain-text templates documented for all 3 Firebase Auth lifecycle emails.

---

*BugShot Roulette &bull; Developed by Aadish &bull; Built with React, TypeScript, Three.js, and Firebase Cloud.*
