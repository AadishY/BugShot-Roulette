import {
    collection,
    doc,
    setDoc,
    addDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    arrayUnion,
    arrayRemove,
    writeBatch
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';
import { UserProfile, findUserByUsernameOrEmail, getPlayerId, getLocalUsersCache } from './firebaseService';
import { getDicebearUrl } from './dicebear';

// Robust Player Avatar Resolver
export const resolvePlayerAvatar = (user?: {
    username?: string;
    avatarUrl?: string;
    avatarStyle?: any;
    avatarSeed?: string;
    isDeveloper?: boolean;
    role?: string;
} | null): string => {
    if (!user || typeof user !== 'object') return '/image/favicon/android-chrome-192x192.png';
    const clean = (typeof user.username === 'string' ? user.username : '').toLowerCase().trim();
    if (clean === 'bugshot' || clean === 'system') {
        return '/image/favicon/android-chrome-192x192.png';
    }
    const isDev = clean === 'aadish' || Boolean(user.isDeveloper || user.role === 'developer');
    if (isDev) {
        return 'https://avatars.githubusercontent.com/u/101470733';
    }
    if (user.avatarUrl && typeof user.avatarUrl === 'string' && user.avatarUrl.trim() !== '') {
        const url = user.avatarUrl.trim();
        if (!url.startsWith('data:image/svg+xml') && (url.startsWith('http') || url.startsWith('/') || url.startsWith('data:image/png')) && !url.includes('undefined')) {
            return url;
        }
    }
    // Check if we have this user cached in local cache
    try {
        const cache = getLocalUsersCache();
        const cached = cache[clean];
        if (cached?.avatarUrl && typeof cached.avatarUrl === 'string' && !cached.avatarUrl.startsWith('data:image/svg+xml') && !cached.avatarUrl.includes('undefined')) {
            return cached.avatarUrl;
        }
        if (cached?.avatarStyle && cached?.avatarSeed) {
            return getDicebearUrl(cached.avatarStyle, cached.avatarSeed);
        }
    } catch (e) {}

    const style = user.avatarStyle || 'thumbs';
    const seed = user.avatarSeed || user.username || 'operator';
    return getDicebearUrl(style, seed);
};

// 30 Days in milliseconds for direct message retention
export const DIRECT_MESSAGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface ChatMessage {
    id: string;
    conversationId: string; // [userA, userB].sort().join('_') or 'global_broadcast'
    sender: string;
    senderDisplayName: string;
    senderAvatarUrl: string;
    recipient: string; // username or 'broadcast'
    text: string;
    title?: string;
    stickerId?: string;
    createdAt: number;
    read?: boolean;
    isBroadcast?: boolean;
    pinned?: boolean;
}

export interface FriendRequest {
    id: string;
    from: string;
    fromDisplayName: string;
    fromAvatarUrl: string;
    fromPlayerId: string;
    to: string;
    status: 'pending' | 'accepted' | 'declined';
    createdAt: number;
}

export interface FriendUser {
    username: string;
    displayName: string;
    avatarUrl: string;
    playerId: string;
    isDeveloper?: boolean;
}

export interface CustomSticker {
    id: string;
    file: string;
    name: string;
    url: string;
    badge?: string;
    isAnimated?: boolean;
}

// 26 Custom Thematic Bugshot Stickers (Real assets in /sticker/)
export const BUGSHOT_STICKERS: CustomSticker[] = [
    { id: 'sticker1', file: 'sticker1.webp', name: 'TACTICAL 01', url: '/sticker/sticker1.webp', badge: 'STATIC' },
    { id: 'sticker2', file: 'sticker2.webp', name: 'TACTICAL 02', url: '/sticker/sticker2.webp', badge: 'STATIC' },
    { id: 'sticker3', file: 'sticker3.webp', name: 'TACTICAL 03', url: '/sticker/sticker3.webp', badge: 'STATIC' },
    { id: 'sticker4', file: 'sticker4.gif', name: 'ANIMATED 04', url: '/sticker/sticker4.gif', badge: 'GIF', isAnimated: true },
    { id: 'sticker5', file: 'sticker5.webp', name: 'TACTICAL 05', url: '/sticker/sticker5.webp', badge: 'STATIC' },
    { id: 'sticker6', file: 'sticker6.webp', name: 'TACTICAL 06', url: '/sticker/sticker6.webp', badge: 'STATIC' },
    { id: 'sticker7', file: 'sticker7.webp', name: 'TACTICAL 07', url: '/sticker/sticker7.webp', badge: 'STATIC' },
    { id: 'sticker8', file: 'sticker8.webp', name: 'TACTICAL 08', url: '/sticker/sticker8.webp', badge: 'STATIC' },
    { id: 'sticker9', file: 'sticker9.gif', name: 'ANIMATED 09', url: '/sticker/sticker9.gif', badge: 'GIF', isAnimated: true },
    { id: 'sticker10', file: 'sticker10.webp', name: 'TACTICAL 10', url: '/sticker/sticker10.webp', badge: 'STATIC' },
    { id: 'sticker11', file: 'sticker11.gif', name: 'ANIMATED 11', url: '/sticker/sticker11.gif', badge: 'GIF', isAnimated: true },
    { id: 'sticker12', file: 'sticker12.webp', name: 'TACTICAL 12', url: '/sticker/sticker12.webp', badge: 'STATIC' },
    { id: 'sticker13', file: 'sticker13.webp', name: 'TACTICAL 13', url: '/sticker/sticker13.webp', badge: 'STATIC' },
    { id: 'sticker14', file: 'sticker14.webp', name: 'TACTICAL 14', url: '/sticker/sticker14.webp', badge: 'STATIC' },
    { id: 'sticker15', file: 'sticker15.webp', name: 'TACTICAL 15', url: '/sticker/sticker15.webp', badge: 'STATIC' },
    { id: 'sticker16', file: 'sticker16.gif', name: 'ANIMATED 16', url: '/sticker/sticker16.gif', badge: 'GIF', isAnimated: true },
    { id: 'sticker17', file: 'sticker17.gif', name: 'ANIMATED 17', url: '/sticker/sticker17.gif', badge: 'GIF', isAnimated: true },
    { id: 'sticker18', file: 'sticker18.gif', name: 'ANIMATED 18', url: '/sticker/sticker18.gif', badge: 'GIF', isAnimated: true },
    { id: 'sticker19', file: 'sticker19.gif', name: 'ANIMATED 19', url: '/sticker/sticker19.gif', badge: 'GIF', isAnimated: true },
    { id: 'sticker20', file: 'sticker20.gif', name: 'ANIMATED 20', url: '/sticker/sticker20.gif', badge: 'GIF', isAnimated: true },
    { id: 'sticker21', file: 'sticker21.gif', name: 'ANIMATED 21', url: '/sticker/sticker21.gif', badge: 'GIF', isAnimated: true },
    { id: 'sticker22', file: 'sticker22.gif', name: 'ANIMATED 22', url: '/sticker/sticker22.gif', badge: 'GIF', isAnimated: true },
    { id: 'sticker23', file: 'sticker23.webp', name: 'TACTICAL 23', url: '/sticker/sticker23.webp', badge: 'STATIC' },
    { id: 'sticker24', file: 'sticker24.gif', name: 'ANIMATED 24', url: '/sticker/sticker24.gif', badge: 'GIF', isAnimated: true },
    { id: 'sticker25', file: 'sticker25.gif', name: 'ANIMATED 25', url: '/sticker/sticker25.gif', badge: 'GIF', isAnimated: true },
    { id: 'sticker26', file: 'sticker26.webp', name: 'TACTICAL 26', url: '/sticker/sticker26.webp', badge: 'STATIC' }
];

export const getStickerById = (id?: string): CustomSticker | null => {
    if (!id) return null;
    const cleanId = id.trim();
    const found = BUGSHOT_STICKERS.find(s => s.id === cleanId || s.file === cleanId);
    if (found) return found;

    if (cleanId.startsWith('sticker')) {
        const numPart = cleanId.replace('sticker', '').replace(/\..*$/, '');
        const isGif = ['4','9','11','16','17','18','19','20','21','22','24','25'].includes(numPart);
        const ext = isGif ? 'gif' : 'webp';
        return {
            id: `sticker${numPart}`,
            file: `sticker${numPart}.${ext}`,
            name: `STICKER ${numPart}`,
            url: `/sticker/sticker${numPart}.${ext}`,
            badge: isGif ? 'GIF' : 'STATIC',
            isAnimated: isGif
        };
    }
    return null;
};

// Local storage fallback keys
const LS_FRIENDS_KEY = 'aadish_roulette_friends_cache';
const LS_REQUESTS_KEY = 'aadish_roulette_requests_cache';
const LS_MESSAGES_KEY = 'aadish_roulette_dms_cache';
const LS_BROADCASTS_KEY = 'aadish_roulette_broadcasts_cache';

// Helper to get conversation ID between two usernames (deterministic)
export const getConversationId = (userA: string, userB: string): string => {
    const cleanA = (userA || '').trim().toLowerCase();
    const cleanB = (userB || '').trim().toLowerCase();
    return [cleanA, cleanB].sort().join('_');
};

// 1. SUBSCRIBE TO MUTUAL FRIENDS IN REAL TIME
export const subscribeToFriends = (
    username: string,
    callback: (friends: FriendUser[]) => void
): (() => void) => {
    const clean = (username || '').trim().toLowerCase();
    if (!clean) {
        callback([]);
        return () => {};
    }

    const handleLocalFriends = (e: any) => {
        if (e.detail && Array.isArray(e.detail)) {
            callback(e.detail);
        }
    };
    if (typeof window !== 'undefined') {
        window.addEventListener(`bugshot_friends_${clean}`, handleLocalFriends);
    }

    let unsubscribeFirestore = () => {};

    if (isFirebaseConfigured() && db) {
        try {
            const userDocRef = doc(db, 'users', clean);
            unsubscribeFirestore = onSnapshot(userDocRef, async (docSnap) => {
                try {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        const friendUsernames: string[] = Array.isArray(data?.friends) ? data.friends : [];
                        
                        if (friendUsernames.length === 0) {
                            callback([]);
                            return;
                        }

                        // Resolve friends details
                        const friendProfiles: FriendUser[] = [];
                        for (const fName of friendUsernames) {
                            const cleanFName = (fName || '').trim().toLowerCase();
                            if (!cleanFName) continue;
                            try {
                                const fUser = await findUserByUsernameOrEmail(cleanFName);
                                if (fUser) {
                                    friendProfiles.push({
                                        username: fUser.username,
                                        displayName: fUser.displayName || fUser.username,
                                        avatarUrl: resolvePlayerAvatar(fUser),
                                        playerId: fUser.playerId || getPlayerId(fUser),
                                        isDeveloper: Boolean(fUser.isDeveloper || fUser.role === 'developer' || fUser.username === 'aadish')
                                    });
                                } else {
                                    friendProfiles.push({
                                        username: cleanFName,
                                        displayName: cleanFName,
                                        avatarUrl: resolvePlayerAvatar({ username: cleanFName }),
                                        playerId: `@${cleanFName}#1000`,
                                        isDeveloper: cleanFName === 'aadish'
                                    });
                                }
                            } catch (err) {
                                console.warn("Failed resolving friend profile:", cleanFName, err);
                                friendProfiles.push({
                                    username: cleanFName,
                                    displayName: cleanFName,
                                    avatarUrl: resolvePlayerAvatar({ username: cleanFName }),
                                    playerId: `@${cleanFName}#1000`,
                                    isDeveloper: cleanFName === 'aadish'
                                });
                            }
                        }

                        try {
                            localStorage.setItem(`${LS_FRIENDS_KEY}_${clean}`, JSON.stringify(friendProfiles));
                        } catch (e) {}

                        callback(friendProfiles);
                    } else {
                        callback([]);
                    }
                } catch (snapshotErr) {
                    console.warn("[Firebase] Friend resolve snapshot error:", snapshotErr);
                }
            }, (error) => {
                console.warn("[Firebase] Friends listener warning:", error);
                // Fallback to local storage
                try {
                    const raw = localStorage.getItem(`${LS_FRIENDS_KEY}_${clean}`);
                    if (raw) callback(JSON.parse(raw));
                } catch (e) {}
            });
        } catch (e) {
            console.warn("Error establishing friends listener:", e);
        }
    }

    // Local storage fallback
    try {
        const raw = localStorage.getItem(`${LS_FRIENDS_KEY}_${clean}`);
        if (raw) callback(JSON.parse(raw));
    } catch (e) {}

    return () => {
        if (unsubscribeFirestore) unsubscribeFirestore();
        if (typeof window !== 'undefined') {
            window.removeEventListener(`bugshot_friends_${clean}`, handleLocalFriends);
        }
    };
};

