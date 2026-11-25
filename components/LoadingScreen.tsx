import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { X, Wifi, AlertTriangle, Terminal, ShieldCheck, Cpu } from 'lucide-react';
import { getDeviceType } from '../utils/gameUtils';

interface LoadingScreenProps {
    onComplete: () => void;
    onBack?: () => void;
    text?: string;
    duration?: number;
    error?: string | null;
    onRetry?: () => void;
    showClose?: boolean;
    progress?: number;
}

const WARNINGS = [
    "UNAUTHORIZED ACCESS IS PUNISHABLE BY DEATH",
    "THE SHELL DOES NOT DISCRIMINATE",
    "TRUST IS A DECREASING RESOURCE",
    "THE DEALER IS ALWAYS WATCHING",
    "DOUBLE OR NOTHING IS YOUR ONLY WAY OUT",
    "LIVE OR BLANK: DECIDE",
    "MIND THE SAW. IT BITES.",
    "NO QUANTUM IMMORTALITY ALLOWED",
    "LIABILITY WAIVER: SIGNED AND SIGNED AGAIN",
    "YOUR BRAINWAVES ARE BEING MONITORED",
    "DEVIATION FROM PROTOCOL RESULTS IN IMMEDIATE TERMINATION",
    "SURRENDER IS NOT AN OPTION IN THIS BUNKER",
    "THE CONTRACT IS BINDING. SOULS ARE NON-REFUNDABLE.",
    "KEEP YOUR FINGERS CLEAR OF THE RECEIVER",
    "THE ODDS ARE EQUAL, THE CONSEQUENCES ARE NOT"
];

const NETWORK_LINES = [
    "NET_SOCKET: RESOLVING SECURE RELAY NODE...",
    "ESTABLISHING ENCRYPTED TUNNEL [TLS 1.3]...",
    "SYNCHRONIZING CLIENT TIME SEED...",
    "HANDSHAKE: PROTOCOL BUFFER v4 ACCEPTED",
    "VERIFYING SESSION TOKEN & USER KEYS...",
    "JOINING ENCLAVE ROOM INSTANCE...",
    "INITIALIZING PEER-TO-PEER MESH...",
    "ROOM STATE SYNCHRONIZED. LINK ACTIVE."
];

const GAME_LINES = [
    "BOOT_SEQ: 0x4F229A READY",
    "SCANNING TABLE HYDRAULICS...",
    "ALLOCATING 12-GAUGE CHAMBER BUFFERS...",
    "STREAMING 3D MESH GEOMETRIES & SHADERS...",
    "CACHING HIGH-RES TEXTURE ATLAS...",
    "INITIALIZING AUDIO REVERB ENGINE...",
    "CALIBRATING DEALER NEURAL PATHWAYS...",
    "WARMING UP GPU INSTANCED DRAW BUFFERS...",
    "DEPLOYMENT PROTOCOL COMPLETE. READY."
];

const getStageInfo = (pct: number, isNetworkMode: boolean, isSlowWait: boolean) => {
    if (isNetworkMode) {
        if (isSlowWait && pct >= 70) {
            return { stage: 4, total: 4, label: "CLOUD SERVER WAKING UP — HOLDING LINK" };
        }
        if (pct < 25) return { stage: 1, total: 4, label: "RESOLVING SECURE RELAY ENDPOINT" };
        if (pct < 55) return { stage: 2, total: 4, label: "NEGOTIATING ENCRYPTED SOCKET HANDSHAKE" };
        if (pct < 75) return { stage: 3, total: 4, label: "AUTHENTICATING OPERATIVE SESSION" };
        return { stage: 4, total: 4, label: "AWAITING ENCLAVE ROOM CONFIRMATION" };
    }

    if (pct < 20) return { stage: 1, total: 5, label: "ALLOCATING HEAP & WEBGL CONTEXT" };
    if (pct < 45) return { stage: 2, total: 5, label: "DECODING DRACO 3D MESH GEOMETRIES" };
    if (pct < 70) return { stage: 3, total: 5, label: "BUFFERING COMPRESSED AUDIO & SFX" };
    if (pct < 92) return { stage: 4, total: 5, label: "COMPILING SHADERS & LIGHTING RIGS" };
    return { stage: 5, total: 5, label: "TABLE SYNCHRONIZED — ENTERING BUNKER" };
};

