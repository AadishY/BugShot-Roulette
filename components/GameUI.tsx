import React, { useEffect, useState, useRef } from 'react';
import { GameState, PlayerState, LogEntry, TurnOwner, ItemType, AimTarget, ShellType, CameraView, GameSettings, ChatMessage, LocalSplitConfig, isUltraPerf, isLowPerf } from '../types';
import { Settings as SettingsIcon, Skull, Send, Smile, Minimize2 } from 'lucide-react';
import { audioManager } from '../utils/audioManager';
import { StatusDisplay } from './ui/StatusDisplay';
import { Inventory } from './ui/Inventory';
import { Controls } from './ui/Controls';
import { BootScreen } from './ui/BootScreen';
import { IntroScreen } from './ui/IntroScreen';
import ShellBackground from './ui/ShellBackground';
import { LinkPreviewCard } from './ui/LinkPreviewCard';

import { GameOverScreen } from './ui/GameOverScreen';
import { LootOverlay } from './ui/LootOverlay';
import { Icons } from './ui/Icons';
import { ITEM_DESCRIPTIONS } from '../constants';

interface GameUIProps {
    gameState: GameState;
    player: PlayerState;
    dealer: PlayerState;
    player3?: PlayerState;
    player4?: PlayerState;
    logs: LogEntry[];
    overlayText: string | null;
    overlayColor: 'none' | 'red' | 'green' | 'scan';
    showBlood: boolean;
    showFlash: boolean;
    showFlashbang?: boolean; // Added for flashbang white-out
    showLootOverlay: boolean;
    triggerHeal: number;
    triggerDrink: number;
    knownShell: ShellType | null;
    receivedItems: ItemType[];
    opponentReceivedItems?: ItemType[];
    playerName: string;
    cameraView: CameraView;
    aimTarget?: AimTarget; // Added for controls logic
    isProcessing: boolean;
    isRecovering?: boolean; // Added for blocking gun pickup during recovery
    settings: GameSettings;
    onStartGame: (name: string, hardMode?: boolean) => void;
    onResetGame: (toMenu: boolean) => void;
    onFireShot: (target: TurnOwner, targetId?: string) => void;
    onUseItem: (index: number, targetPlayerId?: string) => void;
    onHoverTarget: (target: AimTarget, targetId?: string) => void;
    onPickupGun: () => void;
    onOpenSettings: () => void;
    onOpenGuide: () => void;
    onOpenScoreboard: () => void;
    onUpdateName?: (name: string) => void;
    onStealItem?: (index: number) => void;
    onBootComplete?: () => void;
    onStartMultiplayer?: (name: string) => void;
    onStartLocalSplit?: (config: LocalSplitConfig) => void;
    matchData?: any;
    isMultiplayer?: boolean;
    messages?: ChatMessage[];
    onSendMessage?: (text: string) => void;
    mpGameState?: any;
    mpMyPlayerId?: string | null;
    stickers?: string[];
    hideIntro?: boolean;
    isMenuLaunching?: boolean;
}

const RenderColoredText = ({ text }: { text: string }) => {
    if (!text) return null;
    const parts = text.split(/(LIVE|BLANK)/g);
    return (
        <>
            {parts.map((part, i) => {
                if (part === 'LIVE') return <span key={i} className="text-red-600 animate-pulse font-black">{part}</span>;
                if (part === 'BLANK') return <span key={i} className="text-blue-500 font-black">{part}</span>;
                return <span key={i}>{part}</span>;
            })}
        </>
    );
};