// Helper to save friend request locally
const saveLocalRequest = (req: FriendRequest) => {
    try {
        const key = `${LS_REQUESTS_KEY}_${req.to.toLowerCase()}`;
        const raw = localStorage.getItem(key);
        const list: FriendRequest[] = raw ? JSON.parse(raw) : [];
        if (!list.some(r => r.id === req.id)) {
            list.unshift(req);
            localStorage.setItem(key, JSON.stringify(list));
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent(`bugshot_requests_${req.to.toLowerCase()}`, { detail: list }));
            }
        }
    } catch (e) {}
};

// 2. SUBSCRIBE TO INCOMING FRIEND REQUESTS
export const subscribeToFriendRequests = (
    username: string,
    callback: (requests: FriendRequest[]) => void
): (() => void) => {
    const clean = username.trim().toLowerCase();
    if (!clean) {
        callback([]);
        return () => {};
    }

    const handleLocalRequests = (e: any) => {
        if (e.detail && Array.isArray(e.detail)) {
            callback(e.detail);
        }
    };
    if (typeof window !== 'undefined') {
        window.addEventListener(`bugshot_requests_${clean}`, handleLocalRequests);
    }

    let unsubscribeFirestore = () => {};

    if (isFirebaseConfigured() && db) {
        try {
            const q = query(
                collection(db, 'friend_requests'),
                where('to', '==', clean),
                where('status', '==', 'pending')
            );

            unsubscribeFirestore = onSnapshot(q, (snapshot) => {
                try {
                    const requests: FriendRequest[] = [];
                    snapshot.forEach((docSnap) => {
                        const d = docSnap.data();
                        if (!d) return;
                        requests.push({
                            id: docSnap.id,
                            from: d.from || '',
                            fromDisplayName: d.fromDisplayName || d.from || 'Operative',
                            fromAvatarUrl: resolvePlayerAvatar({ username: d.from, avatarUrl: d.fromAvatarUrl }),
                            fromPlayerId: d.fromPlayerId || `@${d.from || 'operative'}#1000`,
                            to: d.to || '',
                            status: d.status || 'pending',
                            createdAt: typeof d.createdAt === 'number' ? d.createdAt : Date.now()
                        });
                    });

                    // Sort newest first
                    requests.sort((a, b) => b.createdAt - a.createdAt);

                    try {
                        localStorage.setItem(`${LS_REQUESTS_KEY}_${clean}`, JSON.stringify(requests));
                    } catch (e) {}

                    callback(requests);
                } catch (snapshotErr) {
                    console.warn("[Firebase] Friend requests snapshot parsing error:", snapshotErr);
                }
            }, (err) => {
                console.warn("[Firebase] Friend requests listener warning:", err);
                try {
                    const raw = localStorage.getItem(`${LS_REQUESTS_KEY}_${clean}`);
                    if (raw) callback(JSON.parse(raw));
                } catch (e) {}
            });
        } catch (e) {
            console.warn("Error listening to friend requests:", e);
        }
    }

    try {
        const raw = localStorage.getItem(`${LS_REQUESTS_KEY}_${clean}`);
        if (raw) callback(JSON.parse(raw));
    } catch (e) {}

    return () => {
        if (unsubscribeFirestore) unsubscribeFirestore();
        if (typeof window !== 'undefined') {
            window.removeEventListener(`bugshot_requests_${clean}`, handleLocalRequests);
        }
    };
};

