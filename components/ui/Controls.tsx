import React from 'react';
import { AimTarget, TurnOwner, GameSettings } from '../../types';
import { Hand, Target, User } from 'lucide-react';
import { audioManager } from '../../utils/audioManager';

export interface GameStateData {
    players: Record<string, {
        id: string;
        name: string;
        isAlive?: boolean;
    }> | Array<{
        id: string;
        name: string;
        isAlive?: boolean;
    }>;
}

interface ControlsProps {
    isGunHeld: boolean;
    isProcessing: boolean;
    isRecovering?: boolean; // Whether player/dealer is knocked and recovering
    onPickupGun: () => void;
    onFireShot: (target: TurnOwner, targetId?: string) => void;
    onHoverTarget: (target: AimTarget, targetId?: string) => void;
    currentAimTarget?: AimTarget;
    isMultiplayer?: boolean;
    isThreePlayer?: boolean;
    isFourPlayer?: boolean;
    mpGameState?: GameStateData | null;
    mpMyPlayerId?: string | null;
    onMpShoot?: (targetId: string) => void;
    settings?: GameSettings;
    isCompact?: boolean;
    isLocalSplit?: boolean;
    activeTurnOwner?: TurnOwner;
    activePlayerName?: string;
    targetOpponentName?: string;
    experimentalHoverLabel?: string | null;
}

