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
    isPortrait?: boolean;
}

const StatusDisplayComponent: React.FC<StatusDisplayProps> = ({ player, dealer, player3, player4, playerName, gameState, settings, isCompact: isCompactProp, isPortrait: isPortraitProp }) => {
    const isBalanced = !!settings?.balancedPerformance || !!settings?.ultraPerformance;
    const isPotato = !!settings?.ultraPerformance;
    const isCompact = isCompactProp ?? (typeof window !== 'undefined' && (window.innerWidth < 768 || window.innerHeight < 540));
    const isPortrait = isPortraitProp ?? (typeof window !== 'undefined' && window.innerHeight > window.innerWidth);

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

    const isSplitMode = Boolean(gameState.isLocalSplit);
    const p1DisplayName = isSplitMode ? (gameState.player1Name || playerName || 'PLAYER 1') : (playerName || 'OPERATOR');
    const p2DisplayName = (gameState.isMultiplayer || isSplitMode) ? (gameState.opponentName || 'OPPONENT') : 'DEALER';
    const isP1Turn = gameState.turnOwner === 'PLAYER';
    const isP2Turn = gameState.turnOwner === 'DEALER';
    const splitTotalMatches = gameState.localSplitConfig?.totalMatches ?? 1;
    const splitScore = gameState.multiModeState;
    const splitCurrentMatch = splitScore
        ? Math.min(splitTotalMatches, splitScore.playerWins + splitScore.opponentWins + 1)
        : 1;

    const turnLabel = isSplitMode
        ? `${(isP1Turn ? p1DisplayName : p2DisplayName).toUpperCase()}'S TURN`
        : (gameState.turnOwner === 'PLAYER'
            ? 'YOUR TURN'
            : (gameState.turnOwner === 'PLAYER3'
                ? `${getPlayer3Name().toUpperCase()}'S TURN`
                : (gameState.turnOwner === 'PLAYER4'
                    ? `${getPlayer4Name().toUpperCase()}'S TURN`
                    : `${(gameState.opponentName?.toUpperCase() || 'DEALER')}'S TURN`)));

    const totalAmmo = gameState.liveCount + gameState.blankCount;

    const renderCenterAmmoWidget = (compactWidget: boolean) => (
        <div
            className={compactWidget
                ? "flex items-center gap-1.5 bg-black/75 px-3 py-0.5 rounded-full border border-white/15 shadow-md"
                : "flex items-center gap-2 md:gap-4 mt-1.5 md:mt-2.5"
            }
            title={`Total Shells Loaded: ${totalAmmo}`}
        >
            {!compactWidget && (
                <div className="h-[1px] w-6 md:w-16 bg-gradient-to-r from-transparent via-stone-700 to-stone-700" />
            )}
            <div className={compactWidget
                ? "flex items-center gap-1.5"
                : "flex items-center gap-1.5 md:gap-2.5 bg-stone-950/75 px-3 md:px-4.5 py-1 md:py-1.5 rounded-xl border border-white/15 shadow-lg"
            }>
                <Icons.Shell size={compactWidget ? 13 : 18} className="text-stone-300 shrink-0" />
                <span className={compactWidget
                    ? "text-stone-100 font-black text-[11px] sm:text-xs tabular-nums leading-none tracking-wider"
                    : "text-stone-100 font-black text-sm md:text-2xl tracking-[0.18em] tabular-nums leading-none"
                }>
                    {totalAmmo}
                </span>
            </div>
            {!compactWidget && (
                <div className="h-[1px] w-6 md:w-16 bg-gradient-to-l from-transparent via-stone-700 to-stone-700" />
            )}
        </div>
    );

    const renderLeftTelemetry = (compactBadge: boolean) => {
        const hasSplit = Boolean(isSplitMode && splitScore);
        const hasHard = Boolean(gameState.isHardMode && gameState.hardModeState);
        const hasNormal = Boolean(!gameState.isMultiplayer && !isSplitMode && !gameState.isHardMode && gameState.normalModeState);
        const hasJackpot = Boolean(player.jackpotImmunityShots !== undefined && player.jackpotImmunityShots > 0);
        if (!hasSplit && !hasHard && !hasNormal && !hasJackpot) return null;

        return (
            <div className={`flex flex-wrap items-center ${compactBadge ? 'gap-1 mt-1' : 'gap-1.5 mt-1.5'}`}>
                {/* Split Match Score & Progress Pill (Compact, left side below health) */}
                {hasSplit && splitScore && (
                    <div
                        className={`flex items-center gap-1 bg-amber-950/60 border border-amber-500/40 rounded-md font-mono font-black tabular-nums leading-none whitespace-nowrap ${
                            compactBadge ? 'px-1.5 py-0.5 text-[8px] text-amber-300' : 'px-2 py-0.5 text-[9.5px] md:text-[10.5px] text-amber-300'
                        }`}
                        title={`Split Match ${splitCurrentMatch} of ${splitTotalMatches}`}
                    >
                        <span>M{splitCurrentMatch}/{splitTotalMatches}</span>
                        <span className="text-amber-500/60">•</span>
                        <span className="text-white">{splitScore.playerWins}-{splitScore.opponentWins}</span>
                    </div>
                )}

                {/* Hard Mode Phase */}
                {hasHard && gameState.hardModeState && (
                    <div className={`flex items-center gap-1 bg-red-950/50 border border-red-800/50 rounded-md font-mono font-black tabular-nums leading-none ${
                        compactBadge ? 'px-1.5 py-0.5 text-[8px] text-red-400' : 'px-2 py-0.5 text-[9.5px] md:text-[10.5px] text-red-400'
                    }`}>
                        <span>PH</span>
                        <span className="text-red-300">{gameState.hardModeState.round}/3</span>
                    </div>
                )}

                {/* Normal Mode Round */}
                {hasNormal && gameState.normalModeState && (
                    <div className={`flex items-center gap-1 bg-stone-900/75 border border-white/10 rounded-md font-mono font-black tabular-nums leading-none ${
                        compactBadge ? 'px-1.5 py-0.5 text-[8px] text-stone-300' : 'px-2 py-0.5 text-[9.5px] md:text-[10.5px] text-stone-300'
                    }`}>
                        <span>RD</span>
                        <span className="text-stone-100">{gameState.normalModeState.round}/2</span>
                    </div>
                )}

                {/* Jackpot Immunity Shots */}
                {hasJackpot && (
                    <div className={`flex items-center gap-1 bg-yellow-950/65 border border-yellow-500/40 rounded-md font-mono font-black text-yellow-400 tabular-nums leading-none ${
                        compactBadge ? 'px-1.5 py-0.5 text-[8px]' : 'px-2 py-0.5 text-[9.5px] md:text-[10.5px]'
                    }`}>
                        <span>★{player.jackpotImmunityShots}</span>
                    </div>
                )}
            </div>
        );
    };

    if (isCompact && isPortrait) {
        return (
            <div className="flex flex-col gap-1 w-full pointer-events-none px-0.5 py-0.5 min-w-0 flex-1">
                {/* Row 1: Left Player (HP + Split/Ammo telemetry below) & Right Dealer Cards */}
                <div className="flex justify-between items-start gap-1.5 w-full min-w-0">
                    <div className={`flex flex-col items-start min-w-0 flex-1 max-w-[49%] bg-black/55 border rounded-lg px-2 py-1 transition-all ${
                        isSplitMode && isP1Turn
                            ? 'border-emerald-400/80 ring-1 ring-emerald-500/40'
                            : isSplitMode
                                ? 'border-white/10 opacity-80'
                                : 'border-white/10'
                    }`}>
                        <div className="flex items-center gap-1 min-w-0 w-full">
                            <span className="text-[9.5px] font-black tracking-wider text-stone-200 uppercase truncate">
                                {p1DisplayName}
                            </span>
                            {isSplitMode && isP1Turn && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                            )}
                            {player.isFlashbanged && <span className="text-red-500 text-[9px] font-black shrink-0" title="Blinded">⚡</span>}
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
                        </div>
                        {renderLeftTelemetry(true)}
                        {isSplitMode && isP2Turn && renderItems(player.items)}
                    </div>

                    <div className="flex flex-col items-end min-w-0 flex-1 max-w-[49%]">
                        <div className={`flex flex-col items-end w-full bg-black/55 border rounded-lg px-2 py-1 transition-all ${
                            isSplitMode && isP2Turn
                                ? 'border-amber-400/80 ring-1 ring-amber-500/40'
                                : isSplitMode
                                    ? 'border-white/10 opacity-80'
                                    : 'border-white/10'
                        }`}>
                            <div className="flex items-center gap-1 max-w-full justify-end">
                                {isSplitMode && isP2Turn && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                                )}
                                {dealer.isFlashbanged && <span className="text-red-500 text-[9px] font-black shrink-0" title="Blinded">⚡</span>}
                                <span className="text-[9.5px] font-black tracking-wider text-stone-200 uppercase truncate">
                                    {p2DisplayName}
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
                    </div>
                </div>

                {/* Row 2: Centered Turn Badge + Total Ammo Left Widget + Extra 3P/4P Chips */}
                <div className="flex flex-wrap items-center justify-center gap-1.5 w-full">
                    <div className={`px-2.5 py-0.5 rounded-full border text-[9px] font-black tracking-wider uppercase italic whitespace-nowrap max-w-[65vw] truncate ${
                        isP1Turn
                            ? 'bg-green-950/70 border-green-500/50 text-green-400'
                            : isSplitMode
                                ? 'bg-amber-950/70 border-amber-500/50 text-amber-300'
                                : 'bg-red-950/70 border-red-500/40 text-red-400'
                    }`}>
                        {turnLabel}
                    </div>
                    {renderCenterAmmoWidget(true)}
                    {(gameState.isThreePlayer || gameState.isFourPlayer) && player3 && (
                        <div className="flex items-center gap-1 bg-black/60 border border-amber-500/25 rounded-full px-1.5 py-0.5 text-[8px]">
                            <span className="font-black text-amber-300 uppercase truncate max-w-[54px]">{getPlayer3Name()}</span>
                            <span className="font-mono font-bold text-red-400 tabular-nums">{player3.hp}/{player3.maxHp}</span>
                        </div>
                    )}
                    {gameState.isFourPlayer && player4 && (
                        <div className="flex items-center gap-1 bg-black/60 border border-purple-500/25 rounded-full px-1.5 py-0.5 text-[8px]">
                            <span className="font-black text-purple-300 uppercase truncate max-w-[54px]">{getPlayer4Name()}</span>
                            <span className="font-mono font-bold text-red-400 tabular-nums">{player4.hp}/{player4.maxHp}</span>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (isCompact) {
        return (
            <div className="flex justify-between items-start gap-1.5 w-full pointer-events-none px-0.5 py-0.5 min-w-0">
                {/* Player Side (Compact Landscape - Split Match & Ammo tucked neatly below health) */}
                <div className={`flex flex-col items-start min-w-0 max-w-[36%] bg-black/50 border rounded-lg px-2 py-1 transition-all ${
                    isSplitMode && isP1Turn
                        ? 'border-emerald-400/80 ring-1 ring-emerald-500/40'
                        : isSplitMode
                            ? 'border-white/10 opacity-75'
                            : 'border-white/10'
                }`}>
                    <div className="flex items-center gap-1 min-w-0 w-full">
                        <span className="text-[9px] sm:text-[10px] font-black tracking-wider text-stone-200 uppercase truncate">
                            {p1DisplayName}
                        </span>
                        {isSplitMode && isP1Turn && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                        )}
                        {player.isFlashbanged && <span className="text-red-500 text-[9px] font-black shrink-0" title="Blinded">⚡</span>}
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
                    </div>
                    {renderLeftTelemetry(true)}
                    {isSplitMode && isP2Turn && renderItems(player.items)}
                </div>

                {/* Center Turn Pill + Total Ammo Left Widget */}
                <div className="flex flex-col items-center justify-center gap-1 pt-0.5 min-w-0 shrink">
                    <div className={`px-2.5 py-0.5 rounded-full border text-[9px] sm:text-[10px] font-black tracking-wider uppercase italic whitespace-nowrap max-w-[160px] truncate ${
                        isP1Turn
                            ? 'bg-green-950/60 border-green-500/50 text-green-400'
                            : isSplitMode
                                ? 'bg-amber-950/60 border-amber-500/50 text-amber-300'
                                : 'bg-red-950/60 border-red-500/40 text-red-400'
                    }`}>
                        {turnLabel}
                    </div>
                    {renderCenterAmmoWidget(true)}
                </div>

                {/* Dealer / Opponents Side (Compact) */}
                <div className="flex flex-col items-end min-w-0 max-w-[36%]">
                    <div className={`flex flex-col items-end bg-black/50 border rounded-lg px-2 py-1 max-w-full transition-all ${
                        isSplitMode && isP2Turn
                            ? 'border-amber-400/80 ring-1 ring-amber-500/40'
                            : isSplitMode
                                ? 'border-white/10 opacity-75'
                                : 'border-white/10'
                    }`}>
                        <div className="flex items-center gap-1 max-w-full">
                            {isSplitMode && isP2Turn && (
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                            )}
                            {dealer.isFlashbanged && <span className="text-red-500 text-[9px] font-black shrink-0" title="Blinded">⚡</span>}
                            <span className="text-[9px] sm:text-[10px] font-black tracking-wider text-stone-200 uppercase truncate">
                                {p2DisplayName}
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
            <div className={`flex flex-col items-start min-w-[80px] md:w-1/3 animate-in slide-in-from-left duration-700 transition-opacity ${isSplitMode && !isP1Turn ? 'opacity-70' : 'opacity-100'}`}>
                <div className={`flex flex-col mb-1.5 ${isSplitMode && isP1Turn ? 'bg-emerald-950/30 border border-emerald-500/50 rounded-xl px-2.5 py-1.5 shadow-[0_0_24px_rgba(16,185,129,0.2)]' : ''}`}>
                    <span className="text-[10px] md:text-sm font-black tracking-[0.2em] md:tracking-[0.35em] text-stone-200 mb-1 uppercase truncate max-w-[180px] md:max-w-full flex items-center gap-2">
                        {p1DisplayName}
                        {isSplitMode && isP1Turn && (
                            <span className="text-[8px] md:text-[10px] font-mono font-black tracking-widest px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-300">
                                ACTIVE
                            </span>
                        )}
                        {player.isFlashbanged && <span className="text-red-500 animate-pulse text-[8px] md:text-xs font-black">⚡ BLINDED</span>}
                    </span>
                    <div className="flex items-center gap-1.5 md:gap-2.5">
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
                                <div key={i} className={`relative group w-2 h-6 md:w-5 md:h-12 border rounded-sm transition-all duration-1000 ${hpClass}`}>
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
                </div>

                {/* Compact Left Telemetry: Total Ammo + Split Match + Round / Immunity below Player Health */}
                {renderLeftTelemetry(false)}

                {isSplitMode && isP2Turn && (
                    <div className="mt-1.5">
                        {renderItems(player.items)}
                    </div>
                )}
            </div>

            {/* Center Protocol Display (Turn Pill + Enlarged Total Ammo Widget; Split Match sits compact on left below HP) */}
            <div className="flex-1 flex flex-col items-center justify-start pt-1 md:pt-2 animate-in fade-in duration-1000">
                <div className={`relative px-2 md:px-6 py-1 md:py-2 rounded-xl overflow-hidden transition-all duration-500 border ${isP1Turn
                    ? 'bg-green-950/20 border-green-500/40'
                    : isSplitMode
                        ? 'bg-amber-950/25 border-amber-500/50'
                        : 'bg-red-950/10 border-red-500/20'
                    }`}>
                    {!isBalanced && (
                        <div className={`absolute inset-0 blur-2xl opacity-20 -z-10 animate-pulse ${isP1Turn ? 'bg-green-500' : (isSplitMode ? 'bg-amber-500' : 'bg-red-600')
                            }`} />
                    )}

                    <div className={`text-xs md:text-2xl lg:text-3xl font-black tracking-[0.1em] md:tracking-[0.28em] transition-all duration-500 whitespace-nowrap uppercase italic ${isP1Turn
                        ? `text-green-400 ${isBalanced ? '' : 'drop-shadow-[0_0_15px_rgba(34,197,94,0.5)]'}`
                        : isSplitMode
                            ? `text-amber-300 ${isBalanced ? '' : 'drop-shadow-[0_0_15px_rgba(245,158,11,0.55)]'}`
                            : `text-red-600 ${isBalanced ? '' : 'drop-shadow-[0_0_15px_rgba(220,38,38,0.5)]'}`
                        } ${gameState.isHardMode && gameState.turnOwner === 'DEALER' && !isPotato ? 'animate-[chromatic_0.2s_infinite]' : ''}`}>
                        {turnLabel}
                    </div>
                </div>
                {renderCenterAmmoWidget(false)}
            </div>

            {/* Dealer & Opponent Side (Right aligned stack) */}
            <div className={`flex flex-col gap-4 md:gap-6 items-end min-w-[80px] md:w-1/3 animate-in slide-in-from-right duration-700 transition-opacity ${isSplitMode && !isP2Turn ? 'opacity-70' : 'opacity-100'}`}>
                {/* Opponent 1 (Dealer / Front) */}
                <div className={`flex flex-col items-end ${isSplitMode && isP2Turn ? 'bg-amber-950/30 border border-amber-500/50 rounded-xl px-3 py-2 shadow-[0_0_24px_rgba(245,158,11,0.2)]' : ''}`}>
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] md:text-sm font-black tracking-[0.2em] md:tracking-[0.4em] text-stone-200 mb-1 uppercase flex items-center gap-2">
                            {isSplitMode && isP2Turn && (
                                <span className="text-[8px] md:text-[10px] font-mono font-black tracking-widest px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-amber-300">
                                    ACTIVE
                                </span>
                            )}
                            {p2DisplayName}
                            {dealer.isFlashbanged && <span className="text-red-500 animate-pulse text-[8px] md:text-xs font-black">⚡ BLINDED</span>}
                        </span>
                        {renderEnemyHpBars(dealer, 'w-1.5 h-4 md:w-5 md:h-12 rounded-sm')}
                    </div>
                    {(!isSplitMode || isP1Turn) && renderItems(dealer.items)}
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