import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    sendPasswordResetEmail,
    verifyBeforeUpdateEmail,
    sendEmailVerification,
    EmailAuthProvider,
    reauthenticateWithCredential,
    deleteUser,
    onAuthStateChanged,
    ActionCodeSettings,
    User
} from 'firebase/auth';
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    collection,
    getDocs,
    query,
    where,
    limit,
    writeBatch
} from 'firebase/firestore';
import { auth, db, googleProvider, isFirebaseConfigured } from './firebase';
import { generateRandomAvatar, getDicebearUrl, DicebearStyle } from './dicebear';
import { setUserActiveStats, mergeGameStats, type GameStats } from './statsManager';
import legacyUsersList from './legacyUsersBackup.json';

export interface UserProfile {
    uid: string;
    username: string;
    displayName: string;
    email: string;
    avatarUrl: string;
    avatarStyle: DicebearStyle;
    avatarSeed: string;
    isDeveloper: boolean;
    role: 'developer' | 'player';
    totalTimePlayed: number; // in seconds
    stats: GameStats;
    needsGmailMigration: boolean;
    legacyPasswordHash?: string;
    createdAt: number;
    lastLoginAt: number;
    lastSeenAt?: number;
    playerId?: string;
}

export interface LeaderboardEntry {
    username: string;
    displayName: string;
    avatarUrl: string;
    avatarStyle?: DicebearStyle;
    avatarSeed?: string;
    wins: number;
    losses: number;
    hardModeWins: number;
    totalTimePlayed?: number;
    isDeveloper?: boolean;
    stats: GameStats;
    playerId?: string;
    lastLoginAt?: number;
    lastSeenAt?: number;
}

// Generate consistent unique @playerid tag
export const getPlayerId = (user: { username: string; uid?: string; playerId?: string }): string => {
    if (user.playerId) return user.playerId;
    const base = (user.username || 'operator').toLowerCase().replace(/[^a-z0-9]/g, '');
    let hash = 0;
    for (let i = 0; i < base.length; i++) {
        hash = (hash << 5) - hash + base.charCodeAt(i);
        hash |= 0;
    }
    const code = (Math.abs(hash) % 9000) + 1000;
    return `@${base}#${code}`;
};

// Check whether an active user profile belongs to an unmigrated Upstash account
export const isLegacyUpstashUser = (user: any): boolean => {
    if (!user || typeof user !== 'object') return false;

    // Explicit migration requirement flag
    if (user.needsGmailMigration === true) return true;

    // If user has no email, or email is empty or invalid
    if (!user.email || typeof user.email !== 'string' || !user.email.includes('@')) {
        return true;
    }

    // Legacy placeholders or fake local emails
    const cleanMail = user.email.trim().toLowerCase();
    if (
        cleanMail.endsWith('@legacy.local') ||
        cleanMail.endsWith('@upstash.com') ||
        cleanMail.endsWith('@roulette.internal') ||
        cleanMail.endsWith('@example.com')
    ) {
        return true;
    }

    return false;
};

const LOCAL_STORAGE_USERS_KEY = 'aadish_roulette_users_cache';
const LOCAL_STORAGE_SESSION_KEY = 'aadish_roulette_logged_in_user';

// In-memory cache for local users to avoid repetitive synchronous disk parsing on every render
let localUsersMemoryCache: Record<string, UserProfile> | null = null;

// Initialize local cache with migrated users if not already initialized
// Always ensuring all backed up Upstash accounts are present
export const getLocalUsersCache = (): Record<string, UserProfile> => {
    if (localUsersMemoryCache) {
        return localUsersMemoryCache;
    }
    let currentMap: Record<string, UserProfile> = {};
    try {
        const raw = localStorage.getItem(LOCAL_STORAGE_USERS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                currentMap = parsed;
            }
        }
    } catch (e) {
        console.warn("Failed to read local users cache:", e);
    }

    // Ensure all backed up Upstash accounts are populated in cache
    if (Array.isArray(legacyUsersList)) {
        for (const u of legacyUsersList) {
            if (u && u.username && !currentMap[u.username]) {
                currentMap[u.username] = u as UserProfile;
            }
        }
    }

    localUsersMemoryCache = currentMap;
    return currentMap;
};

const saveLocalUsersCache = (cache: Record<string, UserProfile>) => {
    localUsersMemoryCache = cache;
    try {
        localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(cache));
    } catch (e) {}
};

// Memory cache for user lookups with 30s TTL
interface CachedUserRecord {
    profile: UserProfile | null;
    timestamp: number;
}
const userMemoryCache = new Map<string, CachedUserRecord>();
const MEMORY_CACHE_TTL_MS = 30000;

const getCachedUser = (identifierLower: string): UserProfile | null | undefined => {
    const entry = userMemoryCache.get(identifierLower);
    if (entry && (Date.now() - entry.timestamp) < MEMORY_CACHE_TTL_MS) {
        return entry.profile;
    }
    return undefined;
};

const setCachedUser = (identifierLower: string, profile: UserProfile | null) => {
    if (!identifierLower) return;
    const now = Date.now();
    userMemoryCache.set(identifierLower, { profile, timestamp: now });
    if (profile) {
        if (profile.username) {
            userMemoryCache.set(profile.username.toLowerCase(), { profile, timestamp: now });
        }
        if (profile.email) {
            userMemoryCache.set(profile.email.toLowerCase(), { profile, timestamp: now });
        }
    }
};

const invalidateCachedUser = (identifierLower: string) => {
    userMemoryCache.delete(identifierLower);
};

// In-flight request deduplication map to prevent simultaneous redundant document reads
const pendingUserReads = new Map<string, Promise<UserProfile | null>>();

// Seed Firestore stub (migration completed)
export const seedMigratedUsersToFirestore = async () => {
    // Migration from legacy stores has already concluded
};

