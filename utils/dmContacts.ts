export interface DMContactRecord {
    username: string;
    displayName?: string;
    avatarUrl?: string;
    lastMessage: string;
    lastTimestamp: number;
    lastSender: string;
}

export interface MergedDMContact {
    username: string;
    displayName: string;
    avatarUrl: string;
    avatarStyle?: string;
    avatarSeed?: string;
    playerId: string;
    isDeveloper?: boolean;
    lastMessage?: string;
    lastTimestamp?: number;
    lastSender?: string;
    isFriend?: boolean;
}

const RESERVED_DM_KEYS = new Set([
    'global_broadcast',
    'admin_feedbacks',
    'bugshot',
    'system',
    'anonymous'
]);

export const isValidDMContactUsername = (username?: string | null): boolean => {
    const clean = (username || '').trim().toLowerCase();
    return Boolean(clean) && !RESERVED_DM_KEYS.has(clean);
};

/**
 * Pure helper to upsert a DM contact into a persisted contact list,
 * deduplicating by lowercase username and sorting newest-first.
 */
export const upsertDMContactList = (
    existing: DMContactRecord[],
    incoming: DMContactRecord,
    maxContacts: number = 100
): DMContactRecord[] => {
    const key = (incoming.username || '').trim().toLowerCase();
    if (!isValidDMContactUsername(key)) return existing.slice();

    const map = new Map<string, DMContactRecord>();
    for (const item of existing) {
        const k = (item.username || '').trim().toLowerCase();
        if (!isValidDMContactUsername(k)) continue;
        map.set(k, { ...item, username: k });
    }

    const prev = map.get(key);
    if (!prev || incoming.lastTimestamp >= prev.lastTimestamp) {
        map.set(key, {
            username: key,
            displayName: incoming.displayName || prev?.displayName || key,
            avatarUrl: incoming.avatarUrl || prev?.avatarUrl,
            lastMessage: incoming.lastMessage || prev?.lastMessage || '',
            lastTimestamp: Math.max(incoming.lastTimestamp || 0, prev?.lastTimestamp || 0),
            lastSender: (incoming.lastSender || prev?.lastSender || '').trim().toLowerCase()
        });
    } else if (incoming.displayName && (!prev.displayName || prev.displayName === key)) {
        map.set(key, {
            ...prev,
            displayName: incoming.displayName,
            avatarUrl: incoming.avatarUrl || prev.avatarUrl
        });
    }

    return Array.from(map.values())
        .sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0))
        .slice(0, maxContacts);
};

export interface MergeDMContactsInput {
    friends: Array<{
        username: string;
        displayName: string;
        avatarUrl: string;
        avatarStyle?: any;
        avatarSeed?: string;
        playerId: string;
        isDeveloper?: boolean;
    }>;
    recentDMs: DMContactRecord[];
    unreadBySender?: Record<string, number>;
    selectedChatId?: string | null;
    currentUsername?: string | null;
    resolveContact: (username: string, fallback?: Partial<DMContactRecord>) => MergedDMContact;
}

/**
 * Merges mutual friends, persistent DM history (sent & received), unread senders,
 * and the active selected conversation into a unified deduplicated DM contact list.
 */
export const mergeDMContacts = ({
    friends,
    recentDMs,
    unreadBySender = {},
    selectedChatId,
    currentUsername,
    resolveContact
}: MergeDMContactsInput): MergedDMContact[] => {
    const cleanSelf = (currentUsername || '').trim().toLowerCase();
    const recentByKey = new Map<string, DMContactRecord>();
    for (const rec of recentDMs) {
        const key = (rec.username || '').trim().toLowerCase();
        if (!isValidDMContactUsername(key) || key === cleanSelf) continue;
        const prev = recentByKey.get(key);
        if (!prev || (rec.lastTimestamp || 0) >= (prev.lastTimestamp || 0)) {
            recentByKey.set(key, { ...rec, username: key });
        }
    }

    const byKey = new Map<string, MergedDMContact>();

    // 1. Add all mutual friends (enriched with any recent DM metadata)
    for (const f of friends) {
        const key = (f.username || '').trim().toLowerCase();
        if (!isValidDMContactUsername(key) || key === cleanSelf) continue;
        const recent = recentByKey.get(key);
        const resolved = resolveContact(key, {
            displayName: f.displayName,
            avatarUrl: f.avatarUrl
        });
        byKey.set(key, {
            ...resolved,
            displayName: resolved.displayName || f.displayName || f.username,
            playerId: resolved.playerId || f.playerId,
            isDeveloper: Boolean(resolved.isDeveloper || f.isDeveloper),
            isFriend: true,
            lastMessage: recent?.lastMessage,
            lastTimestamp: recent?.lastTimestamp,
            lastSender: recent?.lastSender
        });
    }

    // 2. Add every persisted DM conversation partner (sent OR received) so chats & names stay in the DM section
    for (const [key, rec] of recentByKey.entries()) {
        if (byKey.has(key)) continue;
        const resolved = resolveContact(key, rec);
        byKey.set(key, {
            ...resolved,
            displayName: resolved.displayName || rec.displayName || key,
            isFriend: false,
            lastMessage: rec.lastMessage,
            lastTimestamp: rec.lastTimestamp,
            lastSender: rec.lastSender
        });
    }

    // 3. Add unread senders not already present
    for (const sender of Object.keys(unreadBySender || {})) {
        const key = sender.trim().toLowerCase();
        if (!isValidDMContactUsername(key) || key === cleanSelf || byKey.has(key)) continue;
        const resolved = resolveContact(key);
        byKey.set(key, {
            ...resolved,
            isFriend: false
        });
    }

    // 4. Add currently selected chat recipient if not already present
    if (selectedChatId) {
        const key = selectedChatId.trim().toLowerCase();
        if (isValidDMContactUsername(key) && key !== cleanSelf && !byKey.has(key)) {
            const resolved = resolveContact(key);
            byKey.set(key, {
                ...resolved,
                isFriend: false
            });
        }
    }

    return Array.from(byKey.values());
};