export const GameUI: React.FC<GameUIProps> = ({
    gameState,
    player,
    dealer,
    logs,
    overlayText,
    overlayColor,
    showFlash,
    showBlood,
    showFlashbang = false,
    showLootOverlay,
    triggerHeal,
    triggerDrink,
    knownShell,
    receivedItems,
    opponentReceivedItems = [],
    playerName,
    cameraView,
    aimTarget = 'IDLE',
    isProcessing,
    settings,
    onStartGame,
    onResetGame,
    onFireShot,
    onUseItem,
    onHoverTarget,
    onPickupGun,
    onOpenSettings,
    onOpenGuide,
    onOpenScoreboard,
    onUpdateName,
    onStealItem,
    onBootComplete,
    isRecovering = false,
    matchData,
    onStartMultiplayer,
    onStartLocalSplit,
    isMultiplayer = false,
    messages = [],
    onSendMessage,
    mpGameState,
    mpMyPlayerId,
    stickers = [],
    player3,
    player4,
    hideIntro = false,
    isMenuLaunching = false
}) => {
    const isLowGraphics = isLowPerf(settings) || isUltraPerf(settings);
    const [inputName, setInputName] = useState(playerName || '');
    const [isChatMinimized, setIsChatMinimized] = useState(true);
    const [unreadCount, setUnreadCount] = useState(0);
    const [pendingItemIndex, setPendingItemIndex] = useState<number | null>(null);
    const [showChatPreview, setShowChatPreview] = useState(false);
    const [chatPreviewMessages, setChatPreviewMessages] = useState<ChatMessage[]>([]);
    const [chatDraft, setChatDraft] = useState('');
    const prevMsgLength = useRef(messages.length);
    const fullscreenRequestedRef = useRef(false);
    const chatPreviewTimeoutRef = useRef<number | null>(null);

    const [isStickersOpen, setIsStickersOpen] = useState(false);
    const [activeStickers, setActiveStickers] = useState<{ id: string; sender: string; color: string; filename: string }[]>([]);
    const lastStickerMsgIndex = useRef(-1);
    const stickerTimeoutsRef = useRef<Record<string, number>>({});

    const getOpponentName = () => {
        if (!mpGameState) return 'DEALER';
        const opp = mpGameState.players.find((p: any) => p.id !== mpMyPlayerId);
        return opp ? opp.name : 'DEALER';
    };

    // Cleanup active timer references on unmount
    useEffect(() => {
        return () => {
            if (chatPreviewTimeoutRef.current) {
                window.clearTimeout(chatPreviewTimeoutRef.current);
                chatPreviewTimeoutRef.current = null;
            }
        };
    }, []);

    // Sticker message listeners (displays transparently on left side, fades after 8s, max 3 limit)
    useEffect(() => {
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (msg.text && msg.text.startsWith('[STICKER]:') && i > lastStickerMsgIndex.current) {
                lastStickerMsgIndex.current = i;
                const filename = msg.text.split(':')[1];
                const id = `${msg.timestamp || Date.now()}-${i}-${Math.random()}`;
                setActiveStickers(prev => {
                    const merged = [...prev, { id, sender: msg.sender, color: msg.color || '#fff', filename }];
                    return merged.slice(-3);
                });

                stickerTimeoutsRef.current[id] = window.setTimeout(() => {
                    setActiveStickers(prev => prev.filter(s => s.id !== id));
                    delete stickerTimeoutsRef.current[id];
                }, 8000);
            }
        }
    }, [messages]);

    useEffect(() => {
        return () => {
            Object.values(stickerTimeoutsRef.current).forEach(window.clearTimeout);
            stickerTimeoutsRef.current = {};
            if (chatPreviewTimeoutRef.current) {
                window.clearTimeout(chatPreviewTimeoutRef.current);
                chatPreviewTimeoutRef.current = null;
            }
        };
    }, []);

    const resetChatPreviewTimer = (previewMessages: ChatMessage[]) => {
        setChatPreviewMessages(previewMessages.slice(-5));
        setShowChatPreview(true);
        if (chatPreviewTimeoutRef.current) {
            window.clearTimeout(chatPreviewTimeoutRef.current);
        }
        chatPreviewTimeoutRef.current = window.setTimeout(() => {
            setShowChatPreview(false);
            chatPreviewTimeoutRef.current = null;
        }, 30000);
    };

    useEffect(() => {
        if (!isChatMinimized) {
            prevMsgLength.current = messages.length;
            return;
        }

        const newMsgs = messages.slice(prevMsgLength.current).filter(m => m.sender !== 'SYSTEM' && m.text && !m.text.startsWith('SYSTEM:') && !m.text.startsWith('[STICKER]:'));
        if (newMsgs.length > 0) {
            setUnreadCount(prev => prev + newMsgs.length);
            resetChatPreviewTimer(newMsgs);
        }
        prevMsgLength.current = messages.length;
    }, [messages, isChatMinimized]);

    useEffect(() => {
        if (isChatMinimized && messages.length > 0) {
            const recent = messages.filter(m => m.sender !== 'SYSTEM' && m.text && !m.text.startsWith('SYSTEM:') && !m.text.startsWith('[STICKER]:')).slice(-5);
            if (recent.length > 0) {
                resetChatPreviewTimer(recent);
            }
        }
    }, [isChatMinimized]);

    useEffect(() => {
        if (!isChatMinimized) {
            setUnreadCount(0);
            setShowChatPreview(false);
            if (chatPreviewTimeoutRef.current) {
                window.clearTimeout(chatPreviewTimeoutRef.current);
                chatPreviewTimeoutRef.current = null;
            }
        }
    }, [isChatMinimized]);

    useEffect(() => {
        return () => {
            if (chatPreviewTimeoutRef.current) {
                clearTimeout(chatPreviewTimeoutRef.current);
                chatPreviewTimeoutRef.current = null;
            }
        };
    }, []);

    useEffect(() => { if (playerName) setInputName(playerName); }, [playerName]);

    const chatScrollRef = React.useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!isChatMinimized && chatScrollRef.current) {
            chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
    }, [messages, isChatMinimized]);

    const handleStartGame = (hardMode?: boolean) => {
        if (inputName.trim()) {
            if (onUpdateName) onUpdateName(inputName.trim());

            if (!fullscreenRequestedRef.current && document.documentElement?.requestFullscreen) {
                fullscreenRequestedRef.current = true;
                const requestFullscreen = async () => {
                    try {
                        if (!document.fullscreenElement) {
                            await document.documentElement.requestFullscreen({ navigationUI: 'hide' } as any).catch(() => {});
                        }
                        if (settings?.orientationMode === 'vertical' || document.documentElement.classList.contains('force-vertical')) {
                            await (screen as any)?.orientation?.lock?.('portrait')?.catch(() => {});
                        }
                    } catch (e) {}
                };

                if (typeof window !== 'undefined') {
                    window.setTimeout(requestFullscreen, 80);
                } else {
                    requestFullscreen();
                }
            }

            onStartGame(inputName.trim(), hardMode);
        }
    };


    const [smokeActive, setSmokeActive] = useState(false);
    useEffect(() => {
        if (triggerHeal > 0) {
            setSmokeActive(true);
            const timer = window.setTimeout(() => setSmokeActive(false), 2000);
            return () => window.clearTimeout(timer);
        }
    }, [triggerHeal]);

    const [drinkActive, setDrinkActive] = useState(false);
    useEffect(() => {
        if (triggerDrink > 0) {
            setDrinkActive(true);
            const timer = window.setTimeout(() => setDrinkActive(false), 1500);
            return () => window.clearTimeout(timer);
        }
    }, [triggerDrink]);

    // Keyboard navigation: Escape key dismisses sticker drawers or open chat
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isStickersOpen) {
                    setIsStickersOpen(false);
                } else if (!isChatMinimized) {
                    setIsChatMinimized(true);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isStickersOpen, isChatMinimized]);

    const isSplitMode = Boolean(gameState.isLocalSplit);
    const isSplitP2Turn = isSplitMode && gameState.turnOwner === 'DEALER';
    const p1Label = isSplitMode ? (gameState.player1Name || playerName || 'PLAYER 1') : (playerName || 'OPERATOR');
    const p2Label = (isMultiplayer || isSplitMode) ? (gameState.opponentName || getOpponentName()) : 'DEALER';
    const activePlayerState = isSplitP2Turn ? dealer : player;
    const activeOpponentState = isSplitP2Turn ? player : dealer;
    const activePlayerName = isSplitP2Turn ? p2Label : p1Label;
    const targetOpponentName = isSplitP2Turn ? p1Label : p2Label;

    const isGunHeld = cameraView === 'GUN' || cameraView === 'PLAYER3_GUN' || cameraView === 'DEALER_GUN' || aimTarget === 'CHOOSING' || aimTarget === 'OPPONENT' || aimTarget === 'SELF' || aimTarget === 'LEFT' || aimTarget === 'RIGHT';
    const isMyTurn = (gameState.turnOwner === 'PLAYER' && (gameState.phase === 'PLAYER_TURN' || gameState.phase === 'LOOTING'))
        || (isSplitMode && gameState.turnOwner === 'DEALER' && (gameState.phase === 'DEALER_TURN' || gameState.phase === 'LOOTING'));

    // Robust UI Scaling: Scale the UI container while keeping it centered and contained
    const [screenSize, setScreenSize] = useState({ w: window.innerWidth, h: window.innerHeight });
    useEffect(() => {
        const handleResize = () => setScreenSize({ w: window.innerWidth, h: window.innerHeight });
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const isPortraitLayout = screenSize.h > screenSize.w;
    const isVeryNarrow = screenSize.w < 380;
    const isPortraitMobile = screenSize.w < 768 || (isPortraitLayout && screenSize.w < 1024);
    const isLandscapeMobile = screenSize.h < 540 && screenSize.w > screenSize.h;
    const isCompactHUD = isPortraitMobile || isLandscapeMobile;

    // Calibrated HUD scale: on compact vertical & mobile viewports, keep HUD crisp and legible
    // with true 44px+ touch targets while preserving vertical 3D table visibility.
    const finalScale = settings.uiScale <= 0
        ? 0
        : isCompactHUD
            ? (isPortraitLayout && screenSize.w < 768
                ? Math.min(1.05, Math.max(0.84, settings.uiScale * (isVeryNarrow ? 1.72 : 1.85)))
                : Math.min(1.05, settings.uiScale * (isVeryNarrow ? 1.45 : (isLandscapeMobile ? 1.55 : 1.65))))
            : settings.uiScale;
    const showExternalSettingsButton = finalScale < 0.45;
    const isHudHidden = finalScale <= 0;

    const uiStyle = isHudHidden ? {
        opacity: 0,
        pointerEvents: 'none' as const,
    } : {
        transform: `scale(${finalScale})`,
        transformOrigin: 'center center',
        width: `${100 / finalScale}%`,
        height: `${100 / finalScale}%`,
        left: `${(100 - (100 / finalScale)) / 2}%`,
        top: `${(100 - (100 / finalScale)) / 2}%`,
    };

    return (
        <>
            {/* Falling Shells Background - Mounted only on INTRO and disabled on Low/Potato profiles for silky menu performance */}
            {!hideIntro && (gameState.phase === 'BOOT' || gameState.phase === 'INTRO') && (
                <div className="absolute inset-0 bg-black">
                    {gameState.phase === 'INTRO' && !isLowGraphics && (
                        <ShellBackground active={true} />
                    )}
                </div>
            )}

            {!hideIntro && gameState.phase === 'BOOT' && <BootScreen onContinue={onBootComplete} />}

            {/* FX Layers */}
            <div className={`absolute inset-0 pointer-events-none transition-colors duration-300 z-10 ${overlayColor === 'red' ? 'bg-red-900/40' : overlayColor === 'green' ? 'bg-green-900/20' : overlayColor === 'scan' ? 'bg-fuchsia-900/30 mix-blend-overlay' : ''}`} />

            {/* Cinematic Framing */}
            <div className={`fixed inset-0 pointer-events-none z-[100] ${(gameState.phase === 'RESOLVING' || gameState.phase === 'STEALING' || gameState.phase === 'LOOTING' || gameState.phase === 'GAME_OVER') ? 'letterbox-active' : ''}`}>
                <div className="letterbox-top" />
                <div className="letterbox-bottom" />
            </div>

            {/* Cinematic Vignette */}
            <div className="absolute inset-0 pointer-events-none z-10 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.6)_100%)] mix-blend-multiply" />

            {showFlash && <div className="absolute inset-0 z-50 flash-screen" />}
            {showFlashbang && <div className="absolute inset-0 z-50 flashbang-screen" />}
            {smokeActive && (
                <>
                    <div
                        className="absolute inset-x-0 bottom-0 z-30 pointer-events-none animate-[pulse_2s_ease-out]"
                        style={{
                            height: '72%',
                            clipPath: 'polygon(0 18%, 100% 18%, 100% 100%, 0 100%)',
                            background: 'linear-gradient(180deg, rgba(255,255,255,0.0) 0%, rgba(148,163,184,0.18) 40%, rgba(30,30,30,0.5) 70%, rgba(15,23,42,0.7) 100%)',
                            mixBlendMode: 'hard-light',
                            backdropFilter: isLowGraphics ? 'none' : 'blur(3px)'
                        }}
                    />
                    <div className="absolute top-[35%] left-1/2 -translate-x-1/2 z-40 pointer-events-none hud-hardware-accel animate-in fade-in zoom-in duration-300">
                        <div className="flex items-center gap-2 bg-emerald-955/90 border border-emerald-500/50 px-4 py-1.5 rounded-full shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                            <Icons.Cigs size={16} className="text-emerald-400" />
                            <span className="text-emerald-300 font-mono font-black text-xs md:text-sm tracking-wider uppercase">
                                +1 HP RECOVERED
                            </span>
                        </div>
                    </div>
                </>
            )}
            {drinkActive && (
                <>
                    <div className={`absolute inset-0 z-30 pointer-events-none ${isLowGraphics ? 'bg-amber-900/20' : 'bg-amber-600/15 backdrop-blur-[2px]'} animate-pulse`} />
                    <div className="absolute top-[35%] left-1/2 -translate-x-1/2 z-40 pointer-events-none hud-hardware-accel animate-in fade-in zoom-in duration-300">
                        <div className="flex items-center gap-2 bg-amber-955/90 border border-amber-500/50 px-4 py-1.5 rounded-full shadow-[0_0_20px_rgba(245,158,11,0.3)]">
                            <Icons.Beer size={16} className="text-amber-400" />
                            <span className="text-amber-300 font-mono font-black text-xs md:text-sm tracking-wider uppercase">
                                SHELL RACKED & EJECTED
                            </span>
                        </div>
                    </div>
                </>
            )}
            {showBlood && (
                <div className="absolute inset-0 pointer-events-none z-40 blood-overlay blood-active hud-hardware-accel">
                    <div className="absolute inset-0 opacity-40 bg-[url('https://www.transparenttextures.com/patterns/black-linen-2.png')] mix-blend-multiply" />
                </div>
            )}

            {/* Intro Screen - Kept outside of scaled HUD so HUD scale setting does not affect main menu */}
            {!hideIntro && gameState.phase === 'INTRO' && (
                <IntroScreen
                    playerName={playerName}
                    inputName={inputName}
                    setInputName={setInputName}
                    onStartGame={handleStartGame}
                    onOpenSettings={onOpenSettings}
                    onOpenGuide={onOpenGuide}
                    onOpenScoreboard={onOpenScoreboard}
                    onStartMultiplayer={onStartMultiplayer ?? (() => {})}
                    onStartLocalSplit={onStartLocalSplit}
                    isLaunching={isMenuLaunching}
                />
            )}

            {/* Scaled UI */}
            <div className={`absolute z-20 pointer-events-none hud-hardware-accel ${gameState.isHardMode ? 'vhs-flicker' : ''}`} style={uiStyle}>
                {/* Dynamic Scanline for Hard Mode */}
                {gameState.isHardMode && <div className="scan-line" />}

                {/* Known Shell - High-Impact Tactical Chamber HUD */}
                {knownShell && (
                    <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center px-3 hud-hardware-accel animate-in fade-in zoom-in-95 duration-200">
                        <div
                            className={`flex flex-col items-center justify-center max-w-[92vw] ${isCompactHUD ? 'px-4 py-3 rounded-2xl border-2' : 'px-6 py-4 md:px-12 md:py-7 border-2 md:border-4 rounded-2xl md:rounded-3xl'} shadow-2xl relative overflow-hidden ${
                                isLowGraphics ? 'bg-stone-900/95' : 'backdrop-blur-2xl'
                            } ${
                                knownShell === 'LIVE'
                                    ? 'bg-red-955/92 border-red-500/90 shadow-[0_0_60px_rgba(239,68,68,0.6)]'
                                    : 'bg-cyan-955/92 border-cyan-500/90 shadow-[0_0_60px_rgba(6,182,212,0.6)]'
                            }`}
                        >
                            {/* Cathode Scanline Pattern */}
                            <div className="absolute inset-0 bg-[linear-gradient(transparent_0%,rgba(255,255,255,0.06)_50%,transparent_100%)] bg-[length:100%_4px] pointer-events-none" />

                            <div className="flex items-center gap-2 mb-1 relative z-10">
                                <Icons.Shell
                                    size={isCompactHUD ? 16 : 20}
                                    className={`lg:w-7 lg:h-7 ${
                                        knownShell === 'LIVE'
                                            ? 'text-red-500 fill-red-500/40 animate-pulse'
                                            : 'text-cyan-400 fill-cyan-400/40 animate-pulse'
                                    }`}
                                />
                                <span
                                    className={`${isCompactHUD ? 'text-[8px] tracking-[0.2em]' : 'text-[9px] md:text-sm tracking-[0.3em]'} font-mono font-black uppercase ${
                                        knownShell === 'LIVE' ? 'text-red-400' : 'text-cyan-300'
                                    }`}
                                >
                                    BALLISTIC SCAN • CHAMBER VERIFIED
                                </span>
                            </div>

                            <div
                                className={`${isCompactHUD ? 'text-lg sm:text-2xl' : 'text-2xl sm:text-4xl lg:text-6xl'} font-black tracking-wider uppercase italic leading-none relative z-10 text-center ${
                                    knownShell === 'LIVE'
                                        ? 'text-red-400 drop-shadow-[0_0_25px_rgba(239,68,68,0.85)] animate-pulse'
                                        : 'text-cyan-300 drop-shadow-[0_0_25px_rgba(6,182,212,0.85)]'
                                }`}
                            >
                                {knownShell === 'LIVE' ? '⚠️ LIVE ROUND IN CHAMBER ⚠️' : '❄️ BLANK ROUND IN CHAMBER ❄️'}
                            </div>

                            <div className={`${isCompactHUD ? 'mt-1.5' : 'mt-2 md:mt-3'} flex items-center gap-2 relative z-10`}>
                                <div
                                    className={`h-[1px] w-8 sm:w-12 lg:w-24 ${
                                        knownShell === 'LIVE' ? 'bg-red-500/50' : 'bg-cyan-500/50'
                                    }`}
                                />
                                <span className="text-[7.5px] lg:text-[9.5px] font-mono tracking-widest text-stone-300 uppercase whitespace-nowrap">
                                    NEXT SHOT CONFIRMED
                                </span>
                                <div
                                    className={`h-[1px] w-8 sm:w-12 lg:w-24 ${
                                        knownShell === 'LIVE' ? 'bg-red-500/50' : 'bg-cyan-500/50'
                                    }`}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Cuffs Indicators */}
                {(player.isHandcuffed || dealer.isHandcuffed) && (
                    <div
                        className={`absolute ${
                            player.isHandcuffed
                                ? (isCompactHUD ? (isPortraitLayout ? 'bottom-[124px] left-2' : 'bottom-[110px] left-2') : 'bottom-[30%] left-4 md:left-[15%]')
                                : (isCompactHUD ? (isPortraitLayout ? 'top-[90px] right-2' : 'top-[54px] right-2') : 'top-[22%] right-4 md:right-[15%]')
                        } z-20 animate-pulse pointer-events-none hud-hardware-accel cuffs-indicator`}
                    >
                        <div className={`flex items-center gap-1.5 bg-red-955/95 border border-red-500 ${isCompactHUD ? 'px-2.5 py-1 text-[9px] rotate-2' : 'border-2 px-3 py-1.5 md:px-5 md:py-2 rotate-6 text-xs md:text-lg'} shadow-[0_0_30px_rgba(239,68,68,0.6)] rounded-xl text-red-200 font-mono font-black tracking-widest uppercase`}>
                            <Icons.Cuffs size={isCompactHUD ? 13 : 18} className="text-red-400 shrink-0 lg:w-5 lg:h-5 animate-pulse" />
                            <span>{isSplitMode ? `${(player.isHandcuffed ? p1Label : p2Label).toUpperCase()} RESTRAINED` : 'RESTRAINED: TURN LOCKED'}</span>
                        </div>
                    </div>
                )}

                {/* Cinematic Letterbox for Round Announcements */}
                {overlayText?.startsWith('ROUND') && !showLootOverlay && (
                    <>
                        <div className="fixed top-0 left-0 w-full h-[10dvh] bg-black z-[40] animate-in slide-in-from-top duration-1000 border-b border-white/5" />
                        <div className="fixed bottom-0 left-0 w-full h-[10dvh] bg-black z-[40] animate-in slide-in-from-bottom duration-1000 border-t border-white/5" />
                    </>
                )}

                {/* Overlay Text - Centered Announcements */}
                {overlayText && !showLootOverlay && (
                    <div className={`absolute inset-0 z-50 flex justify-center pointer-events-none px-3 hud-hardware-accel announcement-overlay ${
                        gameState.phase === 'CARD_SELECT' ? 'items-start pt-10 lg:pt-16' : 'items-center'
                    }`}>
                        {overlayText.startsWith('ROUND') || (overlayText.includes('LIVE') && overlayText.includes('|')) ? (
                            <div className="flex flex-col items-center">
                                {overlayText.startsWith('ROUND') ? (
                                    <div className="flex flex-col items-center gap-2 sm:gap-4 lg:gap-6 animate-in zoom-in-95 duration-1000 max-w-[95vw]">
                                        <div className="h-[2px] w-[min(280px,90vw)] lg:w-[800px] bg-gradient-to-r from-transparent via-white/60 to-transparent shadow-[0_0_20px_rgba(255,255,255,0.3)]" />
                                        <div className="relative group">
                                            <div className="absolute inset-0 blur-[100px] bg-white/20 animate-pulse" />
                                            <h1 className={`${isCompactHUD ? 'text-3xl sm:text-5xl tracking-[0.25em]' : 'text-4xl sm:text-6xl lg:text-9xl tracking-[0.3em] sm:tracking-[0.6em] lg:tracking-[1.2em]'} font-black text-white drop-shadow-[0_0_40px_rgba(255,255,255,0.5)] transition-all uppercase italic text-center select-none`}>
                                                {overlayText}
                                            </h1>
                                        </div>
                                        <div className="h-[2px] w-[min(280px,90vw)] lg:w-[800px] bg-gradient-to-r from-transparent via-white/60 to-transparent shadow-[0_0_20px_rgba(255,255,255,0.3)]" />
                                        <div className="flex flex-col items-center mt-1">
                                            <span className="text-[9px] sm:text-xs lg:text-sm font-black tracking-[0.35em] text-white/60 uppercase animate-pulse">Synchronizing Protocol</span>
                                            <div className="flex gap-1 mt-2 sm:mt-4">
                                                {[...Array(3)].map((_, i) => (
                                                    <div key={i} className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className={`flex flex-col items-center ${isCompactHUD ? 'gap-2 px-5 py-3.5 rounded-2xl' : 'gap-3 sm:gap-5 px-4 sm:px-12 lg:px-20 py-4 sm:py-8 lg:py-12 rounded-[1.5rem] sm:rounded-[2.5rem]'} ${isLowGraphics ? 'bg-stone-900/95' : 'bg-gradient-to-b from-stone-950/92 to-black/98 backdrop-blur-3xl'} border border-stone-850 shadow-[0_0_100px_rgba(0,0,0,0.95)] ring-1 ring-white/5 animate-in zoom-in-95 duration-1000 max-w-[94vw]`}>
                                        <div className={`flex items-center ${isCompactHUD ? 'gap-5 sm:gap-8' : 'gap-4 sm:gap-10 lg:gap-20'}`}>
                                            <div className="flex flex-col items-center group">
                                                <div className="flex items-center gap-2 sm:gap-3 lg:gap-5">
                                                    {/* Red Shell SVG */}
                                                    <svg className={`${isCompactHUD ? 'w-5 h-8' : 'w-6 h-9 sm:w-8 sm:h-12'} text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-pulse shrink-0`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M8 17h8v3a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-3z" fill="currentColor" fillOpacity="0.45" />
                                                        <rect x="8" y="3" width="8" height="14" rx="1" fill="currentColor" fillOpacity="0.15" />
                                                        <line x1="10" y1="7" x2="14" y2="7" />
                                                        <line x1="10" y1="11" x2="14" y2="11" />
                                                        <line x1="8" y1="17" x2="16" y2="17" />
                                                    </svg>
                                                    <div className="relative">
                                                        <div className="absolute inset-0 blur-3xl bg-red-600/30 group-hover:bg-red-600/50 transition-colors" />
                                                        <span className={`relative text-red-500 ${isCompactHUD ? 'text-4xl sm:text-5xl' : 'text-5xl sm:text-7xl lg:text-8xl'} font-black drop-shadow-[0_0_25px_rgba(239,68,68,0.75)] italic tracking-tighter transition-transform group-hover:scale-110 leading-none`}>
                                                            {overlayText.split('|')[0].trim().split(' ')[0]}
                                                        </span>
                                                    </div>
                                                </div>
                                                <span className="text-[9px] sm:text-xs font-black tracking-[0.25em] sm:tracking-[0.45em] text-red-400/90 uppercase mt-1.5 sm:mt-3">Live Shells</span>
                                            </div>
                                            
                                            <div className={`w-[1px] ${isCompactHUD ? 'h-12' : 'h-16 sm:h-24'} bg-gradient-to-b from-transparent via-stone-800 to-transparent`} />
                                            
                                            <div className="flex flex-col items-center group">
                                                <div className="flex items-center gap-2 sm:gap-3 lg:gap-5">
                                                    {/* Blue Shell SVG */}
                                                    <svg className={`${isCompactHUD ? 'w-5 h-8' : 'w-6 h-9 sm:w-8 sm:h-12'} text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.8)] animate-pulse shrink-0`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M8 17h8v3a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-3z" fill="currentColor" fillOpacity="0.45" />
                                                        <rect x="8" y="3" width="8" height="14" rx="1" fill="currentColor" fillOpacity="0.15" />
                                                        <line x1="10" y1="7" x2="14" y2="7" />
                                                        <line x1="10" y1="11" x2="14" y2="11" />
                                                        <line x1="8" y1="17" x2="16" y2="17" />
                                                    </svg>
                                                    <div className="relative">
                                                        <div className="absolute inset-0 blur-3xl bg-cyan-600/20 group-hover:bg-cyan-600/40 transition-colors" />
                                                        <span className={`relative text-cyan-400 ${isCompactHUD ? 'text-4xl sm:text-5xl' : 'text-5xl sm:text-7xl lg:text-8xl'} font-black drop-shadow-[0_0_25px_rgba(34,211,238,0.75)] italic tracking-tighter transition-transform group-hover:scale-110 leading-none`}>
                                                            {overlayText.split('|')[1].trim().split(' ')[0]}
                                                        </span>
                                                    </div>
                                                </div>
                                                <span className="text-[9px] sm:text-xs font-black tracking-[0.25em] sm:tracking-[0.45em] text-cyan-400/80 uppercase mt-1.5 sm:mt-3">Blanks</span>
                                            </div>
                                        </div>
                                        <div className="mt-1 flex flex-col items-center gap-1.5 sm:gap-3 w-full">
                                            <div className="h-[1px] w-40 sm:w-64 bg-gradient-to-r from-transparent via-stone-800 to-transparent" />
                                            <span className="text-[8px] sm:text-[9.5px] font-black tracking-[0.4em] sm:tracking-[0.8em] text-stone-400 uppercase flex items-center justify-center gap-2 select-none">
                                                <span className="w-1.5 h-1.5 bg-red-650 rounded-full animate-ping shrink-0" />
                                                <span>CHAMBER_SYNCHRONIZED</span>
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : overlayText.startsWith('DESTROYED_ITEM::') ? (
                            (() => {
                                const [_, itemType, ownerName, friendlyName] = overlayText.split('::');
                                const IconComponent = Icons[itemType as keyof typeof Icons] || Icons.Crusher;
                                return (
                                    <div className={`flex flex-col items-center text-center ${isLowGraphics ? 'bg-stone-900/95' : 'bg-black/95 backdrop-blur-xl'} px-6 sm:px-10 py-4 sm:py-6 border-2 border-red-500/50 rounded-2xl pop-in max-w-[90vw] sm:max-w-lg shadow-[0_0_60px_rgba(239,68,68,0.35)]`}>
                                        <div className="text-red-500 animate-pulse mb-2 drop-shadow-[0_0_15px_rgba(239,68,68,0.6)]">
                                            <IconComponent size={isCompactHUD ? 40 : 56} className="lg:w-16 lg:h-16" />
                                        </div>
                                        <div className="text-base sm:text-2xl lg:text-3xl font-black tracking-[0.2em] text-stone-100 drop-shadow-[0_0_20px_rgba(255,255,255,0.4)] uppercase italic leading-tight">
                                            ITEM CRUSHED
                                        </div>
                                        <div className="text-xs sm:text-sm lg:text-base font-bold tracking-[0.1em] text-stone-300 mt-1.5 uppercase not-italic">
                                            Destroyed {ownerName}&apos;s <span className="text-red-400 font-extrabold">{friendlyName}</span>!
                                        </div>
                                    </div>
                                );
                            })()
                        ) : overlayText.startsWith('📞') ? (
                            <div className={`flex flex-col items-center text-center ${isLowGraphics ? 'bg-stone-900/95' : 'bg-black/95 backdrop-blur-xl'} px-5 sm:px-10 py-3.5 sm:py-6 border-2 border-cyan-500/50 rounded-2xl pop-in max-w-[90vw] sm:max-w-lg shadow-[0_0_60px_rgba(6,182,212,0.35)] relative overflow-hidden`}>
                                <div className="absolute inset-0 bg-[linear-gradient(transparent_0%,rgba(6,182,212,0.04)_50%,transparent_100%)] bg-[length:100%_4px] pointer-events-none" />
                                <div className="flex items-center gap-2 text-cyan-400 font-mono text-[10px] sm:text-sm tracking-[0.25em] uppercase mb-1 relative z-10">
                                    <Icons.Phone size={16} className="animate-pulse" />
                                    <span>INTERCEPTED TRANSMISSION</span>
                                </div>
                                {/* Satellite audio signal waveform bars */}
                                <div className="flex items-center gap-1 my-1.5 relative z-10">
                                    {[10, 22, 8, 26, 16, 10, 24, 14, 28, 12, 20, 8].map((h, i) => (
                                        <div key={i} className="w-1 bg-cyan-400/80 rounded-full animate-pulse" style={{ height: `${isCompactHUD ? Math.round(h * 0.65) : h}px`, animationDelay: `${i * 0.08}s` }} />
                                    ))}
                                </div>
                                <div className="text-lg sm:text-3xl lg:text-4xl font-mono font-black tracking-wider text-white uppercase mt-1 relative z-10">
                                    <RenderColoredText text={overlayText.replace('📞', '').trim()} />
                                </div>
                                <div className="mt-2 flex items-center gap-2 text-[8px] sm:text-[9px] font-mono text-stone-400 tracking-widest uppercase relative z-10">
                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                                    <span>ENCRYPTED SATELLITE RELAY • 142.85 MHz</span>
                                </div>
                            </div>
                        ) : (
                            <div className={`relative ${isCompactHUD ? '-top-6 px-4 py-2.5' : '-top-16 md:-top-20 px-6 sm:px-10 py-3.5 sm:py-5'} flex flex-col items-center text-center max-w-[90vw] ${isLowGraphics ? 'bg-stone-900/95' : 'bg-black/90 backdrop-blur-xl'} border-y-2 border-stone-200/30 rounded-xl pop-in shadow-2xl`}>
                                {overlayText.includes('\n') ? (
                                    <>
                                        <div className={`${isCompactHUD ? 'text-sm sm:text-xl' : 'text-base sm:text-3xl lg:text-5xl'} font-black tracking-[0.18em] text-stone-100 drop-shadow-[0_0_20px_rgba(255,255,255,0.4)] uppercase italic`}>
                                            <RenderColoredText text={overlayText.split('\n')[0]} />
                                        </div>
                                        <div className={`${isCompactHUD ? 'text-[10px] sm:text-xs mt-1' : 'text-xs sm:text-sm lg:text-lg mt-2'} font-bold tracking-[0.15em] text-stone-400 uppercase not-italic`}>
                                            <RenderColoredText text={overlayText.split('\n')[1]} />
                                        </div>
                                    </>
                                ) : (
                                    <div className={`${isCompactHUD ? 'text-sm sm:text-xl' : 'text-base sm:text-3xl lg:text-5xl'} font-black tracking-[0.18em] text-stone-100 drop-shadow-[0_0_20px_rgba(255,255,255,0.4)] uppercase italic`}>
                                        <RenderColoredText text={overlayText} />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Main HUD */}
                {gameState.phase !== 'INTRO' && gameState.phase !== 'BOOT' && gameState.phase !== 'GAME_OVER' && !showLootOverlay && (
                    <div
                        className={`absolute inset-0 z-20 pb-0 flex flex-col justify-between pointer-events-none hud-hardware-accel ${isCompactHUD ? 'p-1' : 'p-2 lg:p-8 lg:pb-0'}`}
                        style={{
                            paddingTop: isCompactHUD ? 'max(env(safe-area-inset-top, 0px), 4px)' : 'max(env(safe-area-inset-top, 0px), 8px)',
                            paddingLeft: isCompactHUD ? 'max(env(safe-area-inset-left, 0px), 6px)' : 'max(env(safe-area-inset-left, 0px), 8px)',
                            paddingRight: isCompactHUD ? 'max(env(safe-area-inset-right, 0px), 6px)' : 'max(env(safe-area-inset-right, 0px), 8px)'
                        }}
                    >
                        
                        {gameState.phase === 'CARD_SELECT' && (
                            <div className={`absolute ${isCompactHUD ? 'top-[14%]' : 'top-[20%]'} left-1/2 transform -translate-x-1/2 z-30 flex flex-col items-center animate-in fade-in zoom-in duration-500 pointer-events-none px-2 w-max max-w-[92vw]`}>
                                <div className={`px-3.5 sm:px-6 ${isCompactHUD ? 'py-1' : 'py-2'} ${isLowGraphics ? 'bg-stone-900/95' : 'bg-black/85 backdrop-blur-md'} border border-purple-500/35 rounded-full shadow-[0_0_30px_rgba(168,85,247,0.2)] text-center`}>
                                    <span className={`${isCompactHUD ? 'text-[10px] tracking-[0.15em]' : 'text-[10px] sm:text-xs lg:text-xl tracking-[0.2em] sm:tracking-[0.3em]'} font-black uppercase text-purple-400 animate-pulse`}>
                                        {isSplitMode
                                            ? `🔮 ${activePlayerName.toUpperCase()}: SELECT A TAROT CARD 🔮`
                                            : (gameState.turnOwner === 'PLAYER' ? '🔮 SELECT A TAROT CARD 🔮' : `🔮 ${gameState.opponentName?.toUpperCase() || 'DEALER'} CHOOSING CARD... 🔮`)}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Top Bar */}
                        <div className={`flex justify-between items-start w-full ${isCompactHUD ? 'gap-1' : 'gap-2'}`}>
                            <StatusDisplay player={player} dealer={dealer} player3={player3} player4={player4} playerName={playerName} gameState={gameState} settings={settings} isCompact={isCompactHUD} isPortrait={isPortraitLayout} />
                            {!showExternalSettingsButton && (
                                <button
                                    onClick={() => {
                                        audioManager.playSound('click');
                                        onOpenSettings();
                                    }}
                                    className={`pointer-events-auto flex items-center justify-center text-stone-400 hover:text-white bg-black/45 hover:bg-black/65 rounded-xl border border-white/10 transition-colors shrink-0 touch-manipulation ${isCompactHUD ? 'w-11 h-11 min-w-[44px] min-h-[44px] p-1.5' : 'w-11 h-11 min-w-[44px] min-h-[44px] p-2'}`}
                                    title="Settings"
                                    aria-label="Settings"
                                >
                                    <SettingsIcon size={isCompactHUD ? 16 : 18} className="lg:w-5 lg:h-5 text-stone-300" />
                                </button>
                            )}
                        </div>

                        {/* Bottom UI Area - Vertically stacked Controls & Inventory */}
                        <div
                            className={`mt-auto w-full flex flex-col items-center pointer-events-none z-30 hud-hardware-accel ${isCompactHUD ? 'gap-1.5' : 'gap-2 lg:gap-4'}`}
                            style={{
                                paddingBottom: isCompactHUD ? 'max(env(safe-area-inset-bottom, 0px), 4px)' : 'max(env(safe-area-inset-bottom, 0px), 4px)'
                            }}
                        >
                            {/* Controls */}
                            {!settings?.experimentalDirectAim && gameState.phase !== 'STEALING' && gameState.phase !== 'CARD_SELECT' && isMyTurn && !showLootOverlay && (
                                <div className="pointer-events-none w-full max-w-full flex justify-center">
                                    <Controls
                                        isGunHeld={isGunHeld}
                                        isProcessing={isProcessing}
                                        isRecovering={isRecovering}
                                        onPickupGun={onPickupGun}
                                        onFireShot={onFireShot}
                                        onHoverTarget={onHoverTarget}
                                        currentAimTarget={aimTarget}
                                        isMultiplayer={isMultiplayer}
                                        isThreePlayer={gameState.isThreePlayer}
                                        isFourPlayer={gameState.isFourPlayer}
                                        mpGameState={mpGameState}
                                        mpMyPlayerId={mpMyPlayerId}
                                        settings={settings}
                                        isCompact={isCompactHUD}
                                        isLocalSplit={isSplitMode}
                                        activeTurnOwner={gameState.turnOwner}
                                        activePlayerName={activePlayerName}
                                        targetOpponentName={targetOpponentName}
                                    />
                                </div>
                            )}

                            {/* Inventory */}
                            <div className="pointer-events-none w-full max-w-full flex flex-col items-center min-w-0">
                                {isSplitMode && (
                                    <div className={`mb-1 px-2.5 py-0.5 rounded-full border text-[9px] font-mono font-black uppercase tracking-[0.2em] ${
                                        isSplitP2Turn
                                            ? 'bg-amber-950/70 border-amber-500/40 text-amber-300'
                                            : 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
                                    }`}>
                                        {activePlayerName.toUpperCase()}&apos;S LOADOUT
                                    </div>
                                )}
                                {gameState.phase === 'STEALING' && (gameState.turnOwner === 'PLAYER' || isSplitP2Turn) ? (
                                    <Inventory
                                        player={activeOpponentState}
                                        dealer={activePlayerState}
                                        gameState={gameState}
                                        cameraView={cameraView}
                                        isProcessing={false}
                                        onUseItem={(idx) => {
                                            audioManager.playSound('grab');
                                            if (onStealItem) onStealItem(idx);
                                        }}
                                        disabled={false}
                                        settings={settings}
                                        isCompact={isCompactHUD}
                                    />
                                ) : (
                                    <Inventory
                                        player={activePlayerState}
                                        dealer={activeOpponentState}
                                        gameState={gameState}
                                        cameraView={cameraView}
                                        isProcessing={isProcessing}
                                        onUseItem={(idx) => {
                                            audioManager.playSound('grab');
                                            const item = activePlayerState.items[idx];
                                            const targetedItems = ['CUFFS', 'ADRENALINE', 'CRUSHER', 'FLASHBANG'];
                                            if ((gameState.isThreePlayer || gameState.isFourPlayer) && targetedItems.includes(item)) {
                                                setPendingItemIndex(idx);
                                            } else {
                                                onUseItem(idx);
                                            }
                                        }}
                                        disabled={false}
                                        isGunHeld={isGunHeld}
                                        settings={settings}
                                        isCompact={isCompactHUD}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Game Over Screen - Rendered outside scaled HUD so it stays crisp and unaffected by HUD scale */}
            {gameState.phase === 'GAME_OVER' && (
                <GameOverScreen
                    winner={gameState.winner}
                    onResetGame={onResetGame}
                    matchData={matchData}
                    isDebugUsed={gameState.isDebugUsed}
                    isMultiplayer={isMultiplayer}
                    isThreeOrFourPlayerWin={gameState.winner === 'PLAYER' && (gameState.isThreePlayer || gameState.isFourPlayer)}
                    isLocalSplit={isSplitMode}
                    player1Name={p1Label}
                    player2Name={p2Label}
                    splitScore={gameState.multiModeState}
                    splitTotalMatches={gameState.localSplitConfig?.totalMatches}
                />
            )}

            {/* Global Stealing Screen Overlay - Priority Layer Outside UI Scale */}
            {gameState.phase === 'STEALING' && (gameState.turnOwner === 'PLAYER' || isSplitP2Turn) && (
                <div
                    className={`fixed inset-0 z-[150] h-[100dvh] flex flex-col items-center justify-start sm:justify-center ${isLowGraphics ? 'bg-stone-900/95' : 'bg-red-950/40 backdrop-blur-[16px]'} px-3 sm:px-6 pointer-events-auto animate-in fade-in duration-500 overflow-y-auto overflow-x-hidden hud-hardware-accel custom-scrollbar`}
                    style={{
                        paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
                        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
                        paddingLeft: 'max(env(safe-area-inset-left, 0px), 12px)',
                        paddingRight: 'max(env(safe-area-inset-right, 0px), 12px)'
                    }}
                >
                    {/* Atmospheric Overlays */}
                    <div className="fixed inset-0 opacity-20 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.3),transparent_70%)]" />
                    <div className="fixed inset-0 opacity-[0.05] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/black-linen-2.png')] animate-[pulse_4s_infinite]" />
                    <div className="fixed top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-600 to-transparent animate-[scanline_3s_linear_infinite] shadow-[0_0_20px_rgba(220,38,38,0.5)]" />

                    <div className="relative z-10 flex flex-col items-center max-w-5xl w-full my-auto py-2">
                        <div className="mb-4 sm:mb-10 text-center">
                            <h2 className="text-2xl sm:text-5xl lg:text-7xl font-black text-white tracking-[-0.04em] mb-1.5 sm:mb-3 uppercase drop-shadow-[0_0_40px_rgba(255,0,0,0.4)] italic">
                                Adrenaline <span className="text-red-700 animate-pulse">Extraction</span>
                            </h2>
                            <div className="flex flex-col items-center gap-1.5">
                                <p className="text-stone-400 font-bold tracking-[0.25em] sm:tracking-[0.5em] text-[8px] sm:text-xs uppercase bg-black/40 px-4 py-1 rounded-full border border-red-900/30">
                                    {isSplitMode ? `${activePlayerName.toUpperCase()} • Seize From ${targetOpponentName.toUpperCase()}` : 'Neural Link Active • Seize Repository'}
                                </p>
                            </div>
                        </div>

                        {/* Extraction Grid */}
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 sm:gap-5 w-full max-w-5xl mx-auto">
                            {(() => {
                                const targetItems = isSplitMode
                                    ? activeOpponentState.items
                                    : ((gameState.adrenalineTargetOwner === 'PLAYER3' && player3)
                                        ? player3.items
                                        : (gameState.adrenalineTargetOwner === 'PLAYER4' && player4)
                                            ? player4.items
                                            : dealer.items);

                                if (targetItems.length === 0) {
                                    return (
                                        <div className={`col-span-full py-10 sm:py-16 text-center ${isLowGraphics ? 'bg-stone-900/95' : 'bg-black/40 backdrop-blur-xl'} rounded-2xl sm:rounded-3xl border border-white/5 flex flex-col items-center px-4`}>
                                            <div className="mb-3 inline-block p-3 rounded-full bg-stone-900/60 border border-white/10">
                                                <Icons.Adrenaline size={36} className="text-stone-700 opacity-50 sm:w-12 sm:h-12" />
                                            </div>
                                            <p className="text-stone-500 font-black tracking-[0.3em] uppercase italic text-lg sm:text-2xl">Vault Empty</p>
                                            <p className="text-stone-600 text-xs sm:text-sm mt-1.5 font-bold tracking-widest uppercase px-4">Subject Has No Extractable Assets</p>
                                            <button
                                                type="button"
                                                onClick={() => onStealItem && onStealItem(-1)}
                                                className="mt-5 px-6 py-3 min-h-[44px] bg-red-950/80 hover:bg-red-900 border border-red-700/60 text-red-200 font-bold uppercase text-xs tracking-widest rounded-xl transition-all active:scale-95 cursor-pointer shadow-lg flex items-center justify-center touch-manipulation"
                                            >
                                                Return To Match
                                            </button>
                                        </div>
                                    );
                                }
                                return targetItems.map((item, idx) => {
                                    const isAdrenaline = item === 'ADRENALINE';
                                    const isTotemLocked = item === 'TOTEM';
                                    const isStealLocked = isAdrenaline || isTotemLocked;
                                    return (
                                        <button
                                            key={idx}
                                            onClick={() => !isStealLocked && onStealItem && onStealItem(idx)}
                                            onMouseEnter={() => !isStealLocked && audioManager.playSound('click')}
                                            disabled={isStealLocked}
                                            className={`group relative flex flex-col items-center justify-center aspect-square sm:aspect-[5/7] p-2 rounded-xl sm:rounded-2xl border transition-all duration-300 overflow-hidden ${isStealLocked
                                                ? 'bg-black/80 border-white/5 cursor-not-allowed grayscale-[0.8] opacity-60'
                                                : 'bg-stone-900/65 border-white/10 hover:border-red-500 hover:bg-red-500/10 hover:shadow-[0_0_40px_rgba(239,68,68,0.2)] sm:hover:-translate-y-2 active:scale-95'
                                                }`}
                                        >
                                            {/* Scanline effect for grid items */}
                                            <div className="absolute inset-0 bg-[linear-gradient(transparent_0%,rgba(255,255,255,0.03)_50%,transparent_100%)] bg-[length:100%_4px] pointer-events-none" />

                                            {/* Card BG Deco */}
                                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-[radial-gradient(circle_at_center,rgba(255,100,100,0.1),transparent_70%)]" />

                                            {isStealLocked ? (
                                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 z-20">
                                                    {item === 'ADRENALINE' ? (
                                                        <Icons.Adrenaline className="w-8 h-8 sm:w-12 sm:h-12 text-stone-700 mb-1.5 opacity-30" />
                                                    ) : (
                                                        <Icons.Totem className="w-8 h-8 sm:w-12 sm:h-12 text-stone-700 mb-1.5 opacity-30" />
                                                    )}
                                                    <span className="text-[9px] sm:text-[10px] font-black tracking-widest text-red-900 border border-red-900/40 px-1.5 py-0.5 rounded bg-black/80 rotate-12">LOCKED</span>
                                                </div>
                                            ) : (
                                                <div className="relative z-10 flex flex-col items-center w-full">
                                                    <div className={`mb-1.5 sm:mb-3 transition-all duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] ${item === 'BEER' ? 'text-amber-500' :
                                                        item === 'CIGS' ? 'text-red-500' :
                                                            item === 'GLASS' ? 'text-cyan-400' :
                                                                item === 'CUFFS' ? 'text-stone-300' :
                                                                    item === 'SAW' ? 'text-orange-600' :
                                                                        item === 'PHONE' ? 'text-blue-300' :
                                                                            item === 'INVERTER' ? 'text-green-400' :
                                                                                item === 'CHOKE' ? 'text-stone-300' :
                                                                                    item === 'REMOTE' ? 'text-red-500' :
                                                                                        item === 'BIG_INVERTER' ? 'text-orange-500' :
                                                                                            item === 'CONTRACT' ? 'text-red-700' :
                                                                                                item === 'LUCKYCHARM' ? 'text-emerald-500' :
                                                                                                    item === 'FLASHBANG' ? 'text-zinc-300' :
                                                                                                        item === 'CRUSHER' ? 'text-amber-600' :
                                                                                                            (item as ItemType) === 'TOTEM' ? 'text-amber-400' :
                                                                                                                item === 'MIRROR' ? 'text-indigo-400' :
                                                                                                                    item === 'DECK_CARD' ? 'text-purple-400' :
                                                                                                                        item === 'JACKPOT' ? 'text-yellow-400' : 'text-stone-300'
                                                        }`}>
                                                        {item === 'BEER' && <Icons.Beer className="w-8 h-8 sm:w-12 sm:h-12" />}
                                                        {item === 'CIGS' && <Icons.Cigs className="w-8 h-8 sm:w-12 sm:h-12" />}
                                                        {item === 'GLASS' && <Icons.Glass className="w-8 h-8 sm:w-12 sm:h-12" />}
                                                        {item === 'CUFFS' && <Icons.Cuffs className="w-8 h-8 sm:w-12 sm:h-12" />}
                                                        {item === 'SAW' && <Icons.Saw className="w-8 h-8 sm:w-12 sm:h-12" />}
                                                        {item === 'PHONE' && <Icons.Phone className="w-8 h-8 sm:w-12 sm:h-12" />}
                                                        {item === 'INVERTER' && <Icons.Inverter className="w-8 h-8 sm:w-12 sm:h-12" />}
                                                        {item === 'CHOKE' && <Icons.Choke className="w-8 h-8 sm:w-12 sm:h-12" />}
                                                        {item === 'REMOTE' && <Icons.Remote className="w-8 h-8 sm:w-12 sm:h-12" />}
                                                        {item === 'BIG_INVERTER' && <Icons.BigInverter className="w-8 h-8 sm:w-12 sm:h-12" />}
                                                        {item === 'CONTRACT' && <Icons.Contract className="w-8 h-8 sm:w-12 sm:h-12" />}
                                                        {item === 'LUCKYCHARM' && <Icons.Luckycharm className="w-8 h-8 sm:w-12 sm:h-12" />}
                                                        {item === 'FLASHBANG' && <Icons.Flashbang className="w-8 h-8 sm:w-12 sm:h-12" />}
                                                        {item === 'CRUSHER' && <Icons.Crusher className="w-8 h-8 sm:w-12 sm:h-12" />}
                                                        {(item as ItemType) === 'TOTEM' && <Icons.Totem className="w-8 h-8 sm:w-12 sm:h-12" />}
                                                        {item === 'MIRROR' && <Icons.Mirror className="w-8 h-8 sm:w-12 sm:h-12" />}
                                                        {item === 'DECK_CARD' && <Icons.DeckCard className="w-8 h-8 sm:w-12 sm:h-12" />}
                                                        {item === 'JACKPOT' && <Icons.Jackpot className="w-8 h-8 sm:w-12 sm:h-12" />}
                                                    </div>
                                                    <span className="text-[9px] sm:text-xs font-black text-stone-200 tracking-[0.12em] uppercase group-hover:text-white transition-colors truncate w-full px-1">
                                                        {item.replace('_', ' ')}
                                                    </span>
                                                    <span className="hidden sm:line-clamp-2 text-[8.5px] text-stone-400 font-bold uppercase tracking-wider text-center mt-1 px-2 group-hover:text-white/85 transition-colors leading-tight select-none">
                                                        {ITEM_DESCRIPTIONS[item]}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Hover Overlay info */}
                                            {!isStealLocked && (
                                                <div className="hidden sm:flex absolute bottom-0 left-0 w-full h-1/4 bg-red-600 items-center justify-center translate-y-full group-hover:translate-y-0 transition-all duration-300">
                                                    <span className="text-[10px] font-black text-white tracking-[0.4em] uppercase">EXTRACT</span>
                                                </div>
                                            )}

                                            {/* Active pulse dot */}
                                            {!isStealLocked && (
                                                <div className="absolute top-2 right-2 sm:top-3 sm:right-3 opacity-30 group-hover:opacity-100 transition-opacity">
                                                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-red-500 rounded-full animate-ping" />
                                                </div>
                                            )}
                                        </button>
                                    );
                                });
                            })()}
                        </div>

                        <div className="mt-4 sm:mt-8 flex flex-col items-center gap-3">
                            <button
                                type="button"
                                onClick={() => onStealItem && onStealItem(-1)}
                                className="px-6 py-2.5 min-h-[44px] bg-stone-900/80 hover:bg-red-950/60 border border-stone-750 hover:border-red-700/50 text-stone-300 hover:text-red-200 font-bold uppercase text-xs tracking-widest rounded-xl transition-all active:scale-95 cursor-pointer shadow-md flex items-center justify-center touch-manipulation"
                            >
                                Cancel Extraction
                            </button>
                            <div className="hidden sm:flex text-stone-600 text-[10px] font-bold tracking-[0.5em] uppercase items-center gap-6">
                                <div className="h-[1px] w-12 bg-stone-800" />
                                Operation Immediate Extraction
                                <div className="h-[1px] w-12 bg-stone-800" />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showExternalSettingsButton && gameState.phase !== 'INTRO' && gameState.phase !== 'BOOT' && gameState.phase !== 'GAME_OVER' && (
                <button
                    onClick={() => {
                        audioManager.playSound('click');
                        onOpenSettings();
                    }}
                    className="fixed z-[220] pointer-events-auto w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-400 hover:text-white bg-black/60 hover:bg-black/80 rounded-full transition-colors shadow-xl"
                    style={{
                        top: 'max(env(safe-area-inset-top, 0px), 10px)',
                        right: 'max(env(safe-area-inset-right, 0px), 10px)'
                    }}
                    aria-label="Open settings"
                >
                    <SettingsIcon size={20} className="lg:w-5 lg:h-5" />
                </button>
            )}

            {/* Global Loot Overlay - Priority Layer Outside UI Scale */}
            {showLootOverlay && (
                <div className="fixed inset-0 z-[200]">
                    <LootOverlay
                        receivedItems={receivedItems}
                        opponentReceivedItems={opponentReceivedItems}
                        isLocalSplit={isSplitMode}
                        player1Name={p1Label}
                        player2Name={p2Label}
                    />
                </div>
            )}

            {/* Global Chat Overlay - Visible whenever game is active (Multiplayer only) */}
            {isMultiplayer && gameState.phase !== 'INTRO' && gameState.phase !== 'BOOT' && (
                <>
                    {/* Render ChatBox & Stickers toggle buttons when both are minimized */}
                    {isChatMinimized && !isStickersOpen && (
                        <div
                            className={`absolute z-[100] pointer-events-auto select-none flex ${isCompactHUD ? 'flex-row items-center gap-1.5' : 'flex-col items-start gap-2'}`}
                            style={{
                                bottom: isCompactHUD
                                    ? (isPortraitLayout
                                        ? (!settings?.experimentalDirectAim ? 'max(calc(env(safe-area-inset-bottom, 0px) + 114px), 114px)' : 'max(calc(env(safe-area-inset-bottom, 0px) + 74px), 74px)')
                                        : 'max(calc(env(safe-area-inset-bottom, 0px) + 62px), 62px)')
                                    : 'max(env(safe-area-inset-bottom, 0px), 16px)',
                                left: isCompactHUD ? 'max(env(safe-area-inset-left, 0px), 8px)' : 'max(env(safe-area-inset-left, 0px), 16px)'
                            }}
                        >
                            {/* Stickers Toggle Button */}
                            <button
                                onClick={() => {
                                    audioManager.playSound('click');
                                    setIsStickersOpen(true);
                                    setIsChatMinimized(true);
                                }}
                                className={`w-11 h-11 min-w-[44px] min-h-[44px] ${isLowGraphics ? 'bg-stone-900/95' : 'bg-stone-950/85 backdrop-blur-md'} border border-cyan-500/30 hover:border-cyan-400 rounded-xl text-cyan-500 hover:text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.15)] transition-all duration-300 active:scale-95 cursor-pointer flex items-center justify-center group`}
                                title="Stickers"
                                aria-label="Open Stickers"
                            >
                                <Smile size={18} className="text-cyan-500" />
                            </button>

                            {/* ChatBox Toggle Button */}
                            <button
                                onClick={() => {
                                    audioManager.playSound('click');
                                    setIsChatMinimized(false);
                                    setIsStickersOpen(false);
                                }}
                                className={`relative min-h-[44px] ${isCompactHUD ? 'px-2.5 py-2' : 'px-4 py-2.5'} ${isLowGraphics ? 'bg-stone-900/95' : 'bg-stone-950/85 backdrop-blur-md'} border border-cyan-500/30 hover:border-cyan-400 rounded-xl text-[9px] sm:text-[10px] font-black tracking-[0.15em] uppercase text-cyan-500 hover:text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.15)] transition-all duration-300 active:scale-95 cursor-pointer flex items-center gap-1.5 group`}
                                aria-label="Open ChatBox"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                </svg>
                                {!isCompactHUD && <span>ChatBox</span>}

                                {unreadCount > 0 && (
                                    <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-[8px] font-black text-white items-center justify-center leading-none">
                                            {unreadCount}
                                        </span>
                                    </span>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Chat Overlay Active (Hides stickers button) */}
                    {!isChatMinimized && (
                        <div
                            className="absolute z-[100] w-[min(320px,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] h-[min(220px,calc(100dvh-96px))] sm:h-[260px] lg:h-[300px] pointer-events-auto transition-all duration-300 animate-in fade-in duration-200"
                            style={{
                                bottom: 'max(calc(env(safe-area-inset-bottom, 0px) + env(keyboard-inset-height, 0px)), 10px)',
                                left: 'max(env(safe-area-inset-left, 0px), 8px)'
                            }}
                        >
                            <div className="h-full flex flex-col justify-end">
                                <div className={`${isLowGraphics ? 'bg-stone-900/95' : 'bg-gradient-to-t from-black/90 to-black/55 backdrop-blur-3xl'} border border-white/[0.08] rounded-2xl sm:rounded-3xl overflow-hidden flex flex-col h-full shadow-[0_24px_80px_rgba(0,0,0,0.65)] group/chat transition-all hover:border-cyan-400/30`}>
                                    <div className="px-3 py-1.5 bg-white/5 border-b border-white/[0.04] flex justify-between items-center select-none shrink-0">
                                        <span className="text-[9px] sm:text-[10px] font-black tracking-[0.25em] text-stone-400 uppercase">ChatBox</span>
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={() => {
                                                    audioManager.playSound('click');
                                                    setIsChatMinimized(true);
                                                }}
                                                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 min-h-[44px] text-[8px] sm:text-[9px] font-black uppercase tracking-[0.2em] text-stone-100 transition-all duration-200 hover:bg-cyan-500/15 hover:border-cyan-400/40 hover:text-cyan-300 cursor-pointer"
                                            >
                                                <Minimize2 size={12} className="text-cyan-300 shrink-0" />
                                                <span>Minimize</span>
                                            </button>
                                        </div>
                                    </div>
                                    <div
                                        ref={chatScrollRef}
                                        className="flex-1 overflow-y-auto p-2.5 sm:p-4 space-y-2 text-[10px] sm:text-[11px] lg:text-xs scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent hover:scrollbar-thumb-white/20 custom-scrollbar"
                                    >
                                        {messages
                                            .filter(m => m.sender !== 'SYSTEM' && m.text && !m.text.startsWith('SYSTEM:') && !m.text.startsWith('[STICKER]:'))
                                            .map((msg, i) => (
                                                <div key={i} className="animate-in fade-in slide-in-from-left-1 duration-300 group">
                                                    <div className="flex items-baseline gap-2">
                                                        <span style={{ color: msg.color }} className="font-black text-[9px] sm:text-[10px] lg:text-[11px] uppercase tracking-widest opacity-80 group-hover:opacity-100 transition-opacity whitespace-nowrap">{msg.sender}</span>
                                                        <span className="text-white font-medium break-words leading-relaxed drop-shadow-sm">{msg.text}</span>
                                                    </div>
                                                    {(() => {
                                                        const url = msg.text.match(/https?:\/\/[^\s]+/)?.[0];
                                                        return url ? <LinkPreviewCard url={url} /> : null;
                                                    })()}
                                                </div>
                                            ))}
                                    </div>
                                    <form
                                        onSubmit={(e) => {
                                            e.preventDefault();
                                            if (chatDraft.trim() && onSendMessage) {
                                                onSendMessage(chatDraft.trim());
                                                setChatDraft('');
                                            }
                                        }}
                                        className="p-2 bg-white/5 border-t border-white/5 flex gap-1.5 keyboard-aware-bottom shrink-0"
                                    >
                                        <input
                                            name="chat-input"
                                            type="text"
                                            value={chatDraft}
                                            onChange={(e) => setChatDraft(e.target.value)}
                                            autoComplete="off"
                                            placeholder="TYPE A MESSAGE..."
                                            className="flex-1 min-w-0 bg-black/40 border border-white/[0.06] rounded-lg px-2.5 py-1.5 min-h-[44px] text-[10px] lg:text-xs text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-white/15 transition-all focus:bg-black/50 shadow-inner"
                                            onKeyDown={(e) => e.stopPropagation()}
                                        />
                                        <button
                                            type="submit"
                                            className="inline-flex items-center justify-center rounded-lg border border-white/[0.08] bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25 px-3 py-2 min-h-[44px] min-w-[44px] text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-200 hover:text-white cursor-pointer shrink-0"
                                            aria-label="Send message"
                                        >
                                            <Send size={14} />
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Sticker Selection Overlay (Hides Chat overlay, shows Chat button next to it) */}
                    {isStickersOpen && (
                        <>
                            {/* Sticker Panel overlay container */}
                            <div
                                className="absolute z-[100] w-[min(320px,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] h-[min(220px,calc(100dvh-96px))] sm:h-[260px] lg:h-[300px] pointer-events-auto transition-all duration-300 animate-in fade-in duration-200"
                                style={{
                                    bottom: 'max(calc(env(safe-area-inset-bottom, 0px) + env(keyboard-inset-height, 0px)), 10px)',
                                    left: 'max(env(safe-area-inset-left, 0px), 8px)'
                                }}
                            >
                                <div className="h-full flex flex-col justify-end">
                                    <div className={`${isLowGraphics ? 'bg-stone-900/95' : 'bg-gradient-to-t from-black/85 to-black/45 backdrop-blur-2xl'} border border-white/10 rounded-2xl overflow-hidden flex flex-col h-full shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all hover:border-white/15`}>
                                        <div className="px-3 py-1.5 bg-white/5 border-b border-white/5 flex justify-between items-center select-none shrink-0">
                                            <span className="text-[9px] sm:text-[10px] font-black tracking-[0.25em] text-stone-400 uppercase">Stickers</span>
                                            <button 
                                                onClick={() => {
                                                    audioManager.playSound('click');
                                                    setIsStickersOpen(false);
                                                }}
                                                className="text-stone-400 hover:text-white transition-colors text-[8px] sm:text-[9px] uppercase tracking-widest font-black cursor-pointer bg-transparent border-none outline-none py-1.5 px-3 min-h-[44px] flex items-center justify-center"
                                            >
                                                Minimize
                                            </button>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 custom-scrollbar scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                                            <div className="grid grid-cols-4 gap-2">
                                                {stickers.map((stk) => (
                                                    <button
                                                        key={stk}
                                                        onClick={() => {
                                                            audioManager.playSound('click');
                                                            if (onSendMessage) onSendMessage('[STICKER]:' + stk);
                                                            setIsStickersOpen(false);
                                                        }}
                                                        className="w-12 h-12 min-w-[48px] min-h-[48px] sm:w-14 sm:h-14 flex items-center justify-center rounded-xl border border-white/10 bg-black/40 hover:bg-white/5 hover:border-cyan-500/50 p-1.5 transition-all active:scale-95 cursor-pointer"
                                                        title={stk}
                                                    >
                                                        <img src={`/sticker/${stk}`} alt={stk} className="w-full h-full object-contain rounded" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ChatBox Toggle Button shown next to Sticker overlay so user can switch back */}
                            <div
                                className="absolute z-[100] pointer-events-auto select-none"
                                style={{
                                    bottom: 'max(calc(env(safe-area-inset-bottom, 0px) + env(keyboard-inset-height, 0px)), 10px)',
                                    right: 'max(env(safe-area-inset-right, 0px), 10px)'
                                }}
                            >
                                <button
                                    onClick={() => {
                                        audioManager.playSound('click');
                                        setIsChatMinimized(false);
                                        setIsStickersOpen(false);
                                    }}
                                    className={`bg-stone-950/90 ${isLowGraphics ? 'bg-stone-900/95' : 'backdrop-blur-md'} border border-cyan-500/30 hover:border-cyan-400 rounded-xl px-3.5 py-2 min-h-[44px] text-[9px] sm:text-[10px] font-black tracking-[0.2em] uppercase text-cyan-500 hover:text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.15)] active:scale-95 transition-all duration-300 cursor-pointer flex items-center gap-2 group`}
                                    aria-label="Open ChatBox"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                                    </svg>
                                    <span>ChatBox</span>
                                </button>
                            </div>
                        </>
                    )}
                </>
            )}

            {/* Minimized Chat Overlay - Visible in-game at above left corner when minimized (Filters out sticker logs) */}
            {isMultiplayer && gameState.phase !== 'INTRO' && gameState.phase !== 'BOOT' && isChatMinimized && showChatPreview && (
                <div className={`absolute ${isCompactHUD ? (isPortraitLayout ? 'top-[90px] left-2 max-w-[200px]' : 'top-[54px] left-2 max-w-[180px]') : 'top-28 left-4 max-w-xs md:max-w-sm'} z-[100] pointer-events-none space-y-1.5 select-none`}>
                    {chatPreviewMessages.map((msg, i) => (
                        <div key={`${msg.timestamp}-${i}`} className="text-white text-[10px] sm:text-xs font-semibold drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] animate-in fade-in slide-in-from-left-2 duration-300 flex items-baseline gap-1.5">
                            <span style={{ color: msg.color }} className="font-extrabold uppercase text-[9px] sm:text-[10px] tracking-widest shrink-0">{msg.sender}:</span>
                            <span className="break-words">{msg.text}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Transparent Active Stickers Overlay - rendered on left side, auto fades after 8s, max 3 limit */}
            {isMultiplayer && gameState.phase !== 'INTRO' && gameState.phase !== 'BOOT' && activeStickers.length > 0 && (
                <div className={`absolute ${isCompactHUD ? (isPortraitLayout ? 'bottom-[168px] left-2' : 'bottom-[114px] left-2') : 'bottom-[120px] left-4'} z-[100] pointer-events-none space-y-2 select-none flex flex-col-reverse items-start bg-transparent`}>
                    {activeStickers.map((stk) => (
                        <div key={stk.id} className="animate-in fade-in slide-in-from-left-3 duration-300 flex flex-col items-start bg-transparent">
                            <span style={{ color: stk.color }} className="font-extrabold uppercase text-[8px] tracking-widest drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.95)]">
                                {stk.sender}
                            </span>
                            <div className="w-[34px] h-[34px] sm:w-[80px] sm:h-[80px] object-contain drop-shadow-[0_3px_6px_rgba(0,0,0,0.85)] mt-0.5 bg-transparent">
                                <img src={`/sticker/${stk.filename}`} alt="Sticker" className="w-full h-full object-contain bg-transparent" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pinned Jackpot Sticker (Immunity Active) - shown in both singleplayer & multiplayer */}
            {gameState.phase !== 'INTRO' && gameState.phase !== 'BOOT' && (
                <>
                    {(player.jackpotImmunityShots || 0) > 0 && (
                        <div className={`absolute ${isCompactHUD ? (isPortraitLayout ? 'top-[90px] left-2' : 'top-[52px] left-2') : 'top-[200px] left-4'} z-[100] pointer-events-none flex flex-col items-start bg-transparent animate-pulse select-none`}>
                            <span className="font-extrabold uppercase text-[7px] tracking-widest text-amber-400 drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.95)]">
                                {playerName} IMMUNITY ({player.jackpotImmunityShots})
                            </span>
                            {player.hasJackpotWinActive && (
                                <div className="w-[32px] h-[32px] sm:w-[72px] sm:h-[72px] object-contain drop-shadow-[0_3px_6px_rgba(0,0,0,0.85)] mt-0.5 border border-amber-500/40 rounded-lg p-0.5 bg-amber-950/20">
                                    <img src="/sticker/sticker9.gif" alt="Jackpot Pinned" className="w-full h-full object-contain bg-transparent" />
                                </div>
                            )}
                        </div>
                    )}
                    {(dealer.jackpotImmunityShots || 0) > 0 && (
                        <div className={`absolute ${isCompactHUD ? (isPortraitLayout ? 'top-[90px] left-28' : 'top-[52px] left-28') : 'top-[200px] left-28 sm:left-32'} z-[100] pointer-events-none flex flex-col items-start bg-transparent animate-pulse select-none`}>
                            <span className="font-extrabold uppercase text-[7px] tracking-widest text-stone-400 drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.95)]">
                                {isMultiplayer ? getOpponentName() : 'DEALER'} IMMUNITY ({dealer.jackpotImmunityShots})
                            </span>
                            {dealer.hasJackpotWinActive && (
                                <div className="w-[32px] h-[32px] sm:w-[72px] sm:h-[72px] object-contain drop-shadow-[0_3px_6px_rgba(0,0,0,0.85)] mt-0.5 border border-stone-500/40 rounded-lg p-0.5 bg-stone-950/20">
                                    <img src="/sticker/sticker9.gif" alt="Jackpot Pinned" className="w-full h-full object-contain bg-transparent" />
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
            {pendingItemIndex !== null && (
                <div
                    className={`fixed inset-0 ${isLowGraphics ? 'bg-stone-900/95' : 'bg-black/85 backdrop-blur-md'} z-[250] flex flex-col items-center justify-center pointer-events-auto animate-in fade-in duration-300 hud-hardware-accel p-3`}
                    style={{
                        paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
                        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)'
                    }}
                >
                    <div className="bg-stone-950 border-2 border-stone-800 p-4 sm:p-6 lg:p-8 rounded-2xl max-w-md w-full max-h-[90dvh] overflow-y-auto shadow-[0_0_60px_rgba(0,0,0,0.9)] border-y-white/10 text-center custom-scrollbar">
                        <h2 className="text-base sm:text-xl lg:text-2xl font-black text-white tracking-widest uppercase mb-1">
                            SELECT TARGET FOR {player.items[pendingItemIndex].replace('_', ' ')}
                        </h2>
                        <p className="text-stone-400 text-[9px] sm:text-xs font-bold tracking-wider uppercase mb-4 sm:mb-6">
                            Target tactical disruption at an opponent
                        </p>
                        <div className="flex flex-col gap-2.5 sm:gap-3">
                            {gameState.multiplayerState?.players
                                .filter((p: any) => p.id !== gameState.localPlayerId)
                                .map((targetPlayer: any) => {
                                    // Target relative owner check to determine HP and seat identity
                                    const playersList = gameState.multiplayerState?.players || [];
                                    const myId = gameState.localPlayerId || '';
                                    const myIndex = playersList.findIndex((p: any) => p.id === myId);
                                    let targetHp = 1;
                                    let seatName = 'SEAT 02 • FRONT';
                                    let seatBorderClass = 'border-red-500/70 text-red-200 hover:bg-red-955/80 hover:border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)]';
                                    let hpBadgeClass = 'text-red-400 bg-red-955/80 border-red-500/40';

                                    if (myIndex !== -1) {
                                        const size = playersList.length || 3;
                                        const frontOpponent = playersList[(myIndex + 2) % size];
                                        const leftOpponent = playersList[(myIndex + 1) % size];
                                        const rightOpponent = size >= 4 ? playersList[(myIndex + 3) % size] : null;
                                        if (frontOpponent && targetPlayer.id === frontOpponent.id) {
                                            targetHp = dealer.hp;
                                            seatName = 'SEAT 02 • FRONT';
                                            seatBorderClass = 'border-red-500/70 text-red-200 hover:bg-red-955/80 hover:border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)]';
                                            hpBadgeClass = 'text-red-400 bg-red-955/80 border-red-500/40';
                                        } else if (leftOpponent && targetPlayer.id === leftOpponent.id && player3) {
                                            targetHp = player3.hp;
                                            seatName = 'SEAT 03 • LEFT';
                                            seatBorderClass = 'border-amber-500/70 text-amber-200 hover:bg-amber-955/80 hover:border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]';
                                            hpBadgeClass = 'text-amber-400 bg-amber-955/80 border-amber-500/40';
                                        } else if (rightOpponent && targetPlayer.id === rightOpponent.id && player4) {
                                            targetHp = player4.hp;
                                            seatName = 'SEAT 04 • RIGHT';
                                            seatBorderClass = 'border-purple-500/70 text-purple-200 hover:bg-purple-955/80 hover:border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.2)]';
                                            hpBadgeClass = 'text-purple-400 bg-purple-955/80 border-purple-500/40';
                                        } else {
                                            targetHp = player.hp;
                                        }
                                    }
                                    const isTargetDead = targetHp <= 0;
                                    
                                    return (
                                        <button
                                            key={targetPlayer.id}
                                            disabled={isTargetDead}
                                            onClick={() => {
                                                audioManager.playSound('click');
                                                onUseItem(pendingItemIndex, targetPlayer.id);
                                                setPendingItemIndex(null);
                                            }}
                                            onMouseEnter={() => !isTargetDead && audioManager.playSound('click')}
                                            className={`w-full py-3 px-5 border-2 font-black tracking-wider uppercase rounded-xl transition-all duration-200 flex items-center justify-between ${
                                                isTargetDead
                                                    ? 'bg-stone-955/40 border-stone-900/60 text-stone-600 cursor-not-allowed italic'
                                                    : `bg-stone-950/90 ${seatBorderClass} active:scale-98`
                                            }`}
                                        >
                                            <div className="flex flex-col items-start">
                                                <span className="text-[7.5px] font-mono font-bold tracking-widest text-stone-400">
                                                    {seatName}
                                                </span>
                                                <span className="text-sm md:text-base font-black text-white">
                                                    {targetPlayer.name} {isTargetDead && '(KNOCKED OUT)'}
                                                </span>
                                            </div>
                                            <span className={`text-xs font-mono font-black px-2 py-0.5 rounded border ${hpBadgeClass}`}>
                                                HP: {Math.max(0, targetHp)}
                                            </span>
                                        </button>
                                    );
                                })}
                        </div>
                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                setPendingItemIndex(null);
                            }}
                            className="mt-6 px-4 py-2.5 min-h-[44px] flex items-center justify-center text-xs font-black tracking-widest text-stone-300 hover:text-white uppercase transition-colors touch-manipulation cursor-pointer"
                        >
                            [ CANCEL ]
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};