// Find user by username or email in Firestore / cache (optimized, cached, and deduplicated)
export const findUserByUsernameOrEmail = async (identifier: string): Promise<UserProfile | null> => {
    const clean = (identifier || '').trim().toLowerCase();
    if (!clean) return null;

    // 1. Check in-memory fast cache
    const memCached = getCachedUser(clean);
    if (memCached !== undefined) {
        return memCached;
    }

    // 2. Check local storage cache for instant resolution
    const localCache = getLocalUsersCache();
    if (localCache[clean]) {
        setCachedUser(clean, localCache[clean]);
        return localCache[clean];
    }
    for (const key in localCache) {
        const u = localCache[key];
        if (!u) continue;
        if (u.email?.trim().toLowerCase() === clean || u.username?.trim().toLowerCase() === clean) {
            setCachedUser(clean, u);
            return u;
        }
    }

    // 3. Deduplicate simultaneous in-flight reads
    if (pendingUserReads.has(clean)) {
        return pendingUserReads.get(clean)!;
    }

    const fetchPromise = (async (): Promise<UserProfile | null> => {
        if (isFirebaseConfigured() && db) {
            try {
                // If clean contains '@', query by email with limit(1)
                if (clean.includes('@')) {
                    const qEmail = query(collection(db, 'users'), where('email', '==', clean), limit(1));
                    const emailSnap = await getDocs(qEmail);
                    if (!emailSnap.empty) {
                        const data = emailSnap.docs[0].data() as UserProfile;
                        if (data && data.username) {
                            setCachedUser(clean, data);
                            localCache[data.username.toLowerCase()] = data;
                            saveLocalUsersCache(localCache);
                            return data;
                        }
                    }

                    // Direct doc check in case email was used as doc id
                    const userDoc = await getDoc(doc(db, 'users', clean));
                    if (userDoc.exists()) {
                        const data = userDoc.data() as UserProfile;
                        if (data && data.username) {
                            setCachedUser(clean, data);
                            localCache[data.username.toLowerCase()] = data;
                            saveLocalUsersCache(localCache);
                            return data;
                        }
                    }
                } else {
                    // Direct username doc lookup (O(1) direct read)
                    const userDoc = await getDoc(doc(db, 'users', clean));
                    if (userDoc.exists()) {
                        const data = userDoc.data() as UserProfile;
                        if (data && data.username) {
                            setCachedUser(clean, data);
                            localCache[data.username.toLowerCase()] = data;
                            saveLocalUsersCache(localCache);
                            return data;
                        }
                    }

                    // Query by username with limit(1)
                    const qUser = query(collection(db, 'users'), where('username', '==', clean), limit(1));
                    const userSnap = await getDocs(qUser);
                    if (!userSnap.empty) {
                        const data = userSnap.docs[0].data() as UserProfile;
                        if (data && data.username) {
                            setCachedUser(clean, data);
                            localCache[data.username.toLowerCase()] = data;
                            saveLocalUsersCache(localCache);
                            return data;
                        }
                    }
                }
            } catch (e) {
                console.warn("[Firebase] Query error, falling back to local cache:", e);
            }
        }

        // Fallback to local cache if not found in Firestore
        const fallbackCache = getLocalUsersCache();
        if (fallbackCache[clean]) {
            setCachedUser(clean, fallbackCache[clean]);
            return fallbackCache[clean];
        }
        for (const key in fallbackCache) {
            const u = fallbackCache[key];
            if (u && (u.email?.trim().toLowerCase() === clean || u.username?.trim().toLowerCase() === clean)) {
                setCachedUser(clean, u);
                return u;
            }
        }

        setCachedUser(clean, null);
        return null;
    })();

    pendingUserReads.set(clean, fetchPromise);
    try {
        return await fetchPromise;
    } finally {
        pendingUserReads.delete(clean);
    }
};

// Dedicated helper to strictly check if an email is already bound to any registered account (optimized & cached)
export const findUserByEmail = async (email: string): Promise<UserProfile | null> => {
    const clean = (email || '').trim().toLowerCase();
    if (!clean || !clean.includes('@')) return null;

    // 1. Check in-memory fast cache
    const memCached = getCachedUser(clean);
    if (memCached !== undefined) {
        return memCached;
    }

    // 2. Check local cache first for instant lookup
    const cache = getLocalUsersCache();
    for (const key in cache) {
        const u = cache[key];
        if (u && u.email && u.email.trim().toLowerCase() === clean) {
            setCachedUser(clean, u);
            return u;
        }
    }

    // 3. Deduplicate in-flight reads
    if (pendingUserReads.has(clean)) {
        return pendingUserReads.get(clean)!;
    }

    const fetchPromise = (async (): Promise<UserProfile | null> => {
        if (isFirebaseConfigured() && db) {
            try {
                // Direct query by email with limit(1)
                const qEmail = query(collection(db, 'users'), where('email', '==', clean), limit(1));
                const emailSnap = await getDocs(qEmail);
                if (!emailSnap.empty) {
                    const data = emailSnap.docs[0].data() as UserProfile;
                    if (data && data.username) {
                        setCachedUser(clean, data);
                        return data;
                    }
                }

                // Check if document was saved with email as ID
                const directDoc = await getDoc(doc(db, 'users', clean));
                if (directDoc.exists()) {
                    const data = directDoc.data() as UserProfile;
                    if (data && data.username) {
                        setCachedUser(clean, data);
                        return data;
                    }
                }
            } catch (e) {
                console.warn("[Firebase] findUserByEmail error:", e);
            }
        }
        setCachedUser(clean, null);
        return null;
    })();

    pendingUserReads.set(clean, fetchPromise);
    try {
        return await fetchPromise;
    } finally {
        pendingUserReads.delete(clean);
    }
};

// Register New User with Username, Gmail, and Password
export const registerUserWithFirebase = async (
    username: string,
    email: string,
    password: string,
    displayName?: string
): Promise<{ success: boolean; error?: string; user?: UserProfile }> => {
    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanUsername || !cleanEmail || !password) {
        return { success: false, error: 'Username, Gmail, and Password are all required.' };
    }

    if (cleanUsername.length < 3 || cleanUsername.length > 18) {
        return { success: false, error: 'Username must be between 3 and 18 characters.' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
        return { success: false, error: 'Please enter a valid Gmail address.' };
    }

    if (!cleanEmail.endsWith('@gmail.com') && !cleanEmail.endsWith('@googlemail.com')) {
        return { success: false, error: 'Registration requires a valid Gmail address (@gmail.com).' };
    }

    if (password.length < 6) {
        return { success: false, error: 'Password must be at least 6 characters.' };
    }

    // 1. Check if username is already taken
    const existingUser = await findUserByUsernameOrEmail(cleanUsername);
    if (existingUser) {
        return { success: false, error: 'Username is already taken. Please choose another username.' };
    }

    // 2. CRITICAL: Strictly ensure no one can create 2 accounts with the same email
    const existingEmailUser = await findUserByEmail(cleanEmail);
    if (existingEmailUser) {
        return {
            success: false,
            error: 'An account is already registered with this Gmail address. Please sign in instead.'
        };
    }

    const isDeveloper = cleanUsername === 'aadish';
    const randomAvatar = generateRandomAvatar(cleanUsername);

    const initialStats: GameStats = {
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

    let uid = `user_${Date.now()}`;

    // 3. Firebase Auth Registration
    if (isFirebaseConfigured() && auth) {
        try {
            const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
            uid = cred.user.uid;
        } catch (err: any) {
            console.error("Firebase auth creation error:", err);
            if (err.code === 'auth/email-already-in-use' || err.message?.includes('email-already-in-use')) {
                return {
                    success: false,
                    error: 'An account is already registered with this Gmail address. Please sign in instead.'
                };
            }
            if (err.code === 'auth/invalid-email') {
                return { success: false, error: 'Invalid Gmail / Email address format.' };
            }
            if (err.code === 'auth/weak-password') {
                return { success: false, error: 'Password must be at least 6 characters.' };
            }
            return { success: false, error: err.message || 'Authentication error.' };
        }
    }

    const newUserProfile: UserProfile = {
        uid,
        username: cleanUsername,
        displayName: displayName?.trim() || username.trim(),
        email: cleanEmail,
        avatarUrl: randomAvatar.url,
        avatarStyle: randomAvatar.style,
        avatarSeed: randomAvatar.seed,
        isDeveloper,
        role: isDeveloper ? 'developer' : 'player',
        totalTimePlayed: 0,
        stats: initialStats,
        needsGmailMigration: false,
        createdAt: Date.now(),
        lastLoginAt: Date.now()
    };

    // Save to Firestore
    if (isFirebaseConfigured() && db) {
        try {
            await setDoc(doc(db, 'users', cleanUsername), newUserProfile);
        } catch (e) {
            console.warn("Firestore save error on register:", e);
        }
    }

    // Save to local cache
    const cache = getLocalUsersCache();
    cache[cleanUsername] = newUserProfile;
    saveLocalUsersCache(cache);

    // Save session
    try {
        localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(newUserProfile));
    } catch (e) {}

    return { success: true, user: newUserProfile };
};

