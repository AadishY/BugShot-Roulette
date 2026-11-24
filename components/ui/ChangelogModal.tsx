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
            <div className="relative w-full max-w-3xl max-h-[94vh] sm:max-h-[90vh] bg-stone-950/95 border-2 border-stone-850 p-3.5 sm:p-6 md:p-8 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] font-mono flex flex-col overflow-hidden">
                {/* Top Animated Scan Line */}
                <div className="absolute top-0 left-0 w-full h-[2px] bg-red-650/40 animate-[scan-line-move_4s_linear_infinite]" />

                {/* Top Close Button (Expanded touch target 44px+) */}
                <button
                    onClick={() => {
                        audioManager.playSound('click');
                        onClose();
                    }}
                    className="absolute top-2.5 right-2.5 sm:top-5 sm:right-5 text-stone-300 hover:text-red-400 bg-stone-900/80 hover:bg-red-955/30 border border-stone-800 hover:border-red-500/45 rounded-xl z-50 cursor-pointer flex items-center justify-center shadow-lg hover:shadow-[0_0_15px_rgba(239,68,68,0.25)] transition-all w-11 h-11 min-w-[44px] min-h-[44px] p-2"
                    title="Close Console"
                    aria-label="Close Console"
                >
                    <X size={18} />
                </button>

                {/* Header */}
                <div className="text-stone-300 font-black border-b border-stone-900 pb-2.5 mb-3 sm:pb-3.5 sm:mb-3 flex items-center justify-between uppercase tracking-wider text-xs sm:text-base">
                    <span className="flex items-center gap-2">
                        <Terminal size={15} className="text-red-500 sm:w-[18px] sm:h-[18px]" />
                        <span>System Changelog</span>
                        <span className="text-red-400/90 text-[10px] sm:text-xs font-mono font-bold tracking-normal lowercase px-2 py-0.5 rounded bg-red-955/30 border border-red-900/50">
                            v{GAME_VERSION}
                        </span>
                    </span>
                    <span className="text-red-500/80 animate-pulse flex items-center gap-1.5 text-[10px] sm:text-xs bg-red-955/20 border border-red-900/35 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-lg mr-12 sm:mr-14">
                        <span className="w-1.5 h-1.5 bg-red-600 rounded-full" />
                        active
                    </span>
                </div>

                {/* Search Bar */}
                <div className="relative mb-3 shrink-0">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter system changelog (e.g. graphics, AI, mobile, firebase)..."
                        className="w-full bg-stone-900/70 border border-stone-800/80 focus:border-red-500/60 rounded-xl pl-9 pr-9 py-2 min-h-[44px] text-[10px] sm:text-xs text-stone-200 placeholder-stone-500 outline-none transition-colors font-mono"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
                            title="Clear search"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>

                {/* Scrollable Changelog Feed */}
                <div className="space-y-2.5 sm:space-y-3 text-left flex-1 min-h-0 overflow-y-auto pr-1.5 select-text scrollbar-thin text-[9px] sm:text-[10px] md:text-xs text-stone-400 custom-scrollbar">
                    {/* Pinned Multiplayer Notice */}
                    {!searchQuery && (
                        <div className="space-y-1.5 bg-cyan-950/20 border border-cyan-500/40 p-2.5 sm:p-3.5 rounded-lg shadow-[0_0_15px_rgba(6,182,212,0.15)] animate-[pulse_4s_ease-in-out_infinite]">
                            <div className="flex items-center gap-2 border-b border-cyan-900 pb-1.5">
                                <span className="px-2 py-0.5 bg-cyan-500 text-stone-950 text-[9px] font-black rounded uppercase tracking-widest select-none">
                                    PINNED
                                </span>
                                <span className="text-cyan-400 font-black text-[10px] sm:text-xs tracking-wider uppercase">
                                    MULTIPLAYER IS OUT!
                                </span>
                            </div>
                            <p className="leading-relaxed text-stone-300 text-[10px] sm:text-[11px]">
                                Lobby matches, FOR NOW ONLY 1v1, and real-time interactive game synchronization are fully live! Challenge opponents on mobile and desktop devices.
                            </p>
                        </div>
                    )}

                    {/* Releases List */}
                    {filteredReleases.length === 0 ? (
                        <div className="text-center py-8 text-stone-500 text-xs font-mono">
                            No log entries matching &quot;{searchQuery}&quot;
                        </div>
                    ) : (
                        filteredReleases.map((release) => {
                            const isLatest = release.highlight;
                            return (
                                <div
                                    key={release.version}
                                    className={`space-y-1.5 bg-stone-950 border p-2.5 sm:p-3.5 rounded-lg transition-all ${
                                        isLatest
                                            ? 'border-stone-800 border-l-4 border-l-red-500 bg-red-955/10 shadow-[0_0_20px_rgba(239,68,68,0.08)]'
                                            : 'border-stone-900/60 opacity-90 hover:opacity-100'
                                    }`}
                                >
                                    <div className="border-b border-stone-900 pb-1.5 flex items-center justify-between flex-wrap gap-1">
                                        <span className="text-stone-200 font-black text-[10px] sm:text-[11px] md:text-xs tracking-wider flex items-center gap-1.5">
                                            {isLatest && <Sparkles size={12} className="text-red-400 animate-pulse shrink-0" />}
                                            [{release.date} - {release.title} (v{release.version})]
                                        </span>
                                        {isLatest && (
                                            <span className="px-1.5 py-0.5 bg-red-955/80 text-red-300 border border-red-600/60 rounded text-[7px] sm:text-[8px] font-black uppercase tracking-widest animate-pulse">
                                                LATEST
                                            </span>
                                        )}
                                    </div>
                                    <ul className="list-none space-y-1.5 pl-0.5 pt-1">
                                        {release.items.map((item, itemIdx) => (
                                            <li key={itemIdx} className="flex items-start gap-2.5">
                                                <span
                                                    className={`px-1.5 py-0.5 border text-[7px] sm:text-[8px] font-black rounded-md uppercase tracking-widest shrink-0 select-none ${getTagBadgeStyle(
                                                        item.tag
                                                    )}`}
                                                >
                                                    {item.tag}
                                                </span>
                                                <span className="leading-relaxed text-stone-300">
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
                        <div className="space-y-1.5 bg-stone-950 border border-stone-900/60 p-2.5 sm:p-3.5 rounded-lg opacity-75 hover:opacity-100 transition-opacity">
                            <span className="text-stone-400 font-black block border-b border-stone-900 pb-1 text-[9px] sm:text-[10px] tracking-wider">
                                [Pre-Alpha Origin Releases]
                            </span>
                            <ul className="list-none space-y-1.5 pl-0.5">
                                <li className="flex items-start gap-2.5">
                                    <span className="px-1.5 py-0.5 bg-cyan-950/50 border border-cyan-800/40 text-cyan-400 text-[7px] sm:text-[8px] font-black rounded-md uppercase tracking-widest shrink-0 select-none">
                                        ORIGIN
                                    </span>
                                    <span className="leading-relaxed">
                                        Implemented device-aware graphics profiles, 12-gauge turn engine, and browser 3D canvas pipeline.
                                    </span>
                                </li>
                                <li className="flex items-start gap-2.5">
                                    <span className="px-1.5 py-0.5 bg-stone-900 border border-stone-700 text-stone-300 text-[7px] sm:text-[8px] font-black rounded-md uppercase tracking-widest shrink-0 select-none">
                                        SYSTEM
                                    </span>
                                    <span className="leading-relaxed">
                                        Added duplicate item reroll penalties and initial positional sound effects.
                                    </span>
                                </li>
                            </ul>
                        </div>
                    )}
                </div>

                {/* Bottom Close Button (Expanded touch target 40px+) */}
                <button
                    onClick={() => {
                        audioManager.playSound('click');
                        onClose();
                    }}
                    className="mt-3 sm:mt-5 w-full min-h-[44px] py-2.5 sm:py-3.5 bg-stone-900 border border-stone-800 hover:border-red-500/50 hover:text-white text-stone-400 font-bold text-[10px] sm:text-xs tracking-[0.4em] uppercase transition-all rounded-xl cursor-pointer active:scale-98 shadow-md flex items-center justify-center"
                >
                    Close Console
                </button>
            </div>
        </div>
    );
};
