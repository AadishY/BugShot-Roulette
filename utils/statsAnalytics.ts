export interface MatchStatsLike {
    result?: 'WIN' | 'LOSS' | string;
    roundsSurvived?: number;
    shotsFired?: number;
    shotsHit?: number;
    selfShots?: number;
    itemsUsed?: Record<string, number>;
    damageDealt?: number;
    damageTaken?: number;
    totalScore?: number;
    duration?: number;
    timestamp?: number;
    isHardMode?: boolean;
    isMultiplayer?: boolean;
}

export interface GameStatsLike {
    wins?: number;
    losses?: number;
    totalRounds?: number;
    shotsFired?: number;
    shotsHit?: number;
    selfShots?: number;
    damageDealt?: number;
    damageTaken?: number;
    itemsUsed?: number;
    highestRound?: number;
    totalPlaytime?: number;
    mostUsedItem?: string;
    matchHistory?: MatchStatsLike[];
}

export interface DetailedStatsOverrides {
    wins?: number;
    losses?: number;
    hardModeWins?: number;
    totalTimePlayed?: number;
}

export interface DetailedCareerStats {
    wins: number;
    losses: number;
    totalMatches: number;
    winRate: number;
    shotsFired: number;
    shotsHit: number;
    shotsMissed: number;
    accuracy: number;
    selfShots: number;
    damageDealt: number;
    damageTaken: number;
    damageRatio: string;
    avgDamagePerMatch: number;
    itemsUsed: number;
    mostUsedItem: string;
    mostUsedItemCount: number;
    totalRounds: number;
    highestRound: number;
    hardModeWins: number;
    hardModeMatches: number;
    mpWins: number;
    mpMatches: number;
    soloWins: number;
    soloMatches: number;
    currentStreak: number;
    bestStreak: number;
    bestScore: number;
    avgScore: number;
    totalScore: number;
    combatRating: number;
    totalPlaytimeSeconds: number;
    formattedPlaytime: string;
    combatRank: {
        tier: 'S+' | 'S' | 'A' | 'B' | 'C' | 'D';
        label: string;
        colorClass: string;
    };
}