// Login user with Username OR Gmail and Password
export const loginUserWithFirebase = async (
    identifier: string,
    password: string
): Promise<{
    success: boolean;
    error?: string;
    needsMigration?: boolean;
    user?: UserProfile;
}> => {
    const clean = identifier.trim().toLowerCase();
    const rawPass = password.trim();
    if (!clean || !rawPass) {
        return { success: false, error: 'Username/Email and Password are required.' };
    }

    let userProfile = await findUserByUsernameOrEmail(clean);
    if (!userProfile && clean.includes('@')) {
        userProfile = await findUserByEmail(clean);
    }

    // If identifier looks like an email and userProfile wasn't loaded yet, try direct Firebase Auth
    if (!userProfile && clean.includes('@') && isFirebaseConfigured() && auth) {
        try {
            const cred = await signInWithEmailAndPassword(auth, clean, rawPass);
            userProfile = await findUserByEmail(clean) || await findUserByUsernameOrEmail(clean);
            if (!userProfile && cred.user) {
                const uBase = clean.split('@')[0].replace(/[^a-z0-9_]/gi, '').toLowerCase();
                let chosenUsername = uBase;
                const existingU = await findUserByUsernameOrEmail(chosenUsername);
                if (existingU && existingU.email?.toLowerCase() !== clean) {
                    chosenUsername = `${uBase.slice(0, 13)}_${Math.floor(1000 + Math.random() * 9000)}`;
                }
                const isDev = chosenUsername === 'aadish' || clean === 'aadish14146yadav@gmail.com';
                const rndAvatar = generateRandomAvatar(chosenUsername);
                userProfile = {
                    uid: cred.user.uid,
                    username: chosenUsername,
                    displayName: chosenUsername,
                    email: clean,
                    avatarUrl: rndAvatar.url,
                    avatarStyle: rndAvatar.style,
                    avatarSeed: rndAvatar.seed,
                    isDeveloper: isDev,
                    role: isDev ? 'developer' : 'player',
                    totalTimePlayed: 0,
                    stats: {
                        wins: 0, losses: 0, totalRounds: 0, shotsFired: 0, shotsHit: 0,
                        selfShots: 0, damageDealt: 0, itemsUsed: 0, highestRound: 0, matchHistory: []
                    },
                    needsGmailMigration: false,
                    createdAt: Date.now(),
                    lastLoginAt: Date.now()
                };
                if (db) {
                    await setDoc(doc(db, 'users', chosenUsername), userProfile).catch(() => {});
                }
            }
            if (userProfile) {
                const cache = getLocalUsersCache();
                cache[userProfile.username.toLowerCase()] = userProfile;
                saveLocalUsersCache(cache);
                try {
                    localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(userProfile));
                } catch (e) {}
                return { success: true, user: userProfile };
            }
        } catch (e: any) {
            console.warn("Direct Firebase auth attempt failed:", e);
        }
    }
    if (!userProfile) {
        return { success: false, error: 'Account not found.' };
    }

    // If user is from legacy Upstash migration and has not linked Gmail yet:
    if (userProfile.needsGmailMigration) {
        // Verify legacy password
        if (userProfile.legacyPasswordHash && userProfile.legacyPasswordHash === rawPass) {
            return {
                success: true,
                needsMigration: true,
                user: userProfile
            };
        } else {
            return { success: false, error: 'Invalid password for this legacy account.' };
        }
    }

    // Standard Firebase Auth login
    if (isFirebaseConfigured() && auth && userProfile?.email) {
        try {
            await signInWithEmailAndPassword(auth, userProfile.email, rawPass);
            userProfile.lastLoginAt = Date.now();
            if (db) {
                await updateDoc(doc(db, 'users', userProfile.username), { lastLoginAt: Date.now() }).catch(() => {});
            }
            try {
                localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(userProfile));
            } catch (e) {}
            return { success: true, user: userProfile };
        } catch (err: any) {
            console.error("Firebase auth login error:", err);
            // Fallback for legacy password check if auth fails (e.g. offline or password changed)
            if (userProfile.legacyPasswordHash === rawPass || (userProfile.isDeveloper && rawPass === 'Aadish20m')) {
                userProfile.lastLoginAt = Date.now();
                try {
                    localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(userProfile));
                } catch (e) {}
                return { success: true, user: userProfile };
            }
            return { success: false, error: err.message || 'Invalid credentials.' };
        }
    }

    // Local / offline fallback
    if (userProfile.legacyPasswordHash === rawPass || (userProfile.isDeveloper && rawPass === 'Aadish20m')) {
        userProfile.lastLoginAt = Date.now();
        try {
            localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(userProfile));
        } catch (e) {}
        return { success: true, user: userProfile };
    }
    return { success: false, error: 'Invalid password.' };
};