// 3. SEND FRIEND REQUEST (Strictly by Player Tag, e.g. @username#1000 or username#1000)
export const sendFriendRequest = async (
    sender: UserProfile,
    targetIdentifier: string
): Promise<{ success: boolean; error?: string }> => {
    if (!sender || !sender.username) {
        return { success: false, error: 'User profile is required to send friend request.' };
    }
    const rawInput = (targetIdentifier || '').trim();
    if (!rawInput) {
        return { success: false, error: 'Please enter a Player Tag (e.g. @username#1000).' };
    }

    const cleanInput = rawInput.toLowerCase().replace(/^@/, '');

    // STRICT CHECK: Must contain '#' followed by tag code
    if (!cleanInput.includes('#')) {
        return {
            success: false,
            error: 'Friend requests require full Player Tag (e.g. @username#1000). Plain usernames are not accepted.'
        };
    }

    const parts = cleanInput.split('#');
    const targetUsername = parts[0].trim();
    const tagCode = parts[1].trim();

    if (!targetUsername || !tagCode) {
        return { success: false, error: 'Invalid Player Tag format. Use @username#1000.' };
    }

    const cleanSender = sender.username.trim().toLowerCase();
    if (targetUsername === cleanSender) {
        return { success: false, error: 'You cannot send a friend request to yourself.' };
    }

    // Verify recipient exists
    const targetUser = await findUserByUsernameOrEmail(targetUsername);
    if (!targetUser) {
        return { success: false, error: `Operative with tag "@${targetUsername}#${tagCode}" not found.` };
    }

    // Verify the entered tag code matches the target user's actual player tag
    const actualPlayerTag = (targetUser.playerId || getPlayerId(targetUser)).toLowerCase().replace(/^@/, '');
    const enteredPlayerTag = `${targetUsername}#${tagCode}`;
    if (actualPlayerTag !== enteredPlayerTag) {
        return {
            success: false,
            error: `Invalid tag code for @${targetUser.displayName || targetUser.username}. Expected their 4-digit tag (e.g. ${actualPlayerTag}).`
        };
    }

    const reqId = `${cleanSender}_${targetUser.username.toLowerCase()}`;
    const newRequest: FriendRequest = {
        id: reqId,
        from: cleanSender,
        fromDisplayName: sender.displayName || sender.username,
        fromAvatarUrl: resolvePlayerAvatar(sender),
        fromPlayerId: sender.playerId || getPlayerId(sender),
        to: targetUser.username.toLowerCase(),
        status: 'pending',
        createdAt: Date.now()
    };

    // Check if already friends
    if (isFirebaseConfigured() && db) {
        try {
            const senderDoc = await getDoc(doc(db, 'users', cleanSender)).catch(() => null);
            if (senderDoc && senderDoc.exists()) {
                const friends: string[] = senderDoc.data()?.friends || [];
                if (friends.includes(targetUser.username.toLowerCase())) {
                    return { success: false, error: `You and @${targetUser.displayName || targetUser.username} are already friends!` };
                }
            }

            // Check if request already pending
            const existingReq = await getDoc(doc(db, 'friend_requests', reqId)).catch(() => null);
            if (existingReq && existingReq.exists() && existingReq.data()?.status === 'pending') {
                return { success: false, error: 'Friend request already pending.' };
            }

            await setDoc(doc(db, 'friend_requests', reqId), newRequest);
            saveLocalRequest(newRequest);
            return { success: true };
        } catch (e: any) {
            console.warn("Firestore sendFriendRequest warning (using local fallback):", e.message || e);
            saveLocalRequest(newRequest);
            return { success: true };
        }
    }

    // Local simulation if Firebase is unavailable
    saveLocalRequest(newRequest);
    return { success: true };
};