export const formatDurationCompact = (seconds: number): string => {
    const safeSecs = Math.max(0, Math.round(seconds || 0));
    const hours = Math.floor(safeSecs / 3600);
    const mins = Math.floor((safeSecs % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m`;
    return safeSecs > 0 ? `${safeSecs}s` : '0m';
};

export const computeDetailedStats = (
    stats?: GameStatsLike | null,
    overrides?: DetailedStatsOverrides
): DetailedCareerStats => {
    const s = stats || {};
    const history = Array.isArray(s.matchHistory) ? s.matchHistory.filter(Boolean) : [];

    const wins = Math.max(0, Number(overrides?.wins ?? s.wins ?? 0) || 0);
    const losses = Math.max(0, Number(overrides?.losses ?? s.losses ?? 0) || 0);
    const totalMatches = wins + losses;
    const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

    const shotsFired = Math.max(0, Number(s.shotsFired ?? 0) || 0);
    const shotsHit = Math.max(0, Math.min(shotsFired || Number.MAX_SAFE_INTEGER, Number(s.shotsHit ?? 0) || 0));
    const shotsMissed = Math.max(0, shotsFired - shotsHit);
    const accuracy = shotsFired > 0 ? Math.round((shotsHit / shotsFired) * 100) : 0;
    const selfShots = Math.max(0, Number(s.selfShots ?? 0) || 0);

    let historyDamageTaken = 0;
    let historyItemsUsed = 0;
    let hardModeWinsFromHistory = 0;
    let hardModeMatches = 0;
    let mpWins = 0;
    let mpMatches = 0;
    let soloWins = 0;
    let soloMatches = 0;
    let bestScore = 0;
    let totalScore = 0;
    let scoredCount = 0;
    let highestRoundFromHistory = 0;
    const itemTally: Record<string, number> = {};

    // Compute streaks chronologically (history is stored newest-first)
    let currentStreak = 0;
    let countingCurrentStreak = true;
    let bestStreak = 0;
    let runningStreak = 0;

    for (let i = 0; i < history.length; i++) {
        const m = history[i];
        const isWin = m.result === 'WIN';
        if (countingCurrentStreak) {
            if (isWin) currentStreak++;
            else countingCurrentStreak = false;
        }

        if (m.isMultiplayer) {
            mpMatches++;
            if (isWin) mpWins++;
        } else if (m.isHardMode) {
            hardModeMatches++;
            if (isWin) hardModeWinsFromHistory++;
        } else {
            soloMatches++;
            if (isWin) soloWins++;
        }

        historyDamageTaken += Math.max(0, Number(m.damageTaken || 0));
        highestRoundFromHistory = Math.max(highestRoundFromHistory, Number(m.roundsSurvived || 0));

        const sc = Number(m.totalScore || 0);
        if (sc > 0) {
            scoredCount++;
            totalScore += sc;
            if (sc > bestScore) bestScore = sc;
        }

        if (m.itemsUsed && typeof m.itemsUsed === 'object') {
            for (const [key, val] of Object.entries(m.itemsUsed)) {
                const count = Number(val) || 0;
                if (count > 0) {
                    itemTally[key] = (itemTally[key] || 0) + count;
                    historyItemsUsed += count;
                }
            }
        }
    }

    // Walk oldest -> newest for best win streak
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].result === 'WIN') {
            runningStreak++;
            if (runningStreak > bestStreak) bestStreak = runningStreak;
        } else {
            runningStreak = 0;
        }
    }

    const damageDealt = Math.max(0, Number(s.damageDealt ?? 0) || 0);
    const damageTaken = Math.max(Number(s.damageTaken ?? 0) || 0, historyDamageTaken);
    const damageRatio =
        damageTaken > 0
            ? (damageDealt / damageTaken).toFixed(2)
            : damageDealt > 0
                ? `${damageDealt}.00`
                : '0.00';
    const avgDamagePerMatch = totalMatches > 0 ? Math.round((damageDealt / totalMatches) * 10) / 10 : 0;

    const itemsUsed = Math.max(Number(s.itemsUsed ?? 0) || 0, historyItemsUsed);
    let mostUsedItem = s.mostUsedItem || 'NONE';
    let mostUsedItemCount = 0;
    for (const [itemKey, count] of Object.entries(itemTally)) {
        if (count > mostUsedItemCount) {
            mostUsedItemCount = count;
            mostUsedItem = itemKey.replace(/_/g, ' ');
        }
    }

    const totalRounds = Math.max(0, Number(s.totalRounds ?? 0) || 0);
    const highestRound = Math.max(Number(s.highestRound ?? 0) || 0, highestRoundFromHistory);
    const hardModeWins = Math.max(Number(overrides?.hardModeWins ?? 0) || 0, hardModeWinsFromHistory);
    const avgScore = scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0;

    // Unified career combat rating for ranking & comparison
    const combatRating = Math.max(
        0,
        Math.round(wins * 120 + hardModeWins * 180 + damageDealt * 10 + Math.round(accuracy * 2) - selfShots * 15)
    );

    const totalPlaytimeSeconds = Math.max(
        0,
        Number(overrides?.totalTimePlayed ?? s.totalPlaytime ?? totalRounds * 60) || 0
    );

    let combatRank: DetailedCareerStats['combatRank'];
    if (wins >= 25 && winRate >= 70 && hardModeWins >= 5) {
        combatRank = { tier: 'S+', label: 'APEX', colorClass: 'text-amber-300 border-amber-500/70 bg-amber-950/50' };
    } else if (wins >= 15 && winRate >= 60) {
        combatRank = { tier: 'S', label: 'ELITE', colorClass: 'text-emerald-300 border-emerald-500/70 bg-emerald-950/50' };
    } else if (wins >= 8 && winRate >= 50) {
        combatRank = { tier: 'A', label: 'VETERAN', colorClass: 'text-cyan-300 border-cyan-500/70 bg-cyan-950/50' };
    } else if (wins >= 3) {
        combatRank = { tier: 'B', label: 'TACTICIAN', colorClass: 'text-blue-300 border-blue-500/60 bg-blue-950/40' };
    } else if (totalMatches > 0) {
        combatRank = { tier: 'C', label: 'OPERATIVE', colorClass: 'text-stone-300 border-stone-600 bg-stone-900/70' };
    } else {
        combatRank = { tier: 'D', label: 'ROOKIE', colorClass: 'text-stone-400 border-stone-700 bg-stone-900/60' };
    }

    return {
        wins,
        losses,
        totalMatches,
        winRate,
        shotsFired,
        shotsHit,
        shotsMissed,
        accuracy,
        selfShots,
        damageDealt,
        damageTaken,
        damageRatio,
        avgDamagePerMatch,
        itemsUsed,
        mostUsedItem,
        mostUsedItemCount,
        totalRounds,
        highestRound,
        hardModeWins,
        hardModeMatches,
        mpWins,
        mpMatches,
        soloWins,
        soloMatches,
        currentStreak,
        bestStreak,
        bestScore,
        avgScore,
        totalScore,
        combatRating,
        totalPlaytimeSeconds,
        formattedPlaytime: formatDurationCompact(totalPlaytimeSeconds),
        combatRank
    };
};