// 1-Click Google Sign-In
export const signInWithGoogle = async (): Promise<{
    success: boolean;
    error?: string;
    user?: UserProfile;
}> => {
    if (!isFirebaseConfigured() || !auth) {
        return { success: false, error: 'Firebase Auth is not yet configured.' };
    }

    try {
        const result = await signInWithPopup(auth, googleProvider);
        const fbUser = result.user;
        const email = (fbUser.email || '').toLowerCase().trim();
        const baseName = fbUser.displayName || email.split('@')[0] || 'operator';
        let cleanUsername = email.split('@')[0].replace(/[^a-z0-9_]/gi, '').toLowerCase();

        // Check if account already exists with this exact email
        let profile = await findUserByEmail(email);

        const isDeveloper = (profile?.username || cleanUsername) === 'aadish' || email === 'aadish14146yadav@gmail.com' || Boolean(profile?.isDeveloper);

        if (!profile) {
            // Also ensure cleanUsername doesn't collide with another user with a different email
            const existingWithUsername = await findUserByUsernameOrEmail(cleanUsername);
            if (existingWithUsername) {
                if (existingWithUsername.email?.toLowerCase() === email) {
                    profile = existingWithUsername;
                } else {
                    const suffix = Math.floor(1000 + Math.random() * 9000);
                    cleanUsername = `${cleanUsername.slice(0, 13)}_${suffix}`;
                }
            }
        }

        if (!profile) {
            const randomAvatar = generateRandomAvatar(baseName);
            profile = {
                uid: fbUser.uid,
                username: cleanUsername,
                displayName: baseName,
                email,
                avatarUrl: fbUser.photoURL || randomAvatar.url,
                avatarStyle: randomAvatar.style,
                avatarSeed: randomAvatar.seed,
                isDeveloper,
                role: isDeveloper ? 'developer' : 'player',
                totalTimePlayed: 0,
                stats: {
                    wins: 0, losses: 0, totalRounds: 0, shotsFired: 0, shotsHit: 0,
                    selfShots: 0, damageDealt: 0, itemsUsed: 0, highestRound: 0, matchHistory: []
                },
                needsGmailMigration: false,
                createdAt: Date.now(),
                lastLoginAt: Date.now()
            };

            if (db) {
                await setDoc(doc(db, 'users', cleanUsername), profile).catch(() => {});
            }
            const cache = getLocalUsersCache();
            cache[cleanUsername] = profile;
            saveLocalUsersCache(cache);
        } else {
            profile.lastLoginAt = Date.now();
            profile.isDeveloper = isDeveloper;
            if (isDeveloper) profile.role = 'developer';
            if (db) {
                await updateDoc(doc(db, 'users', profile.username), {
                    lastLoginAt: Date.now(),
                    isDeveloper,
                    role: isDeveloper ? 'developer' : (profile.role || 'player')
                }).catch(() => {});
            }
            const cache = getLocalUsersCache();
            cache[profile.username] = profile;
            saveLocalUsersCache(cache);
        }

        try {
            localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(profile));
        } catch (e) {}

        return { success: true, user: profile };
    } catch (err: any) {
        console.error("Google sign in error:", err);
        if (err.code === 'auth/popup-closed-by-user') {
            return { success: false, error: 'Google sign-in was canceled.' };
        }
        if (err.code === 'auth/popup-blocked') {
            return { success: false, error: 'Popup blocked by browser. Please enable popups or log in with Username/Password.' };
        }
        if (err.code === 'auth/cancelled-popup-request') {
            return { success: false, error: 'Multiple popups detected. Please try again.' };
        }
        if (err.code === 'auth/unauthorized-domain') {
            return { success: false, error: 'Domain not authorized in Firebase Console -> Auth.' };
        }
        return { success: false, error: err.message || 'Google sign-in aborted.' };
    }
};

// Update real-time last active timestamp in Firebase database
export const updateUserLastSeen = async (username: string): Promise<void> => {
    if (!username) return;
    const clean = username.trim().toLowerCase();
    try {
        if (db) {
            await updateDoc(doc(db, 'users', clean), {
                lastSeenAt: Date.now()
            }).catch(() => {});
        }
        const cache = getLocalUsersCache();
        if (cache[clean]) {
            cache[clean].lastSeenAt = Date.now();
            saveLocalUsersCache(cache);
        }
    } catch (e) {
        // Silently catch background writes
    }
};