// 4. ACCEPT FRIEND REQUEST (Creates Mutual Friendship)
export const acceptFriendRequest = async (
    request: FriendRequest
): Promise<{ success: boolean; error?: string }> => {
    if (!request || !request.from || !request.to) {
        return { success: false, error: 'Invalid friend request data.' };
    }
    const cleanFrom = request.from.trim().toLowerCase();
    const cleanTo = request.to.trim().toLowerCase();

    // Update local storage cache immediately so UI reflects friend right away
    try {
        const key = `${LS_FRIENDS_KEY}_${cleanTo}`;
        const raw = localStorage.getItem(key);
        const current: FriendUser[] = raw ? JSON.parse(raw) : [];
        if (!current.some(f => f.username.toLowerCase() === cleanFrom)) {
            current.push({
                username: request.from,
                displayName: request.fromDisplayName,
                avatarUrl: resolvePlayerAvatar({ username: request.from, avatarUrl: request.fromAvatarUrl }),
                playerId: request.fromPlayerId,
                isDeveloper: request.from.toLowerCase() === 'aadish'
            });
            localStorage.setItem(key, JSON.stringify(current));
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent(`bugshot_friends_${cleanTo}`, { detail: current }));
            }
        }
    } catch (e) {}

    if (isFirebaseConfigured() && db) {
        try {
            // 1. Mark request as accepted
            await updateDoc(doc(db, 'friend_requests', request.id), {
                status: 'accepted'
            }).catch(() => {});

            // 2. Add each other to mutual friends list
            await updateDoc(doc(db, 'users', cleanFrom), {
                friends: arrayUnion(cleanTo)
            }).catch((err) => console.warn("updateDoc friends error:", err));

            await updateDoc(doc(db, 'users', cleanTo), {
                friends: arrayUnion(cleanFrom)
            }).catch((err) => console.warn("updateDoc friends error:", err));

            return { success: true };
        } catch (e: any) {
            console.warn("Firestore acceptFriendRequest warning (using local fallback):", e.message || e);
            return { success: true };
        }
    }
    return { success: true };
};

// 5. DECLINE FRIEND REQUEST
export const declineFriendRequest = async (
    requestId: string
): Promise<{ success: boolean; error?: string }> => {
    if (!requestId) return { success: false, error: 'Request ID is required.' };
    if (isFirebaseConfigured() && db) {
        try {
            await deleteDoc(doc(db, 'friend_requests', requestId));
            return { success: true };
        } catch (e: any) {
            console.error("Error declining friend request:", e);
            return { success: false, error: e.message || 'Failed to decline request.' };
        }
    }
    return { success: true };
};

// 5b. REMOVE FRIEND (Mutual unfriend)
export const removeFriend = async (
    userA: string,
    userB: string
): Promise<{ success: boolean; error?: string }> => {
    const cleanA = (userA || '').trim().toLowerCase();
    const cleanB = (userB || '').trim().toLowerCase();
    if (!cleanA || !cleanB) {
        return { success: false, error: 'Both operatives must be specified.' };
    }
    if (isFirebaseConfigured() && db) {
        try {
            await updateDoc(doc(db, 'users', cleanA), {
                friends: arrayRemove(cleanB)
            }).catch(() => {});
            await updateDoc(doc(db, 'users', cleanB), {
                friends: arrayRemove(cleanA)
            }).catch(() => {});
            return { success: true };
        } catch (e: any) {
            console.error("Error removing friend:", e);
            return { success: false, error: e.message || 'Failed to remove friend.' };
        }
    }
    return { success: true };
};

// Helper to save DM to local cache and notify listeners
const saveLocalDM = (convId: string, msg: ChatMessage) => {
    try {
        const raw = localStorage.getItem(`${LS_MESSAGES_KEY}_${convId}`);
        const list: ChatMessage[] = raw ? JSON.parse(raw) : [];
        if (!list.some(m => m.id === msg.id)) {
            list.push(msg);
            localStorage.setItem(`${LS_MESSAGES_KEY}_${convId}`, JSON.stringify(list));
            window.dispatchEvent(new CustomEvent(`bugshot_dm_${convId}`, { detail: list }));
        }
    } catch (e) {}
};

// 6. SUBSCRIBE TO DIRECT MESSAGES (With 30-Day Retention Filter)
export const subscribeToDirectMessages = (
    userA: string,
    userB: string,
    callback: (messages: ChatMessage[]) => void
): (() => void) => {
    const convId = getConversationId(userA, userB);
    const cutoffTimestamp = Date.now() - DIRECT_MESSAGE_RETENTION_MS;

    // Local event listener for instant local sync
    const handleLocalUpdate = (e: any) => {
        if (e.detail && Array.isArray(e.detail)) {
            callback(e.detail);
        }
    };
    if (typeof window !== 'undefined') {
        window.addEventListener(`bugshot_dm_${convId}`, handleLocalUpdate);
    }

    let unsubscribeFirestore = () => {};

    if (isFirebaseConfigured() && db) {
        try {
            // Query only by conversationId (single-field equality, avoiding Firestore composite index requirement)
            const q = query(
                collection(db, 'direct_messages'),
                where('conversationId', '==', convId)
            );

            unsubscribeFirestore = onSnapshot(q, (snapshot) => {
                try {
                    const messages: ChatMessage[] = [];
                    snapshot.forEach((docSnap) => {
                        const data = docSnap.data();
                        if (!data) return;
                        const createdAt = typeof data.createdAt === 'number' ? data.createdAt : Date.now();
                        // Apply 30-Day Retention Filter in memory
                        if (createdAt < cutoffTimestamp) return;

                        messages.push({
                            id: docSnap.id,
                            conversationId: data.conversationId || convId,
                            sender: data.sender || '',
                            senderDisplayName: data.senderDisplayName || data.sender || 'Operative',
                            senderAvatarUrl: resolvePlayerAvatar({ username: data.sender, avatarUrl: data.senderAvatarUrl }),
                            recipient: data.recipient || '',
                            text: data.text || '',
                            stickerId: data.stickerId || undefined,
                            createdAt: createdAt,
                            read: Boolean(data.read)
                        });
                    });

                    // Sort chronological
                    messages.sort((a, b) => a.createdAt - b.createdAt);

                    try {
                        localStorage.setItem(`${LS_MESSAGES_KEY}_${convId}`, JSON.stringify(messages));
                    } catch (e) {}

                    callback(messages);
                } catch (snapshotErr) {
                    console.warn("[Firebase] DM snapshot parsing error:", snapshotErr);
                }
            }, (error) => {
                console.warn("[Firebase] DM listener warning, using local cache:", error);
                try {
                    const raw = localStorage.getItem(`${LS_MESSAGES_KEY}_${convId}`);
                    if (raw) callback(JSON.parse(raw));
                } catch (e) {}
            });
        } catch (e) {
            console.warn("Error initializing DM listener:", e);
        }
    }

    try {
        const raw = localStorage.getItem(`${LS_MESSAGES_KEY}_${convId}`);
        if (raw) callback(JSON.parse(raw));
    } catch (e) {}

    return () => {
        if (unsubscribeFirestore) unsubscribeFirestore();
        if (typeof window !== 'undefined') {
            window.removeEventListener(`bugshot_dm_${convId}`, handleLocalUpdate);
        }
    };
};

