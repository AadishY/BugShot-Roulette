import React, { useEffect, useState } from 'react';
import { X, Trophy, Activity, Target, Zap, Skull, Swords, Clock, Copy, Check, User, Shield } from 'lucide-react';
import { GameStats, getStoredStats, setUserActiveStats } from '../../utils/statsManager';
import { getUserStatsFromFirebase, getPlayerId, UserProfile } from '../../utils/firebaseService';
import { getDicebearUrl } from '../../utils/dicebear';
import { audioManager } from '../../utils/audioManager';
import { Icons } from './Icons';

// Thematic codename pools for match history display
const NORMAL_CODENAMES = [
    'VIPER', 'BLACKOUT', 'WRAITH', 'KINGPIN', 'PHANTOM',
    'SHADOW OPS', 'NIGHTFALL', 'DEADLOCK', 'SERPENT', 'CRIMSON TIDE',
    'IRON WOLF', 'GHOST WIRE', 'COLD FRONT', 'REAPER', 'OBSIDIAN',
    'THUNDERCLAP', 'DARK PULSE', 'STEEL RAIN', 'VOID WALKER', 'ECLIPSE'
];

const HARD_CODENAMES = [
    'IRON FANG', 'DARK HARVEST', 'SCORCHED EARTH', 'BLOOD MERIDIAN',
    'DEAD RECKONING', 'HELLFIRE', 'OMEGA PURGE', 'SKULL CIRCUIT',
    'DEATH WARRANT', 'BLACK HORIZON', 'ENDGAME', 'FINAL PROTOCOL',
    'LAST RITES', 'EXTINCTION', 'DOOMSDAY ARC', 'VOID COLLAPSE',
    'INFERNO GATE', 'CARNAGE PRIME', 'ANNIHILATION', 'TERMINUS'
];

const getMatchCodename = (index: number, isHardMode: boolean): string => {
    const pool = isHardMode ? HARD_CODENAMES : NORMAL_CODENAMES;
    return pool[index % pool.length];
};

const ITEM_ICONS: Record<string, React.ElementType> = {
    CIGS: Icons.Cigs,
    SAW: Icons.Saw,
    PHONE: Icons.Phone,
    INVERTER: Icons.Inverter,
    BEER: Icons.Beer,
    GLASS: Icons.Glass,
    CUFFS: Icons.Cuffs,
    ADRENALINE: Icons.Adrenaline,
    CHOKE: Icons.Choke,
    REMOTE: Icons.Remote,
    BIG_INVERTER: Icons.BigInverter,
    CONTRACT: Icons.Contract,
    LUCKYCHARM: Icons.Luckycharm,
    FLASHBANG: Icons.Flashbang,
    CRUSHER: Icons.Crusher,
    TOTEM: Icons.Totem,
    MIRROR: Icons.Mirror,
    DECK_CARD: Icons.DeckCard,
    JACKPOT: Icons.Jackpot
};

