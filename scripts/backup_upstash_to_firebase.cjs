const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, setDoc } = require('firebase/firestore');

const UPSTASH_URL = "https://enormous-mackerel-87613.upstash.io";
const UPSTASH_TOKEN = "gQAAAAAAAVY9AAIncDFhZDhkNGNjODM5M2I0NmY5YTg5YzQwYWFhOGU3NzI2NnAxODc2MTM";

// Read .env file for Firebase configuration
const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
            env[key] = val;
        }
    }
});

const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    measurementId: env.VITE_FIREBASE_MEASUREMENT_ID
};

console.log("[Backup] Target Firebase Project:", firebaseConfig.projectId);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const getPlayerId = (username) => {
    const base = (username || 'operator').toLowerCase().replace(/[^a-z0-9]/g, '');
    let hash = 0;
    for (let i = 0; i < base.length; i++) {
        hash = (hash << 5) - hash + base.charCodeAt(i);
        hash |= 0;
    }
    const code = (Math.abs(hash) % 9000) + 1000;
    return `@${base}#${code}`;
};

const getDicebearUrl = (style, seed) => {
    return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
};

async function executeUpstash(cmd) {
    const res = await fetch(UPSTASH_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${UPSTASH_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(cmd)
    });
    if (!res.ok) {
        throw new Error(`Upstash HTTP Error: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    return data.result;
}

async function backupUpstashToFirebase() {
    console.log("[Backup] Fetching user keys from Upstash Redis...");
    const keys = await executeUpstash(['KEYS', 'aadishroulette:*']);
    console.log(`[Backup] Found ${keys.length} Upstash keys.`);

    const allProfiles = [];
    let uploadedCount = 0;
    let existingCount = 0;
    let errorCount = 0;

    for (const key of keys) {
        try {
            const raw = await executeUpstash(['GET', key]);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            const rawUsername = parsed.username || key.replace('aadishroulette:', '');
            const cleanUsername = rawUsername.trim().toLowerCase();

            const isDev = cleanUsername === 'aadish' || parsed.isDeveloper === true;
            const avatarSeed = `${cleanUsername}_${parsed.passwordHash ? parsed.passwordHash.slice(0, 4) : 'seed'}`;
            const avatarUrl = getDicebearUrl('bottts-neutral', avatarSeed);
            const playerId = getPlayerId(cleanUsername);

            const userStats = parsed.stats || {
                wins: 0,
                losses: 0,
                totalRounds: 0,
                shotsFired: 0,
                shotsHit: 0,
                selfShots: 0,
                damageDealt: 0,
                itemsUsed: 0,
                highestRound: 0,
                matchHistory: []
            };

            const userProfile = {
                uid: `upstash_${cleanUsername}_${Date.now()}`,
                username: cleanUsername,
                displayName: rawUsername.trim(),
                email: `${cleanUsername}@legacy.local`, // Legacy placeholder requiring Gmail upgrade
                avatarUrl,
                avatarStyle: 'bottts-neutral',
                avatarSeed,
                isDeveloper: isDev,
                role: isDev ? 'developer' : 'player',
                totalTimePlayed: 0,
                stats: userStats,
                needsGmailMigration: true,
                legacyPasswordHash: parsed.passwordHash || '',
                playerId,
                createdAt: Date.now(),
                lastLoginAt: Date.now()
            };

            allProfiles.push(userProfile);

            // Check if document already exists in Firestore
            const docRef = doc(db, 'users', cleanUsername);
            const snap = await getDoc(docRef);

            if (snap.exists()) {
                const existing = snap.data();
                // If it already migrated with a real email, do not overwrite email, but ensure stats and legacyPasswordHash are preserved if missing
                const updated = {
                    ...userProfile,
                    ...existing,
                    stats: existing.stats || userStats,
                    legacyPasswordHash: existing.legacyPasswordHash || parsed.passwordHash || ''
                };
                await setDoc(docRef, updated, { merge: true });
                existingCount++;
                console.log(`[Firestore] Merged existing user: ${cleanUsername}`);
            } else {
                await setDoc(docRef, userProfile);
                uploadedCount++;
                console.log(`[Firestore] Created new backed up user: ${cleanUsername}`);
            }
        } catch (err) {
            console.error(`[Backup Error] Failed for key ${key}:`, err.message);
            errorCount++;
        }
    }

    // Save JSON artifact
    const backupFilePath = path.resolve(__dirname, 'upstash_users_backup.json');
    fs.writeFileSync(backupFilePath, JSON.stringify(allProfiles, null, 2), 'utf8');
    console.log(`[Backup] Exported ${allProfiles.length} profiles to ${backupFilePath}`);

    console.log("\n================ BACKUP SUMMARY ================");
    console.log(`Total Upstash Accounts Processed: ${keys.length}`);
    console.log(`New Users Uploaded to Firebase:   ${uploadedCount}`);
    console.log(`Existing Users Merged in Firebase: ${existingCount}`);
    console.log(`Errors:                           ${errorCount}`);
    console.log("================================================\n");

    return allProfiles;
}

backupUpstashToFirebase().then(() => {
    console.log("[Backup] Upstash to Firebase backup complete!");
    process.exit(0);
}).catch(err => {
    console.error("[Backup Fatal Error]:", err);
    process.exit(1);
});