// 7. SEND DIRECT MESSAGE
export const sendDirectMessage = async (
    sender: UserProfile,
    recipientUsername: string,
    text: string,
    stickerId?: string
): Promise<{ success: boolean; error?: string; message?: ChatMessage }> => {
    if (!sender || !sender.username) {
        return { success: false, error: 'User profile is required to send messages.' };
    }
    const cleanSender = sender.username.trim().toLowerCase();
    const cleanRecipient = (recipientUsername || '').trim().toLowerCase();
    const cleanText = (text || '').trim();

    if (cleanRecipient === 'bugshot' || cleanRecipient === 'system') {
        return { success: false, error: 'Cannot reply to automated system dispatches (one-way transmission).' };
    }

    if (!cleanText && !stickerId) {
        return { success: false, error: 'Cannot send an empty transmission.' };
    }

    const convId = getConversationId(cleanSender, cleanRecipient);
    
    // Construct message ensuring NO undefined fields are passed to Firestore
    const newMessage: any = {
        conversationId: convId,
        sender: cleanSender,
        senderDisplayName: sender.displayName || sender.username,
        senderAvatarUrl: resolvePlayerAvatar(sender),
        recipient: cleanRecipient,
        text: cleanText,
        createdAt: Date.now(),
        read: false
    };

    if (stickerId) {
        newMessage.stickerId = stickerId;
    }

    if (isFirebaseConfigured() && db) {
        try {
            const docRef = await addDoc(collection(db, 'direct_messages'), newMessage);
            const savedMsg: ChatMessage = { ...newMessage, id: docRef.id };
            saveLocalDM(convId, savedMsg);
            return {
                success: true,
                message: savedMsg
            };
        } catch (e: any) {
            console.warn("[Firebase] Direct message save warning (saving to local cache):", e.message || e);
            // Save to local cache as fallback so messaging continues seamlessly
            const fakeId = `msg_${Date.now()}`;
            const fallbackMsg: ChatMessage = { ...newMessage, id: fakeId };
            saveLocalDM(convId, fallbackMsg);
            return {
                success: true,
                message: fallbackMsg,
                error: e.code === 'permission-denied'
                    ? 'Firestore rules need to be updated in Firebase Console to sync across devices.'
                    : e.message
            };
        }
    }

    // Local simulation fallback
    const fakeId = `msg_${Date.now()}`;
    const fallbackMsg: ChatMessage = { ...newMessage, id: fakeId };
    saveLocalDM(convId, fallbackMsg);
    return { success: true, message: fallbackMsg };
};

// 7b. DISPATCH SYSTEM DIRECT MESSAGE (From BUGSHOT to target user, offline-ready)
export const sendSystemDirectMessage = async (
    targetUsername: string,
    text: string
): Promise<{ success: boolean; error?: string; message?: ChatMessage }> => {
    const cleanRecipient = targetUsername.trim().toLowerCase();
    const cleanText = text.trim();
    if (!cleanRecipient) return { success: false, error: 'Recipient username is required.' };
    if (!cleanText) return { success: false, error: 'Message cannot be empty.' };

    const convId = getConversationId('bugshot', cleanRecipient);
    const systemMsg: any = {
        conversationId: convId,
        sender: 'bugshot',
        senderDisplayName: 'BUGSHOT',
        senderAvatarUrl: '/image/favicon/android-chrome-192x192.png',
        recipient: cleanRecipient,
        text: cleanText,
        createdAt: Date.now(),
        read: false
    };

    if (isFirebaseConfigured() && db) {
        try {
            const docRef = await addDoc(collection(db, 'direct_messages'), systemMsg);
            const savedMsg: ChatMessage = { ...systemMsg, id: docRef.id };
            saveLocalDM(convId, savedMsg);
            // Also notify local listeners if current user is the recipient
            window.dispatchEvent(new CustomEvent('bugshot_notifications_changed'));
            return { success: true, message: savedMsg };
        } catch (e: any) {
            console.warn("[Firebase] System DM save error, using local cache fallback:", e);
            const fakeId = `sys_msg_${Date.now()}`;
            const fallbackMsg: ChatMessage = { ...systemMsg, id: fakeId };
            saveLocalDM(convId, fallbackMsg);
            window.dispatchEvent(new CustomEvent('bugshot_notifications_changed'));
            return { success: true, message: fallbackMsg };
        }
    }

    const fakeId = `sys_msg_${Date.now()}`;
    const fallbackMsg: ChatMessage = { ...systemMsg, id: fakeId };
    saveLocalDM(convId, fallbackMsg);
    window.dispatchEvent(new CustomEvent('bugshot_notifications_changed'));
    return { success: true, message: fallbackMsg };
};