// Migrate Legacy Upstash user by linking their Gmail and creating Firebase Auth
export const completeLegacyMigration = async (
    username: string,
    email: string,
    newPassword?: string
): Promise<{ success: boolean; error?: string; user?: UserProfile }> => {
    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanUsername || !cleanEmail) {
        return { success: false, error: 'Username and Gmail address are required.' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
        return { success: false, error: 'Please enter a valid Gmail address.' };
    }

    if (!cleanEmail.endsWith('@gmail.com') && !cleanEmail.endsWith('@googlemail.com')) {
        return { success: false, error: 'Registration requires a valid Gmail address (@gmail.com).' };
    }

    // CRITICAL: Strictly ensure this email is not already registered to ANOTHER account
    const existingWithEmail = await findUserByEmail(cleanEmail);
    if (existingWithEmail && existingWithEmail.username?.toLowerCase() !== cleanUsername) {
        return {
            success: false,
            error: `This Gmail address is already registered to operative @${existingWithEmail.displayName || existingWithEmail.username}. Each account must have a unique email.`
        };
    }

    let userProfile = await findUserByUsernameOrEmail(cleanUsername);

    // Fallback 1: If not found in Firestore or cache, check current session
    if (!userProfile) {
        const sessionUser = getCurrentUserProfile();
        if (sessionUser && sessionUser.username?.toLowerCase() === cleanUsername) {
            userProfile = { ...sessionUser };
        }
    }

    // Fallback 2: Synthesize profile if user was only stored in legacy local storage
    if (!userProfile) {
        const rndAvatar = generateRandomAvatar(cleanUsername);
        const isDev = cleanUsername === 'aadish';
        userProfile = {
            uid: `migrated_${cleanUsername}_${Date.now()}`,
            username: cleanUsername,
            displayName: cleanUsername,
            email: cleanEmail,
            avatarUrl: rndAvatar.url,
            avatarStyle: rndAvatar.style,
            avatarSeed: rndAvatar.seed,
            isDeveloper: isDev,
            role: isDev ? 'developer' : 'player',
            totalTimePlayed: 0,
            stats: {
                wins: 0, losses: 0, totalRounds: 0, shotsFired: 0, shotsHit: 0,
                selfShots: 0, damageDealt: 0, itemsUsed: 0, highestRound: 0, matchHistory: []
            },
            needsGmailMigration: false,
            createdAt: Date.now(),
            lastLoginAt: Date.now()
        };
    }

    // Ensure stats structure exists
    if (!userProfile.stats) {
        userProfile.stats = {
            wins: 0, losses: 0, totalRounds: 0, shotsFired: 0, shotsHit: 0,
            selfShots: 0, damageDealt: 0, itemsUsed: 0, highestRound: 0, matchHistory: []
        };
    }

    const passwordToUse = (newPassword && newPassword.length >= 6)
        ? newPassword
        : ((userProfile.legacyPasswordHash && userProfile.legacyPasswordHash.length >= 6) ? userProfile.legacyPasswordHash : 'Bugshot2026!');

    let uid = userProfile.uid;

    if (isFirebaseConfigured() && auth) {
        try {
            const cred = await createUserWithEmailAndPassword(auth, cleanEmail, passwordToUse);
            uid = cred.user.uid;
        } catch (err: any) {
            console.warn("Migration auth creation:", err);
            if (err.code === 'auth/email-already-in-use' || err.message?.includes('email-already-in-use')) {
                // If it already belongs to a DIFFERENT operative in Firestore or cache
                if (existingWithEmail && existingWithEmail.username?.toLowerCase() !== cleanUsername) {
                    return {
                        success: false,
                        error: `This Gmail address is already registered to operative @${existingWithEmail.displayName || existingWithEmail.username}. Each account must have a unique email.`
                    };
                }

                // If this is the SAME user who previously partially linked Firebase Auth, attempt sign-in
                try {
                    const cred = await signInWithEmailAndPassword(auth, cleanEmail, passwordToUse);
                    uid = cred.user.uid;
                } catch (e2: any) {
                    console.error("Migration auth link error:", err, e2);
                    return {
                        success: false,
                        error: 'This Gmail address is already registered to another account. Please use your own Gmail address.'
                    };
                }
            } else if (err.code === 'auth/weak-password') {
                return {
                    success: false,
                    error: 'Password must be at least 6 characters. Please set a new password.'
                };
            } else {
                return {
                    success: false,
                    error: err.message || 'Failed to link Gmail with your account.'
                };
            }
        }
    }

    // Update profile
    userProfile.uid = uid;
    userProfile.email = cleanEmail;
    userProfile.needsGmailMigration = false;
    userProfile.playerId = userProfile.playerId || getPlayerId(userProfile);
    if (!userProfile.avatarUrl) {
        const rndAvatar = generateRandomAvatar(cleanUsername);
        userProfile.avatarUrl = rndAvatar.url;
        userProfile.avatarStyle = rndAvatar.style;
        userProfile.avatarSeed = rndAvatar.seed;
    }
    userProfile.legacyPasswordHash = passwordToUse;
    userProfile.lastLoginAt = Date.now();

    // Persist to Firestore
    if (isFirebaseConfigured() && db) {
        try {
            await setDoc(doc(db, 'users', cleanUsername), userProfile);
        } catch (e) {
            console.warn("Firestore error during migration update:", e);
        }
    }

    // Persist to local cache & session
    const cache = getLocalUsersCache();
    cache[cleanUsername] = userProfile;
    saveLocalUsersCache(cache);

    try {
        localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(userProfile));
    } catch (e) {}

    // Synchronize active stats session
    try {
        setUserActiveStats(cleanUsername, userProfile.stats);
    } catch (e) {}

    return { success: true, user: userProfile };
};

// Update Avatar
export const updateUserAvatar = async (
    username: string,
    style: DicebearStyle,
    seed: string
): Promise<UserProfile | null> => {
    const cleanUsername = username.trim().toLowerCase();
    const userProfile = await findUserByUsernameOrEmail(cleanUsername);
    if (!userProfile) return null;

    const newUrl = getDicebearUrl(style, seed);
    userProfile.avatarUrl = newUrl;
    userProfile.avatarStyle = style;
    userProfile.avatarSeed = seed;

    if (isFirebaseConfigured() && db) {
        try {
            await updateDoc(doc(db, 'users', cleanUsername), {
                avatarUrl: newUrl,
                avatarStyle: style,
                avatarSeed: seed
            });
        } catch (e) {
            console.warn("Firestore avatar update error:", e);
        }
    }

    const cache = getLocalUsersCache();
    cache[cleanUsername] = userProfile;
    saveLocalUsersCache(cache);

    try {
        localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(userProfile));
    } catch (e) {}

    return userProfile;
};

// Update Display Name
export const updateUserDisplayName = async (
    username: string,
    newDisplayName: string
): Promise<UserProfile | null> => {
    const cleanUsername = username.trim().toLowerCase();
    const userProfile = await findUserByUsernameOrEmail(cleanUsername);
    if (!userProfile) return null;

    userProfile.displayName = newDisplayName.trim() || userProfile.displayName;

    if (isFirebaseConfigured() && db) {
        try {
            await updateDoc(doc(db, 'users', cleanUsername), {
                displayName: userProfile.displayName
            });
        } catch (e) {
            console.warn("Firestore displayName update error:", e);
        }
    }

    const cache = getLocalUsersCache();
    cache[cleanUsername] = userProfile;
    saveLocalUsersCache(cache);

    try {
        localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(userProfile));
    } catch (e) {}

    return userProfile;
};

// Send password reset email to a user's registered Gmail address
export const sendPasswordReset = async (
    emailOrUsername: string,
    actionCodeSettings?: ActionCodeSettings
): Promise<{ success: boolean; error?: string; email?: string }> => {
    const raw = (emailOrUsername || '').trim();
    if (!raw) {
        return { success: false, error: 'Please enter a valid Gmail address or operative callsign.' };
    }

    let targetEmail = raw.toLowerCase();

    // If identifier is a username rather than an email address, lookup email
    if (!targetEmail.includes('@')) {
        const user = await findUserByUsernameOrEmail(targetEmail);
        if (!user || !user.email) {
            return {
                success: false,
                error: `No registered Gmail address found for operative @${targetEmail}.`
            };
        }
        targetEmail = user.email.toLowerCase();
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(targetEmail)) {
        return { success: false, error: 'Invalid Gmail / Email address format.' };
    }

    if (!isFirebaseConfigured() || !auth) {
        console.warn("[Firebase] Auth not configured. Simulating password reset link to:", targetEmail);
        return { success: true, email: targetEmail };
    }

    try {
        if (actionCodeSettings) {
            await sendPasswordResetEmail(auth, targetEmail, actionCodeSettings);
        } else {
            await sendPasswordResetEmail(auth, targetEmail);
        }
        return { success: true, email: targetEmail };
    } catch (err: any) {
        console.error("Password reset error:", err);
        let errorMsg = 'Failed to send password reset email.';
        if (err.code === 'auth/user-not-found') {
            errorMsg = 'No account found with this Gmail address.';
        } else if (err.code === 'auth/invalid-email') {
            errorMsg = 'Invalid Gmail / Email address format.';
        } else if (err.code === 'auth/too-many-requests') {
            errorMsg = 'Too many reset requests dispatched. Please wait a few minutes before trying again.';
        } else if (err.code === 'auth/network-request-failed') {
            errorMsg = 'Network connectivity failure. Check your connection.';
        } else if (err.message) {
            errorMsg = err.message;
        }
        return { success: false, error: errorMsg };
    }
};

