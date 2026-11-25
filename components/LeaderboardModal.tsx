import React, { useState, useMemo, useEffect } from 'react';
import { Trophy, Crown, Award, Skull, Swords, Search, X, RotateCw, ChevronLeft, ChevronRight, User, Shield, Flame, Target } from 'lucide-react';
import { LeaderboardEntry, UserProfile, getPlayerId } from '../utils/firebaseService';
import { DEFAULT_FALLBACK_AVATAR } from '../utils/dicebear';
import { resolvePlayerAvatar } from '../utils/messagingService';
import { presenceClient } from '../utils/presenceService';
import { audioManager } from '../utils/audioManager';

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

    // Re-resolve leaderboard avatars immediately when user updates their avatar or presence syncs
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

    // Filter, Sort, and Pre-enrich Entries (Cached in useMemo for 60fps render performance)
    // Displays up to 50 names per scrollable view, followed by Next button
    const processedLeaderboard = useMemo((): EnrichedLeaderboardEntry[] => {
        if (!isOpen) return [];
        let entries = [...leaderboard];

        // Search Filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            entries = entries.filter((e) => {
                const name = (e.displayName || e.username || '').toLowerCase();
                const pid = (e.playerId || getPlayerId(e) || '').toLowerCase();
                return name.includes(q) || pid.includes(q);
            });
        }

        // Tab Sorting
        switch (currentTab) {
            case 'winrate': {
                entries.sort((a, b) => {
                    const totalA = (a.wins || 0) + (a.losses || 0);
                    const totalB = (b.wins || 0) + (b.losses || 0);
                    const rateA = totalA > 0 ? (a.wins / totalA) : 0;
                    const rateB = totalB > 0 ? (b.wins / totalB) : 0;
                    if (rateB !== rateA) return rateB - rateA;
                    return (b.wins || 0) - (a.wins || 0);
                });
                break;
            }
            case 'hardcore': {
                entries.sort((a, b) => (b.hardModeWins || 0) - (a.hardModeWins || 0) || (b.wins || 0) - (a.wins || 0));
                break;
            }
            case 'multiplayer': {
                entries.sort((a, b) => {
                    const mpA = (a.stats?.matchHistory || []).filter((m: any) => m?.isMultiplayer).length;
                    const mpB = (b.stats?.matchHistory || []).filter((m: any) => m?.isMultiplayer).length;
                    return mpB - mpA || (b.wins || 0) - (a.wins || 0);
                });
                break;
            }
            case 'wins':
            default: {
                entries.sort((a, b) => (b.wins || 0) - (a.wins || 0) || (a.losses || 0) - (b.losses || 0));
                break;
            }
        }

        // Pre-compute all expensive operations once to optimize 50-item list scrolling
        return entries.map((entry) => {
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
            const totalMatches = (effectiveEntry.wins || 0) + (effectiveEntry.losses || 0);
            const winRatePercent = totalMatches > 0 ? Math.round((effectiveEntry.wins / totalMatches) * 100) : 0;
            const multiplayerMatchCount = (effectiveEntry.stats?.matchHistory || []).filter((m: any) => m?.isMultiplayer).length;
            const pId = effectiveEntry.playerId || getPlayerId(effectiveEntry);

            return {
                ...effectiveEntry,
                isDev,
                avatarSrc,
                winRatePercent,
                multiplayerMatchCount,
                pId
            };
        });
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

    return (
        <div 
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-300 overflow-hidden font-mono select-none"
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
            <div className="relative w-full max-w-[min(96vw,calc(100vw-16px))] h-[92vh] max-h-[96vh] md:w-[90vw] md:h-[90vh] bg-stone-950/95 border-2 border-stone-850 p-3 sm:p-4 rounded-2xl shadow-[0_28px_90px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden my-auto">
                {/* Close Button */}
                <button
                    onClick={() => {
                        audioManager.playSound('click');
                        onClose();
                    }}
                    className="absolute top-3 right-3 text-stone-400 hover:text-white bg-stone-900 hover:bg-stone-850 border border-stone-800 w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl z-50 cursor-pointer flex items-center justify-center transition-all"
                    title="Close Leaderboard"
                    aria-label="Close Leaderboard"
                >
                    <X size={18} />
                </button>

                {/* Header Box */}
                <div className="border-b border-stone-850 pb-3 mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0 pr-12">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-amber-955/30 border border-amber-800/40 rounded-xl text-amber-400">
                            <Trophy size={18} />
                        </div>
                        <div>
                            <span className="text-sm sm:text-base font-black text-white tracking-widest block uppercase">GLOBAL LEADERBOARD</span>
                            <span className="text-[8px] sm:text-[9px] text-stone-500 font-bold uppercase tracking-wider block">CLOUD-VERIFIED OPERATIVE COMBAT RECORDS (TOP 50 PER SCROLL)</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Search Input */}
                        <div className="relative flex items-center">
                            <Search size={12} className="absolute left-2.5 text-stone-500" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setPage(1);
                                }}
                                placeholder="Search operative..."
                                className="bg-stone-900/90 border border-stone-800 focus:border-amber-500/60 pl-7 pr-2.5 py-2 min-h-[44px] text-[9.5px] text-stone-200 uppercase rounded-xl outline-none w-32 sm:w-44 tracking-wider placeholder-stone-600"
                            />
                        </div>

                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                onRefresh();
                            }}
                            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center bg-stone-900 hover:bg-stone-850 border border-stone-800 text-stone-400 hover:text-white rounded-xl cursor-pointer transition-all shrink-0"
                            title="Refresh Leaderboard"
                            aria-label="Refresh Leaderboard"
                        >
                            <RotateCw size={15} className={isLoading ? 'animate-spin text-amber-400' : ''} />
                        </button>
                        <span className="text-stone-400 flex items-center gap-1.5 text-[8px] sm:text-[9px] bg-stone-900 border border-stone-800 px-2.5 py-1 min-h-[44px] rounded-xl shrink-0 font-bold">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                            {processedLeaderboard.length} OPERATIVES
                        </span>
                    </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-2 mb-2.5 overflow-x-auto pb-1 shrink-0 scrollbar-none custom-scrollbar">
                    <button
                        type="button"
                        onClick={() => handleTabChange('wins')}
                        className={`flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl border text-[8.5px] sm:text-[9.5px] font-black tracking-widest uppercase transition-all cursor-pointer ${
                            currentTab === 'wins'
                                ? 'bg-amber-955/40 border-amber-500/70 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                                : 'bg-stone-900/40 border-stone-850 text-stone-500 hover:text-stone-300'
                        }`}
                    >
                        <Trophy size={11} />
                        <span>OVERALL WINS</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => handleTabChange('winrate')}
                        className={`flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl border text-[8.5px] sm:text-[9.5px] font-black tracking-widest uppercase transition-all cursor-pointer ${
                            currentTab === 'winrate'
                                ? 'bg-emerald-955/40 border-emerald-500/70 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                                : 'bg-stone-900/40 border-stone-850 text-stone-500 hover:text-stone-300'
                        }`}
                    >
                        <Target size={11} />
                        <span>WIN RATIO %</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => handleTabChange('hardcore')}
                        className={`flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl border text-[8.5px] sm:text-[9.5px] font-black tracking-widest uppercase transition-all cursor-pointer ${
                            currentTab === 'hardcore'
                                ? 'bg-red-955/40 border-red-500/70 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.2)]'
                                : 'bg-stone-900/40 border-stone-850 text-stone-500 hover:text-stone-300'
                        }`}
                    >
                        <Skull size={11} />
                        <span>HARDCORE PROTOCOL</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => handleTabChange('multiplayer')}
                        className={`flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-xl border text-[8.5px] sm:text-[9.5px] font-black tracking-widest uppercase transition-all cursor-pointer ${
                            currentTab === 'multiplayer'
                                ? 'bg-cyan-955/40 border-cyan-500/70 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.2)]'
                                : 'bg-stone-900/40 border-stone-850 text-stone-500 hover:text-stone-300'
                        }`}
                    >
                        <Swords size={11} />
                        <span>MULTIPLAYER ENGAGEMENTS</span>
                    </button>
                </div>

                {/* Table Header Row */}
                {paginatedEntries.length > 0 && !isLoading && (
                    <div className="relative flex items-center px-3 py-2 text-[8px] sm:text-[9px] font-mono font-black uppercase tracking-[0.2em] rounded-xl mb-2 shrink-0 bg-stone-900/80 border border-stone-800 shadow-inner">
                        <span className="w-12 text-center shrink-0 flex items-center justify-center gap-1 text-amber-400">
                            <Crown size={11} />
                            <span>RANK</span>
                        </span>
                        <span className="flex-1 pl-4 text-left flex items-center gap-1 text-stone-300">
                            <User size={11} className="text-cyan-400" />
                            <span>OPERATIVE</span>
                        </span>
                        <span className="w-auto sm:w-56 text-right pr-3 shrink-0 flex items-center justify-end gap-1 text-stone-300">
                            <Swords size={11} className="text-emerald-400" />
                            <span>COMBAT METRICS</span>
                        </span>
                    </div>
                )}

                {/* Entries List */}
                <div className="space-y-1.5 flex-1 overflow-y-auto pr-1 select-none custom-scrollbar">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <div className="w-8 h-8 border-2 border-stone-700 border-t-amber-400 rounded-full animate-spin" />
                            <span className="text-stone-400 text-xs font-bold tracking-wider uppercase">Loading Combat Data...</span>
                        </div>
                    ) : paginatedEntries.length === 0 ? (
                        <div className="text-center py-16 text-stone-500 text-xs font-bold tracking-wider uppercase border border-dashed border-stone-850 rounded-xl p-8">
                            No Operatives Found
                        </div>
                    ) : (
                        paginatedEntries.map((entry, idx) => {
                            const globalIndex = (safePage - 1) * ITEMS_PER_PAGE + idx;
                            const { multiplayerMatchCount, pId, isDev, avatarSrc, winRatePercent } = entry;
                            const isMe = currentUser?.username?.toLowerCase() === entry.username?.toLowerCase();

                            const isTop1 = globalIndex === 0;
                            const isTop2 = globalIndex === 1;
                            const isTop3 = globalIndex === 2;

                            let rowWrapperClass = "border border-stone-850 bg-stone-900/30 hover:bg-stone-900/60 rounded-xl overflow-hidden transition-all";
                            let rankBadge = (
                                <span className="w-12 text-center text-[10px] shrink-0 text-stone-500 font-bold font-mono">
                                    #{globalIndex + 1}
                                </span>
                            );
                            let avatarRing = "border-stone-800";

                            if (isTop1) {
                                rowWrapperClass = "relative border border-amber-500/70 bg-stone-900/60 hover:bg-stone-850/80 rounded-xl overflow-hidden shadow-[0_0_15px_rgba(245,158,11,0.15)] transition-all";
                                rankBadge = (
                                    <div className="w-12 flex justify-center shrink-0">
                                        <span className="px-2 py-0.5 bg-amber-500/20 border border-amber-500/60 text-amber-400 font-black text-[9.5px] rounded-lg flex items-center gap-1 font-mono uppercase tracking-tight shadow-[0_0_8px_rgba(245,158,11,0.3)]">
                                            <Crown size={11} className="text-amber-400 fill-amber-400/30" />
                                            #1
                                        </span>
                                    </div>
                                );
                                avatarRing = "border-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.3)]";
                            } else if (isTop2) {
                                rowWrapperClass = "relative border border-stone-400/60 bg-stone-900/50 hover:bg-stone-850/80 rounded-xl overflow-hidden shadow-[0_0_12px_rgba(214,211,209,0.1)] transition-all";
                                rankBadge = (
                                    <div className="w-12 flex justify-center shrink-0">
                                        <span className="px-2 py-0.5 bg-stone-400/15 border border-stone-400/50 text-stone-200 font-black text-[9.5px] rounded-lg flex items-center gap-1 font-mono uppercase tracking-tight">
                                            <Award size={11} className="text-stone-300" />
                                            #2
                                        </span>
                                    </div>
                                );
                                avatarRing = "border-stone-400";
                            } else if (isTop3) {
                                rowWrapperClass = "relative border border-amber-700/60 bg-stone-900/50 hover:bg-stone-850/80 rounded-xl overflow-hidden shadow-[0_0_10px_rgba(180,83,9,0.1)] transition-all";
                                rankBadge = (
                                    <div className="w-12 flex justify-center shrink-0">
                                        <span className="px-2 py-0.5 bg-amber-700/20 border border-amber-700/50 text-amber-500 font-black text-[9.5px] rounded-lg flex items-center gap-1 font-mono uppercase tracking-tight">
                                            <Award size={11} className="text-amber-600" />
                                            #3
                                        </span>
                                    </div>
                                );
                                avatarRing = "border-amber-700";
                            } else if (globalIndex < 10) {
                                rankBadge = (
                                    <span className="w-12 text-center text-[10px] shrink-0 text-amber-500/90 font-bold font-mono">
                                        #{globalIndex + 1}
                                    </span>
                                );
                            }

                            if (isMe) {
                                rowWrapperClass += " ring-1 ring-cyan-500/50 bg-cyan-950/10";
                            }

                            return (
                                <div 
                                    key={entry.username} 
                                    className={rowWrapperClass}
                                    style={{ contentVisibility: 'auto', containIntrinsicSize: '52px' }}
                                >
                                    <button
                                        onClick={() => {
                                            audioManager.playSound('click');
                                            onSelectProfile(entry);
                                        }}
                                        className="w-full flex items-center px-3 py-2.5 min-h-[44px] text-left transition-colors cursor-pointer group/row"
                                    >
                                        {/* Rank */}
                                        {rankBadge}

                                        {/* Avatar & Presence */}
                                        <div className="relative shrink-0 ml-1.5">
                                            <div className={`w-8 h-8 rounded-full overflow-hidden bg-stone-900 border ${avatarRing}`}>
                                                <img
                                                    src={avatarSrc}
                                                    alt={entry.username}
                                                    className="w-full h-full object-cover group-hover/row:scale-105 transition-transform duration-150"
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
                                            {(() => {
                                                const p = getUserPresence(entry.username);
                                                const st = p?.status || 'offline';
                                                if (st === 'in_match') {
                                                    return <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 border border-stone-950" title="In Match" />;
                                                } else if (st === 'in_lobby') {
                                                    return <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-400 border border-stone-950" title="In Lobby" />;
                                                } else if (st === 'online') {
                                                    return <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 border border-stone-950" title="Online" />;
                                                }
                                                return <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-stone-600 border border-stone-950" title="Offline" />;
                                            })()}
                                        </div>

                                        {/* Agent Username & Badges */}
                                        <div className="flex-1 min-w-0 pl-3">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="font-bold text-[10px] sm:text-xs text-stone-200 uppercase tracking-wide truncate">
                                                    {entry.displayName || entry.username}
                                                </span>
                                                {isDev && (
                                                    <span className="px-1.5 py-0.2 bg-red-955 border border-red-800 text-red-400 text-[6.5px] font-bold rounded uppercase shrink-0">
                                                        DEV
                                                    </span>
                                                )}
                                                {isMe && (
                                                    <span className="px-1.5 py-0.2 bg-cyan-950 border border-cyan-700 text-cyan-300 text-[6.5px] font-black rounded uppercase shrink-0">
                                                        YOU
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[7.5px] text-stone-500 font-mono tracking-wider block">
                                                {pId}
                                            </span>
                                        </div>

                                        {/* Combat Record & Win Rate */}
                                        <div className="flex items-center gap-1 sm:gap-2 w-auto sm:w-56 justify-end pr-1 sm:pr-2 text-[8.5px] sm:text-[10px] shrink-0 font-bold flex-wrap">
                                            {/* Win Rate */}
                                            <span className="text-stone-300 bg-stone-900 px-1.5 py-0.5 rounded border border-stone-800 font-mono text-[8px]" title="Win Rate %">
                                                {winRatePercent}% WR
                                            </span>

                                            {/* Wins */}
                                            <span className="text-emerald-300 bg-emerald-955/60 px-2 py-0.5 rounded-lg border border-emerald-600/50 font-mono flex items-center gap-0.5" title="Total Wins">
                                                <Trophy size={10} className="text-emerald-400" />
                                                {entry.wins}W
                                            </span>

                                            {/* Losses */}
                                            <span className="text-stone-400 bg-stone-950 px-1.5 py-0.5 rounded-lg border border-stone-850 font-mono text-[8.5px]" title="Total Losses">
                                                {entry.losses}L
                                            </span>

                                            {/* Hardcore / Skull */}
                                            {entry.hardModeWins > 0 && (
                                                <span className="text-amber-300 flex items-center gap-0.5 bg-amber-955/60 px-1.5 py-0.5 rounded-lg border border-amber-600/50 font-mono text-[8.5px]" title="Hardcore Wins">
                                                    <Skull size={9} className="text-red-400" />
                                                    {entry.hardModeWins}
                                                </span>
                                            )}

                                            {/* Multiplayer matches */}
                                            {multiplayerMatchCount > 0 && (
                                                <span className="text-cyan-300 flex items-center gap-0.5 bg-cyan-955/60 px-1.5 py-0.5 rounded-lg border border-cyan-600/50 font-mono text-[8.5px]" title="Multiplayer Matches">
                                                    <Swords size={9} className="text-cyan-400" />
                                                    {multiplayerMatchCount}
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer / Pagination Controls */}
                <div className="mt-2.5 pt-2 border-t border-stone-850 flex items-center justify-between shrink-0 gap-2 flex-wrap sm:flex-nowrap">
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                setPage((p) => Math.max(1, p - 1));
                            }}
                            disabled={safePage <= 1}
                            className="px-3.5 py-2 min-h-[40px] bg-stone-900 hover:bg-stone-850 disabled:opacity-30 border border-stone-800 text-stone-300 hover:text-white rounded-lg text-[9.5px] font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed"
                            title="Previous 50 Operatives"
                        >
                            <ChevronLeft size={14} />
                            <span>PREV</span>
                        </button>

                        {/* Direct Page Jump Buttons */}
                        <div className="flex items-center gap-1">
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => (
                                <button
                                    key={pNum}
                                    onClick={() => {
                                        audioManager.playSound('click');
                                        setPage(pNum);
                                    }}
                                    className={`w-9 h-9 min-w-[36px] min-h-[36px] rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer flex items-center justify-center ${
                                        safePage === pNum
                                            ? 'bg-amber-500/25 border border-amber-500/70 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.25)]'
                                            : 'bg-stone-900/60 hover:bg-stone-850 border border-stone-800 text-stone-400 hover:text-stone-200'
                                    }`}
                                    title={`Page ${pNum}`}
                                >
                                    {pNum}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                setPage((p) => Math.min(totalPages, p + 1));
                            }}
                            disabled={safePage >= totalPages}
                            className="px-3.5 py-2 min-h-[40px] bg-stone-900 hover:bg-stone-850 disabled:opacity-30 border border-stone-800 text-stone-300 hover:text-white rounded-lg text-[9.5px] font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed"
                            title="Next 50 Operatives"
                        >
                            <span>NEXT</span>
                            <ChevronRight size={14} />
                        </button>

                        <span className="text-[8px] sm:text-[9.5px] text-stone-500 font-bold font-mono ml-2">
                            SHOWING {processedLeaderboard.length === 0 ? 0 : (safePage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(safePage * ITEMS_PER_PAGE, processedLeaderboard.length)} OF {processedLeaderboard.length} OPERATIVES (50 PER SCROLL)
                        </span>
                    </div>

                    <button
                        onClick={() => {
                            audioManager.playSound('click');
                            onClose();
                        }}
                        className="px-5 py-2.5 min-h-[40px] bg-stone-900 hover:bg-stone-850 border border-stone-800 text-stone-300 hover:text-white font-bold text-[10px] tracking-wider uppercase transition-all rounded-xl cursor-pointer shadow-sm flex items-center justify-center shrink-0"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