// Helper to save broadcast to local cache and notify listeners
const saveLocalBroadcast = (bcast: ChatMessage) => {
    try {
        const raw = localStorage.getItem(LS_BROADCASTS_KEY);
        const list: ChatMessage[] = raw ? JSON.parse(raw) : [];
        if (!list.some(b => b.id === bcast.id)) {
            list.push(bcast);
            localStorage.setItem(LS_BROADCASTS_KEY, JSON.stringify(list));
            window.dispatchEvent(new CustomEvent('bugshot_broadcasts_updated', { detail: list }));
        }
    } catch (e) {}
};

// 8. SUBSCRIBE TO GLOBAL BROADCASTS (Broadcast Forever — Never Expires)
export const subscribeToBroadcasts = (
    callback: (broadcasts: ChatMessage[]) => void
): (() => void) => {
    // Local event listener for instant local sync
    const handleLocalUpdate = (e: any) => {
        if (e.detail && Array.isArray(e.detail)) {
            callback(e.detail);
        }
    };
    if (typeof window !== 'undefined') {
        window.addEventListener('bugshot_broadcasts_updated', handleLocalUpdate);
    }

    let unsubscribeFirestore = () => {};

    if (isFirebaseConfigured() && db) {
        try {
            const q = query(
                collection(db, 'broadcasts'),
                orderBy('createdAt', 'asc'),
                limit(50)
            );

            unsubscribeFirestore = onSnapshot(q, (snapshot) => {
                try {
                    const broadcasts: ChatMessage[] = [];
                    snapshot.forEach((docSnap) => {
                        const data = docSnap.data();
                        if (!data) return;
                        broadcasts.push({
                            id: docSnap.id,
                            conversationId: 'global_broadcast',
                            sender: data.sender || 'BUGSHOT',
                            senderDisplayName: data.senderDisplayName || 'BUGSHOT // MAINFRAME',
                            senderAvatarUrl: resolvePlayerAvatar({ username: data.sender || 'BUGSHOT', avatarUrl: data.senderAvatarUrl, isDeveloper: true }),
                            recipient: 'all',
                            text: data.text || '',
                            title: data.title || '',
                            stickerId: data.stickerId || undefined,
                            createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
                            pinned: true,
                            isBroadcast: true
                        });
                    });

                    // If empty in Firestore, seed initial welcome broadcast
                    if (broadcasts.length === 0) {
                        const defaultBroadcast: ChatMessage = {
                            id: 'init_broadcast',
                            conversationId: 'global_broadcast',
                            sender: 'BUGSHOT',
                            senderDisplayName: 'BUGSHOT // MAINFRAME',
                            senderAvatarUrl: 'https://avatars.githubusercontent.com/u/101470733',
                            recipient: 'all',
                            title: 'SYSTEM ACTIVATION',
                            text: 'Welcome to BugShot Roulette Cloud Mainframe. All combat operators are connected on secure channels. Stay alert, preserve your soul, and respect the live round.',
                            createdAt: Date.now() - 86400000,
                            pinned: true,
                            isBroadcast: true
                        };
                        broadcasts.push(defaultBroadcast);
                    }

                    try {
                        localStorage.setItem(LS_BROADCASTS_KEY, JSON.stringify(broadcasts));
                    } catch (e) {}

                    callback(broadcasts);
                } catch (snapshotErr) {
                    console.warn("[Firebase] Broadcasts snapshot parsing error:", snapshotErr);
                }
            }, (error) => {
                console.warn("[Firebase] Broadcasts listener warning:", error);
                try {
                    const raw = localStorage.getItem(LS_BROADCASTS_KEY);
                    if (raw) callback(JSON.parse(raw));
                } catch (e) {}
            });
        } catch (e) {
            console.warn("Error establishing broadcast listener:", e);
        }
    }

    try {
        const raw = localStorage.getItem(LS_BROADCASTS_KEY);
        if (raw) callback(JSON.parse(raw));
    } catch (e) {}

    return () => {
        if (unsubscribeFirestore) unsubscribeFirestore();
        if (typeof window !== 'undefined') {
            window.removeEventListener('bugshot_broadcasts_updated', handleLocalUpdate);
        }
    };
};

// 9. SEND GLOBAL BROADCAST (Permanent & Stored Forever)
export const sendBroadcastMessage = async (
    sender: UserProfile,
    text: string,
    title?: string,
    stickerId?: string
): Promise<{ success: boolean; error?: string; broadcast?: ChatMessage }> => {
    if (!sender || !sender.username) {
        return { success: false, error: 'User profile is required to send broadcasts.' };
    }
    const cleanText = (text || '').trim();
    if (!cleanText && !stickerId) {
        return { success: false, error: 'Broadcast message cannot be empty.' };
    }

    // Ensure NO undefined values are passed to Firestore
    const newBroadcast: any = {
        sender: sender.username,
        senderDisplayName: sender.displayName || (sender.isDeveloper ? 'BUGSHOT // DEV' : sender.username),
        senderAvatarUrl: resolvePlayerAvatar(sender),
        recipient: 'all',
        title: (title || '').trim() || 'GLOBAL NOTICE',
        text: cleanText,
        createdAt: Date.now(),
        pinned: true
    };

    if (stickerId) {
        newBroadcast.stickerId = stickerId;
    }

    if (isFirebaseConfigured() && db) {
        try {
            const docRef = await addDoc(collection(db, 'broadcasts'), newBroadcast);
            const savedBcast: ChatMessage = {
                ...newBroadcast,
                id: docRef.id,
                conversationId: 'global_broadcast',
                isBroadcast: true
            };
            saveLocalBroadcast(savedBcast);
            return {
                success: true,
                broadcast: savedBcast
            };
        } catch (e: any) {
            console.warn("Error creating broadcast in Firestore, using local fallback:", e.message || e);
            const fakeId = `bcast_${Date.now()}`;
            const fallbackBcast: ChatMessage = {
                ...newBroadcast,
                id: fakeId,
                conversationId: 'global_broadcast',
                isBroadcast: true
            };
            saveLocalBroadcast(fallbackBcast);
            return {
                success: true,
                broadcast: fallbackBcast
            };
        }
    }

    const fakeId = `bcast_${Date.now()}`;
    const fallbackBcast: ChatMessage = {
        ...newBroadcast,
        id: fakeId,
        conversationId: 'global_broadcast',
        isBroadcast: true
    };
    saveLocalBroadcast(fallbackBcast);
    return {
        success: true,
        broadcast: fallbackBcast
    };
};

