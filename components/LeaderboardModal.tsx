import React, { useState, useMemo, useEffect } from 'react';
import {
    Trophy,
    Crown,
    Award,
    Skull,
    Swords,
    Search,
    X,
    RotateCw,
    ChevronLeft,
    ChevronRight,
    Target
} from 'lucide-react';
import { LeaderboardEntry, UserProfile, getPlayerId } from '../utils/firebaseService';
import { DEFAULT_FALLBACK_AVATAR } from '../utils/dicebear';
import { resolvePlayerAvatar } from '../utils/messagingService';
import { presenceClient } from '../utils/presenceService';
import { audioManager } from '../utils/audioManager';
import { computeDetailedStats, DetailedCareerStats } from '../utils/statsAnalytics';

interface LeaderboardModalProps {
    isOpen: boolean;
    onClose: () => void;
    leaderboard: LeaderboardEntry[];
    isLoading: boolean;
    onRefresh: () => void;
    currentUser: UserProfile | null;
    getUserPresence: (username: string) => any;
    onSelectProfile: (entry: LeaderboardEntry) => void;
}

type LeaderboardTab = 'wins' | 'winrate' | 'hardcore' | 'multiplayer';

const ITEMS_PER_PAGE = 50;

export interface EnrichedLeaderboardEntry extends LeaderboardEntry {
    multiplayerMatchCount: number;
    winRatePercent: number;
    pId: string;
    isDev: boolean;
    avatarSrc: string;
    detailed: DetailedCareerStats;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
    isOpen,
    onClose,
    leaderboard,
    isLoading,
    onRefresh,
    currentUser,
    getUserPresence,
    onSelectProfile
}) => {
    const [currentTab, setCurrentTab] = useState<LeaderboardTab>('wins');
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);
    const [profileVersion, setProfileVersion] = useState(0);

    useEffect(() => {
        if (!isOpen) return;
        const handleProfileUpdated = () => setProfileVersion(v => v + 1);
        window.addEventListener('bugshot_profile_updated', handleProfileUpdated);
        const unsubPresence = presenceClient.subscribe(() => setProfileVersion(v => v + 1));
        return () => {
            window.removeEventListener('bugshot_profile_updated', handleProfileUpdated);
            unsubPresence();
        };
    }, [isOpen]);

    const processedLeaderboard = useMemo((): EnrichedLeaderboardEntry[] => {
        if (!isOpen) return [];
        let entries = [...leaderboard];

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            entries = entries.filter((e) => {
                const name = (e.displayName || e.username || '').toLowerCase();
                const pid = (e.playerId || getPlayerId(e) || '').toLowerCase();
                return name.includes(q) || pid.includes(q);
            });
        }

        const enriched: EnrichedLeaderboardEntry[] = entries.map((entry) => {
            const isMe = currentUser?.username?.toLowerCase() === entry.username?.toLowerCase();
            const effectiveEntry: LeaderboardEntry = isMe && currentUser
                ? {
                    ...entry,
                    displayName: currentUser.displayName || entry.displayName,
                    avatarUrl: currentUser.avatarUrl,
                    avatarStyle: currentUser.avatarStyle,
                    avatarSeed: currentUser.avatarSeed,
                    isDeveloper: Boolean(currentUser.isDeveloper || entry.isDeveloper)
                }
                : entry;
            const isDev = effectiveEntry.username?.toLowerCase() === 'aadish' || Boolean(effectiveEntry.isDeveloper);
            const avatarSrc = resolvePlayerAvatar(effectiveEntry);
            const detailed = computeDetailedStats(effectiveEntry.stats, {
                wins: effectiveEntry.wins,
                losses: effectiveEntry.losses,
                hardModeWins: effectiveEntry.hardModeWins,
                totalTimePlayed: (effectiveEntry as any).totalTimePlayed
            });
            const pId = effectiveEntry.playerId || getPlayerId(effectiveEntry);

            return {
                ...effectiveEntry,
                isDev,
                avatarSrc,
                winRatePercent: detailed.winRate,
                multiplayerMatchCount: detailed.mpMatches,
                pId,
                detailed
            };
        });

        switch (currentTab) {
            case 'winrate':
                enriched.sort((a, b) => {
                    if (b.detailed.winRate !== a.detailed.winRate) return b.detailed.winRate - a.detailed.winRate;
                    return b.detailed.wins - a.detailed.wins;
                });
                break;
            case 'hardcore':
                enriched.sort((a, b) => b.detailed.hardModeWins - a.detailed.hardModeWins || b.detailed.wins - a.detailed.wins);
                break;
            case 'multiplayer':
                enriched.sort((a, b) => b.detailed.mpMatches - a.detailed.mpMatches || b.detailed.mpWins - a.detailed.mpWins);
                break;
            case 'wins':
            default:
                enriched.sort((a, b) => b.detailed.wins - a.detailed.wins || a.detailed.losses - b.detailed.losses);
                break;
        }

        return enriched;
    }, [isOpen, leaderboard, searchQuery, currentTab, currentUser, profileVersion]);

    const totalPages = Math.max(1, Math.ceil(processedLeaderboard.length / ITEMS_PER_PAGE));
    const safePage = Math.min(page, totalPages);
    const paginatedEntries = processedLeaderboard.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

    const handleTabChange = (tab: LeaderboardTab) => {
        audioManager.playSound('click');
        setCurrentTab(tab);
        setPage(1);
    };

    if (!isOpen) return null;

    const tabs: { id: LeaderboardTab; label: string; icon: React.ReactNode; activeCls: string }[] = [
        { id: 'wins', label: 'WINS', icon: <Trophy size={12} />, activeCls: 'bg-amber-950/50 border-amber-500/80 text-amber-300' },
        { id: 'winrate', label: 'WIN RATE', icon: <Target size={12} />, activeCls: 'bg-emerald-950/50 border-emerald-500/80 text-emerald-300' },
        { id: 'hardcore', label: 'HARD MODE', icon: <Skull size={12} />, activeCls: 'bg-red-950/50 border-red-500/80 text-red-300' },
        { id: 'multiplayer', label: 'MULTIPLAYER', icon: <Swords size={12} />, activeCls: 'bg-cyan-950/50 border-cyan-500/80 text-cyan-300' }
    ];

    const renderPrimaryMetric = (entry: EnrichedLeaderboardEntry) => {
        const { detailed } = entry;
        switch (currentTab) {
            case 'winrate':
                return (
                    <div className="text-right shrink-0">
                        <span className="text-xs sm:text-sm font-black text-emerald-400 tabular-nums">{detailed.winRate}%</span>
                        <span className="block text-[8px] text-stone-500 font-bold uppercase tracking-wider">WIN RATE</span>
                    </div>
                );
            case 'hardcore':
                return (
                    <div className="text-right shrink-0">
                        <span className="text-xs sm:text-sm font-black text-red-400 tabular-nums">{detailed.hardModeWins}</span>
                        <span className="block text-[8px] text-stone-500 font-bold uppercase tracking-wider">HARD WINS</span>
                    </div>
                );
            case 'multiplayer':
                return (
                    <div className="text-right shrink-0">
                        <span className="text-xs sm:text-sm font-black text-cyan-400 tabular-nums">{detailed.mpMatches}</span>
                        <span className="block text-[8px] text-stone-500 font-bold uppercase tracking-wider">MP GAMES</span>
                    </div>
                );
            case 'wins':
            default:
                return (
                    <div className="text-right shrink-0">
                        <span className="text-xs sm:text-sm font-black text-amber-400 tabular-nums">{detailed.wins}</span>
                        <span className="block text-[8px] text-stone-500 font-bold uppercase tracking-wider">WINS</span>
                    </div>
                );
        }
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/88 p-2 sm:p-4 overflow-hidden font-mono select-none"
            role="dialog"
            aria-modal="true"
            aria-label="Global Leaderboard"
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
            <div className="relative w-full max-w-2xl h-[88vh] max-h-[92vh] bg-stone-950 border-2 border-stone-800 p-3 sm:p-5 rounded-2xl shadow-[0_28px_90px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden my-auto">
                {/* Close Button */}
                <button
                    onClick={() => {
                        audioManager.playSound('click');
                        onClose();
                    }}
                    className="absolute top-3 right-3 text-stone-400 hover:text-white bg-stone-900 hover:bg-stone-800 border border-stone-700 w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl z-50 cursor-pointer flex items-center justify-center transition-colors"
                    title="Close Leaderboard"
                    aria-label="Close Leaderboard"
                >
                    <X size={17} />
                </button>

                {/* Header */}
                <div className="border-b border-stone-850 pb-2.5 mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0 pr-11">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-amber-950/40 border border-amber-800/50 rounded-xl text-amber-400">
                            <Trophy size={18} />
                        </div>
                        <div>
                            <span className="text-sm sm:text-base font-black text-white tracking-widest block uppercase">LEADERBOARD</span>
                            <span className="text-[8.5px] text-stone-500 font-bold uppercase tracking-wider block">
                                Click any player for full stats
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="relative flex items-center flex-1 sm:flex-initial">
                            <Search size={12} className="absolute left-2.5 text-stone-500" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setPage(1);
                                }}
                                placeholder="Search player..."
                                className="bg-stone-900 border border-stone-800 focus:border-amber-500/60 pl-7 pr-2.5 py-2 min-h-[38px] text-[10px] text-stone-200 uppercase rounded-xl outline-none w-full sm:w-44 tracking-wider placeholder-stone-600"
                            />
                        </div>

                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                onRefresh();
                            }}
                            className="w-9 h-9 min-w-[36px] min-h-[36px] flex items-center justify-center bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-400 hover:text-white rounded-xl cursor-pointer transition-colors shrink-0"
                            title="Refresh Leaderboard"
                            aria-label="Refresh Leaderboard"
                        >
                            <RotateCw size={14} className={isLoading ? 'animate-spin text-amber-400' : ''} />
                        </button>
                    </div>
                </div>

                {/* Filter Tabs */}
                <div className="grid grid-cols-4 gap-1.5 mb-3 shrink-0">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => handleTabChange(tab.id)}
                            className={`flex items-center justify-center gap-1.5 px-2 py-2 min-h-[36px] rounded-xl border text-[8.5px] sm:text-[9.5px] font-black tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap ${
                                currentTab === tab.id
                                    ? tab.activeCls
                                    : 'bg-stone-900/50 border-stone-850 text-stone-500 hover:text-stone-200'
                            }`}
                        >
                            {tab.icon}
                            <span className="truncate">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Single-Row Clean Entries List */}
                <div className="space-y-1.5 flex-1 overflow-y-auto pr-1 select-none custom-scrollbar tabular-nums">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <div className="w-8 h-8 border-2 border-stone-700 border-t-amber-400 rounded-full animate-spin" />
                            <span className="text-stone-400 text-xs font-bold tracking-wider uppercase">Loading Rankings...</span>
                        </div>
                    ) : paginatedEntries.length === 0 ? (
                        <div className="text-center py-16 text-stone-500 text-xs font-bold tracking-wider uppercase border border-dashed border-stone-850 rounded-xl p-8">
                            No Players Found
                        </div>
                    ) : (
                        paginatedEntries.map((entry, idx) => {
                            const globalIndex = (safePage - 1) * ITEMS_PER_PAGE + idx;
                            const { pId, isDev, avatarSrc } = entry;
                            const isMe = currentUser?.username?.toLowerCase() === entry.username?.toLowerCase();

                            const isTop1 = globalIndex === 0;
                            const isTop2 = globalIndex === 1;
                            const isTop3 = globalIndex === 2;

                            let rowWrapperClass = 'border border-stone-850 bg-stone-900/40 hover:bg-stone-900/80 rounded-xl overflow-hidden transition-colors';
                            let rankBadge = (
                                <span className="text-[10.5px] text-stone-500 font-bold font-mono">
                                    #{globalIndex + 1}
                                </span>
                            );
                            let avatarRing = 'border-stone-700';

                            if (isTop1) {
                                rowWrapperClass = 'border border-amber-500/70 bg-amber-950/15 hover:bg-amber-950/25 rounded-xl overflow-hidden transition-colors';
                                rankBadge = (
                                    <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/60 text-amber-400 font-black text-[9.5px] rounded-lg inline-flex items-center gap-1">
                                        <Crown size={11} className="text-amber-400" />
                                        #1
                                    </span>
                                );
                                avatarRing = 'border-amber-400';
                            } else if (isTop2) {
                                rowWrapperClass = 'border border-stone-400/50 bg-stone-900/55 hover:bg-stone-850/80 rounded-xl overflow-hidden transition-colors';
                                rankBadge = (
                                    <span className="px-2 py-0.5 bg-stone-400/15 border border-stone-400/50 text-stone-200 font-black text-[9.5px] rounded-lg inline-flex items-center gap-1">
                                        <Award size={11} />
                                        #2
                                    </span>
                                );
                                avatarRing = 'border-stone-400';
                            } else if (isTop3) {
                                rowWrapperClass = 'border border-amber-700/60 bg-stone-900/50 hover:bg-stone-850/80 rounded-xl overflow-hidden transition-colors';
                                rankBadge = (
                                    <span className="px-2 py-0.5 bg-amber-700/20 border border-amber-700/50 text-amber-500 font-black text-[9.5px] rounded-lg inline-flex items-center gap-1">
                                        <Award size={11} />
                                        #3
                                    </span>
                                );
                                avatarRing = 'border-amber-700';
                            } else if (globalIndex < 10) {
                                rankBadge = (
                                    <span className="text-[10.5px] text-amber-500/90 font-bold font-mono">
                                        #{globalIndex + 1}
                                    </span>
                                );
                            }

                            if (isMe) {
                                rowWrapperClass += ' ring-1 ring-cyan-500/60 bg-cyan-950/15';
                            }

                            const p = getUserPresence(entry.username);
                            const st = p?.status || 'offline';
                            const presenceDot =
                                st === 'in_match'
                                    ? 'bg-red-500'
                                    : st === 'in_lobby'
                                        ? 'bg-amber-400'
                                        : st === 'online'
                                            ? 'bg-emerald-500'
                                            : 'bg-stone-600';

                            return (
                                <div
                                    key={entry.username}
                                    className={rowWrapperClass}
                                    style={{ contentVisibility: 'auto', containIntrinsicSize: '56px' }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            audioManager.playSound('click');
                                            onSelectProfile(entry);
                                        }}
                                        className="w-full px-3 py-2.5 text-left transition-colors cursor-pointer flex items-center gap-2.5 sm:gap-3 group/row"
                                    >
                                        {/* Rank */}
                                        <div className="w-11 flex justify-center shrink-0">
                                            {rankBadge}
                                        </div>

                                        {/* Avatar + Name */}
                                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                            <div className="relative shrink-0">
                                                <div className={`w-8 h-8 rounded-full overflow-hidden bg-stone-900 border ${avatarRing}`}>
                                                    <img
                                                        src={avatarSrc}
                                                        alt={entry.username}
                                                        referrerPolicy="no-referrer"
                                                        className="w-full h-full object-cover"
                                                        loading="lazy"
                                                        decoding="async"
                                                        width={32}
                                                        height={32}
                                                        onError={(e) => {
                                                            const img = e.currentTarget;
                                                            if (img.src !== DEFAULT_FALLBACK_AVATAR && !img.dataset.fallbackApplied) {
                                                                img.dataset.fallbackApplied = '1';
                                                                img.src = DEFAULT_FALLBACK_AVATAR;
                                                            }
                                                        }}
                                                    />
                                                </div>
                                                <span className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-stone-950 ${presenceDot}`} />
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-bold text-xs sm:text-[13px] text-white uppercase tracking-wide truncate group-hover/row:text-amber-200 transition-colors">
                                                        {entry.displayName || entry.username}
                                                    </span>
                                                    {isDev && (
                                                        <span className="px-1.5 py-0.5 bg-red-950 border border-red-800 text-red-400 text-[7px] font-bold rounded uppercase shrink-0">
                                                            DEV
                                                        </span>
                                                    )}
                                                    {isMe && (
                                                        <span className="px-1.5 py-0.5 bg-cyan-950 border border-cyan-700 text-cyan-300 text-[7px] font-black rounded uppercase shrink-0">
                                                            YOU
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[8.5px] text-stone-500 font-mono tracking-wider block truncate">
                                                    {pId}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Primary Tab Metric + Profile Arrow */}
                                        <div className="flex items-center gap-2 shrink-0">
                                            {renderPrimaryMetric(entry)}
                                            <ChevronRight size={14} className="text-stone-600 group-hover/row:text-stone-300 transition-colors shrink-0" />
                                        </div>
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer / Pagination */}
                <div className="mt-2.5 pt-2.5 border-t border-stone-850 flex items-center justify-between shrink-0 gap-2 flex-wrap sm:flex-nowrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                setPage((p) => Math.max(1, p - 1));
                            }}
                            disabled={safePage <= 1}
                            className="px-2.5 py-1.5 min-h-[34px] bg-stone-900 hover:bg-stone-800 disabled:opacity-30 border border-stone-800 text-stone-300 hover:text-white rounded-lg text-[9.5px] font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:cursor-not-allowed"
                        >
                            <ChevronLeft size={13} />
                            <span>PREV</span>
                        </button>

                        <span className="text-[9px] text-stone-500 font-bold font-mono px-1.5 tabular-nums">
                            PAGE {safePage} / {totalPages} ({processedLeaderboard.length})
                        </span>

                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                setPage((p) => Math.min(totalPages, p + 1));
                            }}
                            disabled={safePage >= totalPages}
                            className="px-2.5 py-1.5 min-h-[34px] bg-stone-900 hover:bg-stone-800 disabled:opacity-30 border border-stone-800 text-stone-300 hover:text-white rounded-lg text-[9.5px] font-bold flex items-center gap-1 transition-colors cursor-pointer disabled:cursor-not-allowed"
                        >
                            <span>NEXT</span>
                            <ChevronRight size={13} />
                        </button>
                    </div>

                    <button
                        onClick={() => {
                            audioManager.playSound('click');
                            onClose();
                        }}
                        className="px-4 py-1.5 min-h-[34px] bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-200 hover:text-white font-bold text-[10px] tracking-wider uppercase transition-colors rounded-xl cursor-pointer flex items-center justify-center shrink-0"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
