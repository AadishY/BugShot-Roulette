import React, { useEffect, useState, useRef } from 'react';
import { Skull, Power, Trophy, Target, Zap, Activity, RotateCcw, X, Swords } from 'lucide-react';
import { TurnOwner } from '../../types';
import { MatchStats, GameStats, getStoredStats, calculateMatchScore, saveGameStats } from '../../utils/statsManager';
import { audioManager } from '../../utils/audioManager';
import { Icons } from './Icons';
import { getPlayerId } from '../../utils/firebaseService';
import { getDicebearUrl } from '../../utils/dicebear';
import { showConfirm } from '../../utils/modalService';

interface GameOverScreenProps {
    winner: TurnOwner | null;
    onResetGame: (toMenu: boolean) => void;
    matchData?: MatchStats;
    isDebugUsed?: boolean; // Added
    isMultiplayer?: boolean;
    isThreeOrFourPlayerWin?: boolean;
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


export const GameOverScreen: React.FC<GameOverScreenProps> = ({ winner, onResetGame, matchData, isDebugUsed, isMultiplayer, isThreeOrFourPlayerWin }) => {
    const [stats, setStats] = useState<GameStats | null>(null);
    const [selectedMPMatch, setSelectedMPMatch] = useState<any>(null);

    useEffect(() => {
        if (!selectedMPMatch) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setSelectedMPMatch(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedMPMatch]);
    const [finalScore, setFinalScore] = useState(0);
    const [displayedScore, setDisplayedScore] = useState(0);
    const [quote] = useState(() => {
        const quotes = winner === 'PLAYER' ? WIN_QUOTES : LOSS_QUOTES;
        return quotes[Math.floor(Math.random() * quotes.length)];
    });
    const hasSavedRef = useRef(false);

    useEffect(() => {
        const persistStats = async () => {
            if (matchData && !hasSavedRef.current) {
                hasSavedRef.current = true;
                
                if (winner === 'PLAYER') {
                    matchData.result = 'WIN';
                } else if (winner === 'DEALER') {
                    matchData.result = 'LOSS';
                }

                // Check if current user is developer (devs can save stats even with debug)
                let isDeveloper = false;
                try {
                    const loggedInUser = localStorage.getItem('aadish_roulette_logged_in_user');
                    if (loggedInUser) {
                        const u = JSON.parse(loggedInUser);
                        isDeveloper = Boolean(u.isDeveloper || u.role === 'developer' || u.username?.toLowerCase() === 'aadish');
                    }
                } catch (e) {}

                const effectiveMatchData = {
                    ...matchData,
                    result: winner === 'PLAYER' ? 'WIN' as const : 'LOSS' as const,
                    isMultiplayer: Boolean(isMultiplayer)
                };

                if (isMultiplayer || !isDebugUsed || isDeveloper) {
                    await saveGameStats(effectiveMatchData);
                } else {
                    console.log("Stats NOT saved: debug cheats used.");
                }
                const score = calculateMatchScore(matchData);
                setFinalScore(score);
                setStats(getStoredStats());
            } else if (!matchData) {
                setStats(getStoredStats());
            }
        };

        void persistStats();
    }, [matchData, winner, isDebugUsed, isMultiplayer]);

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
        <div 
            className="absolute inset-0 z-[300] flex flex-col items-center justify-start bg-black/90 backdrop-blur-xl pointer-events-auto overflow-y-auto py-12 md:py-16 text-stone-200 font-sans select-none animate-in fade-in duration-1000 custom-scrollbar"
            style={{
                paddingTop: 'max(env(safe-area-inset-top, 0px), 24px)',
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 32px)',
                paddingLeft: 'max(env(safe-area-inset-left, 0px), 16px)',
                paddingRight: 'max(env(safe-area-inset-right, 0px), 16px)'
            }}
        >

            {/* Background Atmosphere */}
            <div className={`absolute inset-0 pointer-events-none transition-colors duration-1000 ${winner === 'PLAYER' ? 'bg-green-500/5' : 'bg-red-500/10'}`}>
                <div className={`absolute inset-0 bg-[radial-gradient(circle_at_center,${winner === 'PLAYER' ? 'rgba(34,197,94,0.1)' : 'rgba(220,38,38,0.15)'},transparent_70%)] animate-pulse`} />
                <div className="absolute inset-0 bg-[url('https://media.giphy.com/media/oEI9uWU0WMrQmInJWC/giphy.gif')] opacity-[0.03] mix-blend-screen" />
            </div>

            {/* Main Header */}
            <div className="relative mb-12 text-center animate-in zoom-in-95 fade-in duration-1000 px-4 flex flex-col items-center">
                {isThreeOrFourPlayerWin && (
                    <div className="mb-6 flex flex-col items-center animate-bounce">
                        <div className="w-[100px] h-[100px] md:w-[150px] md:h-[150px] object-contain drop-shadow-[0_0_20px_rgba(245,158,11,0.6)] bg-transparent border-2 border-amber-500/50 rounded-2xl p-2 bg-amber-950/30 backdrop-blur-md">
                            <img src="/sticker/sticker9.gif" alt="Jackpot Winner" className="w-full h-full object-contain bg-transparent" />
                        </div>
                        <span className="mt-2 text-xs md:text-sm font-black tracking-[0.4em] text-amber-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] uppercase animate-pulse">
                            ✨ ULTIMATE CHAMPION ✨
                        </span>
                    </div>
                )}
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 w-full max-w-4xl px-6 animate-in slide-in-from-bottom-8 duration-1000 delay-300">
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

            {/* Extended Match Analysis */}
            {matchData && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full max-w-4xl px-6 mb-12 animate-in slide-in-from-bottom-12 duration-1000 delay-500">
                    
                    {/* Left Column: Score Breakdown & Achievements */}
                    <div className="bg-stone-900/30 backdrop-blur-md border border-white/5 p-6 rounded-2xl flex flex-col gap-6 text-left">
                        <div>
                            <h3 className="text-xs text-stone-500 font-bold tracking-[0.4em] uppercase mb-4 flex items-center gap-2">
                                <Trophy size={14} className="text-yellow-500" /> Score Breakdown
                            </h3>
                            <div className="space-y-3 font-mono text-xs md:text-sm">
                                <div className="flex justify-between border-b border-white/5 pb-2">
                                    <span className="text-stone-400 font-sans">Match Outcome:</span>
                                    <span className={matchData.result === 'WIN' ? 'text-green-400 font-bold' : 'text-red-500 font-bold'}>
                                        {matchData.result === 'WIN' ? '+1,000 pts' : '+0 pts'}
                                    </span>
                                </div>
                                <div className="flex justify-between border-b border-white/5 pb-2">
                                    <span className="text-stone-400 font-sans">Rounds Survived ({matchData.roundsSurvived}):</span>
                                    <span className="text-stone-200">+{matchData.roundsSurvived * 100} pts</span>
                                </div>
                                <div className="flex justify-between border-b border-white/5 pb-2">
                                    <span className="text-stone-400 font-sans">Shots Hit ({matchData.shotsHit}):</span>
                                    <span className="text-stone-200">+{matchData.shotsHit * 20} pts</span>
                                </div>
                                <div className="flex justify-between border-b border-white/5 pb-2">
                                    <span className="text-stone-400 font-sans">Damage Dealt ({matchData.damageDealt}):</span>
                                    <span className="text-stone-200">+{matchData.damageDealt * 50} pts</span>
                                </div>
                                <div className="flex justify-between border-b border-white/5 pb-2">
                                    <span className="text-stone-400 font-sans">Tactics (Items Used: {Object.values(matchData.itemsUsed).reduce((a,b)=>a+b, 0)}):</span>
                                    <span className="text-stone-200">+{Object.values(matchData.itemsUsed).reduce((a,b)=>a+b, 0) * 15} pts</span>
                                </div>
                                {matchData.selfShots > 0 && (
                                    <div className="flex justify-between border-b border-white/5 pb-2 text-red-500">
                                        <span className="font-sans">Self-Shots Penalty ({matchData.selfShots}):</span>
                                        <span>-{matchData.selfShots * 50} pts</span>
                                    </div>
                                )}
                                {matchData.isHardMode && (
                                    <div className="flex justify-between border-b border-red-500/20 pb-2 text-red-400 font-bold">
                                        <span className="font-sans tracking-wider uppercase text-[10px]">HARD MODE MULTIPLIER:</span>
                                        <span>x2</span>
                                    </div>
                                )}
                                <div className="flex justify-between pt-2 text-base md:text-lg font-black text-yellow-500">
                                    <span className="font-sans uppercase">Total Rating Score:</span>
                                    <span className="drop-shadow-[0_0_10px_rgba(234,179,8,0.4)]">{calculateMatchScore(matchData).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Achievements / Badges Section */}
                        <div className="border-t border-white/5 pt-4">
                            <h4 className="text-[10px] text-stone-500 font-bold tracking-[0.3em] uppercase mb-3">Service Commendations</h4>
                            <div className="flex flex-wrap gap-2">
                                {matchData.result === 'WIN' && matchData.damageTaken === 0 && (
                                    <span className="px-3 py-1 bg-green-500/10 border border-green-500/30 text-green-400 text-[9px] font-bold rounded-lg tracking-widest uppercase animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.15)]">
                                        🥇 PERFECT SURVIVAL
                                    </span>
                                )}
                                {Object.values(matchData.itemsUsed).reduce((a,b)=>a+b, 0) >= 10 && (
                                    <span className="px-3 py-1 bg-purple-500/10 border border-purple-500/30 text-purple-400 text-[9px] font-bold rounded-lg tracking-widest uppercase">
                                        🧠 GRANDMASTER TACTICIAN
                                    </span>
                                )}
                                {matchData.shotsFired > 0 && (matchData.shotsHit / matchData.shotsFired) >= 0.8 && (
                                    <span className="px-3 py-1 bg-red-500/10 border border-red-500/30 text-red-400 text-[9px] font-bold rounded-lg tracking-widest uppercase">
                                        🎯 ELITE SHARPSHOOTER
                                    </span>
                                )}
                                {matchData.selfShots >= 3 && (
                                    <span className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[9px] font-bold rounded-lg tracking-widest uppercase">
                                        🎲 DESPERATE GAMBLER
                                    </span>
                                )}
                                {matchData.isHardMode && matchData.result === 'WIN' && (
                                    <span className="px-3 py-1 bg-red-950/40 border border-red-700/50 text-red-500 text-[9px] font-black rounded-lg tracking-widest uppercase animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.2)]">
                                        💀 HELL WALKER
                                    </span>
                                )}
                                {(!matchData.isHardMode && matchData.result === 'WIN') && (
                                    <span className="px-3 py-1 bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[9px] font-bold rounded-lg tracking-widest uppercase">
                                        🎖️ INITIATE CONTRACT
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Tactics Breakdown & Match History */}
                    <div className="flex flex-col gap-6">
                        {/* Tactics Breakdown */}
                        <div className="bg-stone-900/30 backdrop-blur-md border border-white/5 p-6 rounded-2xl text-left flex-1">
                            <h3 className="text-xs text-stone-500 font-bold tracking-[0.4em] uppercase mb-4 flex items-center gap-2">
                                <Zap size={14} className="text-yellow-500" /> Tactics Breakdown
                            </h3>
                            {Object.keys(matchData.itemsUsed).length > 0 ? (
                                <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                    {Object.entries(matchData.itemsUsed).map(([item, count]) => {
                                        const ItemIcon = Icons[item as keyof typeof Icons] || Icons.Beer;
                                        return (
                                            <div key={item} className="flex items-center gap-2.5 p-2 bg-stone-950/40 border border-white/5 rounded-xl hover:border-white/10 transition-colors">
                                                <div className="w-8 h-8 rounded-lg bg-stone-900 flex items-center justify-center border border-stone-800 text-stone-300">
                                                    <ItemIcon size={16} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-[10px] font-black text-stone-200 tracking-wider truncate uppercase">{item}</div>
                                                    <div className="text-[9px] font-mono text-stone-500">USED: {count}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-stone-500 font-mono text-xs py-6 text-center italic border border-dashed border-white/5 rounded-xl">
                                    No items deployed. Pure guts.
                                </div>
                            )}

                            {/* Most Used Item Badge */}
                            {Object.keys(matchData.itemsUsed).length > 0 && (
                                <div className="mt-4 p-3 bg-purple-950/20 border border-purple-900/30 rounded-xl flex items-center gap-3">
                                    <div className="text-purple-400 font-black text-xs tracking-widest uppercase">Preferred Instrument:</div>
                                    <div className="px-2.5 py-0.5 bg-purple-900/50 border border-purple-500/30 rounded text-[9px] font-mono text-purple-300 uppercase tracking-widest font-black">
                                        {Object.entries(matchData.itemsUsed).reduce((a, b) => a[1] > b[1] ? a : b)[0]}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Recent History log */}
                        <div className="bg-stone-900/30 backdrop-blur-md border border-white/5 p-6 rounded-2xl text-left">
                            <h3 className="text-xs text-stone-500 font-bold tracking-[0.4em] uppercase mb-4 flex items-center gap-2">
                                <Activity size={14} className="text-blue-500" /> Recent Operations
                            </h3>
                            {stats && stats.matchHistory && stats.matchHistory.length > 0 ? (
                                <div className="space-y-2.5 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                    {stats.matchHistory.slice(0, 5).map((match, mi) => (
                                        <div 
                                            key={mi} 
                                            onClick={() => {
                                                audioManager.playSound('click');
                                                setSelectedMPMatch(match);
                                            }}
                                            className="flex items-center justify-between p-2.5 bg-stone-950/30 hover:bg-stone-900/40 border border-white/5 hover:border-cyan-500/40 rounded-xl text-xs font-mono transition-all cursor-pointer"
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <div className={`w-2.5 h-2.5 rounded-full ${match.result === 'WIN' ? 'bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-600'}`} />
                                                <span className="font-sans font-bold text-stone-300">{match.result === 'WIN' ? 'WIN' : 'LOSS'}</span>
                                                <span className="text-[10px] text-stone-600">|</span>
                                                <span className={`text-[9px] font-sans px-1.5 py-0.5 rounded ${match.isMultiplayer ? 'bg-cyan-955/20 border border-cyan-900/30 text-cyan-400' : match.isHardMode ? 'bg-red-955/20 border border-red-900/30 text-red-500' : 'bg-stone-800 text-stone-400'}`}>
                                                    {match.isMultiplayer ? 'MP' : match.isHardMode ? 'HARD' : 'NORMAL'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3 text-[10px]">
                                                <span className="text-stone-500">{match.roundsSurvived} RDS</span>
                                                <span className="text-yellow-500 font-black">{match.totalScore.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-stone-500 font-mono text-xs py-6 text-center italic border border-dashed border-white/5 rounded-xl">
                                    No entries found in archive.
                                </div>
                            )}
                        </div>
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
                            <span className="text-2xl font-black text-yellow-500">{stats.itemsUsed}</span>
                            <span className="text-[9px] font-black tracking-widest text-stone-600 uppercase">Items Used</span>
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
                    <RotateCcw size={20} /> {isMultiplayer ? "Play Again" : "Initiate"}
                </button>
                <button
                    onClick={async () => {
                        audioManager.playSound('click');
                        if (isMultiplayer) {
                            const confirmed = await showConfirm({
                                title: "EXIT MATCH",
                                message: "ARE YOU SURE YOU WANT TO EXIT AND RETURN TO THE MAIN MENU?",
                                confirmText: "EXIT TO MENU",
                                cancelText: "STAY",
                                isDanger: true,
                                icon: "logout"
                            });
                            if (confirmed) {
                                onResetGame(true);
                            }
                        } else {
                            onResetGame(true);
                        }
                    }}
                    className="flex-1 h-16 bg-stone-900/40 backdrop-blur-md border border-stone-800 text-stone-400 font-black text-lg hover:text-white hover:border-white hover:bg-white/5 hover:scale-105 active:scale-95 transition-all tracking-[0.4em] flex items-center justify-center gap-3 rounded-2xl uppercase"
                >
                    <Power size={20} /> Logout
                </button>
            </div>
            {/* Multiplayer Match Summary Popup */}
            {selectedMPMatch && (
                <>
                    <div className="fixed inset-0 bg-black/80 z-[120] cursor-default" onClick={() => setSelectedMPMatch(null)} />
                    <div 
                        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[95vw] sm:w-[90vw] max-w-xl max-h-[85vh] overflow-y-auto bg-stone-950 border border-stone-800 p-4 sm:p-6 rounded-2xl shadow-[0_0_60px_rgba(0,0,0,0.85)] z-[130] font-mono text-stone-300 custom-scrollbar"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Operational Report"
                    >
                        {/* Header */}
                        <div className="flex justify-between items-center border-b border-stone-800 pb-3 mb-4">
                            <div className="flex items-center gap-2 flex-wrap">
                                <Swords className="text-cyan-400" size={16} />
                                <span className="font-black text-xs sm:text-sm tracking-wider uppercase text-white">OPERATIONAL REPORT</span>
                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                                    selectedMPMatch.result === 'WIN' ? 'bg-emerald-955 border border-emerald-700 text-emerald-300' : 'bg-red-955 border border-red-700 text-red-300'
                                }`}>
                                    {selectedMPMatch.result === 'WIN' ? 'VICTORY' : 'ELIMINATED'}
                                </span>
                                <span className="text-[7.5px] px-1.5 py-0.5 rounded bg-stone-900 border border-stone-800 text-stone-400 uppercase font-black">
                                    {selectedMPMatch.isMultiplayer ? 'MULTIPLAYER' : selectedMPMatch.isHardMode ? 'HARD PROTOCOL' : 'SOLO DUEL'}
                                </span>
                            </div>
                            <button onClick={() => setSelectedMPMatch(null)} className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-500 hover:text-white transition-colors cursor-pointer rounded-xl" title="Close" aria-label="Close">
                                <X size={16} />
                            </button>
                        </div>

                        {/* Details */}
                        <div className="space-y-4 text-left">
                            <div className="flex justify-between text-[8px] sm:text-[9px] text-stone-500 border-b border-stone-900 pb-2 flex-wrap gap-2">
                                <span>DATE: {selectedMPMatch.timestamp ? new Date(selectedMPMatch.timestamp).toLocaleString() : 'UNKNOWN'}</span>
                                <span className="text-yellow-400 font-bold">RATING SCORE: {selectedMPMatch.totalScore?.toLocaleString() || 0} PTS</span>
                            </div>

                            {/* Deployed list if Multiplayer */}
                            {selectedMPMatch.isMultiplayer && selectedMPMatch.mpPlayers && selectedMPMatch.mpPlayers.length > 0 && (
                                <div className="space-y-1.5">
                                    <span className="text-[7.5px] sm:text-[8px] text-stone-500 uppercase tracking-widest font-black block">DEPLOYED AGENTS</span>
                                    <div className="space-y-1">
                                        {selectedMPMatch.mpPlayers.map((player: any, idx: number) => {
                                            const pName = player.displayName || player.username || player.name || 'Unknown Agent';
                                            const pId = player.playerId || getPlayerId({ username: pName });
                                            const isDev = pName.toLowerCase() === 'aadish' || Boolean(player.isDeveloper);
                                            const avatarUrl = player.avatarUrl || (isDev
                                                ? 'https://avatars.githubusercontent.com/u/101470733'
                                                : getDicebearUrl(player.avatarStyle || 'thumbs', pName));

                                            return (
                                                <div key={idx} className="flex justify-between items-center p-2 bg-stone-900/30 border border-stone-850 rounded-xl text-[10px]">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <div className="w-7 h-7 rounded-full overflow-hidden bg-stone-900 border border-stone-750 shrink-0">
                                                            <img src={avatarUrl} alt={pName} className="w-full h-full object-cover" />
                                                        </div>
                                                        <div className="flex flex-col text-left min-w-0">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className="font-bold text-stone-200 text-xs truncate">{pName}</span>
                                                                {player.isHost && (
                                                                    <span className="text-[6.5px] bg-red-955 border border-red-800 text-red-400 px-1 py-0.2 rounded font-bold uppercase shrink-0">HOST</span>
                                                                )}
                                                                {player.isMe && (
                                                                    <span className="text-[6.5px] bg-cyan-950 border border-cyan-800 text-cyan-400 px-1 py-0.2 rounded font-bold uppercase shrink-0">YOU</span>
                                                                )}
                                                            </div>
                                                            <span className="text-[7.5px] text-stone-500 font-mono tracking-wider">{pId}</span>
                                                        </div>
                                                    </div>
                                                    <span className={`font-black tracking-widest uppercase text-[9px] font-mono shrink-0 ml-2 ${
                                                        player.result === 'WIN' ? 'text-green-400' :
                                                        player.result === 'LOSS' ? 'text-red-450' : 'text-stone-500'
                                                    }`}>
                                                        {player.result}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Player stats */}
                            <div className="space-y-1.5 pt-2 border-t border-stone-900/60">
                                <span className="text-[7.5px] sm:text-[8px] text-stone-500 uppercase tracking-widest font-black block">PERFORMANCE METRICS</span>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[8.5px] sm:text-[9.5px]">
                                    <div className="p-2 bg-stone-950 border border-stone-900/50 rounded flex flex-col justify-between">
                                        <span className="text-stone-500 text-[7.5px]">RDS SURVIVED</span>
                                        <span className="text-stone-200 font-bold text-sm mt-1">{selectedMPMatch.roundsSurvived}</span>
                                    </div>
                                    <div className="p-2 bg-stone-950 border border-stone-900/50 rounded flex flex-col justify-between">
                                        <span className="text-stone-500 text-[7.5px]">PRECISION</span>
                                        <span className="text-stone-200 font-bold text-sm mt-1">
                                            {selectedMPMatch.shotsFired > 0 ? Math.round((selectedMPMatch.shotsHit / selectedMPMatch.shotsFired) * 100) : 0}%
                                        </span>
                                    </div>
                                    <div className="p-2 bg-stone-950 border border-stone-900/50 rounded flex flex-col justify-between">
                                        <span className="text-stone-500 text-[7.5px]">DMG DEALT</span>
                                        <span className="text-stone-200 font-bold text-sm mt-1">{selectedMPMatch.damageDealt}</span>
                                    </div>
                                    <div className="p-2 bg-stone-950 border border-stone-900/50 rounded flex flex-col justify-between">
                                        <span className="text-stone-500 text-[7.5px]">DMG TAKEN</span>
                                        <span className="text-stone-200 font-bold text-sm mt-1">{selectedMPMatch.damageTaken}</span>
                                    </div>
                                </div>
                                {selectedMPMatch.selfShots > 0 && (
                                    <div className="p-2 bg-red-955/20 border border-red-900/40 rounded-xl flex justify-between items-center text-[8px] sm:text-[9px]">
                                        <span className="text-red-400 font-bold">DESPERATE GAMBLES (SELF-SHOTS):</span>
                                        <span className="text-red-300 font-mono font-black">{selectedMPMatch.selfShots} TIMES (-{selectedMPMatch.selfShots * 50} PTS)</span>
                                    </div>
                                )}
                            </div>

                            {/* Tactics Used */}
                            {selectedMPMatch.itemsUsed && Object.keys(selectedMPMatch.itemsUsed).length > 0 && (
                                <div className="space-y-1.5 pt-2 border-t border-stone-900/60">
                                    <span className="text-[7.5px] sm:text-[8px] text-stone-500 uppercase tracking-widest font-black block">TACTICS DEPLOYED</span>
                                    <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
                                        {Object.entries(selectedMPMatch.itemsUsed).filter(([, c]) => Number(c) > 0).map(([item, count]) => {
                                            const ItemIcon = Icons[item as keyof typeof Icons] || Icons.Beer;
                                            return (
                                                <div key={item} className="flex items-center gap-2 p-1.5 bg-stone-950 border border-stone-850 rounded-lg">
                                                    <ItemIcon size={12} className="text-yellow-400 shrink-0" />
                                                    <span className="text-[8px] text-stone-300 uppercase truncate flex-1">{item}</span>
                                                    <span className="text-[8px] font-bold text-stone-400">x{count as number}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        <button onClick={() => setSelectedMPMatch(null)} className="w-full mt-4 py-2.5 min-h-[44px] flex items-center justify-center bg-stone-900 hover:bg-stone-800 border border-stone-750 text-stone-200 hover:text-white font-black text-[9px] tracking-wider uppercase rounded-xl transition-all cursor-pointer active:scale-98">
                            DISMISS LOG
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};
