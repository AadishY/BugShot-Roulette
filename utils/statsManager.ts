export interface GameStats {
    wins: number;
    losses: number;
    totalRounds: number;
    shotsFired: number;
    shotsHit: number;
    selfShots: number;
    damageDealt: number;
    itemsUsed: number;
    highestRound: number;
    totalPlaytime?: number; // total playtime in seconds
    mostUsedItem?: string;
    itemPoints?: number;
    matchHistory: MatchStats[];
}

export interface MatchStats {
    result: 'WIN' | 'LOSS';
    roundsSurvived: number;
    shotsFired: number;
    shotsHit: number;
    selfShots: number;
    itemsUsed: Record<string, number>;
    damageDealt: number;
    damageTaken: number;
    totalScore: number;
    duration?: number; // match duration in seconds
    matchId?: string;
    timestamp?: number;
    isHardMode?: boolean;
    roundResults?: string[]; // e.g. ['WIN', 'LOSS', 'WIN']
    isMultiplayer?: boolean;
    mpPlayers?: any[];
}

const STORAGE_KEY = 'aadish_roulette_stats_v1';

export const emptyStats = (): GameStats => ({
    wins: 0,
    losses: 0,
    totalRounds: 0,
    shotsFired: 0,
    shotsHit: 0,
    selfShots: 0,
    damageDealt: 0,
    itemsUsed: 0,
    highestRound: 0,
    totalPlaytime: 0,
    matchHistory: []
});

const createMatchHistorySignature = (entry: any): string => {
    const normalizedItems = Object.entries(entry?.itemsUsed || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([item, count]) => `${item}:${count}`)
        .join('|');

    const mpPlayers = Array.isArray(entry?.mpPlayers)
        ? entry.mpPlayers.map((player: any) => `${player?.id || ''}:${player?.name || ''}:${player?.result || ''}`).join('~')
        : '';

    return [
        entry?.timestamp ?? '',
        entry?.result ?? '',
        entry?.roundsSurvived ?? '',
        entry?.shotsFired ?? '',
        entry?.shotsHit ?? '',
        entry?.damageDealt ?? '',
        entry?.totalScore ?? '',
        entry?.isHardMode ? 'hard' : 'normal',
        entry?.isMultiplayer ? 'mp' : 'sp',
        mpPlayers,
        normalizedItems
    ].join('|');
};

export const getActiveUsername = (): string | null => {
    try {
        const session = localStorage.getItem('aadish_roulette_logged_in_user');
        if (session) {
            const parsed = JSON.parse(session);
            if (parsed?.username) return parsed.username.toLowerCase();
        }
    } catch (e) {}
    return null;
};

export const getUserStatsKey = (username?: string | null): string => {
    const u = username || getActiveUsername();
    return u ? `aadish_roulette_stats_user_${u.toLowerCase()}` : 'aadish_roulette_stats_guest';
};

export const setUserActiveStats = (username: string, stats: GameStats) => {
    const key = getUserStatsKey(username);
    localStorage.setItem(key, JSON.stringify(stats));
    // Clean out shared generic key to prevent cross-contamination
    localStorage.removeItem(STORAGE_KEY);
};

export const clearActiveStatsSession = () => {
    try {
        localStorage.removeItem('aadish_roulette_logged_in_user');
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem('aadish_roulette_stats_guest');
        localStorage.removeItem('aadish_roulette_stats');
        localStorage.removeItem('bugshot_stats');
    } catch (e) {}
};

export const getStoredStats = (username?: string): GameStats => {
    try {
        const userKey = getUserStatsKey(username);
        const saved = localStorage.getItem(userKey);
        if (saved) {
            const parsed = JSON.parse(saved) || {};
            const matchHistory = Array.isArray(parsed.matchHistory) ? parsed.matchHistory : [];
            return {
                ...emptyStats(),
                ...parsed,
                matchHistory,
                shotsHit: parsed.shotsHit ?? 0
            };
        }

        // If no user-specific key exists yet, check if active user has stats in their session object
        const activeUser = username || getActiveUsername();
        if (activeUser) {
            const session = localStorage.getItem('aadish_roulette_logged_in_user');
            if (session) {
                const parsedUser = JSON.parse(session);
                if (parsedUser?.username?.toLowerCase() === activeUser.toLowerCase() && parsedUser.stats) {
                    const stats = parsedUser.stats;
                    localStorage.setItem(userKey, JSON.stringify(stats));
                    return stats;
                }
            }
        }
    } catch (e) {
        console.error("Failed to load stats", e);
    }
    return emptyStats();
};

export const calculateMatchScore = (stats: MatchStats): number => {
    let score = 0;

    // Base Score
    if (stats.result === 'WIN') {
        score += 1000;
    }
    score += stats.roundsSurvived * 100;

    // Performance
    score += stats.damageDealt * 50;
    score += stats.shotsHit * 20;

    // Item Points
    Object.values(stats.itemsUsed).forEach(count => {
        score += count * 15;
    });

    // Penalty for mistakes
    score -= stats.selfShots * 50;

    score = Math.max(0, Math.floor(score));

    // Hard Mode Multiplier
    if (stats.isHardMode) {
        score *= 2;
    }

    return score;
};

import { saveUserStatsToFirebase, syncPendingStatsToFirebase } from './firebaseService';

