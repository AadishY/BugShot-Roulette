import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
    Trophy,
    Skull,
    Crown,
    RotateCcw,
    Home,
    Crosshair,
    Shield,
    Flame,
    Package,
    Award,
    Clock,
    AlertTriangle,
    Users
} from 'lucide-react';
import { getStoredStats, saveGameStats, GameStats, MatchStats } from '../../utils/statsManager';
import { computeGameOverSummary } from '../../utils/gameOverSummary';
import { audioManager } from '../../utils/audioManager';

interface GameOverScreenProps {
    winner: 'PLAYER' | 'DEALER' | string | null;
    onResetGame: (returnToIntro?: boolean) => void;
    matchData?: MatchStats | null;
    isDebugUsed?: boolean;
    isMultiplayer?: boolean;
    isThreeOrFourPlayerWin?: boolean;
    isLocalSplit?: boolean;
    player1Name?: string;
    player2Name?: string;
    splitScore?: { playerWins: number; opponentWins: number };
    splitTotalMatches?: number;
}

const WIN_QUOTES = [
    "THE TABLE FALLS SILENT. YOU WALK AWAY WITH YOUR SOUL INTACT.",
    "THE HOUSE ALWAYS WINS — EXCEPT TONIGHT.",
    "STEEL NERVES OUTLASTED EVERY CHAMBER.",
    "CONTRACT FULFILLED. THE DEALER COUNTS HIS LOSSES."
];

const LOSS_QUOTES = [
    "THE CHAMBER ALWAYS COLLECTS WHAT IT IS OWED.",
    "STATIC FILLS THE ROOM. THE CONTRACT IS CLOSED.",
    "ONE CLICK TOO LATE. THE DEALER RELOADS FOR THE NEXT CHALLENGER.",
    "NO MERCY IN THE BUNKER. REGROUP AND STEP BACK TO THE TABLE."
];

const HARD_WIN_QUOTES = [
    "IMPOSSIBLE ODDS SHATTERED. THE BUNKER REMEMBERS YOUR NAME.",
    "YOU STARED DOWN GOD-MODE PRECISION AND NEVER BLINKED."
];

const SPLIT_QUOTES = [
    "TWO CONTENDERS, ONE SHOTGUN, ONE SURVIVOR AT THE TABLE.",
    "NERVES OF STEEL DECIDED THE PASS-AND-PLAY DUEL.",
    "SETTLED FACE TO FACE OVER THE SAME CHAMBER."
];

const GRADE_STYLE: Record<string, string> = {
    S: 'border-amber-400/80 bg-amber-950/50 text-amber-300 shadow-[0_0_28px_rgba(251,191,36,0.28)]',
    A: 'border-emerald-400/80 bg-emerald-950/50 text-emerald-300 shadow-[0_0_24px_rgba(16,185,129,0.22)]',
    B: 'border-cyan-400/70 bg-cyan-950/50 text-cyan-300',
    C: 'border-stone-500/70 bg-stone-900/80 text-stone-200',
    F: 'border-red-600/80 bg-red-950/50 text-red-400'
};

const COMMENDATION_TONE: Record<string, string> = {
    amber: 'bg-amber-950/60 border-amber-500/50 text-amber-300',
    emerald: 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300',
    cyan: 'bg-cyan-950/60 border-cyan-500/50 text-cyan-300',
    rose: 'bg-red-950/60 border-red-500/50 text-red-300'
};

