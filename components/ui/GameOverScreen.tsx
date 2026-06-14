import React, { useEffect, useState, useRef } from 'react';
import { Skull, Power, Trophy, Target, Zap, Activity, RotateCcw } from 'lucide-react';
import { TurnOwner } from '../../types';
import { MatchStats, GameStats, getStoredStats, calculateMatchScore, saveGameStats } from '../../utils/statsManager';
import { audioManager } from '../../utils/audioManager';

interface GameOverScreenProps {
    winner: TurnOwner | null;
    onResetGame: (toMenu: boolean) => void;
    matchData?: MatchStats;
    isDebugUsed?: boolean; // Added
}

const WIN_QUOTES = [
    "DEATH MISSED ITS MARK.",
    "LUCK WAS MERELY AN OPTION.",
    "ONE MORE BREATH, ONE MORE VICTORY.",
    "SHEER WILL OUTLIVED THE BULLET.",
    "FORTUNE SMILED BLOODLESSLY.",
    "SURVIVAL IS YOUR TROPHY.",
    "YOU MAY BREATHE AGAIN.",

];


const LOSS_QUOTES = [
    "YOUR LUCK RAN DRY.",
    "CONNECTION TERMINATED. GAME OVER.",
    "VOID ACCEPTED YOU.",
    "SIGNAL LOST. LIGHTS OUT.",
    "SYSTEM FAILURE: HEART STOPPED.",
    "CONGRATS. YOU FOUND THE BULLET.",
    "PRESS ALT+F4 NEXT TIME",
];


