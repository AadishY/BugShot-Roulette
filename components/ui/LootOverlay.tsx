import React, { useEffect, useState } from 'react';
import { ItemType } from '../../types';
import { Icons } from './Icons';

interface LootOverlayProps {
    receivedItems: ItemType[];
    opponentReceivedItems?: ItemType[];
    isLocalSplit?: boolean;
    player1Name?: string;
    player2Name?: string;
}

const ITEM_NAMES: Record<ItemType, string> = {
    'BEER': 'BEER',
    'CIGS': 'CIGARETTES',
    'GLASS': 'MAGNIFIER',
    'CUFFS': 'HANDCUFFS',
    'SAW': 'HAND SAW',
    'PHONE': 'BURNER PHONE',
    'INVERTER': 'INVERTER',
    'ADRENALINE': 'ADRENALINE',
    'CHOKE': 'CHOKE MOD',
    'REMOTE': 'REMOTE',
    'BIG_INVERTER': 'BIG INVERTER',
    'CONTRACT': 'BLOOD CONTRACT',
    'LUCKYCHARM': 'LUCKY CHARM',
    'FLASHBANG': 'FLASHBANG',
    'CRUSHER': 'CRUSHER',
    'TOTEM': 'TOTEM OF UNDYING',
    'MIRROR': 'MIRROR',
    'DECK_CARD': 'TAROT CARD DECK',
    'JACKPOT': 'JACKPOT SLOT'
};

const ITEM_COLORS: Record<ItemType, string> = {
    'BEER': 'text-amber-500 border-amber-500/50 bg-amber-950/30',
    'CIGS': 'text-red-500 border-red-500/50 bg-red-950/30',
    'GLASS': 'text-cyan-500 border-cyan-500/50 bg-cyan-950/30',
    'CUFFS': 'text-stone-400 border-stone-400/50 bg-stone-900/50',
    'SAW': 'text-orange-600 border-orange-600/50 bg-orange-950/30',
    'PHONE': 'text-blue-300 border-blue-300/50 bg-blue-950/30',
    'INVERTER': 'text-green-400 border-green-500/50 bg-green-950/30',
    'ADRENALINE': 'text-pink-500 border-pink-500/50 bg-pink-950/30',
    'CHOKE': 'text-yellow-700 border-yellow-700/50 bg-yellow-950/30',
    'REMOTE': 'text-red-600 border-red-600/50 bg-red-950/30',
    'BIG_INVERTER': 'text-orange-500 border-orange-500/50 bg-orange-950/30',
    'CONTRACT': 'text-red-700 border-red-700/50 bg-red-950/30',
    'LUCKYCHARM': 'text-emerald-500 border-emerald-500/50 bg-emerald-950/30',
    'FLASHBANG': 'text-zinc-300 border-zinc-300/50 bg-zinc-900/30',
    'CRUSHER': 'text-amber-600 border-amber-500/55 bg-amber-950/35',
    'TOTEM': 'text-amber-400 border-amber-400/50 bg-amber-950/30',
    'MIRROR': 'text-indigo-400 border-indigo-400/50 bg-indigo-950/30',
    'DECK_CARD': 'text-purple-400 border-purple-400/50 bg-purple-950/30',
    'JACKPOT': 'text-yellow-500 border-yellow-500/50 bg-yellow-950/30'
};

const renderItemIcon = (item: ItemType, className: string) => {
    switch (item) {
        case 'BEER': return <Icons.Beer className={className} />;
        case 'CIGS': return <Icons.Cigs className={className} />;
        case 'GLASS': return <Icons.Glass className={className} />;
        case 'CUFFS': return <Icons.Cuffs className={className} />;
        case 'SAW': return <Icons.Saw className={className} />;
        case 'PHONE': return <Icons.Phone className={className} />;
        case 'INVERTER': return <Icons.Inverter className={className} />;
        case 'ADRENALINE': return <Icons.Adrenaline className={className} />;
        case 'CHOKE': return <Icons.Choke className={className} />;
        case 'REMOTE': return <Icons.Remote className={className} />;
        case 'BIG_INVERTER': return <Icons.BigInverter className={className} />;
        case 'CONTRACT': return <Icons.Contract className={className} />;
        case 'LUCKYCHARM': return <Icons.Luckycharm className={className} />;
        case 'FLASHBANG': return <Icons.Flashbang className={className} />;
        case 'CRUSHER': return <Icons.Crusher className={className} />;
        case 'TOTEM': return <Icons.Totem className={className} />;
        case 'MIRROR': return <Icons.Mirror className={className} />;
        case 'DECK_CARD': return <Icons.DeckCard className={className} />;
        case 'JACKPOT': return <Icons.Jackpot className={className} />;
        default: return <Icons.Glass className={className} />;
    }
};