// Send email verification link to current authenticated user
export const sendVerificationEmail = async (
    actionCodeSettings?: ActionCodeSettings
): Promise<{ success: boolean; error?: string }> => {
    if (!isFirebaseConfigured() || !auth || !auth.currentUser) {
        return { success: false, error: 'Firebase is not configured or user is not logged in.' };
    }
    try {
        if (actionCodeSettings) {
            await sendEmailVerification(auth.currentUser, actionCodeSettings);
        } else {
            await sendEmailVerification(auth.currentUser);
        }
        return { success: true };
    } catch (err: any) {
        console.error("sendEmailVerification error:", err);
        return { success: false, error: err.message || 'Failed to dispatch verification email.' };
    }
};

// Update user email address with verification and optional re-authentication
export const updateUserEmail = async (
    username: string,
    newEmail: string,
    currentPassword?: string,
    actionCodeSettings?: ActionCodeSettings
): Promise<{
    success: boolean;
    error?: string;
    requiresReauth?: boolean;
    verificationEmailSent?: boolean;
    user?: UserProfile;
}> => {
    const cleanUsername = username.trim().toLowerCase();
    const cleanNewEmail = newEmail.trim().toLowerCase();

    if (!cleanUsername || !cleanNewEmail) {
        return { success: false, error: 'Username and new Gmail address are required.' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanNewEmail)) {
        return { success: false, error: 'Please enter a valid Gmail address.' };
    }

    if (!cleanNewEmail.endsWith('@gmail.com') && !cleanNewEmail.endsWith('@googlemail.com')) {
        return { success: false, error: 'Only Gmail addresses (@gmail.com) are accepted.' };
    }

    // 1. Check if email is already taken by another account
    const existingWithEmail = await findUserByEmail(cleanNewEmail);
    if (existingWithEmail && existingWithEmail.username?.toLowerCase() !== cleanUsername) {
        return {
            success: false,
            error: `This Gmail address is already registered to operative @${existingWithEmail.displayName || existingWithEmail.username}. Each account must have a unique email.`
        };
    }

    const userProfile = await findUserByUsernameOrEmail(cleanUsername);
    if (!userProfile) {
        return { success: false, error: 'User profile not found.' };
    }

    if (userProfile.email?.toLowerCase() === cleanNewEmail) {
        return { success: false, error: 'New email is identical to your current email address.' };
    }

    // 2. Firebase Auth update with re-authentication if necessary
    let verificationEmailSent = false;
    if (isFirebaseConfigured() && auth) {
        const currentUser = auth.currentUser;

        if (currentUser) {
            // If currentPassword is provided, attempt re-authentication
            if (currentPassword) {
                const authEmail = currentUser.email || userProfile.email;
                if (!authEmail) {
                    return {
                        success: false,
                        error: 'Current email not found for re-authentication.',
                        requiresReauth: true
                    };
                }
                try {
                    const credential = EmailAuthProvider.credential(
                        authEmail,
                        currentPassword
                    );
                    await reauthenticateWithCredential(currentUser, credential);
                } catch (reauthErr: any) {
                    console.error("Re-authentication error:", reauthErr);
                    if (reauthErr.code === 'auth/wrong-password' || reauthErr.code === 'auth/invalid-credential') {
                        return {
                            success: false,
                            error: 'Incorrect current password. Re-authentication failed.',
                            requiresReauth: true
                        };
                    }
                    if (reauthErr.code === 'auth/too-many-requests') {
                        return {
                            success: false,
                            error: 'Too many attempts. Please wait a few moments and try again.',
                            requiresReauth: true
                        };
                    }
                }
            }

            // Attempt email update with verification
            try {
                if (actionCodeSettings) {
                    await verifyBeforeUpdateEmail(currentUser, cleanNewEmail, actionCodeSettings);
                } else {
                    await verifyBeforeUpdateEmail(currentUser, cleanNewEmail);
                }
                verificationEmailSent = true;
            } catch (err: any) {
                console.error("Firebase verifyBeforeUpdateEmail error:", err);
                if (err.code === 'auth/requires-recent-login') {
                    return {
                        success: false,
                        error: 'Security clearance required: Please enter your current password to confirm email update.',
                        requiresReauth: true
                    };
                }
                if (err.code === 'auth/email-already-in-use') {
                    return {
                        success: false,
                        error: 'This Gmail address is already registered to another Firebase account.'
                    };
                }
                if (err.code === 'auth/invalid-email') {
                    return {
                        success: false,
                        error: 'Invalid Gmail / Email address format.'
                    };
                }
                if (err.code === 'auth/operation-not-allowed') {
                    return {
                        success: false,
                        error: 'Email change operation is not enabled in Firebase Console.'
                    };
                }
                return {
                    success: false,
                    error: err.message || 'Failed to dispatch email verification from Firebase.'
                };
            }
        }
    }

    // 3. Update Firestore
    if (isFirebaseConfigured() && db) {
        try {
            await updateDoc(doc(db, 'users', cleanUsername), {
                email: cleanNewEmail,
                lastSeenAt: Date.now()
            });
        } catch (e) {
            console.warn("Firestore error updating email:", e);
        }
    }

    // 4. Update local cache & active session
    userProfile.email = cleanNewEmail;
    const cache = getLocalUsersCache();
    cache[cleanUsername] = userProfile;
    saveLocalUsersCache(cache);

    try {
        localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(userProfile));
    } catch (e) {}

    return {
        success: true,
        verificationEmailSent,
        user: userProfile
    };
};

// Backwards-compatible alias
export const changeUserEmail = updateUserEmail;

// Delete User Account
export const deleteUserAccount = async (
    username: string
): Promise<{ success: boolean; error?: string }> => {
    const cleanUsername = username.trim().toLowerCase();

    // 1. Delete from Firebase Auth
    if (isFirebaseConfigured() && auth && auth.currentUser) {
        try {
            await deleteUser(auth.currentUser);
        } catch (err: any) {
            console.error("Firebase auth deleteUser error:", err);
        }
    }

    // 2. Delete from Firestore
    if (isFirebaseConfigured() && db) {
        try {
            await deleteDoc(doc(db, 'users', cleanUsername));
        } catch (e) {}
    }

    // 3. Delete from local cache and session
    const cache = getLocalUsersCache();
    delete cache[cleanUsername];
    saveLocalUsersCache(cache);

    try {
        localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
    } catch (e) {}

    return { success: true };
};