export const GameOverScreen: React.FC<GameOverScreenProps> = ({
    winner,
    onResetGame,
    matchData,
    isDebugUsed = false,
    isMultiplayer = false,
    isThreeOrFourPlayerWin = false,
    isLocalSplit = false,
    player1Name,
    player2Name,
    splitScore,
    splitTotalMatches
}) => {
    const [stats, setStats] = useState<GameStats>(() => getStoredStats());
    const [displayScore, setDisplayScore] = useState(0);
    const hasResetRef = useRef(false);
    const hasSavedStatsRef = useRef(false);

    const summary = useMemo(
        () =>
            computeGameOverSummary(
                winner,
                matchData,
                isMultiplayer,
                isThreeOrFourPlayerWin,
                isLocalSplit
                    ? {
                        isLocalSplit: true,
                        player1Name,
                        player2Name,
                        player1Wins: splitScore?.playerWins,
                        player2Wins: splitScore?.opponentWins,
                        totalMatches: splitTotalMatches
                    }
                    : undefined
            ),
        [winner, matchData, isMultiplayer, isThreeOrFourPlayerWin, isLocalSplit, player1Name, player2Name, splitScore?.playerWins, splitScore?.opponentWins, splitTotalMatches]
    );

    const quote = useMemo(() => {
        if (isLocalSplit) {
            return SPLIT_QUOTES[Math.floor(Math.random() * SPLIT_QUOTES.length)];
        }
        if (summary.isPlayerWin && summary.isHardMode) {
            return HARD_WIN_QUOTES[Math.floor(Math.random() * HARD_WIN_QUOTES.length)];
        }
        const pool = summary.isPlayerWin ? WIN_QUOTES : LOSS_QUOTES;
        return pool[Math.floor(Math.random() * pool.length)];
    }, [isLocalSplit, summary.isPlayerWin, summary.isHardMode]);

    // Persist match telemetry ONCE per finished match (unless debug/sandbox was used)
    useEffect(() => {
        if (hasSavedStatsRef.current) return;
        hasSavedStatsRef.current = true;

        if (matchData && !isDebugUsed) {
            const payload: MatchStats = {
                ...matchData,
                result: matchData.result || (winner === 'PLAYER' ? 'WIN' : 'LOSS'),
                totalScore: summary.totalScore,
                isMultiplayer: Boolean(isMultiplayer || isLocalSplit || matchData.isMultiplayer),
                isLocalSplit: Boolean(isLocalSplit || matchData.isLocalSplit),
                mpPlayers: Array.isArray(matchData.mpPlayers) ? matchData.mpPlayers : []
            };
            saveGameStats(payload)
                .then((updated) => {
                    if (updated) setStats(updated);
                })
                .catch(() => {
                    try {
                        setStats(getStoredStats());
                    } catch {}
                });
        } else {
            try {
                setStats(getStoredStats());
            } catch {}
        }
    }, [matchData, isDebugUsed, winner, summary.totalScore, isMultiplayer, isLocalSplit]);

    // Lightweight rAF score count-up (stops cleanly in ~700ms)
    useEffect(() => {
        const target = summary.totalScore;
        if (target <= 0) {
            setDisplayScore(0);
            return;
        }
        let rafId = 0;
        const start = performance.now();
        const duration = 700;
        const step = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            setDisplayScore(Math.round(target * eased));
            if (t < 1) {
                rafId = requestAnimationFrame(step);
            }
        };
        rafId = requestAnimationFrame(step);
        return () => cancelAnimationFrame(rafId);
    }, [summary.totalScore]);

    const handlePlayAgain = () => {
        if (hasResetRef.current) return;
        hasResetRef.current = true;
        audioManager.playSound('confirm');
        onResetGame(false);
    };

    const handleMainMenu = () => {
        if (hasResetRef.current) return;
        hasResetRef.current = true;
        audioManager.playSound('click');
        onResetGame(true);
    };

    const isHardVictory = summary.isPlayerWin && summary.isHardMode;
    const isGoldTheme = isHardVictory || isThreeOrFourPlayerWin || isLocalSplit;
    const accentBorder = isGoldTheme
        ? 'border-amber-500/60'
        : summary.isPlayerWin
        ? 'border-emerald-500/60'
        : 'border-red-600/60';
    const accentGlow = isGoldTheme
        ? 'from-amber-500/20 via-amber-950/10 to-transparent'
        : summary.isPlayerWin
        ? 'from-emerald-500/18 via-emerald-950/10 to-transparent'
        : 'from-red-600/20 via-red-950/10 to-transparent';
    const accentText = isGoldTheme
        ? 'text-amber-400'
        : summary.isPlayerWin
        ? 'text-emerald-400'
        : 'text-red-500';
    const accentTopLine = isGoldTheme
        ? 'from-transparent via-amber-400 to-transparent'
        : summary.isPlayerWin
        ? 'from-transparent via-emerald-400 to-transparent'
        : 'from-transparent via-red-500 to-transparent';

    const recentMatches = useMemo(() => {
        const history = Array.isArray(stats?.matchHistory) ? stats.matchHistory : [];
        return history.slice(0, 3);
    }, [stats]);

    const careerWins = Math.max(0, Number(stats?.wins) || 0);
    const careerLosses = Math.max(0, Number(stats?.losses) || 0);
    const careerGames = careerWins + careerLosses;
    const careerWinRate = careerGames > 0 ? Math.round((careerWins / careerGames) * 100) : 0;
    const careerBestScore = useMemo(() => {
        const history = Array.isArray(stats?.matchHistory) ? stats.matchHistory : [];
        let maxScore = summary.totalScore;
        for (const m of history) {
            const sc = Number(m?.totalScore) || 0;
            if (sc > maxScore) maxScore = sc;
        }
        return maxScore;
    }, [stats, summary.totalScore]);

    const p1Display = (player1Name || 'PLAYER 1').toUpperCase();
    const p2Display = (player2Name || 'PLAYER 2').toUpperCase();

    return (
        <div
            className="fixed inset-0 z-[200] bg-[#080706] text-stone-100 font-mono select-none flex flex-col overflow-hidden pointer-events-auto animate-in fade-in duration-300"
            style={{
                paddingTop: 'max(env(safe-area-inset-top, 0px), 10px)',
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 10px)',
                paddingLeft: 'max(env(safe-area-inset-left, 0px), 12px)',
                paddingRight: 'max(env(safe-area-inset-right, 0px), 12px)'
            }}
        >
            {/* Zero-cost CSS Ambient Backdrop */}
            <div className={`absolute inset-0 bg-gradient-to-b ${accentGlow} pointer-events-none`} />
            <div
                className="absolute inset-0 opacity-[0.04] pointer-events-none"
                style={{
                    backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.6) 0px, rgba(255,255,255,0.6) 1px, transparent 1px, transparent 3px)'
                }}
            />

            {/* Main Bounded Tactical Container */}
            <div className={`relative z-10 w-full max-w-5xl mx-auto flex-1 min-h-0 flex flex-col bg-[#0d0c0b]/95 border ${accentBorder} rounded-2xl overflow-hidden shadow-[0_20px_70px_rgba(0,0,0,0.85)]`}>
                {/* Top Accent Strip */}
                <div className={`h-1 w-full shrink-0 bg-gradient-to-r ${accentTopLine}`} />

                {/* 1. COMPACT HERO HEADER */}
                <div className="shrink-0 px-4 py-3 sm:px-6 sm:py-4 border-b border-stone-800/90 bg-stone-950/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                        <div className={`w-11 h-11 sm:w-14 sm:h-14 rounded-xl border ${accentBorder} bg-black/70 flex items-center justify-center shrink-0`}>
                            {isGoldTheme ? (
                                <Crown className="w-6 h-6 sm:w-7 sm:h-7 text-amber-400" />
                            ) : summary.isPlayerWin ? (
                                <Trophy className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-400" />
                            ) : (
                                <Skull className="w-6 h-6 sm:w-7 sm:h-7 text-red-500" />
                            )}
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[9px] sm:text-[10px] font-black tracking-[0.22em] uppercase ${accentText}`}>
                                    {summary.subtitle}
                                </span>
                                {isLocalSplit && (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-950/90 border border-amber-500/70 text-amber-300 text-[8px] font-black tracking-widest uppercase">
                                        LOCAL SPLIT
                                    </span>
                                )}
                                {summary.isHardMode && (
                                    <span className="px-1.5 py-0.5 rounded bg-red-950/90 border border-red-600/70 text-red-300 text-[8px] font-black tracking-widest uppercase">
                                        HARD MODE
                                    </span>
                                )}
                                {isMultiplayer && !isLocalSplit && (
                                    <span className="px-1.5 py-0.5 rounded bg-cyan-950/90 border border-cyan-600/70 text-cyan-300 text-[8px] font-black tracking-widest uppercase">
                                        MULTIPLAYER
                                    </span>
                                )}
                                {isDebugUsed && (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-950/90 border border-amber-600/70 text-amber-300 text-[8px] font-black tracking-widest uppercase">
                                        SANDBOX
                                    </span>
                                )}
                            </div>
                            <h1 className="text-xl sm:text-3xl lg:text-4xl font-black tracking-[0.06em] uppercase text-white leading-tight truncate">
                                {summary.title}
                            </h1>
                            <p className="text-[9.5px] sm:text-[11px] text-stone-400 tracking-wide truncate mt-0.5">
                                {quote}
                            </p>
                        </div>
                    </div>

                    {/* Score & Class Rank Crest */}
                    <div className="flex items-center gap-3 sm:gap-4 shrink-0 self-start sm:self-center bg-black/60 border border-stone-800/90 rounded-xl px-3.5 py-2">
                        <div className="text-left sm:text-right">
                            <div className="text-[8px] sm:text-[9px] text-stone-500 font-bold uppercase tracking-[0.2em]">
                                COMBAT RATING
                            </div>
                            <div className="text-xl sm:text-3xl font-black text-white tabular-nums leading-none mt-0.5">
                                {displayScore.toLocaleString()}
                            </div>
                            <div className="text-[8px] sm:text-[9px] text-stone-400 font-bold uppercase tracking-widest mt-0.5">
                                {summary.rankTitle}
                            </div>
                        </div>
                        <div
                            className={`w-11 h-11 sm:w-13 sm:h-13 rounded-xl border-2 flex items-center justify-center text-2xl sm:text-3xl font-black shrink-0 ${GRADE_STYLE[summary.rankGrade] || GRADE_STYLE.C}`}
                            title={`Combat Rank ${summary.rankGrade}`}
                        >
                            {summary.rankGrade}
                        </div>
                    </div>
                </div>

                {/* 2. SCROLLABLE TELEMETRY & DOSSIER BODY */}
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3.5 sm:p-5 space-y-3.5 sm:space-y-4">
                    {/* Local Split Head-to-Head Banner */}
                    {isLocalSplit && (
                        <div className="grid grid-cols-3 items-center gap-2 bg-stone-950/90 border border-amber-500/40 rounded-xl p-3 sm:p-4">
                            <div className={`flex flex-col items-start min-w-0 p-2 rounded-lg border ${winner === 'PLAYER' ? 'bg-amber-950/40 border-amber-400/70' : 'bg-black/40 border-stone-800'}`}>
                                <span className="text-[8px] font-black tracking-[0.2em] uppercase text-stone-400 flex items-center gap-1">
                                    <Users size={10} /> PLAYER 1 {winner === 'PLAYER' && '• WINNER'}
                                </span>
                                <span className={`text-sm sm:text-lg font-black uppercase truncate w-full ${winner === 'PLAYER' ? 'text-amber-300' : 'text-stone-300'}`}>
                                    {p1Display}
                                </span>
                            </div>

                            <div className="text-center">
                                <div className="text-[8px] font-black uppercase tracking-[0.25em] text-stone-500">
                                    SERIES SCORE {splitTotalMatches ? `(BO${splitTotalMatches})` : ''}
                                </div>
                                <div className="text-2xl sm:text-3xl font-black tabular-nums text-white tracking-wider mt-0.5">
                                    <span className={winner === 'PLAYER' ? 'text-amber-400' : 'text-stone-400'}>
                                        {splitScore?.playerWins ?? (winner === 'PLAYER' ? 1 : 0)}
                                    </span>
                                    <span className="text-stone-600 mx-2">-</span>
                                    <span className={winner === 'DEALER' ? 'text-amber-400' : 'text-stone-400'}>
                                        {splitScore?.opponentWins ?? (winner === 'DEALER' ? 1 : 0)}
                                    </span>
                                </div>
                            </div>

                            <div className={`flex flex-col items-end min-w-0 p-2 rounded-lg border ${winner === 'DEALER' ? 'bg-amber-950/40 border-amber-400/70' : 'bg-black/40 border-stone-800'}`}>
                                <span className="text-[8px] font-black tracking-[0.2em] uppercase text-stone-400">
                                    {winner === 'DEALER' && 'WINNER • '}PLAYER 2
                                </span>
                                <span className={`text-sm sm:text-lg font-black uppercase truncate w-full text-right ${winner === 'DEALER' ? 'text-amber-300' : 'text-stone-300'}`}>
                                    {p2Display}
                                </span>
                            </div>
                        </div>
                    )}

                    {isDebugUsed && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-950/40 border border-amber-700/50 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                            <AlertTriangle size={14} className="shrink-0" />
                            <span>DEBUG TOOLS WERE ACTIVE — MATCH SCORE EXCLUDED FROM RANKED LEADERBOARD</span>
                        </div>
                    )}

                    {/* 4-Metric Telemetry Strip */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                        <div className="bg-stone-950/90 border border-stone-800/90 rounded-xl p-3 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-amber-950/50 border border-amber-800/50 flex items-center justify-center text-amber-400 shrink-0">
                                <Flame size={17} />
                            </div>
                            <div className="min-w-0">
                                <div className="text-[8.5px] text-stone-500 font-bold uppercase tracking-widest">ROUNDS</div>
                                <div className="text-lg sm:text-xl font-black text-white tabular-nums leading-tight">
                                    {summary.roundsSurvived}
                                </div>
                            </div>
                        </div>

                        <div className="bg-stone-950/90 border border-stone-800/90 rounded-xl p-3 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-cyan-950/50 border border-cyan-800/50 flex items-center justify-center text-cyan-400 shrink-0">
                                <Crosshair size={17} />
                            </div>
                            <div className="min-w-0">
                                <div className="text-[8.5px] text-stone-500 font-bold uppercase tracking-widest">ACCURACY</div>
                                <div className="text-lg sm:text-xl font-black text-white tabular-nums leading-tight">
                                    {summary.accuracy}%
                                    <span className="text-[10px] text-stone-500 font-bold ml-1.5">
                                        ({summary.shotsHit}/{summary.shotsFired})
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-stone-950/90 border border-stone-800/90 rounded-xl p-3 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-red-950/50 border border-red-800/50 flex items-center justify-center text-red-400 shrink-0">
                                <Shield size={17} />
                            </div>
                            <div className="min-w-0">
                                <div className="text-[8.5px] text-stone-500 font-bold uppercase tracking-widest">DMG DEALT / TAKEN</div>
                                <div className="text-lg sm:text-xl font-black tabular-nums leading-tight">
                                    <span className="text-emerald-400">{summary.damageDealt}</span>
                                    <span className="text-stone-600 mx-1">/</span>
                                    <span className="text-red-400">{summary.damageTaken}</span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-stone-950/90 border border-stone-800/90 rounded-xl p-3 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-emerald-950/50 border border-emerald-800/50 flex items-center justify-center text-emerald-400 shrink-0">
                                <Package size={17} />
                            </div>
                            <div className="min-w-0">
                                <div className="text-[8.5px] text-stone-500 font-bold uppercase tracking-widest">ITEMS USED</div>
                                <div className="text-lg sm:text-xl font-black text-white tabular-nums leading-tight">
                                    {summary.totalItemsUsed}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 2-Column Tactical Dossier */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Left Column: Score Breakdown + Commendations */}
                        <div className="bg-stone-950/85 border border-stone-800/90 rounded-xl p-3.5 sm:p-4 flex flex-col justify-between gap-3">
                            <div>
                                <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-stone-800/80">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-300 flex items-center gap-1.5">
                                        <Award size={13} className={accentText} />
                                        SCORE BREAKDOWN
                                    </span>
                                    <span className={`text-[10px] font-black tabular-nums ${accentText}`}>
                                        +{summary.totalScore.toLocaleString()} PTS
                                    </span>
                                </div>

                                {summary.scoreBreakdown.length === 0 ? (
                                    <p className="text-[11px] text-stone-500 py-2">
                                        No combat points recorded in this engagement.
                                    </p>
                                ) : (
                                    <div className="space-y-1.5">
                                        {summary.scoreBreakdown.map((row) => (
                                            <div key={row.label} className="flex items-center justify-between text-xs">
                                                <span className="text-stone-400 truncate pr-2">{row.label}</span>
                                                <span className="text-stone-100 font-bold tabular-nums shrink-0">
                                                    +{row.value.toLocaleString()}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {summary.commendations.length > 0 && (
                                <div className="pt-2.5 border-t border-stone-800/80">
                                    <div className="text-[8.5px] text-stone-500 font-black uppercase tracking-[0.2em] mb-2">
                                        COMMENDATIONS EARNED
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {summary.commendations.map((c) => (
                                            <span
                                                key={c.label}
                                                className={`px-2 py-0.5 rounded-md border text-[9px] font-black tracking-wider uppercase ${COMMENDATION_TONE[c.tone]}`}
                                            >
                                                {c.label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right Column: Equipment Deployed + Recent Operations */}
                        <div className="bg-stone-950/85 border border-stone-800/90 rounded-xl p-3.5 sm:p-4 flex flex-col justify-between gap-3">
                            <div>
                                <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-stone-800/80">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-300 flex items-center gap-1.5">
                                        <Package size={13} className="text-cyan-400" />
                                        TACTICAL GEAR DEPLOYED
                                    </span>
                                    <span className="text-[9px] text-stone-500 font-bold uppercase">
                                        {summary.totalItemsUsed} TOTAL
                                    </span>
                                </div>

                                {summary.topItems.length === 0 ? (
                                    <p className="text-[11px] text-stone-500 py-1.5">
                                        Pure steel engagement — no items deployed.
                                    </p>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                        {summary.topItems.map((item) => (
                                            <div
                                                key={item.name}
                                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-stone-900/90 border border-stone-800 text-[10px]"
                                            >
                                                <span className="text-stone-300 font-bold uppercase truncate pr-1">
                                                    {item.name.replace(/_/g, ' ')}
                                                </span>
                                                <span className="text-cyan-400 font-black tabular-nums shrink-0">
                                                    ×{item.count}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {recentMatches.length > 0 && (
                                <div className="pt-2.5 border-t border-stone-800/80">
                                    <div className="text-[8.5px] text-stone-500 font-black uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
                                        <Clock size={11} />
                                        RECENT OPERATIONS
                                    </div>
                                    <div className="space-y-1.5">
                                        {recentMatches.map((m, idx) => {
                                            const isWin = m?.result === 'WIN';
                                            const scoreVal = typeof m?.totalScore === 'number' && Number.isFinite(m.totalScore) ? m.totalScore : 0;
                                            const splitWinnerLabel = m?.isLocalSplit && Array.isArray(m?.mpPlayers)
                                                ? m.mpPlayers.find((p: any) => p?.result === 'WIN')?.name
                                                : null;
                                            return (
                                                <div
                                                    key={m?.matchId || m?.timestamp || idx}
                                                    className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-black/50 border border-stone-850 text-[10px]"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className={`font-black uppercase tracking-wider ${m?.isLocalSplit ? 'text-amber-400' : isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                                                            {splitWinnerLabel ? `${splitWinnerLabel} WON` : isWin ? 'WIN' : 'LOSS'}
                                                        </span>
                                                        {m?.isLocalSplit && (
                                                            <span className="text-[8px] px-1 rounded bg-amber-950 text-amber-300 border border-amber-700/70 font-bold">
                                                                SPLIT
                                                            </span>
                                                        )}
                                                        {m?.isHardMode && (
                                                            <span className="text-[8px] px-1 rounded bg-red-950 text-red-300 border border-red-800/70 font-bold">
                                                                HARD
                                                            </span>
                                                        )}
                                                        <span className="text-stone-500 truncate">
                                                            {Number(m?.roundsSurvived) || 0} RND
                                                        </span>
                                                    </div>
                                                    <span className="text-stone-200 font-bold tabular-nums shrink-0">
                                                        {scoreVal.toLocaleString()} PTS
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Permanent Service Record Strip */}
                    <div className="grid grid-cols-3 gap-2 sm:gap-3 bg-black/55 border border-stone-800/80 rounded-xl px-3.5 py-2.5 text-center">
                        <div>
                            <div className="text-[8px] sm:text-[9px] text-stone-500 font-bold uppercase tracking-widest">CAREER WINS</div>
                            <div className="text-sm sm:text-base font-black text-emerald-400 tabular-nums">{careerWins}</div>
                        </div>
                        <div className="border-x border-stone-800/80">
                            <div className="text-[8px] sm:text-[9px] text-stone-500 font-bold uppercase tracking-widest">WIN RATE</div>
                            <div className="text-sm sm:text-base font-black text-cyan-400 tabular-nums">{careerWinRate}%</div>
                        </div>
                        <div>
                            <div className="text-[8px] sm:text-[9px] text-stone-500 font-bold uppercase tracking-widest">PERSONAL BEST</div>
                            <div className="text-sm sm:text-base font-black text-amber-400 tabular-nums">{careerBestScore.toLocaleString()}</div>
                        </div>
                    </div>
                </div>

                {/* 3. STICKY BOTTOM ACTION BAR */}
                <div className="shrink-0 px-4 py-3 sm:px-6 sm:py-3.5 border-t border-stone-800/90 bg-stone-950 flex flex-row items-center justify-between gap-2.5 sm:gap-4">
                    <button
                        type="button"
                        onClick={handleMainMenu}
                        className="flex-1 sm:flex-none sm:min-w-[180px] min-h-[44px] py-2.5 px-4 bg-stone-900 hover:bg-stone-800 border border-stone-700 hover:border-stone-500 text-stone-200 hover:text-white rounded-xl font-black text-xs tracking-[0.18em] uppercase transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
                    >
                        <Home size={15} />
                        <span>MAIN MENU</span>
                    </button>

                    <button
                        type="button"
                        onClick={handlePlayAgain}
                        className={`flex-1 sm:flex-none sm:min-w-[220px] min-h-[44px] py-2.5 px-5 rounded-xl font-black text-xs tracking-[0.18em] uppercase transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 ${
                            isGoldTheme
                                ? 'bg-amber-500 hover:bg-amber-400 text-stone-950 border border-amber-300 shadow-[0_0_24px_rgba(245,158,11,0.35)]'
                                : summary.isPlayerWin
                                ? 'bg-emerald-500 hover:bg-emerald-400 text-stone-950 border border-emerald-300 shadow-[0_0_24px_rgba(16,185,129,0.35)]'
                                : 'bg-red-600 hover:bg-red-500 text-white border border-red-400 shadow-[0_0_24px_rgba(220,38,38,0.4)]'
                        }`}
                    >
                        <RotateCcw size={15} />
                        <span>{isMultiplayer && !isLocalSplit ? 'RETURN TO LOBBY' : isLocalSplit ? 'REMATCH SPLIT' : 'PLAY AGAIN'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