const renderItemsUsed = (itemsUsed: Record<string, number>) => {
    const entries = Object.entries(itemsUsed || {}).filter(([, count]) => Number(count) > 0);
    if (entries.length === 0) return null;

    return (
        <div className="space-y-2 pt-2 border-t border-stone-900/60">
            <span className="text-[8px] text-stone-500 uppercase tracking-widest font-black block">ITEMS DEPLOYED</span>
            <div className="grid grid-cols-2 gap-2">
                {entries.sort((a, b) => Number(b[1]) - Number(a[1])).map(([item, count]) => {
                    const IconComponent = ITEM_ICONS[item] || Icons.Zap;
                    return (
                        <div key={item} className="flex items-center gap-2 p-2 bg-stone-950/70 border border-stone-900/60 rounded-xl">
                            <div className="w-7 h-7 flex items-center justify-center rounded-full bg-white/5 text-stone-100">
                                <IconComponent size={16} className="text-stone-100" />
                            </div>
                            <div className="flex-1">
                                <div className="text-[9px] uppercase tracking-[0.25em] text-stone-500">{item}</div>
                                <div className="text-sm font-black text-white">{count}×</div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

interface ScoreboardProps {
    onClose: () => void;
    stats?: GameStats;
}

export const Scoreboard: React.FC<ScoreboardProps> = ({ onClose, stats: initialStats }) => {
    const [stats, setStats] = useState<GameStats | null>(null);
    const [selectedMatch, setSelectedMatch] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (selectedMatch) {
                    setSelectedMatch(null);
                } else {
                    audioManager.playSound('click');
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedMatch, onClose]);

    const currentUserProfile: UserProfile | null = (() => {
        try {
            const session = localStorage.getItem('aadish_roulette_logged_in_user');
            if (session) return JSON.parse(session);
        } catch (e) {}
        return null;
    })();

    const isDev = currentUserProfile?.username?.toLowerCase() === 'aadish' || Boolean(currentUserProfile?.isDeveloper);
    const playerDisplayName = currentUserProfile?.displayName || currentUserProfile?.username || 'AGENT';
    const playerIdentifier = currentUserProfile ? getPlayerId(currentUserProfile) : '@AGENT#0000';
    const playerAvatar = isDev 
        ? 'https://avatars.githubusercontent.com/u/101470733'
        : (currentUserProfile?.avatarUrl || getDicebearUrl(currentUserProfile?.avatarStyle || 'thumbs', currentUserProfile?.username || 'operator'));

    useEffect(() => {
        const initializeStats = async () => {
            setIsLoading(true);
            setLoadError(null);

            if (initialStats) {
                setStats(initialStats);
                setIsLoading(false);
                return;
            }

            const loggedInUser = localStorage.getItem('aadish_roulette_logged_in_user');

            if (!loggedInUser) {
                setStats(getStoredStats());
                setIsLoading(false);
                return;
            }

            try {
                const userObj = JSON.parse(loggedInUser);
                if (!userObj?.username) {
                    setStats(getStoredStats());
                    setIsLoading(false);
                    return;
                }

                const remoteStats = await getUserStatsFromFirebase(userObj.username);
                if (!remoteStats) {
                    setLoadError('Unable to load latest remote stats.');
                    setStats(null);
                    setIsLoading(false);
                    return;
                }

                setStats(remoteStats);
                setUserActiveStats(userObj.username, remoteStats);
            } catch (e) {
                console.warn('Failed to refresh stats from Firebase:', e);
                setLoadError('Unable to load latest remote stats.');
                setStats(null);
            } finally {
                setIsLoading(false);
            }
        };

        void initializeStats();
    }, [initialStats]);

    if (isLoading) {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md pointer-events-auto p-4 animate-in fade-in duration-300">
                <div className="bg-stone-950/90 border border-white/10 rounded-3xl p-8 text-center text-stone-100 shadow-[0_20px_60px_rgba(0,0,0,0.65)]">
                    <div className="mb-4 text-lg font-black uppercase tracking-[0.35em]">SYNCING STATS</div>
                    <div className="text-sm text-stone-400">Fetching latest stats from BugshotServer...</div>
                </div>
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md pointer-events-auto p-4 animate-in fade-in duration-300">
                <div className="bg-stone-950/90 border border-white/10 rounded-3xl p-8 text-center text-stone-100 shadow-[0_20px_60px_rgba(0,0,0,0.65)] max-w-sm">
                    <div className="mb-4 text-lg font-black uppercase tracking-[0.35em]">REMOTE STATS ERROR</div>
                    <div className="text-sm text-stone-400 mb-6">{loadError || 'Unable to load Cloud stats.'}</div>
                    <button
                        onClick={() => {
                            audioManager.playSound('click');
                            void (async () => {
                                setIsLoading(true);
                                setLoadError(null);
                                const loggedInUser = localStorage.getItem('aadish_roulette_logged_in_user');
                                if (!loggedInUser) {
                                    setStats(initialStats || getStoredStats());
                                    setIsLoading(false);
                                    return;
                                }
                                try {
                                    const userObj = JSON.parse(loggedInUser);
                                    const remoteStats = await getUserStatsFromFirebase(userObj.username);
                                    if (!remoteStats) {
                                        setLoadError('Unable to load latest remote stats.');
                                        setStats(null);
                                    } else {
                                        setStats(remoteStats);
                                        setUserActiveStats(userObj.username, remoteStats);
                                    }
                                } catch (err) {
                                    setLoadError('Unable to load latest remote stats.');
                                } finally {
                                    setIsLoading(false);
                                }
                            })();
                        }}
                        className="px-4 py-2 bg-yellow-500 text-stone-950 font-bold rounded-xl hover:bg-yellow-400 transition-colors"
                    >
                        Retry
                    </button>
                    <button
                        onClick={() => {
                            audioManager.playSound('click');
                            onClose();
                        }}
                        className="mt-3 px-4 py-2 bg-stone-900 text-stone-200 font-bold rounded-xl hover:bg-stone-800 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        );
    }

    const totalGames = (stats?.wins || 0) + (stats?.losses || 0);
    const winRate = totalGames > 0 ? Math.round(((stats?.wins || 0) / totalGames) * 100) : 0;
    const accuracy = (stats?.shotsFired || 0) > 0 ? Math.round(((stats?.shotsHit || 0) / (stats?.shotsFired || 1)) * 100) : 0;
    const totalPlaytimeSecs = currentUserProfile?.totalTimePlayed || stats?.totalPlaytime || (((stats?.totalRounds || 0)) * 90);
    const playHours = Math.floor(totalPlaytimeSecs / 3600);
    const playMins = Math.floor((totalPlaytimeSecs % 3600) / 60);
    const formattedPlaytime = playHours > 0 ? `${playHours}h ${playMins}m` : `${playMins}m`;

    return (
        <div 
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md pointer-events-auto p-1.5 sm:p-3 animate-in fade-in duration-300"
            role="dialog"
            aria-modal="true"
            aria-label="Agent Service Record"
            style={{
                paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
                paddingLeft: 'max(env(safe-area-inset-left, 0px), 8px)',
                paddingRight: 'max(env(safe-area-inset-right, 0px), 8px)'
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    audioManager.playSound('click');
                    onClose();
                }
            }}
        >
            <div className="w-full max-w-[min(96vw,calc(100vw-16px))] lg:max-w-5xl h-[92dvh] max-h-[92dvh] bg-stone-950/60 backdrop-blur-2xl border-2 border-stone-700/80 shadow-[0_36px_100px_rgba(0,0,0,0.9)] flex flex-col relative overflow-hidden rounded-2xl ring-1 ring-white/10">

                {/* Decorative Elements */}
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent pointer-events-none" />
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-yellow-500/5 blur-[80px] rounded-full pointer-events-none" />

                {/* Header with Player Profile & Avatar */}
                <div className="p-2.5 sm:p-4 border-b border-stone-800/60 flex flex-row justify-between items-center gap-2 bg-stone-950/80 backdrop-blur-md shrink-0">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                        <div className="relative shrink-0">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl overflow-hidden bg-stone-900 border border-stone-750 p-0.5 shadow-lg">
                                <img
                                    src={playerAvatar}
                                    alt={playerDisplayName}
                                    className="w-full h-full object-cover rounded-lg sm:rounded-xl"
                                />
                            </div>
                            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-emerald-500 border-2 border-stone-950 shadow-sm" title="Active" />
                        </div>

                        <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                <h2 className="text-sm sm:text-lg font-black text-white tracking-wider uppercase leading-tight truncate max-w-[140px] sm:max-w-none">
                                    {playerDisplayName}
                                </h2>
                                {isDev ? (
                                    <span className="px-1.5 py-0.5 bg-red-955 border border-red-800 text-red-400 text-[7px] font-bold tracking-widest rounded uppercase">
                                        DEV
                                    </span>
                                ) : (
                                    <span className="px-1.5 py-0.5 bg-stone-900 border border-stone-750 text-stone-400 text-[7px] font-bold tracking-widest rounded uppercase">
                                        AGENT
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-2 text-[9px] text-stone-400 font-mono mt-0.5 flex-wrap">
                                <button
                                    onClick={() => {
                                        audioManager.playSound('click');
                                        navigator.clipboard?.writeText(playerIdentifier);
                                        setCopiedId(true);
                                        setTimeout(() => setCopiedId(false), 2000);
                                    }}
                                    className="small-btn inline-flex items-center gap-1 bg-stone-900/90 hover:bg-stone-800 border border-stone-800 hover:border-stone-700 px-2 py-1 rounded-md text-stone-300 font-bold transition-all cursor-pointer"
                                    title="Click to copy Player ID"
                                >
                                    <span className="truncate max-w-[110px] sm:max-w-none">{playerIdentifier}</span>
                                    {copiedId ? <Check size={11} className="text-emerald-400 shrink-0" /> : <Copy size={11} className="shrink-0" />}
                                </button>
                                <span className="hidden sm:inline text-stone-600">•</span>
                                <span className="flex items-center gap-1 text-stone-400">
                                    <Clock size={11} className="text-stone-500 shrink-0" />
                                    <span><strong className="text-stone-200">{formattedPlaytime}</strong></span>
                                </span>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => {
                            audioManager.playSound('click');
                            onClose();
                        }}
                        className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-400 hover:text-white bg-stone-900/80 hover:bg-stone-800 border border-stone-800 rounded-xl transition-all cursor-pointer shadow-md shrink-0"
                        title="Close"
                        aria-label="Close"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 space-y-3 sm:space-y-4 scrollbar-hide custom-scrollbar">

                    {/* Main Stats - Wins/Losses/WinRate */}
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                        <div className="bg-stone-900/40 p-2.5 sm:p-4 border border-white/5 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center group hover:bg-stone-900/60 transition-colors">
                            <div className="text-stone-500 text-[8px] font-black tracking-[0.2em] uppercase mb-0.5 group-hover:text-green-500/70 transition-colors">WINS</div>
                            <div className="text-2xl sm:text-3xl font-black text-white px-2 relative">
                                {stats.wins}
                                <div className="absolute -inset-1 blur-lg bg-green-500/10 -z-10 group-hover:bg-green-500/20 transition-all" />
                            </div>
                        </div>
                        <div className="bg-stone-900/40 p-2.5 sm:p-4 border border-white/5 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center group hover:bg-stone-900/60 transition-colors">
                            <div className="text-stone-500 text-[8px] font-black tracking-[0.2em] uppercase mb-0.5 group-hover:text-red-500/70 transition-colors">LOSSES</div>
                            <div className="text-2xl sm:text-3xl font-black text-white px-2 relative">
                                {stats.losses}
                                <div className="absolute -inset-1 blur-lg bg-red-500/10 -z-10 group-hover:bg-red-500/20 transition-all" />
                            </div>
                        </div>
                        <div className="bg-stone-900/40 p-2.5 sm:p-4 border border-white/5 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center group hover:bg-stone-900/60 transition-colors">
                            <div className="text-stone-500 text-[8px] font-black tracking-[0.2em] uppercase mb-0.5 group-hover:text-yellow-500/70 transition-colors">SUCCESS</div>
                            <div className="text-2xl sm:text-3xl font-black text-white">
                                {winRate}<span className="text-xs sm:text-sm text-stone-600 align-top opacity-50 ml-0.5">%</span>
                            </div>
                        </div>
                    </div>

                    {/* Performance Grid */}
                    <div className="space-y-2.5 sm:space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-[1px] flex-1 bg-stone-800/50" />
                            <h3 className="text-stone-500 font-black tracking-[0.3em] uppercase text-[9px]">Combat Analysis</h3>
                            <div className="h-[1px] flex-1 bg-stone-800/50" />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                            <div className="bg-black/40 p-2.5 sm:p-3 border border-white/5 rounded-xl flex flex-col items-center justify-center group hover:border-blue-900/30 transition-all">
                                <Activity className="text-blue-500/80 mb-1 sm:mb-2 group-hover:scale-110 transition-transform" size={15} />
                                <div className="text-xl sm:text-2xl font-black text-white leading-none">{stats.totalRounds}</div>
                                <div className="text-[8px] text-stone-600 font-bold uppercase tracking-wider mt-1.5">Rounds</div>
                            </div>
                            <div className="bg-black/40 p-2.5 sm:p-3 border border-white/5 rounded-xl flex flex-col items-center justify-center group hover:border-red-900/30 transition-all">
                                <Target className="text-red-500/80 mb-1 sm:mb-2 group-hover:scale-110 transition-transform" size={15} />
                                <div className="text-xl sm:text-2xl font-black text-white leading-none">{accuracy}%</div>
                                <div className="text-[8px] text-stone-600 font-bold uppercase tracking-wider mt-1.5">Precision</div>
                            </div>
                            <div className="bg-black/40 p-2.5 sm:p-3 border border-white/5 rounded-xl flex flex-col items-center justify-center group hover:border-orange-900/30 transition-all">
                                <Swords className="text-orange-500/80 mb-1 sm:mb-2 group-hover:scale-110 transition-transform" size={15} />
                                <div className="text-xl sm:text-2xl font-black text-white leading-none">{stats.damageDealt}</div>
                                <div className="text-[8px] text-stone-600 font-bold uppercase tracking-wider mt-1.5">Lethality</div>
                            </div>
                            <div className="bg-black/40 p-2.5 sm:p-3 border border-white/5 rounded-xl flex flex-col items-center justify-center group hover:border-purple-900/30 transition-all">
                                <Skull className="text-purple-500/80 mb-1 sm:mb-2 group-hover:scale-110 transition-transform" size={15} />
                                <div className="text-xl sm:text-2xl font-black text-white leading-none">{stats.highestRound}</div>
                                <div className="text-[8px] text-stone-600 font-bold uppercase tracking-wider mt-1.5">Tier</div>
                            </div>
                        </div>
                    </div>

                    {/* Tactical Loadout removed — considered redundant */}

                    {/* Match History */}
                    <div className="space-y-2.5 sm:space-y-4">
                        <div className="flex items-center gap-3">
                            <h3 className="text-stone-500 font-black tracking-[0.3em] uppercase text-[9px]">Recent Operations</h3>
                            <div className="h-[1px] flex-1 bg-stone-800/50" />
                        </div>
                        <div className="space-y-2">
                            {stats.matchHistory && stats.matchHistory.length > 0 ? (
                                stats.matchHistory.slice(0, 10).map((match, i) => (
                                    <div 
                                        key={i} 
                                        onClick={() => {
                                            audioManager.playSound('click');
                                            setSelectedMatch(match);
                                        }}
                                        className="bg-stone-900/20 hover:bg-stone-900/40 p-2 sm:p-2.5 sm:px-3.5 border border-white/5 hover:border-cyan-500/40 rounded-xl flex justify-between items-center gap-2 transition-all cursor-pointer group"
                                    >
                                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-[11px] border shrink-0 ${match.result === 'WIN' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                                                {match.result === 'WIN' ? 'W' : 'L'}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] font-black text-stone-300 tracking-wider truncate">
                                                        MATCH #{i + 1}
                                                    </span>
                                                    {match.isMultiplayer ? (
                                                        <span className="text-[7px] bg-cyan-950/50 text-cyan-400 border border-cyan-900/30 px-1.5 py-0.5 rounded font-black tracking-widest uppercase animate-pulse shrink-0">MP</span>
                                                    ) : match.isHardMode ? (
                                                        <span className="text-[7px] bg-red-955/20 text-red-500 border border-red-900/30 px-1.5 py-0.5 rounded font-black tracking-widest uppercase shrink-0">HardMode</span>
                                                    ) : (
                                                        <span className="text-[7px] bg-stone-800 text-stone-400 px-1.5 py-0.5 rounded font-black tracking-widest uppercase shrink-0">SOLO</span>
                                                    )}
                                                </div>
                                                <span className="text-[8px] text-stone-600 font-mono tracking-tighter uppercase truncate">
                                                    {match.timestamp ? new Date(match.timestamp).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : 'Unknown Date'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex gap-2.5 sm:gap-4 items-center shrink-0">
                                            {/* Accuracy Ratio */}
                                            {(() => {
                                                const fired = match.shotsFired || 0;
                                                const hit = match.shotsHit || 0;
                                                const acc = fired > 0 ? Math.round((hit / fired) * 100) : 0;
                                                return (
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[7px] text-stone-600 font-bold uppercase tracking-widest">Accuracy</span>
                                                        <span className="text-[11px] sm:text-xs font-black text-cyan-400 font-mono flex items-center gap-1">
                                                            <Target size={10} className="text-cyan-500 shrink-0" />
                                                            <span>{acc}%</span>
                                                            <span className="hidden sm:inline text-[7.5px] text-stone-500 font-normal">({hit}/{fired})</span>
                                                        </span>
                                                    </div>
                                                );
                                            })()}
                                            <div className="hidden sm:flex flex-col items-end">
                                                <span className="text-[7px] text-stone-600 font-bold uppercase tracking-widest">Score</span>
                                                <span className="text-sm font-black text-yellow-500/80">{match.totalScore?.toLocaleString() || 0}</span>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className="text-[7px] text-stone-600 font-bold uppercase tracking-widest">Rds</span>
                                                <span className="text-xs sm:text-sm font-black text-stone-200">{match.roundsSurvived}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-stone-700 italic text-center text-[10px] py-8 bg-black/20 rounded-2xl border border-dashed border-stone-800">No operational history found in databanks.</div>
                            )}
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-2.5 sm:p-3 border-t border-stone-800/50 bg-stone-950/40 backdrop-blur-xl flex justify-center shrink-0">
                    <button
                        onClick={() => {
                            audioManager.playSound('click');
                            onClose();
                        }}
                        className="w-full py-2.5 min-h-[44px] bg-white text-black font-black text-[10px] tracking-[0.35em] active:scale-[0.98] transition-all shadow-xl hover:bg-stone-200 uppercase rounded-xl"
                    >
                        Return to Hub
                    </button>
                </div>

                {/* Universal Combat Report Modal */}
                {selectedMatch && (
                    <>
                        <div className="fixed inset-0 bg-black/85 z-[120] cursor-default backdrop-blur-sm" onClick={() => setSelectedMatch(null)} />
                        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[95vw] sm:w-[90vw] max-w-4xl max-h-[88dvh] overflow-y-auto bg-stone-950 border border-stone-800 p-3 sm:p-6 rounded-2xl shadow-[0_0_60px_rgba(0,0,0,0.85)] z-[130] font-mono text-stone-300 custom-scrollbar">
                            {/* Header */}
                            <div className="flex justify-between items-center border-b border-stone-800 pb-3 mb-4">
                                <div className="flex items-center gap-2.5 flex-wrap">
                                    <Swords className="text-cyan-400" size={16} />
                                    <span className="font-black text-xs sm:text-sm tracking-wider uppercase text-white">
                                        OPERATIONAL COMBAT REPORT
                                    </span>
                                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                                        selectedMatch.result === 'WIN' ? 'bg-emerald-955 border border-emerald-700 text-emerald-300' : 'bg-red-955 border border-red-700 text-red-300'
                                    }`}>
                                        {selectedMatch.result === 'WIN' ? 'VICTORY' : 'ELIMINATED'}
                                    </span>
                                    <span className="text-[8px] px-1.5 py-0.5 rounded bg-stone-900 border border-stone-800 text-stone-400 uppercase font-black">
                                        {selectedMatch.isMultiplayer ? 'MULTIPLAYER' : selectedMatch.isHardMode ? 'HARD PROTOCOL' : 'CAMPAIGN DUEL'}
                                    </span>
                                </div>
                                <button 
                                    onClick={() => {
                                        audioManager.playSound('click');
                                        setSelectedMatch(null);
                                    }} 
                                    className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-500 hover:text-white rounded-full hover:bg-white/5 transition-colors cursor-pointer"
                                    aria-label="Close match details"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Details Container */}
                            <div className="space-y-4 text-left">
                                <div className="flex justify-between text-[8px] sm:text-[9px] text-stone-500 border-b border-stone-900 pb-2 gap-2 flex-wrap">
                                    <span>TIMESTAMP: {selectedMatch.timestamp ? new Date(selectedMatch.timestamp).toLocaleString() : 'UNKNOWN'}</span>
                                    <span className="text-yellow-400 font-bold">RATING SCORE: {selectedMatch.totalScore?.toLocaleString() || 0} PTS</span>
                                </div>

                                {/* Deployed Agents list if Multiplayer */}
                                {selectedMatch.isMultiplayer && selectedMatch.mpPlayers && selectedMatch.mpPlayers.length > 0 && (
                                    <div className="space-y-1.5">
                                        <span className="text-[7.5px] sm:text-[8.5px] text-stone-500 uppercase tracking-widest font-black block">
                                            DEPLOYED AGENTS ROSTER
                                        </span>
                                        <div className="space-y-1">
                                            {selectedMatch.mpPlayers.map((player: any, idx: number) => {
                                                const pName = player.displayName || player.name || player.username || 'Agent';
                                                const pId = player.playerId || getPlayerId({ username: player.username || pName });
                                                const isDev = pName.toLowerCase() === 'aadish' || (player.username && player.username.toLowerCase() === 'aadish');
                                                const avatarUrl = isDev 
                                                    ? 'https://avatars.githubusercontent.com/u/101470733' 
                                                    : (player.avatarUrl || getDicebearUrl(player.avatarStyle || 'thumbs', player.username || pName));

                                                return (
                                                    <div key={idx} className="flex justify-between items-center p-2 bg-stone-900/25 border border-stone-850 rounded-xl text-[9.5px]">
                                                        <div className="flex items-center gap-2.5 min-w-0">
                                                            <div className="w-7 h-7 rounded-full overflow-hidden bg-stone-900 border border-stone-750 shrink-0">
                                                                <img src={avatarUrl} alt={pName} className="w-full h-full object-cover" />
                                                            </div>
                                                            <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                                                <span className="font-bold text-stone-200 truncate">{pName}</span>
                                                                <span className="text-[7.5px] text-stone-400 font-mono tracking-wider bg-stone-950 px-1.5 py-0.5 rounded border border-stone-800">{pId}</span>
                                                                {player.isHost && (
                                                                    <span className="text-[6.5px] bg-red-955 border border-red-800 text-red-400 px-1 py-0.2 rounded font-bold">HOST</span>
                                                                )}
                                                                {player.isMe && (
                                                                    <span className="text-[6.5px] bg-cyan-950 border border-cyan-800 text-cyan-400 px-1 py-0.2 rounded font-bold">YOU</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <span className={`font-black tracking-widest uppercase text-[9px] ${
                                                            player.result === 'WIN' ? 'text-green-400' :
                                                            player.result === 'LOSS' ? 'text-red-450' : 'text-stone-500'
                                                        }`}>
                                                            {player.result || 'FINISHED'}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Performance grid */}
                                <div className="space-y-2 pt-2 border-t border-stone-900">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[7.5px] sm:text-[8.5px] text-stone-500 uppercase tracking-widest font-black block">
                                            COMBAT PERFORMANCE METRICS
                                        </span>
                                        {(() => {
                                            const fired = selectedMatch.shotsFired || 0;
                                            const hit = selectedMatch.shotsHit || 0;
                                            const acc = fired > 0 ? Math.round((hit / fired) * 100) : 0;
                                            const grade = acc >= 90 ? 'S' : acc >= 75 ? 'A' : acc >= 50 ? 'B' : 'C';
                                            const gradeColor = grade === 'S' ? 'bg-amber-500/20 text-amber-300 border-amber-400' :
                                                               grade === 'A' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400' :
                                                               grade === 'B' ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400' :
                                                               'bg-stone-800 text-stone-400 border-stone-700';
                                            return (
                                                <span className={`px-2 py-0.5 rounded border text-[8px] font-black tracking-widest font-mono flex items-center gap-1 ${gradeColor}`}>
                                                    <Target size={10} />
                                                    <span>RANK {grade} TACTICAL</span>
                                                </span>
                                            );
                                        })()}
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[8.5px] sm:text-[9.5px]">
                                        <div className="p-2.5 bg-stone-950 border border-stone-850 rounded-xl flex flex-col justify-between">
                                            <span className="text-stone-500 uppercase text-[7.5px]">RDS SURVIVED</span>
                                            <span className="text-white font-bold text-base mt-1">{selectedMatch.roundsSurvived}</span>
                                        </div>
                                        <div className="p-2.5 bg-stone-950 border border-stone-850 rounded-xl flex flex-col justify-between">
                                            <span className="text-stone-500 uppercase text-[7.5px]">PRECISION</span>
                                            <div className="flex items-baseline gap-1 mt-1">
                                                <span className="text-white font-bold text-base">
                                                    {selectedMatch.shotsFired > 0 ? Math.round((selectedMatch.shotsHit / selectedMatch.shotsFired) * 100) : 0}%
                                                </span>
                                                <span className="text-[7.5px] text-stone-500 font-mono">({selectedMatch.shotsHit}/{selectedMatch.shotsFired})</span>
                                            </div>
                                        </div>
                                        <div className="p-2.5 bg-stone-950 border border-stone-850 rounded-xl flex flex-col justify-between">
                                            <span className="text-stone-500 uppercase text-[7.5px]">LETHALITY</span>
                                            <div className="flex items-baseline gap-1 mt-1">
                                                <span className="text-green-400 font-bold text-base">{selectedMatch.damageDealt}</span>
                                                <span className="text-[7.5px] text-stone-500">DMG DEALT</span>
                                            </div>
                                        </div>
                                        <div className="p-2.5 bg-stone-950 border border-stone-850 rounded-xl flex flex-col justify-between">
                                            <span className="text-stone-500 uppercase text-[7.5px]">DAMAGE TAKEN</span>
                                            <div className="flex items-baseline gap-1 mt-1">
                                                <span className={`${selectedMatch.damageTaken > 0 ? 'text-red-400' : 'text-stone-400'} font-bold text-base`}>{selectedMatch.damageTaken}</span>
                                                <span className="text-[7.5px] text-stone-500">HP LOST</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Ballistic Accuracy Ratio Meter Bar */}
                                    {(() => {
                                        const fired = selectedMatch.shotsFired || 0;
                                        const hit = selectedMatch.shotsHit || 0;
                                        const missed = Math.max(0, fired - hit);
                                        const acc = fired > 0 ? Math.round((hit / fired) * 100) : 0;
                                        return (
                                            <div className="p-2.5 bg-stone-950/80 border border-stone-850 rounded-xl space-y-1.5">
                                                <div className="flex justify-between items-center text-[7.5px] sm:text-[8px] uppercase font-bold text-stone-400">
                                                    <span className="flex items-center gap-1.5 text-cyan-400 font-black">
                                                        <Target size={11} /> BALLISTIC ACCURACY RATIO
                                                    </span>
                                                    <div className="flex items-center gap-2 font-mono">
                                                        <span className="text-emerald-400">{hit} HITS ({acc}%)</span>
                                                        <span className="text-stone-600">•</span>
                                                        <span className="text-stone-500">{missed} BLANKS / MISSES</span>
                                                    </div>
                                                </div>
                                                <div className="w-full h-2 bg-stone-900 rounded-full overflow-hidden border border-stone-800 flex">
                                                    <div 
                                                        className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-500" 
                                                        style={{ width: `${acc}%` }}
                                                    />
                                                    <div 
                                                        className="h-full bg-stone-800 transition-all duration-500" 
                                                        style={{ width: `${100 - acc}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {selectedMatch.selfShots > 0 && (
                                        <div className="p-2 bg-red-955/20 border border-red-900/40 rounded-xl flex justify-between items-center text-[8px] sm:text-[9px]">
                                            <span className="text-red-400 font-bold">DESPERATE GAMBLES (SELF-SHOTS):</span>
                                            <span className="text-red-300 font-mono font-black">{selectedMatch.selfShots} TIMES (-{selectedMatch.selfShots * 50} PTS)</span>
                                        </div>
                                    )}
                                </div>

                                {/* Items Deployed with Icons */}
                                {selectedMatch.itemsUsed && Object.keys(selectedMatch.itemsUsed).length > 0 && (
                                    renderItemsUsed(selectedMatch.itemsUsed)
                                )}

                                {/* Score Breakdown */}
                                <div className="space-y-1.5 pt-2 border-t border-stone-900">
                                    <span className="text-[7.5px] sm:text-[8.5px] text-stone-500 uppercase tracking-widest font-black block">
                                        SCORE VALUATION BREAKDOWN
                                    </span>
                                    <div className="p-3 bg-stone-950/80 border border-stone-850 rounded-xl space-y-1.5 text-[8px] sm:text-[9px]">
                                        <div className="flex justify-between border-b border-stone-900 pb-1">
                                            <span className="text-stone-400">Outcome Bonus:</span>
                                            <span className={selectedMatch.result === 'WIN' ? 'text-green-400 font-bold' : 'text-stone-500'}>
                                                {selectedMatch.result === 'WIN' ? '+1,000 PTS' : '+0 PTS'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between border-b border-stone-900 pb-1">
                                            <span className="text-stone-400">Rounds Survived ({selectedMatch.roundsSurvived}):</span>
                                            <span className="text-stone-200">+{selectedMatch.roundsSurvived * 100} PTS</span>
                                        </div>
                                        <div className="flex justify-between border-b border-stone-900 pb-1">
                                            <span className="text-stone-400">Shots Hit ({selectedMatch.shotsHit}):</span>
                                            <span className="text-stone-200">+{selectedMatch.shotsHit * 20} PTS</span>
                                        </div>
                                        <div className="flex justify-between border-b border-stone-900 pb-1">
                                            <span className="text-stone-400">Damage Dealt ({selectedMatch.damageDealt}):</span>
                                            <span className="text-stone-200">+{selectedMatch.damageDealt * 50} PTS</span>
                                        </div>
                                        <div className="flex justify-between pt-1 text-xs font-black text-yellow-400">
                                            <span>FINAL CALCULATED SCORE:</span>
                                            <span>{selectedMatch.totalScore?.toLocaleString() || 0} PTS</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={() => {
                                    audioManager.playSound('click');
                                    setSelectedMatch(null);
                                }} 
                                className="w-full mt-4 py-3 min-h-[44px] bg-stone-900 hover:bg-stone-850 border border-stone-700 text-stone-200 hover:text-white font-black text-[9px] sm:text-[10px] tracking-wider uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center"
                            >
                                DISMISS REPORT
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
