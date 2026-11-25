import React, { useState, useMemo, useEffect } from 'react';
import { X, Terminal, Search, Sparkles } from 'lucide-react';
import { audioManager } from '../../utils/audioManager';
import { CHANGELOG, GAME_VERSION, ChangelogTag } from '../../constants';

interface ChangelogModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const getTagBadgeStyle = (tag: ChangelogTag): string => {
    switch (tag) {
        case 'NEW':
            return 'bg-red-955/60 border-red-700/60 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.2)]';
        case 'ADDED':
            return 'bg-cyan-950/60 border-cyan-700/60 text-cyan-400';
        case 'IMPROVED':
            return 'bg-emerald-950/60 border-emerald-700/60 text-emerald-400';
        case 'UPDATED':
            return 'bg-amber-955/60 border-amber-700/60 text-amber-400';
        case 'FIXED':
            return 'bg-rose-955/60 border-rose-700/60 text-rose-400';
        case 'OPTIMIZED':
            return 'bg-blue-950/60 border-blue-700/60 text-blue-400';
        case 'SECURITY':
            return 'bg-purple-950/60 border-purple-700/60 text-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.2)]';
        case 'SYSTEM':
        default:
            return 'bg-stone-900 border-stone-750 text-stone-300';
    }
};

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ isOpen, onClose }) => {
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                audioManager.playSound('click');
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const filteredReleases = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return CHANGELOG;

        return CHANGELOG.map((release) => {
            const matchesReleaseMeta =
                release.title.toLowerCase().includes(query) ||
                release.version.toLowerCase().includes(query) ||
                release.date.toLowerCase().includes(query);

            if (matchesReleaseMeta) return release;

            const matchingItems = release.items.filter(
                (item) =>
                    item.description.toLowerCase().includes(query) ||
                    item.title?.toLowerCase().includes(query) ||
                    item.tag.toLowerCase().includes(query)
            );

            if (matchingItems.length > 0) {
                return {
                    ...release,
                    items: matchingItems,
                };
            }

            return null;
        }).filter(Boolean) as typeof CHANGELOG;
    }, [searchQuery]);

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-300"
            role="dialog"
            aria-modal="true"
            aria-label="System Changelog"
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
            <div className="relative w-full max-w-3xl max-h-[95dvh] sm:max-h-[90dvh] bg-stone-950/95 border-2 border-stone-850 p-2 sm:p-5 md:p-6 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] font-mono flex flex-col overflow-hidden [@media(max-height:540px)]:p-2">
                {/* Top Animated Scan Line */}
                <div className="absolute top-0 left-0 w-full h-[2px] bg-red-650/40 animate-[scan-line-move_4s_linear_infinite]" />

                {/* Top Close Button */}
                <button
                    onClick={() => {
                        audioManager.playSound('click');
                        onClose();
                    }}
                    className="small-btn absolute top-1.5 right-1.5 sm:top-3.5 sm:right-3.5 [@media(max-height:540px)]:top-1.5 [@media(max-height:540px)]:right-1.5 text-stone-300 hover:text-red-400 bg-stone-900/80 hover:bg-red-955/30 border border-stone-800 hover:border-red-500/45 rounded-lg z-50 cursor-pointer flex items-center justify-center shadow-lg hover:shadow-[0_0_15px_rgba(239,68,68,0.25)] transition-all w-7 h-7 sm:w-9 sm:h-9 [@media(max-height:540px)]:w-7 [@media(max-height:540px)]:h-7 p-1"
                    title="Close Console"
                    aria-label="Close Console"
                >
                    <X size={14} />
                </button>

                {/* Header */}
                <div className="text-stone-300 font-black border-b border-stone-900 pb-1.5 mb-1.5 sm:pb-2.5 sm:mb-2.5 pr-9 sm:pr-12 [@media(max-height:540px)]:pr-9 [@media(max-height:540px)]:pb-1 [@media(max-height:540px)]:mb-1.5 flex items-center justify-between uppercase tracking-wider text-[10px] sm:text-sm md:text-base shrink-0">
                    <span className="flex items-center gap-1.5 sm:gap-2">
                        <Terminal size={12} className="text-red-500 sm:w-[16px] sm:h-[16px]" />
                        <span>System Changelog</span>
                        <span className="text-red-400/90 text-[8.5px] sm:text-xs font-mono font-bold tracking-normal lowercase px-1.5 py-0.2 rounded bg-red-955/30 border border-red-900/50">
                            v{GAME_VERSION}
                        </span>
                    </span>
                    <span className="text-red-500/80 animate-pulse flex items-center gap-1 text-[8px] sm:text-[10px] bg-red-955/20 border border-red-900/35 px-1.5 py-0.5 sm:px-2.5 rounded-md">
                        <span className="w-1.5 h-1.5 bg-red-600 rounded-full" />
                        active
                    </span>
                </div>

                {/* Search Bar */}
                <div className="relative mb-1.5 sm:mb-2.5 shrink-0 [@media(max-height:540px)]:mb-1.5">
                    <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-500" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter changelog..."
                        className="w-full bg-stone-900/70 border border-stone-800/80 focus:border-red-500/60 rounded-lg pl-7 pr-7 py-1 sm:py-1.5 min-h-[28px] sm:min-h-[36px] [@media(max-height:540px)]:min-h-[28px] [@media(max-height:540px)]:py-0.5 !text-[10px] sm:!text-xs text-stone-200 placeholder-stone-500 outline-none transition-colors font-mono"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="small-btn absolute right-1 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 w-6 h-6 flex items-center justify-center cursor-pointer"
                            title="Clear search"
                        >
                            <X size={10} />
                        </button>
                    )}
                </div>

                {/* Scrollable Changelog Feed */}
                <div className="space-y-1.5 sm:space-y-2 text-left flex-1 min-h-0 overflow-y-auto pr-1 select-text scrollbar-thin text-[8px] sm:text-[10px] md:text-xs text-stone-400 custom-scrollbar">
                    {/* Pinned Multiplayer Notice */}
                    {!searchQuery && (
                        <div className="space-y-0.5 bg-cyan-950/20 border border-cyan-500/40 p-1.5 sm:p-2.5 rounded-lg shadow-[0_0_15px_rgba(6,182,212,0.15)] animate-[pulse_4s_ease-in-out_infinite]">
                            <div className="flex items-center gap-1.5 border-b border-cyan-900 pb-0.5">
                                <span className="px-1 py-0.2 bg-cyan-500 text-stone-950 text-[7px] sm:text-[8.5px] font-black rounded uppercase tracking-widest select-none">
                                    PINNED
                                </span>
                                <span className="text-cyan-400 font-black text-[8.5px] sm:text-[11px] tracking-wider uppercase">
                                    ONLINE &amp; SPLIT MULTIPLAYER LIVE!
                                </span>
                            </div>
                            <p className="leading-snug text-stone-300 text-[8px] sm:text-[10.5px]">
                                Challenge friends online in real-time lobbies or duel head-to-head on a single device with Local Split Multiplayer, custom sliders, and smooth eased camera swaps.
                            </p>
                        </div>
                    )}

                    {/* Releases List */}
                    {filteredReleases.length === 0 ? (
                        <div className="text-center py-6 text-stone-500 text-[10px] sm:text-xs font-mono">
                            No log entries matching &quot;{searchQuery}&quot;
                        </div>
                    ) : (
                        filteredReleases.map((release) => {
                            const isLatest = release.highlight;
                            return (
                                <div
                                    key={release.version}
                                    className={`space-y-0.5 sm:space-y-1 bg-stone-950 border p-1.5 sm:p-2.5 rounded-lg transition-all ${
                                        isLatest
                                            ? 'border-stone-800 border-l-4 border-l-red-500 bg-red-955/10 shadow-[0_0_20px_rgba(239,68,68,0.08)]'
                                            : 'border-stone-900/60 opacity-90 hover:opacity-100'
                                    }`}
                                >
                                    <div className="border-b border-stone-900 pb-0.5 sm:pb-1 flex items-center justify-between flex-wrap gap-1">
                                        <span className="text-stone-200 font-black text-[8.5px] sm:text-[10.5px] md:text-xs tracking-wider flex items-center gap-1">
                                            {isLatest && <Sparkles size={9} className="text-red-400 animate-pulse shrink-0 sm:w-3 sm:h-3" />}
                                            [{release.date} - {release.title} (v{release.version})]
                                        </span>
                                        {isLatest && (
                                            <span className="px-1 py-0.2 bg-red-955/80 text-red-300 border border-red-600/60 rounded text-[6px] sm:text-[7.5px] font-black uppercase tracking-widest animate-pulse">
                                                LATEST
                                            </span>
                                        )}
                                    </div>
                                    <ul className="list-none space-y-0.5 sm:space-y-1 pl-0.5 pt-0.5">
                                        {release.items.map((item, itemIdx) => (
                                            <li key={itemIdx} className="flex items-start gap-1.5 sm:gap-2">
                                                <span
                                                    className={`px-1 py-0.2 border text-[6px] sm:text-[7.5px] font-black rounded uppercase tracking-wider shrink-0 select-none mt-0.5 ${getTagBadgeStyle(
                                                        item.tag
                                                    )}`}
                                                >
                                                    {item.tag}
                                                </span>
                                                <span className="leading-snug text-stone-300 text-[8px] sm:text-[10.5px]">
                                                    {item.title && (
                                                        <strong className="text-stone-100 font-bold mr-1">
                                                            {item.title}:
                                                        </strong>
                                                    )}
                                                    {item.description}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            );
                        })
                    )}

                    {/* Pre-alpha archival note when not searching */}
                    {!searchQuery && (
                        <div className="space-y-0.5 bg-stone-950 border border-stone-900/60 p-1.5 sm:p-2.5 rounded-lg opacity-75 hover:opacity-100 transition-opacity">
                            <span className="text-stone-400 font-black block border-b border-stone-900 pb-0.5 text-[8px] sm:text-[10px] tracking-wider">
                                [Pre-Alpha Origin Releases]
                            </span>
                            <ul className="list-none space-y-0.5 pl-0.5">
                                <li className="flex items-start gap-1.5 sm:gap-2">
                                    <span className="px-1 py-0.2 bg-cyan-950/50 border border-cyan-800/40 text-cyan-400 text-[6px] sm:text-[7.5px] font-black rounded uppercase tracking-wider shrink-0 select-none mt-0.5">
                                        ORIGIN
                                    </span>
                                    <span className="leading-snug text-[8px] sm:text-[10.5px]">
                                        Implemented device-aware graphics profiles, 12-gauge turn engine, and browser 3D canvas pipeline.
                                    </span>
                                </li>
                                <li className="flex items-start gap-1.5 sm:gap-2">
                                    <span className="px-1 py-0.2 bg-stone-900 border border-stone-700 text-stone-300 text-[6px] sm:text-[7.5px] font-black rounded uppercase tracking-wider shrink-0 select-none mt-0.5">
                                        SYSTEM
                                    </span>
                                    <span className="leading-snug text-[8px] sm:text-[10.5px]">
                                        Added duplicate item reroll penalties and initial positional sound effects.
                                    </span>
                                </li>
                            </ul>
                        </div>
                    )}
                </div>

                {/* Bottom Close Button */}
                <button
                    onClick={() => {
                        audioManager.playSound('click');
                        onClose();
                    }}
                    className="small-btn mt-1.5 sm:mt-3 w-full min-h-[30px] sm:min-h-[40px] [@media(max-height:540px)]:min-h-[28px] [@media(max-height:540px)]:py-1 py-1.5 sm:py-2.5 bg-stone-900 border border-stone-800 hover:border-red-500/50 hover:text-white text-stone-400 font-bold text-[8.5px] sm:text-xs tracking-[0.25em] sm:tracking-[0.4em] uppercase transition-all rounded-lg sm:rounded-xl cursor-pointer active:scale-98 shadow-md flex items-center justify-center shrink-0"
                >
                    Close Console
                </button>
            </div>
        </div>
    );
};