// 10. DELETE GLOBAL BROADCAST (Admin / Developer Only)
export const deleteBroadcastMessage = async (
    broadcastId: string,
    adminUser: UserProfile
): Promise<{ success: boolean; error?: string }> => {
    if (!adminUser) {
        return { success: false, error: 'User profile is required.' };
    }
    const isDev = Boolean(
        adminUser.isDeveloper ||
        adminUser.role === 'developer' ||
        adminUser.username?.toLowerCase() === 'aadish'
    );
    if (!isDev) {
        return { success: false, error: 'Unauthorized: Only mainframe administrator can delete broadcasts.' };
    }

    if (!broadcastId) {
        return { success: false, error: 'Broadcast ID is required.' };
    }

    // 1. Remove from local cache
    try {
        const raw = localStorage.getItem(LS_BROADCASTS_KEY);
        if (raw) {
            let list = JSON.parse(raw);
            if (Array.isArray(list)) {
                list = list.filter((b: any) => b.id !== broadcastId);
                localStorage.setItem(LS_BROADCASTS_KEY, JSON.stringify(list));
                window.dispatchEvent(new CustomEvent('bugshot_broadcasts_updated', { detail: list }));
            }
        }
    } catch (e) {}

    // 2. Delete from Firestore
    if (isFirebaseConfigured() && db) {
        try {
            await deleteDoc(doc(db, 'broadcasts', broadcastId));
            return { success: true };
        } catch (e: any) {
            console.warn("Firestore broadcast delete error:", e);
            return { success: false, error: e.message || 'Failed to delete broadcast from database.' };
        }
    }

    return { success: true };
};

export interface NotificationCounts {
    unreadDMs: number;
    pendingRequests: number;
    total: number;
    unreadBySender: Record<string, number>;
}

// 10. SUBSCRIBE TO REAL-TIME NOTIFICATIONS (Friend Requests + Unread DMs)
export const subscribeToNotifications = (
    username: string,
    callback: (counts: NotificationCounts) => void
): (() => void) => {
    const clean = (username || '').trim().toLowerCase();
    if (!clean) {
        callback({ unreadDMs: 0, pendingRequests: 0, total: 0, unreadBySender: {} });
        return () => {};
    }

    let pendingRequests = 0;
    let unreadDMs = 0;
    let unreadBySender: Record<string, number> = {};

    const emit = () => {
        callback({
            unreadDMs,
            pendingRequests,
            total: pendingRequests + unreadDMs,
            unreadBySender
        });
    };

    // 1. Subscribe to incoming friend requests
    const unsubRequests = subscribeToFriendRequests(clean, (requests) => {
        pendingRequests = requests.length;
        emit();
    });

    // 2. Subscribe to unread incoming direct messages
    let unsubDMs = () => {};
    if (isFirebaseConfigured() && db) {
        try {
            // Query only by recipient field (No composite index required!)
            const q = query(
                collection(db, 'direct_messages'),
                where('recipient', '==', clean)
            );

            unsubDMs = onSnapshot(q, (snapshot) => {
                try {
                    const cutoffTimestamp = Date.now() - DIRECT_MESSAGE_RETENTION_MS;
                    let count = 0;
                    const bySender: Record<string, number> = {};

                    snapshot.forEach((docSnap) => {
                        const data = docSnap.data();
                        if (!data) return;
                        const createdAt = typeof data.createdAt === 'number' ? data.createdAt : Date.now();
                        if (!data.read && createdAt >= cutoffTimestamp) {
                            count++;
                            const s = (data.sender || '').toLowerCase();
                            if (s) {
                                bySender[s] = (bySender[s] || 0) + 1;
                            }
                        }
                    });

                    unreadDMs = count;
                    unreadBySender = bySender;
                    emit();
                } catch (notifErr) {
                    console.warn("[Firebase] Notification snapshot error:", notifErr);
                }
            }, (err) => {
                console.warn("[Firebase] Notification listener warning:", err);
            });
        } catch (e) {
            console.warn("Error setting up notification listener:", e);
        }
    }

    // Local storage event listener for instant local updates
    const handleLocalNotifs = () => emit();
    if (typeof window !== 'undefined') {
        window.addEventListener('bugshot_notifications_changed', handleLocalNotifs);
    }

    return () => {
        unsubRequests();
        unsubDMs();
        if (typeof window !== 'undefined') {
            window.removeEventListener('bugshot_notifications_changed', handleLocalNotifs);
        }
    };
};

// 11. MARK CONVERSATION AS READ
export const markConversationAsRead = async (
    currentUsername: string,
    otherUsername: string
): Promise<void> => {
    const cleanCurrent = (currentUsername || '').trim().toLowerCase();
    const cleanOther = (otherUsername || '').trim().toLowerCase();
    if (!cleanCurrent || !cleanOther || cleanOther === 'global_broadcast') return;

    const convId = getConversationId(cleanCurrent, cleanOther);

    // 1. Update local storage cache
    try {
        const raw = localStorage.getItem(`${LS_MESSAGES_KEY}_${convId}`);
        if (raw) {
            const list: ChatMessage[] = JSON.parse(raw);
            let changed = false;
            list.forEach(m => {
                if (m.recipient.toLowerCase() === cleanCurrent && !m.read) {
                    m.read = true;
                    changed = true;
                }
            });
            if (changed) {
                localStorage.setItem(`${LS_MESSAGES_KEY}_${convId}`, JSON.stringify(list));
                window.dispatchEvent(new CustomEvent(`bugshot_dm_${convId}`, { detail: list }));
                window.dispatchEvent(new CustomEvent('bugshot_notifications_changed'));
            }
        }
    } catch (e) {}

    // 2. Update Firestore
    if (isFirebaseConfigured() && db) {
        try {
            const q = query(
                collection(db, 'direct_messages'),
                where('conversationId', '==', convId)
            );
            const snapshot = await getDocs(q);
            const batch = writeBatch(db);
            let unreadFound = false;

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                if (data.recipient?.toLowerCase() === cleanCurrent && !data.read) {
                    batch.update(doc(db, 'direct_messages', docSnap.id), { read: true });
                    unreadFound = true;
                }
            });

            if (unreadFound) {
                await batch.commit();
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('bugshot_notifications_changed'));
                }
            }
        } catch (e) {
            console.warn("Failed marking messages as read in Firestore:", e);
        }
    }
};

export interface FeedbackMessage {
    id: string;
    sender: string;
    senderDisplayName: string;
    senderAvatarUrl: string;
    senderPlayerId: string;
    category: string;
    text: string;
    createdAt: number;
    status: 'unread' | 'read';
}