export const syncPendingStats = async (): Promise<void> => {
    return syncPendingStatsToFirebase();
};

export const mergeGameStats = (localStats?: GameStats | null, remoteStats?: GameStats | null): GameStats => {
    const base = localStats ? { ...emptyStats(), ...localStats } : emptyStats();
    const incoming = remoteStats ? { ...emptyStats(), ...remoteStats } : emptyStats();

    const mergedMatchHistory = [
        ...(base.matchHistory || []),
        ...(incoming.matchHistory || [])
    ]
        .filter((entry: any) => entry && typeof entry === 'object')
        .reduce((acc: { seen: Set<string>; entries: any[] }, entry: any) => {
            const signature = createMatchHistorySignature(entry);
            if (!signature || acc.seen.has(signature)) {
                return acc;
            }
            acc.seen.add(signature);
            acc.entries.push(entry);
            return acc;
        }, { seen: new Set<string>(), entries: [] as any[] })
        .entries.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, 20);

    const historyTotals = mergedMatchHistory.reduce((acc: GameStats, entry: any) => {
        if (entry.result === 'WIN') acc.wins += 1;
        else if (entry.result === 'LOSS') acc.losses += 1;

        acc.totalRounds += entry.roundsSurvived || 0;
        acc.shotsFired += entry.shotsFired || 0;
        acc.shotsHit += entry.shotsHit || 0;
        acc.selfShots += entry.selfShots || 0;
        acc.damageDealt += entry.damageDealt || 0;

        const itemCount = (Object.values(entry.itemsUsed || {}) as (number | string)[])
            .reduce<number>((sum: number, count) => sum + (Number(count) || 0), 0);
        acc.itemsUsed += itemCount;
        acc.highestRound = Math.max(acc.highestRound, entry.roundsSurvived || 0);
        return acc;
    }, emptyStats());

    return {
        wins: Math.max(base.wins, incoming.wins, historyTotals.wins),
        losses: Math.max(base.losses, incoming.losses, historyTotals.losses),
        totalRounds: Math.max(base.totalRounds, incoming.totalRounds, historyTotals.totalRounds),
        shotsFired: Math.max(base.shotsFired, incoming.shotsFired, historyTotals.shotsFired),
        shotsHit: Math.max(base.shotsHit || 0, incoming.shotsHit || 0, historyTotals.shotsHit),
        selfShots: Math.max(base.selfShots, incoming.selfShots, historyTotals.selfShots),
        damageDealt: Math.max(base.damageDealt, incoming.damageDealt, historyTotals.damageDealt),
        itemsUsed: Math.max(base.itemsUsed, incoming.itemsUsed, historyTotals.itemsUsed),
        highestRound: Math.max(base.highestRound, incoming.highestRound, historyTotals.highestRound),
        totalPlaytime: Math.max(base.totalPlaytime || 0, incoming.totalPlaytime || 0),
        mostUsedItem: base.mostUsedItem || incoming.mostUsedItem,
        itemPoints: Math.max(base.itemPoints || 0, incoming.itemPoints || 0),
        matchHistory: mergedMatchHistory
    };
};

export const saveGameStats = async (matchStats: MatchStats): Promise<GameStats> => {
    const activeUsername = getActiveUsername();
    const current = getStoredStats(activeUsername || undefined);

    // Update Totals
    if (matchStats.result === 'WIN') current.wins++;
    else current.losses++;

    current.totalRounds += matchStats.roundsSurvived;
    current.shotsFired += matchStats.shotsFired;
    current.shotsHit = (current.shotsHit || 0) + matchStats.shotsHit;
    current.selfShots += matchStats.selfShots;
    current.damageDealt += matchStats.damageDealt;

    // Update Item Stats
    let totalItemsMatch = 0;
    Object.entries(matchStats.itemsUsed || {}).forEach(([, count]) => {
        totalItemsMatch += Number(count) || 0;
    });
    current.itemsUsed += totalItemsMatch;
    current.highestRound = Math.max(current.highestRound, matchStats.roundsSurvived);

    // Playtime accumulation
    const matchDuration = (matchStats.duration && matchStats.duration > 0)
        ? Math.round(matchStats.duration)
        : Math.max(30, (matchStats.roundsSurvived || 1) * 45);
    current.totalPlaytime = (current.totalPlaytime || 0) + matchDuration;

    // Add History
    if (!current.matchHistory) current.matchHistory = [];
    const historyEntry: MatchStats = {
        ...matchStats,
        duration: matchDuration,
        totalScore: calculateMatchScore(matchStats),
        timestamp: Date.now(),
        isMultiplayer: Boolean(matchStats.isMultiplayer),
        mpPlayers: matchStats.mpPlayers || []
    };
    current.matchHistory = [historyEntry, ...current.matchHistory].slice(0, 20);

    // Save strictly to user-scoped key
    const userKey = getUserStatsKey(activeUsername);
    localStorage.setItem(userKey, JSON.stringify(current));

    // Instantly sync to Firebase if user is logged in
    if (activeUsername) {
        try {
            await saveUserStatsToFirebase(activeUsername, current, matchDuration);
            console.log(`[StatsManager] Match saved & synced to Firebase for @${activeUsername} (${matchDuration}s played, total: ${current.totalPlaytime}s)`);
        } catch (e) {
            console.error("Error saving user stats to Firebase:", e);
        }
    }

    return current;
};