const ControlsComponent: React.FC<ControlsProps> = ({
    isGunHeld,
    isProcessing,
    isRecovering = false,
    onPickupGun,
    onFireShot,
    onHoverTarget,
    currentAimTarget = 'IDLE',
    isMultiplayer = false,
    isThreePlayer = false,
    isFourPlayer = false,
    mpGameState,
    mpMyPlayerId,
    onMpShoot,
    settings,
    isCompact: isCompactProp,
    isLocalSplit = false,
    activeTurnOwner = 'PLAYER',
    activePlayerName,
    targetOpponentName,
    experimentalHoverLabel = null
}) => {
    const isBalanced = !!settings?.balancedPerformance || !!settings?.ultraPerformance;
    const isPotato = !!settings?.ultraPerformance;
    const isCompact = isCompactProp ?? (typeof window !== 'undefined' && (window.innerWidth < 768 || window.innerHeight < 540));
    const isMobileTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    const isExperimentalAim = Boolean(settings?.experimentalDirectAim);

    if (isExperimentalAim) {
        const promptText = isRecovering
            ? 'WAIT — RECOVERING...'
            : isProcessing
            ? 'RESOLVING ACTION...'
            : !isGunHeld
            ? `${isLocalSplit && activePlayerName ? `${activePlayerName.toUpperCase()} • ` : ''}${isMobileTouch ? 'TAP' : 'CLICK'} SHOTGUN ON TABLE TO GRAB`
            : experimentalHoverLabel
            ? `${isMobileTouch ? 'TAP' : 'CLICK'}: ${experimentalHoverLabel}`
            : (isThreePlayer || isFourPlayer)
            ? `${isMobileTouch ? 'TAP' : 'CLICK'} ANY OPPONENT TO SHOOT • BOTTOM OF TABLE FOR SELF`
            : `${isMobileTouch ? 'TAP' : 'CLICK'} ${(targetOpponentName || (isMultiplayer ? 'OPPONENT' : 'DEALER')).toUpperCase()} TO SHOOT • BOTTOM OF TABLE FOR SELF`;

        return (
            <div className={`w-full flex items-end justify-center pointer-events-none controls-enter ${isCompact ? 'pb-0.5' : 'flex-1 pb-1 lg:pb-3'}`}>
                <div
                    data-testid="experimental-aim-prompt"
                    className={`pointer-events-none px-3 sm:px-4 py-1.5 rounded-full border font-mono font-black tracking-[0.14em] uppercase text-center transition-colors ${
                        isCompact ? 'text-[9px]' : 'text-[10px] sm:text-xs'
                    } ${
                        experimentalHoverLabel?.includes('SHOOT')
                            ? 'bg-red-950/75 border-red-500/70 text-red-200 shadow-[0_0_20px_rgba(239,68,68,0.25)]'
                            : experimentalHoverLabel === 'GRAB SHOTGUN'
                            ? 'bg-amber-950/75 border-amber-400/70 text-amber-200 shadow-[0_0_18px_rgba(245,158,11,0.25)]'
                            : 'bg-black/65 border-amber-700/40 text-amber-200/90'
                    }`}
                >
                    {promptText}
                </div>
            </div>
        );
    }

    const mpOpponents = isMultiplayer && mpGameState && mpMyPlayerId
        ? Object.values(mpGameState.players).filter(p => p.id !== mpMyPlayerId && p.isAlive !== false)
        : [];

    const handleShootOpponent = (opponentId?: string) => {
        // In Local Split Seat B (DEALER), opponent is PLAYER
        const targetOwner: TurnOwner = isLocalSplit && activeTurnOwner === 'DEALER' ? 'PLAYER' : 'DEALER';
        onFireShot(targetOwner, opponentId);
    };

    const handleShootSelf = () => {
        const selfOwner: TurnOwner = isLocalSplit && activeTurnOwner === 'DEALER' ? 'DEALER' : 'PLAYER';
        onFireShot(selfOwner);
    };

    const isOppAimed = isMobileTouch && currentAimTarget === 'OPPONENT';
    const isSelfAimed = isMobileTouch && currentAimTarget === 'SELF';

    const grabBtnClass = isCompact
        ? (isPotato
            ? `bg-neutral-900 border ${isRecovering ? 'border-red-800 text-red-500' : 'border-stone-500 text-stone-100'} px-4 py-2 min-h-[44px] rounded-xl font-black text-[11px] tracking-wider flex items-center gap-1.5 disabled:opacity-50 touch-manipulation`
            : `bg-black/75 backdrop-blur-md border px-4 py-2 min-h-[44px] rounded-xl font-black text-[11px] transition-all active:scale-95 tracking-wider flex items-center gap-1.5 disabled:opacity-50 touch-manipulation ${
                isRecovering ? 'border-red-800 text-red-500' : 'border-stone-400/70 text-stone-100 hover:bg-stone-800/90 hover:border-white'
            }`)
        : (isPotato
            ? `bg-neutral-900 border ${isRecovering ? 'border-red-800 text-red-500' : 'border-stone-700 text-stone-300 hover:bg-neutral-800'} px-6 py-4 lg:px-10 lg:py-6 min-h-[48px] min-w-[48px] font-black text-xs lg:text-xl tracking-wider flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation`
            : `bg-black/90 border px-6 py-4 lg:px-10 lg:py-6 min-h-[48px] min-w-[48px] font-black text-xs lg:text-xl transition-all active:scale-95 tracking-wider flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation ${isRecovering
                ? 'border-red-800 text-red-500 disabled:animate-none'
                : `border-stone-500 text-stone-200 hover:bg-stone-800 hover:text-white hover:border-white ${isBalanced ? '' : 'animate-pulse shadow-lg'}`
            }`);

    return (
        <div className={`w-full flex items-end justify-center pointer-events-none controls-enter ${isCompact ? 'pb-0.5' : 'flex-1 pb-1 lg:pb-4'}`}>
            <div className={`flex pointer-events-auto justify-center ${isCompact ? 'gap-2 px-1 flex-nowrap max-w-full' : 'gap-2 md:gap-6 flex-wrap px-2'}`}>
                {/* Grab Gun */}
                {!isGunHeld && (
                    <button
                        onClick={() => {
                            if (!isRecovering) {
                                audioManager.playSound('click');
                                onPickupGun();
                            }
                        }}
                        disabled={isProcessing || isRecovering}
                        className={grabBtnClass}
                    >
                        <Hand size={isCompact ? 15 : 18} className="lg:w-6 lg:h-6 shrink-0" />
                        {isRecovering ? (
                            <><span className={isCompact ? 'hidden' : 'hidden md:inline'}>WAIT </span>RECOVERING...</>
                        ) : isLocalSplit && activePlayerName ? (
                            <span className="whitespace-nowrap flex items-center gap-1.5">
                                <span className="truncate max-w-[140px] sm:max-w-[220px]">{activePlayerName.toUpperCase()}</span>
                                <span>• GRAB SHOTGUN</span>
                            </span>
                        ) : (
                            <>GRAB SHOTGUN</>
                        )}
                    </button>
                )}

                {/* Shooting */}
                {isGunHeld && (
                    <>
                        {isThreePlayer || isFourPlayer ? (() => {
                            if (!mpGameState || !Array.isArray((mpGameState as any).players)) return null;
                            const players = (mpGameState as any).players;
                            const myIndex = players.findIndex((p: any) => p.id === mpMyPlayerId);
                            const size = players.length;
                            if (myIndex === -1 || size < 3) return null;
                            const frontOpponent = players[(myIndex + 2) % size];
                            const sideOpponent = players[(myIndex + 1) % size];
                            const leftOpponent = sideOpponent;
                            const rightOpponent = size >= 4 ? players[(myIndex + 3) % size] : null;
                            const sidePos = myIndex === 1 ? 'right' : 'left';

                            const handleChooseOpponent = (relTarget: TurnOwner, intendedAim: AimTarget, oppId: string) => {
                                if (isMobileTouch && currentAimTarget !== intendedAim) {
                                    onHoverTarget(intendedAim, oppId);
                                    return;
                                }
                                onFireShot(relTarget, oppId);
                            };

                            const handleChooseSelf = () => {
                                if (isMobileTouch && currentAimTarget !== 'SELF') {
                                    onHoverTarget('SELF', mpMyPlayerId || undefined);
                                    return;
                                }
                                onFireShot('PLAYER');
                            };

                            const getMultiOppBtnClass = (aim: AimTarget) => {
                                const isAimed = isMobileTouch && currentAimTarget === aim;
                                if (isPotato) {
                                    return `bg-neutral-900 border ${isAimed ? 'border-red-400 ring-2 ring-red-500/70 text-white' : 'border-red-800 text-red-400'} px-2.5 py-1.5 min-h-[44px] font-black text-[10px] sm:text-xs tracking-wide flex items-center gap-1 disabled:opacity-50 rounded-lg touch-manipulation`;
                                }
                                return `${isAimed ? 'bg-red-900/90 border-red-400 ring-2 ring-red-500/70 text-white' : 'bg-black/80 border-red-800/80 text-red-400 hover:bg-red-900 hover:text-white'} border px-2.5 py-1.5 min-h-[44px] font-black text-[10px] sm:text-xs transition-all active:scale-95 tracking-wide flex items-center gap-1 disabled:opacity-50 shadow-lg rounded-lg touch-manipulation`;
                            };

                            const multiSelfBtnClass = isPotato
                                ? `bg-neutral-900 border ${isSelfAimed ? 'border-cyan-400 ring-2 ring-cyan-500/60 text-white' : 'border-stone-700 text-stone-300'} px-2.5 py-1.5 min-h-[44px] font-black text-[10px] sm:text-xs tracking-wide flex items-center gap-1 disabled:opacity-50 rounded-lg touch-manipulation`
                                : `${isSelfAimed ? 'bg-stone-800/95 border-cyan-400 ring-2 ring-cyan-500/60 text-white' : 'bg-black/80 border-stone-700 text-stone-300 hover:bg-stone-800 hover:text-white'} border px-2.5 py-1.5 min-h-[44px] font-black text-[10px] sm:text-xs transition-all active:scale-95 tracking-wide flex items-center gap-1 disabled:opacity-50 shadow-lg rounded-lg touch-manipulation`;

                            return (
                                <div className={`grid grid-cols-3 ${isCompact ? 'gap-1.5 max-w-[330px]' : 'gap-3 max-w-md'} w-full justify-center items-center`}>
                                    {/* Row 1: Front Player */}
                                    <div className="col-start-2 flex justify-center min-w-0">
                                        {frontOpponent && (
                                            <button
                                                onClick={() => {
                                                    audioManager.playSound('click');
                                                    handleChooseOpponent('DEALER', 'OPPONENT', frontOpponent.id);
                                                }}
                                                disabled={isProcessing}
                                                onMouseEnter={() => !isMobileTouch && !isProcessing && onHoverTarget('OPPONENT', frontOpponent.id)}
                                                onMouseLeave={() => !isMobileTouch && !isProcessing && onHoverTarget('CHOOSING')}
                                                className={`${getMultiOppBtnClass('OPPONENT')} w-full justify-center`}
                                            >
                                                <Target size={13} className="shrink-0" />
                                                <span className="truncate">{frontOpponent.name.toUpperCase()}</span>
                                            </button>
                                        )}
                                    </div>

                                    {/* Row 2: Left Player, Self, Right Player */}
                                    <div className="col-start-1 row-start-2 flex justify-center min-w-0">
                                        {((size === 4 && leftOpponent) || (size === 3 && sidePos === 'left' && sideOpponent)) && (
                                            <button
                                                onClick={() => {
                                                    audioManager.playSound('click');
                                                    handleChooseOpponent('PLAYER3', 'LEFT', (size === 4 ? leftOpponent! : sideOpponent).id);
                                                }}
                                                disabled={isProcessing}
                                                onMouseEnter={() => !isMobileTouch && !isProcessing && onHoverTarget('LEFT', (size === 4 ? leftOpponent! : sideOpponent).id)}
                                                onMouseLeave={() => !isMobileTouch && !isProcessing && onHoverTarget('CHOOSING')}
                                                className={`${getMultiOppBtnClass('LEFT')} w-full justify-center`}
                                            >
                                                <Target size={13} className="shrink-0" />
                                                <span className="truncate">{(size === 4 ? leftOpponent! : sideOpponent).name.toUpperCase()}</span>
                                            </button>
                                        )}
                                    </div>

                                    <div className="col-start-2 row-start-2 flex justify-center min-w-0">
                                        <button
                                            onClick={() => {
                                                audioManager.playSound('click');
                                                handleChooseSelf();
                                            }}
                                            disabled={isProcessing}
                                            onMouseEnter={() => !isMobileTouch && !isProcessing && onHoverTarget('SELF')}
                                            onMouseLeave={() => !isMobileTouch && !isProcessing && onHoverTarget('CHOOSING')}
                                            className={`${multiSelfBtnClass} w-full justify-center`}
                                        >
                                            <User size={13} className="shrink-0" />
                                            <span>SELF</span>
                                        </button>
                                    </div>

                                    <div className="col-start-3 row-start-2 flex justify-center min-w-0">
                                        {((size === 4 && rightOpponent) || (size === 3 && sidePos === 'right' && sideOpponent)) && (
                                            <button
                                                onClick={() => {
                                                    audioManager.playSound('click');
                                                    handleChooseOpponent(size === 4 ? 'PLAYER4' : 'PLAYER3', 'RIGHT', (size === 4 ? rightOpponent! : sideOpponent).id);
                                                }}
                                                disabled={isProcessing}
                                                onMouseEnter={() => !isMobileTouch && !isProcessing && onHoverTarget('RIGHT', (size === 4 ? rightOpponent! : sideOpponent).id)}
                                                onMouseLeave={() => !isMobileTouch && !isProcessing && onHoverTarget('CHOOSING')}
                                                className={`${getMultiOppBtnClass('RIGHT')} w-full justify-center`}
                                            >
                                                <Target size={13} className="shrink-0" />
                                                <span className="truncate">{(size === 4 ? rightOpponent! : sideOpponent).name.toUpperCase()}</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })() : (
                            <>
                                {isMultiplayer && mpOpponents.length > 0 ? (
                                    mpOpponents.map((opp) => {
                                        const oppBtnClass = isCompact
                                            ? (isPotato
                                                ? `bg-neutral-900 border ${isOppAimed ? 'border-red-400 ring-2 ring-red-500/70 text-white' : 'border-red-800 text-red-400'} px-3.5 py-2 min-h-[44px] rounded-xl font-black text-[11px] tracking-wide flex items-center gap-1.5 disabled:opacity-50 touch-manipulation`
                                                : `${isOppAimed ? 'bg-red-900/85 border-red-400 ring-2 ring-red-500/70 text-white' : 'bg-black/75 border-red-700/80 text-red-300 hover:bg-red-900 hover:text-white'} backdrop-blur-md border px-3.5 py-2 min-h-[44px] rounded-xl font-black text-[11px] transition-all active:scale-95 tracking-wide flex items-center gap-1.5 disabled:opacity-50 touch-manipulation`)
                                            : (isPotato
                                                ? "bg-neutral-900 border border-red-800 px-5 py-3 lg:px-6 lg:py-4 min-h-[48px] text-red-400 font-black text-xs lg:text-lg hover:bg-neutral-850 hover:text-white tracking-wide flex items-center gap-1 lg:gap-2 disabled:opacity-50 touch-manipulation"
                                                : `bg-black/90 border border-red-800 px-5 py-3 lg:px-6 lg:py-4 min-h-[48px] text-red-400 font-black text-xs lg:text-lg hover:bg-red-900 hover:text-white transition-all active:scale-95 tracking-wide flex items-center gap-1 lg:gap-2 disabled:opacity-50 touch-manipulation ${isBalanced ? '' : 'shadow-lg'}`);
                                        return (
                                            <button
                                                key={opp.id}
                                                onClick={() => {
                                                    audioManager.playSound('click');
                                                    handleShootOpponent(opp.id);
                                                }}
                                                disabled={isProcessing}
                                                onMouseEnter={() => window.matchMedia('(hover: hover)').matches && !isProcessing && onHoverTarget('OPPONENT', opp.id)}
                                                onMouseLeave={() => window.matchMedia('(hover: hover)').matches && !isProcessing && onHoverTarget('CHOOSING')}
                                                className={oppBtnClass}
                                            >
                                                <Target size={isCompact ? 15 : 18} className="lg:w-5 lg:h-5 shrink-0" />
                                                <span className="truncate max-w-[120px]">{isOppAimed ? `FIRE: ${opp.name}` : opp.name}</span>
                                            </button>
                                        );
                                    })
                                ) : (
                                    <button
                                        onClick={() => {
                                            audioManager.playSound('click');
                                            handleShootOpponent();
                                        }}
                                        disabled={isProcessing}
                                        onMouseEnter={() => window.matchMedia('(hover: hover)').matches && !isProcessing && onHoverTarget('OPPONENT')}
                                        onMouseLeave={() => window.matchMedia('(hover: hover)').matches && !isProcessing && onHoverTarget('CHOOSING')}
                                        className={isCompact
                                            ? (isPotato
                                                ? `bg-neutral-900 border ${isOppAimed ? 'border-red-400 ring-2 ring-red-500/70 text-white' : 'border-red-800 text-red-400'} px-3.5 py-2 min-h-[44px] rounded-xl font-black text-[11px] tracking-wide flex items-center gap-1.5 disabled:opacity-50 touch-manipulation whitespace-nowrap`
                                                : `${isOppAimed ? 'bg-red-900/85 border-red-400 ring-2 ring-red-500/70 text-white' : 'bg-black/75 border-red-700/80 text-red-300 hover:bg-red-900 hover:text-white'} backdrop-blur-md border px-3.5 py-2 min-h-[44px] rounded-xl font-black text-[11px] transition-all active:scale-95 tracking-wide flex items-center gap-1.5 disabled:opacity-50 touch-manipulation whitespace-nowrap`)
                                            : (isPotato
                                                ? "bg-neutral-900 border border-red-800 px-5 py-3 lg:px-8 lg:py-5 min-h-[48px] text-red-400 font-black text-xs lg:text-xl hover:bg-neutral-850 hover:text-white tracking-wide flex items-center gap-2 disabled:opacity-50 touch-manipulation"
                                                : `bg-black/90 border border-red-800 px-5 py-3 lg:px-8 lg:py-5 min-h-[48px] text-red-400 font-black text-xs lg:text-xl hover:bg-red-900 hover:text-white transition-all active:scale-95 tracking-wide flex items-center gap-2 disabled:opacity-50 touch-manipulation ${isBalanced ? '' : 'shadow-lg'}`)
                                        }
                                    >
                                        <Target size={isCompact ? 15 : 18} className="lg:w-6 lg:h-6 shrink-0" />
                                        <span className="truncate max-w-[220px] sm:max-w-[320px]">
                                            {isOppAimed
                                                ? 'CONFIRM FIRE'
                                                : isLocalSplit && targetOpponentName
                                                    ? `SHOOT ${targetOpponentName.toUpperCase()}`
                                                    : (isMultiplayer ? 'SHOOT OPPONENT' : 'SHOOT DEALER')}
                                        </span>
                                    </button>
                                )}

                                <button
                                    onClick={() => {
                                        audioManager.playSound('click');
                                        handleShootSelf();
                                    }}
                                    disabled={isProcessing}
                                    onMouseEnter={() => window.matchMedia('(hover: hover)').matches && !isProcessing && onHoverTarget('SELF', mpMyPlayerId || undefined)}
                                    onMouseLeave={() => window.matchMedia('(hover: hover)').matches && !isProcessing && onHoverTarget('CHOOSING')}
                                    className={isCompact
                                        ? (isPotato
                                            ? `bg-neutral-900 border ${isSelfAimed ? 'border-cyan-400 ring-2 ring-cyan-500/60 text-white' : 'border-stone-700 text-stone-200'} px-3.5 py-2 min-h-[44px] rounded-xl font-black text-[11px] tracking-wide flex items-center gap-1.5 disabled:opacity-50 touch-manipulation whitespace-nowrap`
                                            : `${isSelfAimed ? 'bg-stone-800/90 border-cyan-400 ring-2 ring-cyan-500/60 text-white' : 'bg-black/75 border-stone-500/70 text-stone-200 hover:bg-stone-800 hover:text-white'} backdrop-blur-md border px-3.5 py-2 min-h-[44px] rounded-xl font-black text-[11px] transition-all active:scale-95 tracking-wide flex items-center gap-1.5 disabled:opacity-50 touch-manipulation whitespace-nowrap`)
                                        : (isPotato
                                            ? "bg-neutral-900 border border-stone-850 px-5 py-3 lg:px-8 lg:py-5 min-h-[48px] text-stone-300 font-black text-xs lg:text-xl hover:bg-neutral-850 hover:text-white tracking-wide flex items-center gap-2 disabled:opacity-50 touch-manipulation"
                                            : `bg-black/90 border border-stone-700 px-5 py-3 lg:px-8 lg:py-5 min-h-[48px] text-stone-300 font-black text-xs lg:text-xl hover:bg-stone-800 hover:text-white transition-all active:scale-95 tracking-wide flex items-center gap-2 disabled:opacity-50 touch-manipulation ${isBalanced ? '' : 'shadow-lg'}`)
                                    }
                                >
                                    <User size={isCompact ? 15 : 18} className="lg:w-6 lg:h-6 shrink-0" />
                                    {isSelfAimed ? 'CONFIRM SELF' : 'SHOOT SELF'}
                                </button>
                            </>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export const Controls = React.memo(ControlsComponent);