const LS_FEEDBACKS_KEY = 'aadish_roulette_feedbacks_cache';

// Helper to save feedback to local cache
const saveLocalFeedback = (fb: FeedbackMessage) => {
    try {
        const raw = localStorage.getItem(LS_FEEDBACKS_KEY);
        const list: FeedbackMessage[] = raw ? JSON.parse(raw) : [];
        if (!list.some(f => f.id === fb.id)) {
            list.unshift(fb);
            localStorage.setItem(LS_FEEDBACKS_KEY, JSON.stringify(list));
            window.dispatchEvent(new CustomEvent('bugshot_feedbacks_updated', { detail: list }));
        }
    } catch (e) {}
};

// 12. SEND FEEDBACK TRANSMISSION
export const sendFeedback = async (
    sender: UserProfile,
    text: string,
    category: string = 'Feedback'
): Promise<{ success: boolean; error?: string; feedback?: FeedbackMessage }> => {
    if (!sender || !sender.username) {
        return { success: false, error: 'User profile is required to send feedback.' };
    }
    const cleanText = (text || '').trim();
    if (!cleanText) {
        return { success: false, error: 'Feedback message cannot be empty.' };
    }

    const newFeedback: Omit<FeedbackMessage, 'id'> = {
        sender: sender.username,
        senderDisplayName: sender.displayName || sender.username,
        senderAvatarUrl: resolvePlayerAvatar(sender),
        senderPlayerId: sender.playerId || `@${sender.username}#1000`,
        category: category || 'Feedback',
        text: cleanText,
        createdAt: Date.now(),
        status: 'unread'
    };

    if (isFirebaseConfigured() && db) {
        try {
            const docRef = await addDoc(collection(db, 'feedbacks'), newFeedback);
            const savedFeedback: FeedbackMessage = {
                ...newFeedback,
                id: docRef.id
            };
            saveLocalFeedback(savedFeedback);
            return {
                success: true,
                feedback: savedFeedback
            };
        } catch (e: any) {
            console.warn("[Firebase] Error sending feedback to Firestore:", e);
        }
    }

    const fakeId = `fb_${Date.now()}`;
    const fallbackFeedback: FeedbackMessage = {
        ...newFeedback,
        id: fakeId
    };
    saveLocalFeedback(fallbackFeedback);
    return {
        success: true,
        feedback: fallbackFeedback
    };
};

// 13. SUBSCRIBE TO ALL FEEDBACKS (Admin only or user history)
export const subscribeToFeedbacks = (
    callback: (feedbacks: FeedbackMessage[]) => void
): (() => void) => {
    const handleLocalUpdate = (e: any) => {
        if (e.detail && Array.isArray(e.detail)) {
            callback(e.detail);
        }
    };
    if (typeof window !== 'undefined') {
        window.addEventListener('bugshot_feedbacks_updated', handleLocalUpdate);
    }

    let unsubscribeFirestore = () => {};

    if (isFirebaseConfigured() && db) {
        try {
            const q = query(
                collection(db, 'feedbacks'),
                orderBy('createdAt', 'desc'),
                limit(100)
            );

            unsubscribeFirestore = onSnapshot(q, (snapshot) => {
                try {
                    const list: FeedbackMessage[] = [];
                    snapshot.forEach(docSnap => {
                        const data = docSnap.data();
                        if (!data) return;
                        list.push({
                            id: docSnap.id,
                            sender: data.sender || 'Anonymous',
                            senderDisplayName: data.senderDisplayName || data.sender || 'Anonymous',
                            senderAvatarUrl: data.senderAvatarUrl || resolvePlayerAvatar({ username: data.sender }),
                            senderPlayerId: data.senderPlayerId || `@${data.sender || 'operative'}#1000`,
                            category: data.category || 'Feedback',
                            text: data.text || '',
                            createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
                            status: data.status || 'unread'
                        });
                    });

                    try {
                        localStorage.setItem(LS_FEEDBACKS_KEY, JSON.stringify(list));
                    } catch (e) {}

                    callback(list);
                } catch (snapshotErr) {
                    console.warn("[Firebase] Feedbacks snapshot parsing error:", snapshotErr);
                }
            }, (error) => {
                console.warn("[Firebase] Feedbacks listener warning:", error);
                try {
                    const raw = localStorage.getItem(LS_FEEDBACKS_KEY);
                    if (raw) callback(JSON.parse(raw));
                } catch (e) {}
            });
        } catch (e) {
            console.warn("Error establishing feedback listener:", e);
        }
    }

    try {
        const raw = localStorage.getItem(LS_FEEDBACKS_KEY);
        if (raw) callback(JSON.parse(raw));
    } catch (e) {}

    return () => {
        if (unsubscribeFirestore) unsubscribeFirestore();
        if (typeof window !== 'undefined') {
            window.removeEventListener('bugshot_feedbacks_updated', handleLocalUpdate);
        }
    };
};

// 14. DELETE FEEDBACK (Admin only)
export const deleteFeedback = async (
    feedbackId: string,
    adminUser: UserProfile
): Promise<{ success: boolean; error?: string }> => {
    if (!adminUser) {
        return { success: false, error: 'User profile is required.' };
    }
    const isDev = Boolean(
        adminUser.isDeveloper ||
        adminUser.role === 'developer' ||
        adminUser.username?.toLowerCase() === 'aadish'
    );
    if (!isDev) {
        return { success: false, error: 'Unauthorized: Only mainframe administrator can delete feedbacks.' };
    }

    if (!feedbackId) {
        return { success: false, error: 'Feedback ID is required.' };
    }

    // 1. Remove from local cache
    try {
        const raw = localStorage.getItem(LS_FEEDBACKS_KEY);
        if (raw) {
            let list = JSON.parse(raw);
            if (Array.isArray(list)) {
                list = list.filter((f: any) => f.id !== feedbackId);
                localStorage.setItem(LS_FEEDBACKS_KEY, JSON.stringify(list));
                window.dispatchEvent(new CustomEvent('bugshot_feedbacks_updated', { detail: list }));
            }
        }
    } catch (e) {}

    // 2. Delete from Firestore
    if (isFirebaseConfigured() && db) {
        try {
            await deleteDoc(doc(db, 'feedbacks', feedbackId));
            return { success: true };
        } catch (e: any) {
            console.warn("Firestore feedback delete error:", e);
            return { success: false, error: e.message || 'Failed to delete feedback from database.' };
        }
    }

    return { success: true };
};


