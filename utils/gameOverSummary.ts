import { MatchStats } from './statsManager';
import { resolveSplitWinnerName } from './splitMode';

export type GameOverGrade = 'S' | 'A' | 'B' | 'C' | 'F';

export interface GameOverCommendation {
    label: string;
    tone: 'emerald' | 'amber' | 'cyan' | 'rose';
}

export interface SplitGameOverContext {
    isLocalSplit: boolean;
    player1Name?: string;
    player2Name?: string;
    player1Wins?: number;
    player2Wins?: number;
    totalMatches?: number;
}

export interface GameOverSummary {
    isPlayerWin: boolean;
    isHardMode: boolean;
    isLocalSplit: boolean;
    winnerName: string;
    seriesScoreText?: string;
    title: string;
    subtitle: string;
    totalScore: number;
    roundsSurvived: number;
    shotsFired: number;
    shotsHit: number;
    accuracy: number;
    damageDealt: number;
    damageTaken: number;
    totalItemsUsed: number;
    topItems: Array<{ name: string; count: number }>;
    rankGrade: GameOverGrade;
    rankTitle: string;
    scoreBreakdown: Array<{ label: string; value: number }>;
    commendations: GameOverCommendation[];
}

const safeInt = (val: unknown, fallback = 0): number => {
    const n = Number(val);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

/**
 * Pure, crash-proof Game Over summary builder.
 * Handles missing/null matchData, Hard Mode victory text, and Local Split winner titles cleanly.
 */
export const computeGameOverSummary = (
    winner: 'PLAYER' | 'DEALER' | string | null | undefined,
    matchData?: Partial<MatchStats> | null,
    isMultiplayer: boolean = false,
    isThreeOrFourPlayerWin: boolean = false,
    splitContext?: SplitGameOverContext
): GameOverSummary => {
    const isLocalSplit = Boolean(splitContext?.isLocalSplit || matchData?.isLocalSplit);
    const isPlayerWin = isLocalSplit ? Boolean(winner === 'PLAYER' || winner === 'DEALER') : winner === 'PLAYER';
    const isHardMode = Boolean(matchData?.isHardMode) && !isLocalSplit;

    const p1Name = (splitContext?.player1Name || 'PLAYER 1').trim().toUpperCase();
    const p2Name = (splitContext?.player2Name || 'PLAYER 2').trim().toUpperCase();
    const winnerName = isLocalSplit
        ? resolveSplitWinnerName(winner, p1Name, p2Name)
        : (winner === 'PLAYER' ? 'YOU' : 'DEALER');

    const seriesScoreText = isLocalSplit
        ? `${p1Name} ${safeInt(splitContext?.player1Wins, winner === 'PLAYER' ? 1 : 0)} - ${safeInt(splitContext?.player2Wins, winner === 'DEALER' ? 1 : 0)} ${p2Name}`
        : undefined;

    const roundsSurvived = safeInt(matchData?.roundsSurvived, isPlayerWin ? 1 : 0);
    const shotsFired = safeInt(matchData?.shotsFired, 0);
    const shotsHit = Math.min(shotsFired, safeInt(matchData?.shotsHit, 0));
    const accuracy = shotsFired > 0 ? Math.round((shotsHit / shotsFired) * 100) : 0;
    const damageDealt = safeInt(matchData?.damageDealt, 0);
    const damageTaken = safeInt(matchData?.damageTaken, 0);

    const rawItems = matchData?.itemsUsed && typeof matchData.itemsUsed === 'object'
        ? matchData.itemsUsed
        : {};
    const topItems = Object.entries(rawItems)
        .map(([name, count]) => ({ name, count: safeInt(count, 0) }))
        .filter((entry) => entry.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);
    const totalItemsUsed = Object.values(rawItems).reduce((acc, v) => acc + safeInt(v, 0), 0);

    const winBonus = isPlayerWin ? (isHardMode ? 2500 : 1000) : 0;
    const roundPoints = roundsSurvived * (isHardMode ? 400 : 200);
    const damagePoints = damageDealt * 100;
    const accuracyPoints = accuracy >= 75 ? 500 : accuracy >= 50 ? 250 : 0;
    const tacticalPoints = totalItemsUsed * 35;

    const computedFallbackScore = winBonus + roundPoints + damagePoints + accuracyPoints + tacticalPoints;
    const totalScore = matchData && typeof matchData.totalScore === 'number' && Number.isFinite(matchData.totalScore) && matchData.totalScore > 0
        ? Math.max(0, Math.floor(matchData.totalScore))
        : computedFallbackScore;

    const scoreBreakdown: Array<{ label: string; value: number }> = [
        {
            label: isLocalSplit
                ? `Split Victory (${winnerName})`
                : isHardMode
                ? 'Hard Mode Victory'
                : 'Contract Victory',
            value: winBonus
        },
        { label: `Rounds Played (${roundsSurvived})`, value: roundPoints },
        { label: `Damage Dealt (${damageDealt})`, value: damagePoints },
        { label: `Accuracy Bonus (${accuracy}%)`, value: accuracyPoints },
        { label: `Tactical Deployment (${totalItemsUsed})`, value: tacticalPoints }
    ].filter((row) => row.value > 0);

    let rankGrade: GameOverGrade = 'C';
    let rankTitle = 'SURVIVOR';
    if (!isPlayerWin) {
        if (totalScore >= 1800) {
            rankGrade = 'B';
            rankTitle = 'DEFIANT FALLEN';
        } else if (totalScore >= 800) {
            rankGrade = 'C';
            rankTitle = 'CASUALTY';
        } else {
            rankGrade = 'F';
            rankTitle = 'ELIMINATED';
        }
    } else if (totalScore >= 4000 || (isHardMode && totalScore >= 3200)) {
        rankGrade = 'S';
        rankTitle = isLocalSplit ? 'TABLE CHAMPION' : isHardMode ? 'APEX EXECUTIONER' : 'MASTER TACTICIAN';
    } else if (totalScore >= 2500) {
        rankGrade = 'A';
        rankTitle = isLocalSplit ? 'DUEL MASTER' : 'ELITE OPERATIVE';
    } else if (totalScore >= 1500) {
        rankGrade = 'B';
        rankTitle = 'VETERAN';
    } else {
        rankGrade = 'C';
        rankTitle = 'SURVIVOR';
    }

    const commendations: GameOverCommendation[] = [];
    if (isLocalSplit) {
        commendations.push({ label: `${winnerName} CHAMPION`, tone: 'amber' });
    }
    if (isPlayerWin && isHardMode) {
        commendations.push({ label: 'HARD MODE CONQUEROR', tone: 'amber' });
    }
    if (isPlayerWin && isThreeOrFourPlayerWin) {
        commendations.push({ label: 'ARENA CHAMPION', tone: 'amber' });
    }
    if (!isLocalSplit && isPlayerWin && damageTaken === 0 && roundsSurvived > 0) {
        commendations.push({ label: 'UNTOUCHABLE', tone: 'emerald' });
    }
    if (accuracy >= 75 && shotsFired >= 3) {
        commendations.push({ label: 'DEADEYE', tone: 'cyan' });
    }
    if (totalItemsUsed >= 5) {
        commendations.push({ label: 'TACTICIAN', tone: 'cyan' });
    }
    if (isPlayerWin && totalItemsUsed === 0) {
        commendations.push({ label: 'PURE STEEL', tone: 'emerald' });
    }
    if (!isPlayerWin && damageDealt >= 6) {
        commendations.push({ label: 'LAST STAND', tone: 'rose' });
    }

    let title = 'ELIMINATED';
    let subtitle = 'CONTRACT TERMINATED';
    if (isLocalSplit) {
        title = `${winnerName} WINS!`;
        subtitle = seriesScoreText
            ? `LOCAL SPLIT SERIES • ${seriesScoreText}`
            : 'LOCAL SPLIT DUEL COMPLETE';
    } else if (isPlayerWin) {
        if (isThreeOrFourPlayerWin) {
            title = 'CHAMPION';
            subtitle = 'LAST OPERATIVE STANDING';
        } else if (isHardMode) {
            title = 'HARD MODE CLEARED';
            subtitle = 'IMPOSSIBLE ODDS SURVIVED';
        } else if (isMultiplayer) {
            title = 'VICTORY';
            subtitle = 'OPPONENT ELIMINATED';
        } else {
            title = 'VICTORY';
            subtitle = 'DEALER TERMINATED';
        }
    } else if (isHardMode) {
        title = 'TERMINATED';
        subtitle = 'HARD PROTOCOL FAILED';
    } else if (isMultiplayer) {
        title = 'ELIMINATED';
        subtitle = 'OUTPLAYED AT THE TABLE';
    }

    return {
        isPlayerWin,
        isHardMode,
        isLocalSplit,
        winnerName,
        seriesScoreText,
        title,
        subtitle,
        totalScore,
        roundsSurvived,
        shotsFired,
        shotsHit,
        accuracy,
        damageDealt,
        damageTaken,
        totalItemsUsed,
        topItems,
        rankGrade,
        rankTitle,
        scoreBreakdown,
        commendations
    };
};
