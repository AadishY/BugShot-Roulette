import React from 'react';
import { PlayerState, GameState, GameSettings } from '../../types';
import { Icons } from './Icons';

interface StatusDisplayProps {
    player: PlayerState;
    dealer: PlayerState;
    player3?: PlayerState;
    player4?: PlayerState;
    playerName: string;
    gameState: GameState;
    settings?: GameSettings;
    isCompact?: boolean;
}

const StatusDisplayComponent: React.FC<StatusDisplayProps> = ({ player, dealer, player3, player4, playerName, gameState, settings, isCompact: isCompactProp }) => {
    const isBalanced = !!settings?.balancedPerformance || !!settings?.ultraPerformance;
    const isPotato = !!settings?.ultraPerformance;
    const isCompact = isCompactProp ?? (typeof window !== 'undefined' && (window.innerWidth < 768 || window.innerHeight < 540));

    const getPlayer3Name = () => {
        if (!gameState.multiplayerState?.players) return 'OPPONENT 2';
        const players = gameState.multiplayerState.players;
        const size = players.length >= 4 ? 4 : 3;
        const myId = gameState.localPlayerId || '';
        const myIndex = players.findIndex((p: any) => p.id === myId);
        if (myIndex !== -1) {
            const sideOpponent = players[(myIndex + 1) % size];
            return sideOpponent ? sideOpponent.name : 'OPPONENT 2';
        }
        return 'OPPONENT 2';
    };

    const getPlayer4Name = () => {
        if (!gameState.isFourPlayer || !gameState.multiplayerState?.players) return 'OPPONENT 3';
        const players = gameState.multiplayerState.players;
        const myId = gameState.localPlayerId || '';
        const myIndex = players.findIndex((p: any) => p.id === myId);
        if (myIndex !== -1 && players.length >= 4) {
            const rightOpponent = players[(myIndex + 3) % 4];
            return rightOpponent ? rightOpponent.name : 'OPPONENT 3';
        }
        return 'OPPONENT 3';
    };

    const renderItems = (items: import('../../types').ItemType[]) => {
        if (!items || items.length === 0) return null;
        return (
            <div className={isCompact
                ? "flex gap-0.5 flex-wrap justify-end max-w-[118px] sm:max-w-[164px] mt-0.5"
                : "flex gap-1 flex-wrap justify-end max-w-[150px] md:max-w-[200px] mt-1.5"
            }>
                {items.map((item, i) => (
                    <div
                        key={i}
                        className={isCompact
                            ? "w-4 h-4 bg-black/55 border border-white/10 rounded flex items-center justify-center p-0.5 overflow-hidden"
                            : "w-3.5 h-3.5 md:w-8 md:h-8 bg-stone-900/60 backdrop-blur-sm border border-stone-800 group hover:border-white/20 transition-all rounded flex items-center justify-center p-0.5 shadow-inner overflow-hidden"
                        }
                    >
                        <div className="transform transition-transform group-hover:scale-110 flex items-center justify-center">
                            {item === 'BEER' && <Icons.Beer size={16} className={isCompact ? "w-2.5 h-2.5 text-amber-500/90" : "w-2 md:w-4 text-amber-500/80"} />}
                            {item === 'CIGS' && <Icons.Cigs size={16} className={isCompact ? "w-2.5 h-2.5 text-red-500/90" : "w-2 md:w-4 text-red-500/80"} />}
                            {item === 'GLASS' && <Icons.Glass size={16} className={isCompact ? "w-2.5 h-2.5 text-cyan-500/90" : "w-2 md:w-4 text-cyan-500/80"} />}
                            {item === 'CUFFS' && <Icons.Cuffs size={16} className={isCompact ? "w-2.5 h-2.5 text-stone-300" : "w-2 md:w-4 text-stone-400"} />}
                            {item === 'SAW' && <Icons.Saw size={16} className={isCompact ? "w-2.5 h-2.5 text-orange-500/90" : "w-2 md:w-4 text-orange-600/80"} />}
                            {item === 'PHONE' && <Icons.Phone size={16} className={isCompact ? "w-2.5 h-2.5 text-blue-300/90" : "w-2 md:w-4 text-blue-300/80"} />}
                            {item === 'INVERTER' && <Icons.Inverter size={16} className={isCompact ? "w-2.5 h-2.5 text-green-400/90" : "w-2 md:w-4 text-green-400/80"} />}
                            {item === 'ADRENALINE' && <Icons.Adrenaline size={16} className={isCompact ? "w-2.5 h-2.5 text-pink-500/90" : "w-2 md:w-4 text-pink-500/80"} />}
                            {item === 'CHOKE' && <Icons.Choke size={16} className={isCompact ? "w-2.5 h-2.5 text-stone-300" : "w-2 md:w-4 text-stone-300"} />}
                            {item === 'REMOTE' && <Icons.Remote size={16} className={isCompact ? "w-2.5 h-2.5 text-red-500/90" : "w-2 md:w-4 text-red-500/80"} />}
                            {item === 'BIG_INVERTER' && <Icons.BigInverter size={16} className={isCompact ? "w-2.5 h-2.5 text-orange-400/90" : "w-2 md:w-4 text-orange-500/80"} />}
                            {item === 'CONTRACT' && <Icons.Contract size={16} className={isCompact ? "w-2.5 h-2.5 text-red-500/90" : "w-2 md:w-4 text-red-750/80"} />}
                            {item === 'LUCKYCHARM' && <Icons.Luckycharm size={16} className={isCompact ? "w-2.5 h-2.5 text-emerald-400/90" : "w-2 md:w-4 text-emerald-500/80"} />}
                            {item === 'FLASHBANG' && <Icons.Flashbang size={16} className={isCompact ? "w-2.5 h-2.5 text-zinc-200" : "w-2 md:w-4 text-zinc-300"} />}
                            {item === 'CRUSHER' && <Icons.Crusher size={16} className={isCompact ? "w-2.5 h-2.5 text-amber-500/90" : "w-2 md:w-4 text-amber-600/80"} />}
                            {item === 'TOTEM' && <Icons.Totem size={16} className={isCompact ? "w-2.5 h-2.5 text-amber-400" : "w-2 md:w-4 text-amber-500/80 animate-pulse"} />}
                            {item === 'MIRROR' && <Icons.Mirror size={16} className={isCompact ? "w-2.5 h-2.5 text-indigo-400" : "w-2 md:w-4 text-indigo-400"} />}
                            {item === 'DECK_CARD' && <Icons.DeckCard size={16} className={isCompact ? "w-2.5 h-2.5 text-purple-400" : "w-2 md:w-4 text-purple-400"} />}
                            {item === 'JACKPOT' && <Icons.Jackpot size={16} className={isCompact ? "w-2.5 h-2.5 text-yellow-400" : "w-2 md:w-4 text-yellow-500/80"} />}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderEnemyHpBars = (target: PlayerState, barClassName: string) => (
        <div className={isCompact ? "flex gap-0.5" : "flex gap-1 md:gap-2"}>
            {[...Array(target.maxHp)].map((_, i) => {
                const isActive = i < target.hp;
                let hpClass = '';
                if (isActive) {
                    hpClass = isPotato
                        ? 'bg-red-650 border-red-750'
                        : `bg-gradient-to-t from-red-950/80 via-red-600/60 to-red-500/40 border-red-500/60 ${isBalanced ? '' : 'shadow-[0_0_20px_rgba(239,68,68,0.25)]'}`;
                } else {
                    hpClass = isPotato
                        ? 'bg-neutral-900 border-neutral-850 opacity-20'
                        : 'bg-stone-950 border-stone-800/40 opacity-15';
                }

                return (
                    <div key={i} className={`relative group border rounded-[2px] transition-all duration-700 ${barClassName} ${hpClass}`}>
                        {isActive && !isPotato && !isCompact && (
                            <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(255,255,255,0.1)_50%,transparent_100%)] animate-[scanline_3s_linear_infinite]" />
                        )}
                    </div>
                );
            })}
        </div>
    );

    const turnLabel = gameState.turnOwner === 'PLAYER'
        ? 'YOUR TURN'
        : (gameState.turnOwner === 'PLAYER3'
            ? `${getPlayer3Name().toUpperCase()}'S TURN`
            : (gameState.turnOwner === 'PLAYER4'
                ? `${getPlayer4Name().toUpperCase()}'S TURN`
                : `${(gameState.opponentName?.toUpperCase() || 'DEALER')}'S TURN`));

    if (isCompact) {
        return (
            <div className="flex justify-between items-start gap-1.5 w-full pointer-events-none px-0.5 py-0.5 min-w-0">
                {/* Player Side (Ultra-Compact) */}
                <div className="flex flex-col items-start min-w-0 max-w-[34%] bg-black/45 border border-white/10 rounded-lg px-2 py-1">
                    <div className="flex items-center gap-1 min-w-0 w-full">
                        <span className="text-[9px] sm:text-[10px] font-black tracking-wider text-stone-200 uppercase truncate">
                            {playerName || 'OPERATOR'}
                        </span>
                        {player.isFlashbanged && <span className="text-red-500 text-[9px] font-black shrink-0" title="Blinded">⚡</span>}
                        {gameState.isHardMode && gameState.hardModeState && (
                            <span className="text-[8px] font-black text-red-400 bg-red-950/60 border border-red-800/50 px-1 rounded leading-tight shrink-0">
                                P{gameState.hardModeState.round}/3
                            </span>
                        )}
                        {!gameState.isMultiplayer && !gameState.isHardMode && gameState.normalModeState && (
                            <span className="text-[8px] font-black text-stone-300 bg-stone-800/80 border border-white/10 px-1 rounded leading-tight shrink-0">
                                R{gameState.normalModeState.round}/2
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                        <div className="flex items-center gap-0.5">
                            {[...Array(player.maxHp)].map((_, i) => {
                                const isActive = i < player.hp;
                                const isLowHp = player.hp <= 1;
                                const hpClass = isActive
                                    ? (isPotato
                                        ? 'bg-green-600 border-green-700'
                                        : `bg-gradient-to-t from-green-900 via-green-500/70 to-green-400/50 border-green-400/70 ${isLowHp && !isBalanced ? 'animate-pulse' : ''}`)
                                    : 'bg-stone-950 border-stone-800/50 opacity-20';
                                return <div key={i} className={`w-2.5 h-3 border rounded-[2px] ${hpClass}`} />;
                            })}
                        </div>
                        <span className="text-[9px] font-mono font-bold text-green-400 tabular-nums leading-none">
                            {player.hp}/{player.maxHp}
                        </span>
                        {player.jackpotImmunityShots !== undefined && player.jackpotImmunityShots > 0 && (
                            <span className="text-[8px] font-black text-yellow-400 bg-yellow-950/70 border border-yellow-500/40 px-1 rounded leading-tight">
                                ★{player.jackpotImmunityShots}
                            </span>
                        )}
                    </div>
                </div>

                {/* Center Turn & Shell Pill */}
                <div className="flex flex-wrap items-center justify-center gap-1 pt-0.5 min-w-0 shrink">
                    <div className={`px-2 py-0.5 rounded-full border text-[9px] sm:text-[10px] font-black tracking-wider uppercase italic whitespace-nowrap max-w-[130px] truncate ${
                        gameState.turnOwner === 'PLAYER'
                            ? 'bg-green-950/60 border-green-500/40 text-green-400'
                            : 'bg-red-950/60 border-red-500/40 text-red-400'
                    }`}>
                        {turnLabel}
                    </div>
                    <div className="flex items-center gap-1 bg-black/55 px-2 py-0.5 rounded-full border border-white/10">
                        <Icons.Shell size={11} className="text-stone-300 shrink-0" />
                        <span className="text-stone-100 font-black text-[9px] sm:text-[10px] tabular-nums leading-none">
                            {gameState.liveCount + gameState.blankCount}
                        </span>
                    </div>
                </div>

                {/* Dealer / Opponents Side (Compact) */}
                <div className="flex flex-col items-end min-w-0 max-w-[36%]">
                    <div className="flex flex-col items-end bg-black/45 border border-white/10 rounded-lg px-2 py-1 max-w-full">
                        <div className="flex items-center gap-1 max-w-full">
                            {dealer.isFlashbanged && <span className="text-red-500 text-[9px] font-black shrink-0" title="Blinded">⚡</span>}
                            <span className="text-[9px] sm:text-[10px] font-black tracking-wider text-stone-200 uppercase truncate">
                                {gameState.isMultiplayer ? (gameState.opponentName || 'OPPONENT') : 'DEALER'}
                            </span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[9px] font-mono font-bold text-red-400 tabular-nums leading-none">
                                {dealer.hp}/{dealer.maxHp}
                            </span>
                            {renderEnemyHpBars(dealer, 'w-2.5 h-3')}
                        </div>
                        {renderItems(dealer.items)}
                    </div>

                    {/* Compact 3P/4P Extra Opponent Chips */}
                    {((gameState.isThreePlayer || gameState.isFourPlayer) && (player3 || player4)) && (
                        <div className="flex flex-wrap justify-end gap-1 mt-0.5 max-w-full">
                            {(gameState.isThreePlayer || gameState.isFourPlayer) && player3 && (
                                <div className="flex items-center gap-1 bg-black/50 border border-amber-500/25 rounded px-1.5 py-0.5 text-[8px]">
                                    <span className="font-black text-amber-300 uppercase truncate max-w-[52px]">{getPlayer3Name()}</span>
                                    <span className="font-mono font-bold text-red-400 tabular-nums">{player3.hp}/{player3.maxHp}</span>
                                    {player3.items.length > 0 && <span className="text-stone-400">({player3.items.length})</span>}
                                </div>
                            )}
                            {gameState.isFourPlayer && player4 && (
                                <div className="flex items-center gap-1 bg-black/50 border border-purple-500/25 rounded px-1.5 py-0.5 text-[8px]">
                                    <span className="font-black text-purple-300 uppercase truncate max-w-[52px]">{getPlayer4Name()}</span>
                                    <span className="font-mono font-bold text-red-400 tabular-nums">{player4.hp}/{player4.maxHp}</span>
                                    {player4.items.length > 0 && <span className="text-stone-400">({player4.items.length})</span>}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex justify-between items-start w-full pointer-events-none px-1 md:px-2 py-2 md:py-4">
            {/* Player Side */}
            <div className="flex flex-col items-start min-w-[80px] md:w-1/3 animate-in slide-in-from-left duration-700">
                <div className="flex flex-col mb-4">
                    <span className="text-[10px] md:text-sm font-black tracking-[0.2em] md:tracking-[0.4em] text-stone-300 mb-1 uppercase truncate max-w-[135px] md:max-w-full flex items-center gap-1">
                        {playerName || 'OPERATOR'}
                        {player.isFlashbanged && <span className="text-red-500 animate-pulse text-[8px] md:text-xs font-black">⚡ BLINDED</span>}
                    </span>
                    <div className="flex items-center gap-1.5 md:gap-3">
                        {[...Array(player.maxHp)].map((_, i) => {
                            const isActive = i < player.hp;
                            const isLowHp = player.hp <= 1;
                            
                            let hpClass = '';
                            if (isActive) {
                                if (isPotato) {
                                    hpClass = 'bg-green-600 border-green-700';
                                } else {
                                    hpClass = `bg-gradient-to-t from-green-950 via-green-600/40 to-green-400/20 border-green-500/50 ${isBalanced ? '' : 'shadow-[0_0_20px_rgba(34,197,94,0.2)]'} ${isLowHp && !isBalanced ? 'animate-pulse' : ''}`;
                                }
                            } else {
                                if (isPotato) {
                                    hpClass = 'bg-neutral-900 border-neutral-850 opacity-20';
                                } else {
                                    hpClass = 'bg-stone-950 border-stone-800/40 opacity-10';
                                }
                            }

                            return (
                                <div key={i} className={`relative group w-2 h-6 md:w-6 md:h-20 border rounded-sm transition-all duration-1000 ${hpClass}`}>
                                    {isActive && !isPotato && (
                                        <>
                                            <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(255,255,255,0.05)_50%,transparent_100%)] animate-[scanline_3s_linear_infinite]" />
                                            {isLowHp && !isBalanced && <div className="absolute inset-0 bg-red-600/20 blur-sm animate-pulse" />}
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {player.jackpotImmunityShots !== undefined && player.jackpotImmunityShots > 0 && (
                        <div className="mt-2.5 flex items-center gap-1.5 bg-yellow-950/50 border border-yellow-500/30 px-2.5 py-1 rounded-lg text-[9px] md:text-[11px] font-black text-yellow-400 tracking-wider uppercase animate-pulse shadow-[0_0_15px_rgba(234,179,8,0.25)]">
                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-ping" />
                            <span>JACKPOT: {player.jackpotImmunityShots}</span>
                        </div>
                    )}
                </div>

                {gameState.isHardMode && gameState.hardModeState && (
                    <div className="flex items-center gap-1 md:gap-2 bg-red-950/20 px-2 md:px-3 py-1 rounded-full border border-red-900/30">
                        <span className="text-[8px] md:text-xs font-black text-red-400 tracking-[0.2em] uppercase">PH</span>
                        <span className="text-xs md:text-lg text-red-500 font-black tracking-widest leading-none">
                            {gameState.hardModeState.round}<span className="text-[10px] text-red-800 mx-1">/</span>3
                        </span>
                    </div>
                )}

                {!gameState.isMultiplayer && !gameState.isHardMode && gameState.normalModeState && (
                    <div className="flex items-center gap-1 md:gap-2 bg-stone-900/40 px-2 md:px-3 py-1 rounded-full border border-stone-800/40">
                        <span className="text-[8px] md:text-xs font-black text-stone-400 tracking-[0.2em] uppercase">RD</span>
                        <span className="text-xs md:text-lg text-stone-200 font-black tracking-widest leading-none">
                            {gameState.normalModeState.round}<span className="text-[10px] text-stone-600 mx-1">/</span>2
                        </span>
                    </div>
                )}
            </div>

            {/* Center Protocol Display */}
            <div className="flex-1 flex flex-col items-center justify-start pt-1 md:pt-2 animate-in fade-in duration-1000">
                <div className={`relative px-2 md:px-6 py-1 md:py-2 rounded-xl overflow-hidden transition-all duration-500 border ${gameState.turnOwner === 'PLAYER'
                    ? 'bg-green-950/10 border-green-500/20'
                    : 'bg-red-950/10 border-red-500/20'
                    }`}>
                    {!isBalanced && (
                        <div className={`absolute inset-0 blur-2xl opacity-20 -z-10 animate-pulse ${gameState.turnOwner === 'PLAYER' ? 'bg-green-500' : 'bg-red-600'
                            }`} />
                    )}

                    <div className={`text-xs md:text-3xl font-black tracking-[0.1em] md:tracking-[0.4em] transition-all duration-500 whitespace-nowrap uppercase italic ${gameState.turnOwner === 'PLAYER'
                        ? `text-green-500 ${isBalanced ? '' : 'drop-shadow-[0_0_15px_rgba(34,197,94,0.5)]'}`
                        : `text-red-600 ${isBalanced ? '' : 'drop-shadow-[0_0_15px_rgba(220,38,38,0.5)]'}`
                        } ${gameState.isHardMode && gameState.turnOwner === 'DEALER' && !isPotato ? 'animate-[chromatic_0.2s_infinite]' : ''}`}>
                        {turnLabel}
                    </div>
                </div>

                <div className="flex items-center gap-2 md:gap-4 mt-2 md:mt-4">
                    <div className="h-[1px] w-4 md:w-16 bg-gradient-to-r from-transparent via-stone-800 to-stone-800" />
                    <div className="flex items-center gap-1 md:gap-2 bg-stone-900/40 px-2 md:px-4 py-1 rounded-lg border border-white/5">
                        <Icons.Shell size={12} className="text-stone-400 md:hidden" />
                        <Icons.Shell size={16} className="text-stone-400 hidden md:block" />
                        <span className="text-stone-100 font-black text-[10px] md:text-xl tracking-[0.2em] tabular-nums leading-none">
                            {gameState.liveCount + gameState.blankCount}
                        </span>
                    </div>
                    <div className="h-[1px] w-4 md:w-16 bg-gradient-to-l from-transparent via-stone-800 to-stone-800" />
                </div>
            </div>

            {/* Dealer & Opponent Side (Right aligned stack) */}
            <div className="flex flex-col gap-4 md:gap-6 items-end min-w-[80px] md:w-1/3 animate-in slide-in-from-right duration-700">
                {/* Opponent 1 (Dealer / Front) */}
                <div className="flex flex-col items-end">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] md:text-sm font-black tracking-[0.2em] md:tracking-[0.4em] text-stone-300 mb-1 uppercase flex items-center gap-1">
                            {gameState.isMultiplayer ? (gameState.opponentName || 'OPPONENT') : 'DEALER'}
                            {dealer.isFlashbanged && <span className="text-red-500 animate-pulse text-[8px] md:text-xs font-black">⚡ BLINDED</span>}
                        </span>
                        {renderEnemyHpBars(dealer, 'w-1.5 h-4 md:w-5 md:h-12 rounded-sm')}
                    </div>
                    {renderItems(dealer.items)}
                </div>

                {/* Opponent 2 (Player 3 / Left Side) */}
                {(gameState.isThreePlayer || gameState.isFourPlayer) && player3 && (
                    <div className="flex flex-col items-end border-t border-stone-800/40 pt-3 md:pt-4 w-full">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] md:text-sm font-black tracking-[0.2em] md:tracking-[0.4em] text-stone-300 mb-1 uppercase flex items-center gap-1">
                                {getPlayer3Name()}
                                {player3.isFlashbanged && <span className="text-red-500 animate-pulse text-[8px] md:text-xs font-black">⚡ BLINDED</span>}
                            </span>
                            {renderEnemyHpBars(player3, 'w-1.5 h-4 md:w-5 md:h-12 rounded-sm')}
                        </div>
                        {renderItems(player3.items)}
                    </div>
                )}

                {/* Opponent 3 (Player 4 / Right Side) */}
                {gameState.isFourPlayer && player4 && (
                    <div className="flex flex-col items-end border-t border-stone-800/40 pt-3 md:pt-4 w-full">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] md:text-sm font-black tracking-[0.2em] md:tracking-[0.4em] text-stone-300 mb-1 uppercase flex items-center gap-1">
                                {getPlayer4Name()}
                                {player4.isFlashbanged && <span className="text-red-500 animate-pulse text-[8px] md:text-xs font-black">⚡ BLINDED</span>}
                            </span>
                            {renderEnemyHpBars(player4, 'w-1.5 h-4 md:w-5 md:h-12 rounded-sm')}
                        </div>
                        {renderItems(player4.items)}
                    </div>
                )}
            </div>
        </div>
    );
};

export const StatusDisplay = React.memo(StatusDisplayComponent);