export const LoadingScreen: React.FC<LoadingScreenProps> = React.memo(({
    onComplete,
    onBack,
    text: initialText = "INITIALIZING SYSTEM...",
    duration = 1200,
    error,
    onRetry,
    showClose = false,
    progress: progressProp
}) => {
    const [displayProgress, setDisplayProgress] = useState(0);
    const [terminalLines, setTerminalLines] = useState<string[]>([]);
    const [isSlowWait, setIsSlowWait] = useState(false);
    const [isExiting, setIsExiting] = useState(false);

    const warningText = useMemo(
        () => WARNINGS[Math.floor(Math.random() * WARNINGS.length)],
        []
    );

    const reduceEffects = useMemo(() => {
        if (typeof window === 'undefined') return false;
        const device = getDeviceType();
        if (device === 'mobile' || device === 'tablet') return true;
        try {
            const raw = localStorage.getItem('aadish_roulette_settings');
            if (raw) {
                const s = JSON.parse(raw);
                if (s?.ultraPerformance || s?.graphicsMode === 'potato' || s?.graphicsMode === 'low') {
                    return true;
                }
            }
        } catch {}
        return false;
    }, []);

    const onCompleteRef = useRef(onComplete);
    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    const progressPropRef = useRef(progressProp);
    useEffect(() => {
        progressPropRef.current = progressProp;
    }, [progressProp]);

    const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearPendingTimers = useCallback(() => {
        if (completionTimerRef.current !== null) {
            clearTimeout(completionTimerRef.current);
            completionTimerRef.current = null;
        }
        if (exitTimerRef.current !== null) {
            clearTimeout(exitTimerRef.current);
            exitTimerRef.current = null;
        }
    }, []);

    const isNetworkMode = showClose || typeof progressProp === 'undefined';

    const triggerExitAndComplete = useCallback(() => {
        setIsExiting(true);
        if (exitTimerRef.current !== null) clearTimeout(exitTimerRef.current);
        exitTimerRef.current = setTimeout(() => {
            exitTimerRef.current = null;
            onCompleteRef.current();
        }, 180);
    }, []);

    // Cancel any scheduled exit immediately if a network error arrives
    useEffect(() => {
        if (error) {
            clearPendingTimers();
            setIsExiting(false);
            setIsSlowWait(false);
        }
    }, [error, clearPendingTimers]);

    useEffect(() => {
        return () => clearPendingTimers();
    }, [clearPendingTimers]);

    // High-precision delta-time progress interpolation
    useEffect(() => {
        if (error) return;

        let active = true;
        let frameId: number | null = null;
        let completionScheduled = false;
        let lastTime = performance.now();
        const startTime = lastTime;
        let internalProgress = 0;
        let lastRenderedProgress = 0;

        setDisplayProgress(0);
        setIsSlowWait(false);

        const effectiveDuration = Math.max(350, duration);

        const tick = (now: number) => {
            if (!active) return;

            const deltaMs = Math.min(now - lastTime, 50);
            lastTime = now;

            const targetVal = progressPropRef.current;
            if (typeof targetVal === 'number') {
                const clampedTarget = Math.max(0, Math.min(targetVal, 100));
                const diff = clampedTarget - internalProgress;
                if (diff > 0) {
                    internalProgress = Math.min(
                        100,
                        internalProgress + Math.max(diff * 0.18, (deltaMs / effectiveDuration) * 100)
                    );
                } else if (clampedTarget >= 100) {
                    internalProgress = 100;
                }
            } else if (isNetworkMode) {
                // In network mode (multiplayer loading), smoothly progress up to 88% while awaiting handshake.
                // Never auto-completes to 100%; awaits socket connection or error.
                if (internalProgress < 88) {
                    const remaining = 88 - internalProgress;
                    internalProgress += Math.min(remaining * 0.05, (deltaMs / (effectiveDuration * 1.5)) * 60);
                }
                if (now - startTime > 4000) {
                    setIsSlowWait(true);
                }
            } else {
                internalProgress = Math.min(100, internalProgress + (deltaMs / effectiveDuration) * 100);
            }

            const nextVal = Math.min(100, Math.max(lastRenderedProgress, internalProgress));
            // Commit React updates when progress changes noticeably (>= 0.4%) or hits 100%
            if (nextVal - lastRenderedProgress >= 0.4 || (nextVal >= 100 && lastRenderedProgress < 100)) {
                lastRenderedProgress = nextVal;
                setDisplayProgress(nextVal);
            }

            if (!isNetworkMode && nextVal >= 100 && !completionScheduled) {
                completionScheduled = true;
                completionTimerRef.current = setTimeout(() => {
                    completionTimerRef.current = null;
                    if (active) triggerExitAndComplete();
                }, 80);
            }

            if (!completionScheduled) {
                frameId = requestAnimationFrame(tick);
            }
        };

        frameId = requestAnimationFrame(tick);

        return () => {
            active = false;
            if (frameId !== null) cancelAnimationFrame(frameId);
        };
    }, [duration, error, isNetworkMode, triggerExitAndComplete]);

    // Keyboard support: Escape cancels loading or returns from error
    useEffect(() => {
        if (!showClose || !onBack) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onBack();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showClose, onBack]);

    // Terminal Lines Stream Effect
    useEffect(() => {
        if (error) return;
        setTerminalLines([]);
        const lines = isNetworkMode ? NETWORK_LINES : GAME_LINES;
        let current = 0;
        const intervalTime = Math.max(60, duration / lines.length);

        const lineInterval = setInterval(() => {
            if (current < lines.length) {
                const lineText = `> ${lines[current]}`;
                current++;
                setTerminalLines((prev) => [...prev, lineText].slice(-12));
            } else {
                clearInterval(lineInterval);
            }
        }, intervalTime);

        return () => clearInterval(lineInterval);
    }, [duration, isNetworkMode, error]);

    const clampedPct = Math.min(100, Math.max(0, displayProgress));
    const roundedPct = Math.round(clampedPct);
    const stageInfo = getStageInfo(clampedPct, isNetworkMode, isSlowWait);

    return (
        <div
            className={`fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black text-green-500 font-mono crt overflow-hidden select-none transition-all duration-200 ease-out ${
                isExiting && !error ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'
            }`}
            style={{
                paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)',
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
                paddingLeft: 'max(env(safe-area-inset-left, 0px), 16px)',
                paddingRight: 'max(env(safe-area-inset-right, 0px), 16px)'
            }}
        >
            {/* Cancel / Back button for network/multiplayer loading */}
            {showClose && onBack && (
                <button
                    onClick={onBack}
                    style={{
                        top: 'max(env(safe-area-inset-top, 0px), 16px)',
                        right: 'max(env(safe-area-inset-right, 0px), 16px)'
                    }}
                    className="absolute z-[320] bg-black/85 hover:bg-stone-900 border border-green-800/80 hover:border-green-400 text-green-400 hover:text-green-200 min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 active:scale-95 cursor-pointer shadow-[0_0_20px_rgba(34,197,94,0.2)] group touch-manipulation"
                    title="Cancel Connection (Esc)"
                    aria-label="Cancel connection"
                >
                    <span className="text-[10px] tracking-widest font-black hidden sm:inline uppercase">CANCEL</span>
                    <X size={18} className="group-hover:rotate-90 transition-transform duration-300" />
                </button>
            )}

            {/* Ambient CRT Grid Tech Overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#052e16_1px,transparent_1px),linear-gradient(to_bottom,#052e16_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_50%,#000_60%,transparent_100%)] opacity-30 pointer-events-none" />
            {!reduceEffects && <div className="scan-line !opacity-[0.14] pointer-events-none" />}

            {/* Ambient Center Glow - Radial gradient instead of GPU blur filter on mobile/low-perf */}
            {reduceEffects ? (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.08)_0%,transparent_55%)] pointer-events-none" />
            ) : (
                <div className="absolute w-[360px] sm:w-[500px] h-[360px] sm:h-[500px] bg-green-500/10 rounded-full blur-[120px] pointer-events-none" />
            )}

            {/* Background Terminal Feed (Desktop) */}
            <div className="absolute inset-x-0 top-12 bottom-24 opacity-15 pointer-events-none p-4 font-mono text-[9px] sm:text-[11px] leading-relaxed max-w-2xl mx-auto hidden sm:flex flex-col justify-start overflow-hidden">
                {terminalLines.map((line, i) => (
                    <div key={`${i}-${line.slice(0, 12)}`} className="mb-1 tracking-wider font-semibold truncate">
                        {line}
                    </div>
                ))}
            </div>

            {/* Main Center Console Loading UI */}
            <div
                className={`relative z-10 flex flex-col items-center w-[92vw] max-w-md p-5 sm:p-8 rounded-2xl border border-green-800/60 ${
                    reduceEffects ? 'bg-stone-950/95' : 'bg-black/85 backdrop-blur-xl'
                } transition-all duration-300 shadow-[0_0_40px_rgba(0,0,0,0.9),0_0_25px_rgba(34,197,94,0.15)] ${
                    error ? 'opacity-0 pointer-events-none scale-95' : 'opacity-100 scale-100'
                }`}
            >
                {/* Tech Bracket Accents */}
                <div className="absolute top-2.5 left-2.5 w-3.5 h-3.5 border-t-2 border-l-2 border-green-500/80 pointer-events-none" />
                <div className="absolute top-2.5 right-2.5 w-3.5 h-3.5 border-t-2 border-r-2 border-green-500/80 pointer-events-none" />
                <div className="absolute bottom-2.5 left-2.5 w-3.5 h-3.5 border-b-2 border-l-2 border-green-500/80 pointer-events-none" />
                <div className="absolute bottom-2.5 right-2.5 w-3.5 h-3.5 border-b-2 border-r-2 border-green-500/80 pointer-events-none" />

                {/* Subsystem Mode Badge */}
                <div className="flex items-center gap-2 mb-3 px-3 py-1 bg-green-950/40 border border-green-800/60 rounded-full text-[9px] sm:text-[10px] text-green-400 font-bold tracking-[0.25em] uppercase shadow-[0_0_12px_rgba(34,197,94,0.2)]">
                    {isNetworkMode ? (
                        <>
                            <Wifi size={12} className="text-green-400 animate-pulse shrink-0" />
                            <span>NETWORK ENCLAVE PROTOCOL</span>
                        </>
                    ) : (
                        <>
                            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block shrink-0" />
                            <span>BUNKER DEPLOYMENT PIPELINE</span>
                        </>
                    )}
                </div>

                {/* Main Headline */}
                <div className={`text-base sm:text-2xl font-black tracking-[0.2em] mb-4 text-center uppercase text-green-300 ${
                    reduceEffects ? '' : 'drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]'
                }`}>
                    {initialText}
                </div>

                {/* Stage Telemetry Progress Pills */}
                <div className="w-full flex items-center gap-1.5 mb-3 px-0.5" aria-hidden="true">
                    {Array.from({ length: stageInfo.total }, (_, idx) => {
                        const stepNum = idx + 1;
                        const done = stepNum < stageInfo.stage;
                        const active = stepNum === stageInfo.stage;
                        return (
                            <div
                                key={stepNum}
                                className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
                                    done
                                        ? 'bg-emerald-400'
                                        : active
                                        ? 'bg-green-400/90 animate-pulse'
                                        : 'bg-green-950/80'
                                }`}
                            />
                        );
                    })}
                    <span className="text-[8px] font-mono font-bold text-green-500/90 tracking-widest ml-1 shrink-0">
                        {stageInfo.stage}/{stageInfo.total}
                    </span>
                </div>

                {/* Cyber Progress Bar Frame with Ticks (GPU-composited translate3d fill) */}
                <div className="w-full relative">
                    <div className="flex justify-between w-full px-0.5 mb-1.5 text-[8px] font-mono text-green-700/80 uppercase tracking-widest">
                        <span>0%</span>
                        <span>25%</span>
                        <span>50%</span>
                        <span>75%</span>
                        <span>100%</span>
                    </div>

                    <div className="w-full h-5 sm:h-6 border-2 border-green-800/90 bg-stone-950/90 p-0.5 relative rounded-md overflow-hidden shadow-[inset_0_2px_6px_rgba(0,0,0,0.9),0_0_15px_rgba(34,197,94,0.15)]">
                        <div className="w-full h-full relative overflow-hidden rounded-sm">
                            <div
                                className="w-full h-full bg-gradient-to-r from-green-700 via-emerald-500 to-green-400 rounded-sm relative will-change-transform"
                                style={{
                                    transform: `translate3d(${clampedPct - 100}%, 0, 0)`
                                }}
                            >
                                <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_50%,rgba(0,0,0,0.45)_50%)] bg-[size:8px_100%]" />
                                <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-white shadow-[0_0_10px_#ffffff]" />
                            </div>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-b from-white/15 via-transparent to-transparent pointer-events-none" />
                    </div>
                </div>

                {/* Metrics Readout */}
                <div className="mt-4 flex items-baseline justify-between w-full font-mono px-0.5">
                    <span className="text-green-600 text-[10px] sm:text-xs font-bold tracking-widest uppercase flex items-center gap-1.5">
                        <Cpu size={12} className="text-green-500 shrink-0" />
                        <span>{isNetworkMode ? "HANDSHAKE INTEGRITY" : "ASSET RECONSTRUCTION"}</span>
                    </span>
                    <span className={`text-green-300 font-black text-base sm:text-xl tracking-wider ${
                        reduceEffects ? '' : 'drop-shadow-[0_0_8px_rgba(74,222,128,0.6)]'
                    }`}>
                        {roundedPct}%
                    </span>
                </div>

                {/* Contextual Telemetry Stage Sub-text */}
                <div className="mt-2 text-[9px] sm:text-[10px] text-green-500/95 uppercase tracking-[0.18em] font-semibold text-center flex items-center justify-center gap-1.5 max-w-full">
                    <Terminal size={11} className="text-green-500 shrink-0" />
                    <span className="truncate">{stageInfo.label}</span>
                </div>

                {/* Warning Footer Text */}
                <div className="mt-5 text-[8.5px] sm:text-[10px] text-green-700 font-bold tracking-[0.18em] uppercase text-center max-w-xs leading-relaxed border-t border-green-950/80 pt-3 w-full flex items-center justify-center gap-1.5">
                    <ShieldCheck size={12} className="text-green-800 shrink-0" />
                    <span className="truncate">{warningText}</span>
                </div>
            </div>

            {/* Error UI Overlay */}
            {error && (
                <div className="absolute inset-0 z-[310] flex flex-col items-center justify-center bg-black/95 p-4 sm:p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.18)_0%,transparent_70%)] pointer-events-none" />

                    <div className={`max-w-md w-full border-2 border-red-700/80 bg-stone-950/95 p-6 sm:p-8 rounded-2xl shadow-[0_0_80px_rgba(220,38,38,0.35)] flex flex-col items-center text-center relative font-mono ${
                        reduceEffects ? '' : 'backdrop-blur-2xl'
                    }`}>
                        <div className="absolute top-3 left-3 w-3 h-3 border-t-2 border-l-2 border-red-500 pointer-events-none" />
                        <div className="absolute top-3 right-3 w-3 h-3 border-t-2 border-r-2 border-red-500 pointer-events-none" />
                        <div className="absolute bottom-3 left-3 w-3 h-3 border-b-2 border-l-2 border-red-500 pointer-events-none" />
                        <div className="absolute bottom-3 right-3 w-3 h-3 border-b-2 border-r-2 border-red-500 pointer-events-none" />

                        <div className="text-red-500 mb-4 flex flex-col items-center gap-1.5">
                            <AlertTriangle size={40} className="text-red-500 animate-pulse" />
                            <div className={`text-2xl sm:text-3xl font-black tracking-tight uppercase italic ${
                                reduceEffects ? '' : 'drop-shadow-[0_0_15px_rgba(220,38,38,0.6)]'
                            }`}>
                                SERVER OFFLINE
                            </div>
                            <div className="text-[10px] text-stone-400 font-bold uppercase tracking-[0.25em]">
                                Multiplayer Enclave Unreachable
                            </div>
                        </div>

                        <div className="w-full text-xs text-red-300 border border-red-900/60 bg-red-950/40 px-4 py-3 rounded-xl uppercase tracking-wider leading-relaxed mb-5 break-words max-h-36 overflow-y-auto font-semibold select-text scrollbar-thin">
                            {error}
                        </div>

                        <div className="flex flex-col gap-2.5 w-full">
                            {onRetry && (
                                <button
                                    onClick={onRetry}
                                    className="min-h-[46px] bg-gradient-to-r from-green-950 via-green-900 to-green-950 hover:from-green-900 hover:to-green-800 text-green-300 hover:text-white border border-green-700/80 hover:border-green-400 font-bold uppercase tracking-[0.25em] text-xs transition-all rounded-xl active:scale-98 cursor-pointer shadow-lg hover:shadow-[0_0_20px_rgba(34,197,94,0.3)] flex items-center justify-center touch-manipulation"
                                >
                                    RETRY CONNECTION
                                </button>
                            )}
                            {onBack && (
                                <button
                                    onClick={onBack}
                                    className="min-h-[44px] bg-stone-900/80 hover:bg-stone-800 border border-stone-700 hover:border-stone-500 text-stone-300 hover:text-white font-bold uppercase tracking-[0.25em] text-xs transition-all rounded-xl active:scale-98 cursor-pointer touch-manipulation"
                                >
                                    RETURN TO MAIN MENU
                                </button>
                            )}
                        </div>

                        <div className="mt-5 text-[9px] text-stone-400 font-mono text-center max-w-xs uppercase leading-normal border-t border-stone-900 pt-3 w-full">
                            Cloud server may be waking up from sleep. Click Retry to re-establish link.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

LoadingScreen.displayName = 'LoadingScreen';
