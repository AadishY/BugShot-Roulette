import React, { useEffect, useState, useRef, useCallback } from 'react';
import { X, Wifi, AlertTriangle, Terminal, ShieldCheck, Cpu } from 'lucide-react';

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

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
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
    const [warningText, setWarningText] = useState("UNAUTHORIZED ACCESS IS PUNISHABLE BY DEATH");
    const [isExiting, setIsExiting] = useState(false);

    const onCompleteRef = useRef(onComplete);
    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    const progressPropRef = useRef(progressProp);
    useEffect(() => {
        progressPropRef.current = progressProp;
    }, [progressProp]);

    const isNetworkMode = showClose || typeof progressProp === 'undefined';

    // Random warning flavor text
    useEffect(() => {
        const warnings = [
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
        const randomWarning = warnings[Math.floor(Math.random() * warnings.length)];
        setWarningText(randomWarning);
    }, []);

    // Smooth exit transition handler (180ms ease-out)
    const triggerExitAndComplete = useCallback(() => {
        setIsExiting(true);
        setTimeout(() => {
            onCompleteRef.current();
        }, 180);
    }, []);

    // Ensure exit animation is canceled if an error appears
    useEffect(() => {
        if (error) {
            setIsExiting(false);
        }
    }, [error]);

    // High-precision delta-time progress interpolation
    useEffect(() => {
        if (error) return;

        let active = true;
        let frameId: number | null = null;
        let completionScheduled = false;
        let lastTime = performance.now();
        let internalProgress = 0;

        const effectiveDuration = Math.max(350, duration);

        const tick = (now: number) => {
            if (!active) return;

            const deltaMs = Math.min(now - lastTime, 50); // clamp delta against background tab freezes
            lastTime = now;

            const targetVal = progressPropRef.current;
            if (typeof targetVal === 'number') {
                // Smooth interpolation toward targetVal (e.g. Asset loading)
                const clampedTarget = Math.max(0, Math.min(targetVal, 100));
                const diff = clampedTarget - internalProgress;
                if (diff > 0) {
                    internalProgress = Math.min(100, internalProgress + Math.max(diff * 0.18, (deltaMs / effectiveDuration) * 100));
                } else if (clampedTarget >= 100) {
                    internalProgress = 100;
                }
            } else if (isNetworkMode) {
                // In network mode (multiplayer loading), smoothly progress up to 88% while awaiting handshake.
                // It NEVER completes to 100% or auto-exits on its own; it waits for socket connection or error.
                if (internalProgress < 88) {
                    const remaining = 88 - internalProgress;
                    internalProgress += Math.min(remaining * 0.05, (deltaMs / (effectiveDuration * 1.5)) * 60);
                }
            } else {
                // Time-based smooth progress for standalone transitions
                internalProgress = Math.min(100, internalProgress + (deltaMs / effectiveDuration) * 100);
            }

            setDisplayProgress(prev => {
                const nextVal = Math.min(100, Math.max(prev, internalProgress));
                // Only non-network mode auto-triggers completion when reaching 100%
                if (!isNetworkMode && nextVal >= 100 && !completionScheduled) {
                    completionScheduled = true;
                    setTimeout(() => {
                        if (active) triggerExitAndComplete();
                    }, 80);
                }
                return nextVal;
            });

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
        const networkLines = [
            "NET_SOCKET: RESOLVING SECURE RELAY NODE...",
            "ESTABLISHING ENCRYPTED TUNNEL [TLS 1.3]...",
            "SYNCHRONIZING CLIENT TIME SEED...",
            "HANDSHAKE: PROTOCOL BUFFER v4 ACCEPTED",
            "VERIFYING SESSION TOKEN & USER KEYS...",
            "JOINING ENCLAVE ROOM INSTANCE...",
            "INITIALIZING PEER-TO-PEER MESH...",
            "ROOM STATE SYNCHRONIZED. LINK ACTIVE."
        ];

        const gameLines = [
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

        const lines = isNetworkMode ? networkLines : gameLines;
        let current = 0;
        const intervalTime = Math.max(50, duration / lines.length);

        const lineInterval = setInterval(() => {
            if (current < lines.length) {
                setTerminalLines(prev => [...prev, `> ${lines[current]}`].slice(-16));
                current++;
            }
        }, intervalTime);

        return () => clearInterval(lineInterval);
    }, [duration, isNetworkMode]);

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
                    className="absolute z-[320] bg-black/80 hover:bg-stone-900 border border-green-800/80 hover:border-green-400 text-green-400 hover:text-green-200 min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 active:scale-95 cursor-pointer shadow-[0_0_20px_rgba(34,197,94,0.2)] group"
                    title="Cancel Connection (Esc)"
                    aria-label="Cancel connection"
                >
                    <span className="text-[10px] tracking-widest font-black hidden sm:inline uppercase">CANCEL</span>
                    <X size={18} className="group-hover:rotate-90 transition-transform duration-300" />
                </button>
            )}

            {/* Ambient CRT Grid Tech Overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#052e16_1px,transparent_1px),linear-gradient(to_bottom,#052e16_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_50%,#000_60%,transparent_100%)] opacity-30 pointer-events-none" />
            <div className="scan-line !opacity-[0.14] pointer-events-none" />

            {/* Ambient Center Glow */}
            <div className="absolute w-[360px] sm:w-[500px] h-[360px] sm:h-[500px] bg-green-500/10 rounded-full blur-[120px] pointer-events-none" />

            {/* Background Terminal Feed (Desktop) */}
            <div className="absolute inset-x-0 top-12 bottom-24 opacity-15 pointer-events-none p-4 font-mono text-[9px] sm:text-[11px] leading-relaxed max-w-2xl mx-auto hidden sm:flex flex-col justify-start overflow-hidden">
                {terminalLines.map((line, i) => (
                    <div key={i} className="mb-1 tracking-wider font-semibold animate-in fade-in slide-in-from-left duration-200 truncate">
                        {line}
                    </div>
                ))}
            </div>

            {/* Main Center Console Loading UI */}
            <div
                className={`relative z-10 flex flex-col items-center w-[92vw] max-w-md p-5 sm:p-8 rounded-2xl border border-green-800/60 bg-black/85 backdrop-blur-xl transition-all duration-300 shadow-[0_0_40px_rgba(0,0,0,0.9),0_0_25px_rgba(34,197,94,0.15)] ${
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
                            <span className="w-2 h-2 rounded-full bg-green-400 animate-ping inline-block shrink-0" />
                            <span>BUNKER DEPLOYMENT PIPELINE</span>
                        </>
                    )}
                </div>

                {/* Main Headline */}
                <div className="text-base sm:text-2xl font-black tracking-[0.2em] mb-5 text-center uppercase text-green-300 drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]">
                    {initialText}
                </div>

                {/* Cyber Progress Bar Frame with Ticks */}
                <div className="w-full relative">
                    {/* Tick markers */}
                    <div className="flex justify-between w-full px-0.5 mb-1.5 text-[8px] font-mono text-green-700/80 uppercase tracking-widest">
                        <span>0%</span>
                        <span>25%</span>
                        <span>50%</span>
                        <span>75%</span>
                        <span>100%</span>
                    </div>

                    <div className="w-full h-5 sm:h-6 border-2 border-green-800/90 bg-stone-950/90 p-0.5 relative rounded-md overflow-hidden shadow-[inset_0_2px_6px_rgba(0,0,0,0.9),0_0_15px_rgba(34,197,94,0.15)]">
                        <div
                            className="h-full bg-gradient-to-r from-green-700 via-emerald-500 to-green-400 shadow-[0_0_20px_rgba(34,197,94,0.7)] transition-all duration-75 ease-out rounded-sm relative will-change-[width]"
                            style={{ width: `${Math.min(100, Math.max(0, displayProgress))}%`, transform: 'translate3d(0,0,0)' }}
                        >
                            {/* Segment Striping */}
                            <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_50%,rgba(0,0,0,0.45)_50%)] bg-[size:8px_100%]" />
                            {/* Leading Edge Glow Pip */}
                            <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-white shadow-[0_0_10px_#ffffff]" />
                        </div>
                        {/* Glass Sheen */}
                        <div className="absolute inset-0 bg-gradient-to-b from-white/15 via-transparent to-transparent pointer-events-none" />
                    </div>
                </div>

                {/* Metrics Readout */}
                <div className="mt-4 flex items-baseline justify-between w-full font-mono px-0.5">
                    <span className="text-green-600 text-[10px] sm:text-xs font-bold tracking-widest uppercase flex items-center gap-1.5">
                        <Cpu size={12} className="text-green-500 shrink-0" />
                        <span>{isNetworkMode ? "HANDSHAKE INTEGRITY" : "ASSET RECONSTRUCTION"}</span>
                    </span>
                    <span className="text-green-300 font-black text-base sm:text-xl tracking-wider drop-shadow-[0_0_8px_rgba(74,222,128,0.6)]">
                        {Math.round(displayProgress)}%
                    </span>
                </div>

                {/* Contextual Status Sub-text */}
                <div className="mt-2 text-[9px] sm:text-[10px] text-green-600/90 uppercase tracking-[0.2em] font-semibold text-center flex items-center justify-center gap-1.5">
                    <Terminal size={11} className="text-green-500 shrink-0" />
                    <span className="truncate">
                        {displayProgress < 40
                            ? "ALLOCATING HEAP & SHADER PIPELINES"
                            : displayProgress < 85
                            ? "STREAMING 3D ASSETS & BUFFER MATRICES"
                            : "FINALIZING SYNCHRONIZATION THREADS"}
                    </span>
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

                    <div className="max-w-md w-full border-2 border-red-700/80 bg-stone-950/95 p-6 sm:p-8 rounded-2xl shadow-[0_0_80px_rgba(220,38,38,0.35)] flex flex-col items-center text-center relative font-mono backdrop-blur-2xl">
                        <div className="absolute top-3 left-3 w-3 h-3 border-t-2 border-l-2 border-red-500 pointer-events-none" />
                        <div className="absolute top-3 right-3 w-3 h-3 border-t-2 border-r-2 border-red-500 pointer-events-none" />
                        <div className="absolute bottom-3 left-3 w-3 h-3 border-b-2 border-l-2 border-red-500 pointer-events-none" />
                        <div className="absolute bottom-3 right-3 w-3 h-3 border-b-2 border-r-2 border-red-500 pointer-events-none" />

                        <div className="text-red-500 mb-4 flex flex-col items-center gap-1.5">
                            <AlertTriangle size={40} className="text-red-500 animate-pulse" />
                            <div className="text-2xl sm:text-3xl font-black tracking-tight uppercase italic drop-shadow-[0_0_15px_rgba(220,38,38,0.6)]">
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
};