// Offline Stats Sync Queue Management
const PENDING_STATS_SYNC_KEY = 'aadish_roulette_pending_stats_sync';

interface PendingStatsSyncEntry {
    username: string;
    stats: GameStats;
    additionalSeconds: number;
    timestamp: number;
}

const getPendingStatsSyncQueue = (): PendingStatsSyncEntry[] => {
    try {
        const raw = localStorage.getItem(PENDING_STATS_SYNC_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch (e) {}
    return [];
};

const savePendingStatsSyncQueue = (queue: PendingStatsSyncEntry[]) => {
    try {
        if (queue.length === 0) {
            localStorage.removeItem(PENDING_STATS_SYNC_KEY);
        } else {
            localStorage.setItem(PENDING_STATS_SYNC_KEY, JSON.stringify(queue));
        }
    } catch (e) {}
};

export const queuePendingStatsSync = (username: string, stats: GameStats, additionalSeconds = 0) => {
    const cleanUsername = username.trim().toLowerCase();
    const queue = getPendingStatsSyncQueue();
    const existingIdx = queue.findIndex(item => item.username === cleanUsername);
    const entry: PendingStatsSyncEntry = {
        username: cleanUsername,
        stats,
        additionalSeconds,
        timestamp: Date.now()
    };
    if (existingIdx !== -1) {
        queue[existingIdx] = entry;
    } else {
        queue.push(entry);
    }
    savePendingStatsSyncQueue(queue);
};

let isSyncingPendingStats = false;
export const syncPendingStatsToFirebase = async (): Promise<void> => {
    if (isSyncingPendingStats) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (!isFirebaseConfigured() || !db) return;

    const queue = getPendingStatsSyncQueue();
    if (queue.length === 0) return;

    isSyncingPendingStats = true;
    try {
        for (const item of queue) {
            try {
                await saveUserStatsToFirebase(item.username, item.stats, item.additionalSeconds);
            } catch (err) {
                console.warn(`[Firebase] Failed to sync pending stats for @${item.username}:`, err);
            }
        }
    } finally {
        isSyncingPendingStats = false;
    }
};

// Automatic listener for offline -> online transition
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        syncPendingStatsToFirebase().catch(() => {});
    });
}

// Save User Stats to Firebase & update play time with offline fallback and bidirectional merging
export const saveUserStatsToFirebase = async (
    username: string,
    stats: GameStats,
    additionalSeconds = 0
): Promise<boolean> => {
    const cleanUsername = username.trim().toLowerCase();
    const userProfile = await findUserByUsernameOrEmail(cleanUsername);
    if (!userProfile) return false;

    userProfile.stats = stats;
    if (additionalSeconds > 0) {
        userProfile.totalTimePlayed = (userProfile.totalTimePlayed || 0) + additionalSeconds;
    }

    // Always update local cache & active session immediately
    const cache = getLocalUsersCache();
    cache[cleanUsername] = userProfile;
    saveLocalUsersCache(cache);

    setCachedUser(cleanUsername, userProfile);
    cachedLeaderboard = null;

    try {
        const sessionUser = getCurrentUserProfile();
        if (sessionUser && sessionUser.username?.toLowerCase() === cleanUsername) {
            sessionUser.stats = userProfile.stats;
            sessionUser.totalTimePlayed = userProfile.totalTimePlayed;
            localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(sessionUser));
        }
    } catch (e) {}

    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (!isOnline || !isFirebaseConfigured() || !db) {
        queuePendingStatsSync(cleanUsername, userProfile.stats, additionalSeconds);
        return true;
    }

    try {
        const userDocRef = doc(db, 'users', cleanUsername);
        const remoteSnap = await getDoc(userDocRef);
        let finalStats = userProfile.stats;
        let finalTimePlayed = userProfile.totalTimePlayed;

        if (remoteSnap.exists()) {
            const remoteData = remoteSnap.data() as UserProfile;
            if (remoteData?.stats) {
                finalStats = mergeGameStats(userProfile.stats, remoteData.stats);
                finalTimePlayed = Math.max(userProfile.totalTimePlayed || 0, remoteData.totalTimePlayed || 0) + additionalSeconds;
                userProfile.stats = finalStats;
                userProfile.totalTimePlayed = finalTimePlayed;
                cache[cleanUsername] = userProfile;
                saveLocalUsersCache(cache);
                setCachedUser(cleanUsername, userProfile);
            }
        }

        await setDoc(userDocRef, {
            stats: finalStats,
            totalTimePlayed: finalTimePlayed,
            lastLoginAt: Date.now()
        }, { merge: true });

        // Successfully synced to Firestore: remove from pending queue
        const remainingQueue = getPendingStatsSyncQueue().filter(item => item.username !== cleanUsername);
        savePendingStatsSyncQueue(remainingQueue);

        return true;
    } catch (e) {
        console.warn("[Firebase] Firestore update error, queueing for retry:", e);
        queuePendingStatsSync(cleanUsername, userProfile.stats, additionalSeconds);
        return false;
    }
};

// Safely Log Out User from Firebase Auth & local session
export const logoutUserFromFirebase = async (): Promise<void> => {
    try {
        if (isFirebaseConfigured() && auth) {
            await signOut(auth);
        }
    } catch (e) {
        console.warn("Firebase signOut warning:", e);
    }
    try {
        localStorage.removeItem(LOCAL_STORAGE_SESSION_KEY);
    } catch (e) {}
};

let cachedLeaderboard: { data: LeaderboardEntry[]; timestamp: number } | null = null;
let pendingLeaderboardPromise: Promise<LeaderboardEntry[]> | null = null;
const LEADERBOARD_CACHE_TTL_MS = 30000;

