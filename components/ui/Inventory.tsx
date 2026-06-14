import React from 'react';
import { ItemType, GameState, CameraView, PlayerState } from '../../types';
import { Icons } from './Icons';
import { ITEM_DESCRIPTIONS } from '../../constants';
import { audioManager } from '../../utils/audioManager';

interface InventoryProps {
    player: PlayerState;
    dealer: PlayerState;
    gameState: GameState;
    cameraView: CameraView;
    isProcessing: boolean;
    onUseItem: (index: number) => void;
    disabled?: boolean; // For multiplayer when not your turn
    isGunHeld?: boolean;
}

const InventoryComponent: React.FC<InventoryProps> = ({ player, dealer, gameState, cameraView, isProcessing, onUseItem, disabled = false, isGunHeld = false }) => {
    const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);

    const GLOW_COLORS: Record<ItemType, string> = {
        'BEER': 'rgba(245, 158, 11, 0.35)',
        'CIGS': 'rgba(239, 68, 68, 0.35)',
        'GLASS': 'rgba(6, 182, 212, 0.35)',
        'CUFFS': 'rgba(163, 163, 163, 0.25)',
        'SAW': 'rgba(234, 88, 12, 0.35)',
        'PHONE': 'rgba(147, 197, 253, 0.35)',
        'INVERTER': 'rgba(74, 222, 128, 0.35)',
        'ADRENALINE': 'rgba(236, 72, 153, 0.35)',
        'CHOKE': 'rgba(212, 163, 115, 0.25)',
        'REMOTE': 'rgba(239, 68, 68, 0.35)',
        'BIG_INVERTER': 'rgba(249, 115, 22, 0.35)',
        'CONTRACT': 'rgba(185, 28, 28, 0.35)'
    };

    const BORDER_COLORS: Record<ItemType, string> = {
        'BEER': 'border-amber-500/20 hover:border-amber-500/50',
        'CIGS': 'border-red-500/20 hover:border-red-500/50',
        'GLASS': 'border-cyan-500/20 hover:border-cyan-500/50',
        'CUFFS': 'border-stone-500/20 hover:border-stone-500/50',
        'SAW': 'border-orange-600/20 hover:border-orange-600/50',
        'PHONE': 'border-blue-400/20 hover:border-blue-400/50',
        'INVERTER': 'border-green-500/20 hover:border-green-500/50',
        'ADRENALINE': 'border-pink-500/20 hover:border-pink-500/50',
        'CHOKE': 'border-stone-400/20 hover:border-stone-400/50',
        'REMOTE': 'border-red-500/20 hover:border-red-500/50',
        'BIG_INVERTER': 'border-orange-500/20 hover:border-orange-500/50',
        'CONTRACT': 'border-red-700/20 hover:border-red-700/50'
    };

    const ITEM_NAMES: Record<ItemType, string> = {
        'BEER': 'BEER',
        'CIGS': 'CIGARETTE',
        'GLASS': 'MAGNIFYING GLASS',
        'CUFFS': 'HANDCUFFS',
        'SAW': 'HAND SAW',
        'PHONE': 'BURNER PHONE',
        'INVERTER': 'POLARITY INVERTER',
        'ADRENALINE': 'ADRENALINE',
        'CHOKE': 'SHOTGUN CHOKE',
        'REMOTE': 'REMOTE CONTROL',
        'BIG_INVERTER': 'BIG INVERTER',
        'CONTRACT': 'BLOOD CONTRACT'
    };

    const ITEM_LABELS: Record<ItemType, string> = {
        'BEER': 'BEER',
        'CIGS': 'CIGS',
        'GLASS': 'GLASS',
        'CUFFS': 'CUFFS',
        'SAW': 'SAW',
        'PHONE': 'PHONE',
        'INVERTER': 'INVERT',
        'ADRENALINE': 'ADRENALINE',
        'CHOKE': 'CHOKE',
        'REMOTE': 'REMOTE',
        'BIG_INVERTER': 'BIG INV',
        'CONTRACT': 'CONTRACT'
    };

    return (
        <div className="flex-1 flex justify-center gap-1 pointer-events-auto h-full items-end">
            <div className="flex gap-1 md:gap-3 p-2 md:p-4 bg-gradient-to-t from-black/95 to-black/70 border-t border-l border-r border-white/10 backdrop-blur-3xl min-h-[40px] md:min-h-[140px] items-end overflow-x-auto md:overflow-visible max-w-full [&::-webkit-scrollbar]:hidden [scrollbar-width:none] rounded-t-[2rem] shadow-[0_-20px_80px_rgba(0,0,0,0.8)]">
                {player.items.map((item, idx) => {
                    const isCuffDisabled = item === 'CUFFS' && dealer.isHandcuffed;
                    const isUsageDisabled = disabled || gameState.phase !== 'PLAYER_TURN' || isGunHeld || isCuffDisabled || isProcessing;
                    const isHovered = hoveredIdx === idx && !isUsageDisabled;
                    const glowColor = GLOW_COLORS[item];
                    const activeStyle = isHovered ? {
                        boxShadow: `0 0 25px 3px ${glowColor}`,
                        transform: 'translateY(-16px) scale(1.04) rotate(1.5deg)',
                    } : {};

                    return (
                        <div
                            key={idx}
                            className="group relative shrink-0"
                            onMouseEnter={() => {
                                setHoveredIdx(idx);
                                if (!isUsageDisabled) audioManager.playSound('click');
                            }}
                            onMouseLeave={() => setHoveredIdx(null)}
                        >
                            <button
                                onClick={() => onUseItem(idx)}
                                disabled={isUsageDisabled}
                                style={activeStyle}
                                className={`w-14 h-18 md:w-24 md:h-32 bg-zinc-950/60 border-2 ${isCuffDisabled ? 'border-red-900/50 bg-red-950/10' : BORDER_COLORS[item]} flex flex-col items-center justify-center hover:bg-stone-900/40 disabled:opacity-20 disabled:cursor-not-allowed transition-all duration-300 relative overflow-hidden rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)]`}
                            >
                                {/* Glass reflection sheen */}
                                <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                                {/* Scanline Effect */}
                                <div className="absolute inset-0 bg-[linear-gradient(transparent_0%,rgba(255,255,255,0.01)_50%,transparent_100%)] bg-[length:100%_3px] pointer-events-none" />

                                {item === 'BEER' && <Icons.Beer className="text-amber-500 mb-0 md:mb-2 w-4 h-4 md:w-6 md:h-6 transition-transform group-hover:scale-110 duration-300" />}
                                {item === 'CIGS' && <Icons.Cigs className="text-red-500 mb-0 md:mb-2 w-4 h-4 md:w-6 md:h-6 transition-transform group-hover:scale-110 duration-300" />}
                                {item === 'GLASS' && <Icons.Glass className="text-cyan-500 mb-0 md:mb-2 w-4 h-4 md:w-6 md:h-6 transition-transform group-hover:scale-110 duration-300" />}
                                {item === 'CUFFS' && <Icons.Cuffs className="text-stone-400 mb-0 md:mb-2 w-4 h-4 md:w-6 md:h-6 transition-transform group-hover:scale-110 duration-300" />}
                                {item === 'SAW' && <Icons.Saw className="text-orange-600 mb-0 md:mb-2 w-4 h-4 md:w-6 md:h-6 transition-transform group-hover:scale-110 duration-300" />}
                                {item === 'PHONE' && <Icons.Phone className="text-blue-200 mb-0 md:mb-2 w-4 h-4 md:w-6 md:h-6 transition-transform group-hover:scale-110 duration-300" />}
                                {item === 'INVERTER' && <Icons.Inverter className="text-green-400 mb-0 md:mb-2 w-4 h-4 md:w-6 md:h-6 transition-transform group-hover:scale-110 duration-300" />}
                                {item === 'ADRENALINE' && <Icons.Adrenaline className="text-pink-600 mb-0 md:mb-2 w-4 h-4 md:w-6 md:h-6 transition-transform group-hover:scale-110 duration-300" />}
                                {item === 'CHOKE' && <Icons.Choke className="text-stone-300 mb-0 md:mb-2 w-4 h-4 md:w-6 md:h-6 transition-transform group-hover:scale-110 duration-300" />}
                                {item === 'REMOTE' && <Icons.Remote className="text-red-500 mb-0 md:mb-2 w-4 h-4 md:w-6 md:h-6 transition-transform group-hover:scale-110 duration-300" />}
                                {item === 'BIG_INVERTER' && <Icons.BigInverter className="text-orange-500 mb-0 md:mb-2 w-4 h-4 md:w-6 md:h-6 transition-transform group-hover:scale-110 duration-300" />}
                                {item === 'CONTRACT' && <Icons.Contract className="text-red-700 mb-0 md:mb-2 w-4 h-4 md:w-6 md:h-6 transition-transform group-hover:scale-110 duration-300" />}

                                <span className="text-[6px] md:text-[8px] text-stone-400 font-black tracking-widest block text-center px-1 truncate w-full relative z-10 transition-colors group-hover:text-white animate-pulse">
                                    {ITEM_LABELS[item]}
                                </span>

                                {isCuffDisabled && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-red-600 font-bold text-lg pointer-events-none z-20">
                                        🚫
                                    </div>
                                )}
                            </button>

                            {/* Tooltip */}
                            <div className="absolute bottom-[115%] left-1/2 -translate-x-1/2 w-48 bg-stone-950/98 border border-stone-800 rounded-lg p-2.5 text-[10px] text-center hidden md:group-hover:block pointer-events-none z-[100] text-stone-300 shadow-[0_15px_30px_rgba(0,0,0,0.9)] animate-in fade-in zoom-in-95 duration-150">
                                <div className="font-black text-white mb-1.5 tracking-widest text-[11px] uppercase border-b border-white/5 pb-1">
                                    {ITEM_NAMES[item]}
                                </div>
                                <div className="text-stone-400 leading-relaxed">
                                    {ITEM_DESCRIPTIONS[item]}
                                </div>
                                {isCuffDisabled && <div className="text-red-500 mt-1.5 font-bold border-t border-red-950/50 pt-1 tracking-wider uppercase text-[8px]">ALREADY CUFFED</div>}
                                {isGunHeld && <div className="text-red-500 mt-1.5 tracking-wider uppercase text-[8px]">DROP GUN FIRST</div>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const Inventory = React.memo(InventoryComponent);