export const GameOverScreen: React.FC<GameOverScreenProps> = ({ winner, onResetGame, matchData, isDebugUsed }) => {
    const [stats, setStats] = useState<GameStats | null>(null);
    const [finalScore, setFinalScore] = useState(0);
    const [displayedScore, setDisplayedScore] = useState(0);
    const [quote, setQuote] = useState('');
    const hasSavedRef = useRef(false);

    useEffect(() => {
        const quotes = winner === 'PLAYER' ? WIN_QUOTES : LOSS_QUOTES;
        setQuote(quotes[Math.floor(Math.random() * quotes.length)]);

        if (matchData && !hasSavedRef.current) {
            // Check if current user is developer (devs can save stats even with debug)
            let isDeveloper = false;
            try {
                const loggedInUser = localStorage.getItem('aadish_roulette_logged_in_user');
                if (loggedInUser) {
                    const u = JSON.parse(loggedInUser);
                    isDeveloper = u.username?.toLowerCase() === (import.meta.env.VITE_DEV_USERNAME || 'aadish').toLowerCase();
                }
            } catch (e) {}

            if (!isDebugUsed || isDeveloper) {
                saveGameStats(matchData);
            } else {
                console.log("Stats NOT saved: debug cheats used.");
            }
            hasSavedRef.current = true;
            const score = calculateMatchScore(matchData);
            setFinalScore(score);
            setStats(getStoredStats());
        } else if (!matchData) {
            setStats(getStoredStats());
        }
    }, [matchData, winner, isDebugUsed]);

    useEffect(() => {
        if (finalScore === 0) return;
        let startTime: number;
        let animationFrame: number;
        const duration = 2500;
        const animate = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = timestamp - startTime;
            const percent = Math.min(progress / duration, 1);
            const ease = 1 - Math.pow(1 - percent, 4);
            setDisplayedScore(Math.floor(finalScore * ease));
            if (progress < duration) animationFrame = requestAnimationFrame(animate);
        };
        animationFrame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrame);
    }, [finalScore]);

    const getRankInfo = (score: number) => {
        if (score >= 3000) return { rank: 'S', label: 'DEATH DEFIER', color: 'text-red-500 animate-pulse drop-shadow-[0_0_15px_rgba(239,68,68,0.6)]' };
        if (score >= 2000) return { rank: 'A', label: 'SURVIVALIST', color: 'text-orange-500 drop-shadow-[0_0_10px_rgba(249,115,22,0.4)]' };
        if (score >= 1000) return { rank: 'B', label: 'LUCKY SHOT', color: 'text-yellow-500' };
        if (score > 0) return { rank: 'C', label: 'CORPSE', color: 'text-stone-400' };
        return { rank: 'F', label: 'COWARD', color: 'text-stone-600' };
    };

    const rankInfo = getRankInfo(finalScore);

    return (
        <div className="absolute inset-0 z-[300] flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl pointer-events-auto overflow-y-auto py-10 text-stone-200 font-sans select-none animate-in fade-in duration-1000">

            {/* Background Atmosphere */}
            <div className={`absolute inset-0 pointer-events-none transition-colors duration-1000 ${winner === 'PLAYER' ? 'bg-green-500/5' : 'bg-red-500/10'}`}>
                <div className={`absolute inset-0 bg-[radial-gradient(circle_at_center,${winner === 'PLAYER' ? 'rgba(34,197,94,0.1)' : 'rgba(220,38,38,0.15)'},transparent_70%)] animate-pulse`} />
                <div className="absolute inset-0 bg-[url('https://media.giphy.com/media/oEI9uWU0WMrQmInJWC/giphy.gif')] opacity-[0.03] mix-blend-screen" />
            </div>

            {/* Main Header */}
            <div className="relative mb-12 text-center animate-in zoom-in-95 fade-in duration-1000 px-4">
                <div className={`text-6xl md:text-9xl font-black tracking-tighter mb-4 px-2 relative inline-block ${winner === 'PLAYER' ? 'text-green-500' : 'text-red-700'}`}>
                    <span className="relative z-10">{winner === 'PLAYER' ? 'VICTORY' : 'ELIMINATED'}</span>
                    <div className={`absolute -inset-x-8 inset-y-4 blur-3xl -z-10 opacity-30 ${winner === 'PLAYER' ? 'bg-green-500' : 'bg-red-600'}`} />
                </div>

                <div className="flex flex-col items-center gap-4">
                    <p className="text-stone-400 font-black italic text-xs md:text-base tracking-[0.4em] uppercase max-w-xl mx-auto leading-relaxed">
                        — {quote} —
                    </p>

                    <div className="mt-4 flex flex-col sm:flex-row gap-4 items-center justify-center">
                        <div className="px-8 py-4 bg-stone-900/40 backdrop-blur-md border border-white/5 rounded-2xl w-56">
                            <div className="text-[10px] text-stone-500 font-bold tracking-[0.3em] uppercase mb-1">Combat Rating</div>
                            <div className="text-3xl md:text-4xl text-yellow-500 font-black tracking-tight tabular-nums drop-shadow-[0_0_20px_rgba(234,179,8,0.3)]">
                                {displayedScore.toLocaleString()}
                            </div>
                        </div>
                        {finalScore > 0 && (
                            <div className="px-8 py-3 bg-stone-900/40 backdrop-blur-md border border-white/5 rounded-2xl flex items-center gap-4 w-56 text-left">
                                <div className={`text-4xl md:text-5xl font-black ${rankInfo.color} select-none`}>
                                    {rankInfo.rank}
                                </div>
                                <div>
                                    <div className="text-[9px] text-stone-500 font-bold tracking-widest uppercase">Class Rank</div>
                                    <div className="text-[10px] text-white font-extrabold tracking-wider uppercase">{rankInfo.label}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {matchData?.isHardMode && (
                    <div className="mt-8 inline-flex items-center gap-3 bg-red-950/40 border border-red-700/50 px-8 py-3 rounded-xl animate-pulse">
                        <Skull className="text-red-600" size={24} />
                        <span className="text-red-500 font-black tracking-[0.6em] text-sm md:text-lg uppercase">Protocols Failed</span>
                        <Skull className="text-red-600" size={24} />
                    </div>
                )}
            </div>

            {/* Match Stats Grid */}
            {matchData && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12 w-full max-w-4xl px-6 animate-in slide-in-from-bottom-8 duration-1000 delay-300">
                    <div className="bg-stone-900/40 backdrop-blur-md border border-white/5 p-6 rounded-2xl flex flex-col items-center group hover:bg-stone-900/60 transition-all">
                        <Activity className="text-blue-500 mb-2 group-hover:scale-110 transition-transform" size={20} />
                        <div className="text-stone-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Duration</div>
                        <div className="text-2xl md:text-3xl font-black text-white">{matchData.roundsSurvived}<span className="text-xs text-stone-600 ml-1">RDS</span></div>
                    </div>
                    <div className="bg-stone-900/40 backdrop-blur-md border border-white/5 p-6 rounded-2xl flex flex-col items-center group hover:bg-stone-900/60 transition-all">
                        <Target className="text-red-500 mb-2 group-hover:scale-110 transition-transform" size={20} />
                        <div className="text-stone-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Accuracy</div>
                        <div className="text-2xl md:text-3xl font-black text-white">
                            {matchData.shotsFired > 0 ? Math.round((matchData.shotsHit / matchData.shotsFired) * 100) : 0}<span className="text-xs text-stone-600 ml-1">%</span>
                        </div>
                    </div>
                    <div className="bg-stone-900/40 backdrop-blur-md border border-white/5 p-6 rounded-2xl flex flex-col items-center group hover:bg-stone-900/60 transition-all">
                        <Zap className="text-yellow-500 mb-2 group-hover:scale-110 transition-transform" size={20} />
                        <div className="text-stone-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Tactics</div>
                        <div className="text-2xl md:text-3xl font-black text-white">
                            {Object.values(matchData.itemsUsed).reduce((a, b) => a + b, 0)}<span className="text-xs text-stone-600 ml-1">USE</span>
                        </div>
                    </div>
                    <div className="bg-stone-900/40 backdrop-blur-md border border-white/5 p-6 rounded-2xl flex flex-col items-center group hover:bg-stone-900/60 transition-all">
                        <Skull className="text-purple-500 mb-2 group-hover:scale-110 transition-transform" size={20} />
                        <div className="text-stone-500 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Lethality</div>
                        <div className="text-2xl md:text-3xl font-black text-white">{matchData.damageDealt}</div>
                    </div>
                </div>
            )}

            {/* Lifetime Record */}
            {stats && (
                <div className="mb-12 w-full max-w-2xl bg-stone-900/20 backdrop-blur-xl border-y border-white/5 py-6 px-8 animate-in slide-in-from-bottom-12 duration-1000 delay-500">
                    <div className="text-[10px] tracking-[0.6em] mb-6 uppercase text-stone-600 font-black text-center">Permanent Service Record</div>
                    <div className="flex justify-around items-center">
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-2xl font-black text-green-500">{stats.wins}</span>
                            <span className="text-[9px] font-black tracking-widest text-stone-600 uppercase">Wins</span>
                        </div>
                        <div className="w-[1px] h-8 bg-stone-800" />
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-2xl font-black text-red-700">{stats.losses}</span>
                            <span className="text-[9px] font-black tracking-widest text-stone-600 uppercase">Losses</span>
                        </div>
                        <div className="w-[1px] h-8 bg-stone-800" />
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-2xl font-black text-stone-100">{stats.highestRound}</span>
                            <span className="text-[9px] font-black tracking-widest text-stone-600 uppercase">Best</span>
                        </div>
                        <div className="w-[1px] h-8 bg-stone-800" />
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-2xl font-black text-yellow-500">{stats.itemPoints}</span>
                            <span className="text-[9px] font-black tracking-widest text-stone-600 uppercase">Points</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="flex flex-col md:flex-row gap-6 w-full max-w-lg px-8 animate-in fade-in slide-in-from-bottom-16 duration-1000 delay-700">
                <button
                    onClick={() => {
                        audioManager.playSound('click');
                        onResetGame(false);
                    }}
                    className="flex-1 h-16 bg-white text-black font-black text-lg hover:bg-stone-200 hover:scale-105 active:scale-95 transition-all tracking-[0.4em] flex items-center justify-center gap-3 rounded-2xl shadow-[0_20px_40px_rgba(255,255,255,0.1)] uppercase"
                >
                    <RotateCcw size={20} /> Initiate
                </button>
                <button
                    onClick={() => {
                        audioManager.playSound('click');
                        onResetGame(true);
                    }}
                    className="flex-1 h-16 bg-stone-900/40 backdrop-blur-md border border-stone-800 text-stone-400 font-black text-lg hover:text-white hover:border-white hover:bg-white/5 hover:scale-105 active:scale-95 transition-all tracking-[0.4em] flex items-center justify-center gap-3 rounded-2xl uppercase"
                >
                    <Power size={20} /> Logout
                </button>
            </div>
        </div>
    );
};