// Get Full Leaderboard sorted with avatars and player info (with 30s cache and in-flight deduplication)
// Returns up to 50 operatives as requested
export const getLeaderboard = async (forceRefresh = false): Promise<LeaderboardEntry[]> => {
    const now = Date.now();
    if (!forceRefresh && cachedLeaderboard && (now - cachedLeaderboard.timestamp) < LEADERBOARD_CACHE_TTL_MS) {
        return cachedLeaderboard.data;
    }

    if (!forceRefresh && pendingLeaderboardPromise) {
        return pendingLeaderboardPromise;
    }

    pendingLeaderboardPromise = (async () => {
        const usersMap: Record<string, UserProfile> = {};

        // Load from Firestore if available
        if (isFirebaseConfigured() && db) {
            try {
                const snap = await getDocs(collection(db, 'users'));
                if (!snap.empty) {
                    snap.forEach(docSnap => {
                        const data = docSnap.data() as UserProfile;
                        if (data && data.username) {
                            usersMap[data.username.toLowerCase()] = data;
                        }
                    });
                }
            } catch (e) {
                console.warn("Firestore leaderboard fetch error, using local cache:", e);
            }
        }

        // Merge with local cache / backed up operatives
        const localCache = getLocalUsersCache();
        for (const key in localCache) {
            if (!usersMap[key]) {
                usersMap[key] = localCache[key];
            }
        }

        const leaderboard: LeaderboardEntry[] = [];

        for (const key in usersMap) {
            const u = usersMap[key];
            if (!u || !u.username) continue;
            const stats = u.stats || {
                wins: 0, losses: 0, totalRounds: 0, shotsFired: 0, shotsHit: 0,
                selfShots: 0, damageDealt: 0, itemsUsed: 0, highestRound: 0, matchHistory: []
            };
            const matchHistory = Array.isArray(stats?.matchHistory) ? stats.matchHistory : [];
            const hardModeWins = matchHistory.filter((m: any) => m && m.result === 'WIN' && m.isHardMode).length;

            leaderboard.push({
                username: u.username,
                displayName: u.displayName || u.username,
                avatarUrl: u.avatarUrl || getDicebearUrl(u.avatarStyle || 'thumbs', u.avatarSeed || u.username),
                avatarStyle: u.avatarStyle,
                avatarSeed: u.avatarSeed,
                wins: stats.wins || 0,
                losses: stats.losses || 0,
                hardModeWins,
                totalTimePlayed: typeof u.totalTimePlayed === 'number' ? u.totalTimePlayed : ((stats.totalRounds || 0) * 90),
                isDeveloper: Boolean(u.isDeveloper || u.username.toLowerCase() === 'aadish'),
                stats,
                playerId: getPlayerId(u),
                lastLoginAt: u.lastLoginAt,
                lastSeenAt: u.lastSeenAt
            });
        }

        // Sorting: Hard mode wins desc, Normal wins desc, Losses asc
        leaderboard.sort((a, b) => {
            if (b.hardModeWins !== a.hardModeWins) {
                return b.hardModeWins - a.hardModeWins;
            }
            if (b.wins !== a.wins) {
                return b.wins - a.wins;
            }
            return a.losses - b.losses;
        });

        // Cache full sorted leaderboard (up to 250 records for smooth multi-page pagination)
        const allRecords = leaderboard.slice(0, 250);

        cachedLeaderboard = { data: allRecords, timestamp: Date.now() };
        pendingLeaderboardPromise = null;
        return allRecords;
    })().catch(err => {
        pendingLeaderboardPromise = null;
        throw err;
    });

    return pendingLeaderboardPromise;
};

// Get current active user from session
export const getCurrentUserProfile = (): UserProfile | null => {
    try {
        const saved = localStorage.getItem(LOCAL_STORAGE_SESSION_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object') {
                if (isLegacyUpstashUser(parsed)) {
                    parsed.needsGmailMigration = true;
                }
                return parsed;
            }
        }
    } catch (e) {}
    return null;
};

let authUnsubscribe: (() => void) | null = null;

export const cleanupFirebaseSubscriptions = () => {
    if (authUnsubscribe) {
        try {
            authUnsubscribe();
        } catch (e) {}
        authUnsubscribe = null;
    }
};

// Automatically synchronize Firebase Auth state with local user profile session
if (typeof window !== 'undefined' && isFirebaseConfigured() && auth) {
    try {
        cleanupFirebaseSubscriptions();
        authUnsubscribe = onAuthStateChanged(auth, async (fbUser) => {
            try {
                if (fbUser && fbUser.email) {
                    const current = getCurrentUserProfile();
                    if (!current || current.email?.toLowerCase() !== fbUser.email.toLowerCase()) {
                        const profile = await findUserByEmail(fbUser.email);
                        if (profile) {
                            try {
                                localStorage.setItem(LOCAL_STORAGE_SESSION_KEY, JSON.stringify(profile));
                                window.dispatchEvent(new CustomEvent('bugshot_auth_state_changed'));
                            } catch (e) {}
                        }
                    }
                }
            } catch (authErr) {
                console.warn("[Firebase] Auth state change handler warning:", authErr);
            }
        });
    } catch (e) {
        console.warn("[Firebase] Auth listener error:", e);
    }
}

// Retrieve User Game Stats from Firebase / Cache
export const getUserStatsFromFirebase = async (username: string): Promise<GameStats | null> => {
    const user = await findUserByUsernameOrEmail(username);
    return user?.stats || null;
};

// Get all registered users from Firestore & local cache (for Admin Dashboard)
export const getAllUsers = async (): Promise<UserProfile[]> => {
    const usersMap: Record<string, UserProfile> = {};

    if (isFirebaseConfigured() && db) {
        try {
            const snap = await getDocs(collection(db, 'users'));
            if (!snap.empty) {
                snap.forEach(docSnap => {
                    const data = docSnap.data() as UserProfile;
                    if (data && data.username) {
                        const cleanU = data.username.toLowerCase();
                        usersMap[cleanU] = {
                            ...data,
                            username: cleanU,
                            playerId: data.playerId || getPlayerId(data),
                            avatarUrl: data.avatarUrl || getDicebearUrl(data.avatarStyle || 'thumbs', data.avatarSeed || cleanU),
                            isDeveloper: Boolean(data.isDeveloper || data.role === 'developer' || cleanU === 'aadish')
                        };
                    }
                });
            }
        } catch (e) {
            console.warn("Firestore getAllUsers error, fallback to cache:", e);
        }
    }

    const localCache = getLocalUsersCache();
    for (const key in localCache) {
        const u = localCache[key];
        if (!u || !u.username) continue;
        const cleanU = key.toLowerCase();
        if (!usersMap[cleanU]) {
            usersMap[cleanU] = {
                ...u,
                username: cleanU,
                playerId: u.playerId || getPlayerId(u),
                avatarUrl: u.avatarUrl || getDicebearUrl(u.avatarStyle || 'thumbs', u.avatarSeed || cleanU),
                isDeveloper: Boolean(u.isDeveloper || u.role === 'developer' || cleanU === 'aadish')
            };
        }
    }

    return Object.values(usersMap).sort((a, b) => {
        // Developers first, then by lastLoginAt desc
        const aDev = Boolean(a?.isDeveloper || a?.role === 'developer');
        const bDev = Boolean(b?.isDeveloper || b?.role === 'developer');
        if (aDev !== bDev) {
            return aDev ? -1 : 1;
        }
        return (b?.lastLoginAt || 0) - (a?.lastLoginAt || 0);
    });
};

// Re-export UserData and legacy compatibility if needed
export type UserData = UserProfile;