export const LootOverlay: React.FC<LootOverlayProps> = ({
    receivedItems,
    opponentReceivedItems = [],
    isLocalSplit = false,
    player1Name = 'PLAYER 1',
    player2Name = 'PLAYER 2'
}) => {
    const showDualSplit = isLocalSplit && opponentReceivedItems.length > 0;
    const maxBatch = Math.max(receivedItems.length, showDualSplit ? opponentReceivedItems.length : 0);
    const [visibleCount, setVisibleCount] = useState(0);

    useEffect(() => {
        setVisibleCount(0);
        const stepMs = showDualSplit ? 220 : 300;
        const interval = setInterval(() => {
            setVisibleCount(prev => {
                if (prev < maxBatch) return prev + 1;
                clearInterval(interval);
                return prev;
            });
        }, stepMs);
        return () => clearInterval(interval);
    }, [receivedItems, opponentReceivedItems, maxBatch, showDualSplit]);

    const renderDualPlayerColumn = (
        title: string,
        items: ItemType[],
        accentBorder: string,
        accentTitle: string,
        seatTag: string
    ) => (
        <div className={`flex-1 min-w-0 bg-stone-950/85 border ${accentBorder} rounded-2xl p-3 sm:p-4 flex flex-col`}>
            <div className="flex items-center justify-between gap-2 pb-2 mb-3 border-b border-stone-800/80">
                <span className={`text-xs sm:text-base font-black uppercase tracking-[0.18em] truncate ${accentTitle}`}>
                    {title}
                </span>
                <span className="text-[10px] font-mono font-bold text-stone-400 uppercase tracking-wider shrink-0 tabular-nums">
                    {seatTag} · {items.length} ITEMS
                </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-2 sm:gap-2.5 flex-1 content-start">
                {items.map((item, i) => {
                    const isVisible = i < visibleCount;
                    const colorToken = ITEM_COLORS[item].split(' ')[0];
                    return (
                        <div
                            key={`${seatTag}-${item}-${i}`}
                            className={`transition-all duration-500 transform ${
                                isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-90'
                            }`}
                        >
                            <div className="relative flex flex-col items-center justify-center p-2 sm:p-3 rounded-xl border border-white/10 bg-gradient-to-b from-stone-900/75 to-black/90 aspect-square">
                                <div className={`p-2 sm:p-2.5 rounded-xl bg-black/50 border border-white/5 mb-1.5 ${colorToken}`}>
                                    {renderItemIcon(item, 'w-6 h-6 sm:w-8 sm:h-8')}
                                </div>
                                <span className={`text-[8px] sm:text-[9.5px] font-black tracking-[0.12em] uppercase text-center leading-tight line-clamp-2 w-full ${colorToken}`}>
                                    {ITEM_NAMES[item]}
                                </span>
                                <span className="absolute top-1.5 left-2 text-[7px] font-mono font-black text-white/20">
                                    {`0${i + 1}`}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );

    return (
        <div
            className="absolute inset-0 max-h-[100dvh] z-50 flex flex-col items-center justify-start bg-black/94 md:bg-black/88 md:backdrop-blur-2xl p-3 sm:p-5 animate-in fade-in duration-500 overflow-y-auto overscroll-contain touch-manipulation custom-scrollbar"
            style={{
                paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
                paddingLeft: 'max(env(safe-area-inset-left, 0px), 12px)',
                paddingRight: 'max(env(safe-area-inset-right, 0px), 12px)'
            }}
        >
            <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
                <div className="absolute inset-0 bg-[linear-gradient(transparent_0%,rgba(255,255,255,0.05)_50%,transparent_100%)] bg-[length:100%_4px]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(50,50,50,0.45)_0%,transparent_100%)]" />
            </div>

            <div className="relative z-10 w-full max-w-6xl flex flex-col items-center my-auto min-w-0">
                {/* Header Section */}
                <div className={`${showDualSplit ? 'mb-3 sm:mb-5' : 'mb-3 sm:mb-8'} w-full text-center animate-in slide-in-from-top-6 duration-500`}>
                    <div className="flex items-center gap-2 sm:gap-4 mb-1 justify-center">
                        <div className="h-[1px] w-6 sm:w-20 lg:w-36 bg-gradient-to-r from-transparent to-red-600 shrink-0" />
                        <span className="text-red-400 font-black tracking-[0.16em] sm:tracking-[0.4em] text-[9px] sm:text-xs uppercase truncate">
                            {showDualSplit ? 'Dual Split Shipment Delivered' : 'Incoming Shipment Verified'}
                        </span>
                        <div className="h-[1px] w-6 sm:w-20 lg:w-36 bg-gradient-to-l from-transparent to-red-600 shrink-0" />
                    </div>
                    <h2 className={`${showDualSplit ? 'text-xl sm:text-4xl lg:text-5xl' : 'text-2xl sm:text-5xl lg:text-7xl'} font-black italic tracking-tighter text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.25)]`}>
                        RESOURCE <span className="text-stone-400">PACK</span>
                    </h2>
                </div>

                {showDualSplit ? (
                    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-5 items-stretch">
                        {renderDualPlayerColumn(
                            player1Name,
                            receivedItems,
                            'border-emerald-500/45',
                            'text-emerald-300',
                            'P1'
                        )}
                        {renderDualPlayerColumn(
                            player2Name,
                            opponentReceivedItems,
                            'border-amber-500/45',
                            'text-amber-300',
                            'P2'
                        )}
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-2.5 sm:gap-6 lg:gap-10 justify-center items-center w-full">
                        {receivedItems.map((item, i) => {
                            const isVisible = i < visibleCount;
                            const colorToken = ITEM_COLORS[item].split(' ')[0];
                            return (
                                <div
                                    key={`${item}-${i}`}
                                    className={`flex flex-col items-center justify-center transition-all duration-700 transform ${
                                        isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-10 scale-75 rotate-3'
                                    }`}
                                    style={{ transitionDelay: `${i * 120}ms` }}
                                >
                                    <div className="relative group w-20 sm:w-28 lg:w-44 aspect-square sm:aspect-[4/5] shrink-0 flex flex-col items-center justify-center p-2 sm:p-3 border border-white/10 rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden bg-gradient-to-b from-stone-900/90 to-black/95 md:from-stone-900/60 md:to-black/80 md:backdrop-blur-xl">
                                        <div className={`absolute inset-0 opacity-10 md:blur-2xl group-hover:opacity-30 transition-opacity bg-current ${colorToken}`} />
                                        <div className={`relative z-10 p-2.5 sm:p-5 rounded-2xl sm:rounded-3xl bg-black/40 border border-white/5 mb-1.5 sm:mb-3 group-hover:scale-110 transition-all duration-500 ${colorToken}`}>
                                            {renderItemIcon(item, 'w-7 h-7 sm:w-11 sm:h-11 lg:w-14 lg:h-14')}
                                        </div>
                                        <div className="relative z-10 text-center px-1.5 sm:px-3 w-full">
                                            <span className={`text-[7.5px] sm:text-[9px] lg:text-xs font-black tracking-[0.15em] sm:tracking-[0.25em] uppercase block truncate ${colorToken}`}>
                                                {ITEM_NAMES[item]}
                                            </span>
                                        </div>
                                        <div className="absolute top-2 left-2.5 sm:top-4 sm:left-4 text-[7px] sm:text-[8px] font-black text-white/15 tracking-widest">
                                            {`0${i + 1}`}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className={`${showDualSplit ? 'mt-4 sm:mt-6' : 'mt-5 sm:mt-12'} flex flex-col items-center gap-2`}>
                    <span className="text-stone-500 font-bold tracking-[0.35em] text-[8px] sm:text-[9px] uppercase text-center">
                        {showDualSplit ? 'Both Inventories Updated' : 'Shipment Synchronized'}
                    </span>
                    <div className="h-[2px] w-36 sm:w-48 bg-gradient-to-r from-transparent via-stone-800 to-transparent" />
                </div>
            </div>
        </div>
    );
};
