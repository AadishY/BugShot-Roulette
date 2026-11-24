import React, { useEffect, useState, useRef, useCallback } from 'react';
import { X, Wifi, AlertTriangle } from 'lucide-react';

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

    // Smooth exit transition handler
    const triggerExitAndComplete = useCallback(() => {
        setIsExiting(true);
        setTimeout(() => {
            onCompleteRef.current();
        }, 260);
    }, []);

    // Progress Timer & Smooth Interpolation Effect
    useEffect(() => {
        if (error) return;

        let currentProgress = 0;
        let active = true;
        let frameId: number | null = null;
        let completionScheduled = false;

        const effectiveDuration = Math.max(400, duration);

        const tick = () => {
            if (!active) return;

            const frameIncrement = 100 / (effectiveDuration / 16.67);
            currentProgress = Math.min(currentProgress + frameIncrement, 100);

            const targetVal = progressPropRef.current;
            const combinedProgress = typeof targetVal === 'number'
                ? Math.min(currentProgress, Math.max(0, Math.min(targetVal, 100)))
                : currentProgress;

            setDisplayProgress(prev => {
                const nextVal = Math.max(prev, combinedProgress);
                if (nextVal >= 100 && !completionScheduled) {
                    completionScheduled = true;
                    setTimeout(() => {
                        if (active) triggerExitAndComplete();
                    }, 120);
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
    }, [duration, error, triggerExitAndComplete]);

    // Keyboard support: Escape cancels loading if back button is available
    useEffect(() => {
        if (!showClose || !onBack || error) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onBack();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showClose, onBack, error]);

    // Terminal Lines Stream Effect
    useEffect(() => {
        const networkLines = [
            "NET_SOCKET: RESOLVING RELAY NODE...",
            "ESTABLISHING ENCRYPTED TUNNEL [TLS 1.3]...",
            "SYNCHRONIZING CLIENT TIME SEED...",
            "HANDSHAKE: PROTOCOL BUFFER v4 ACCEPTED",
            "VERIFYING SESSION TOKEN & USER KEYS...",
            "JOINING ENCLAVE ROOM INSTANCE...",
            "INITIALIZING PEER-TO-PEER MESH...",
            "ROOM STATE SYNCHRONIZED. LINK ACTIVE."
        ];

        const gameLines = [
            "BOOT_SEQ: 0x4F229A",
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
        const intervalTime = Math.max(60, duration / lines.length);

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
            className={`flex flex-col items-center justify-center w-full h-full bg-black text-green-500 z-[300] absolute inset-0 font-mono crt overflow-hidden select-none transition-opacity duration-300 ease-out ${isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        >
            {/* Abort / Back button for network/multiplayer loading */}
            {showClose && onBack && !error && (
                <button
                    onClick={onBack}
                    style={{
                        top: 'max(env(safe-area-inset-top, 0px), 16px)',
                        right: 'max(env(safe-area-inset-right, 0px), 16px)'
                    }}
                    className="absolute z-[320] bg-black/70 hover:bg-stone-900 border border-green-900/60 hover:border-green-500 text-green-500 hover:text-green-300 min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 active:scale-95 cursor-pointer shadow-[0_0_15px_rgba(34,197,94,0.15)] group"
                    title="Cancel Connection (Esc)"
                >
                    <span className="text-[10px] tracking-widest font-bold hidden sm:inline">ABORT</span>
                    <X size={18} className="group-hover:rotate-90 transition-transform duration-300" />
                </button>
            )}

            {/* Ambient CRT Grid Tech Overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#052e16_1px,transparent_1px),linear-gradient(to_bottom,#052e16_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-25 pointer-events-none" />
            <div className="scan-line !opacity-[0.12] pointer-events-none" />

            {/* Background Terminal Feed */}
            <div className="absolute inset-0 opacity-15 pointer-events-none p-4 font-mono text-[9px] sm:text-xs leading-relaxed max-w-2xl mx-auto hidden sm:flex flex-col justify-start h-2/3 mt-8">
                {terminalLines.map((line, i) => (
                    <div key={i} className="mb-1 tracking-wider font-semibold animate-in fade-in slide-in-from-left duration-200">
                        {line}
                    </div>
                ))}
            </div>

            {/* Main Center Console Loading UI */}
            <div className={`relative z-10 flex flex-col items-center w-[92vw] max-w-md p-6 sm:p-8 rounded-2xl border border-green-950/60 bg-black/80 backdrop-blur-md transition-all duration-300 shadow-[0_0_30px_rgba(0,0,0,0.8)] ${error ? 'opacity-0 pointer-events-none scale-95' : 'opacity-100 scale-100'}`}>
                {/* Visual Accent Ticks */}
                <div className="absolute top-3 left-3 w-3 h-3 border-t-2 border-l-2 border-green-700/60" />
                <div className="absolute top-3 right-3 w-3 h-3 border-t-2 border-r-2 border-green-700/60" />
                <div className="absolute bottom-3 left-3 w-3 h-3 border-b-2 border-l-2 border-green-700/60" />
                <div className="absolute bottom-3 right-3 w-3 h-3 border-b-2 border-r-2 border-green-700/60" />

                {/* Subsystem Mode Badge */}
                <div className="flex items-center gap-2 mb-4 text-[10px] text-green-600 font-bold tracking-[0.25em] uppercase">
                    {isNetworkMode ? (
                        <>
                            <Wifi size={13} className="text-green-400 animate-pulse" />
                            <span>NETWORK ENCLAVE PROTOCOL</span>
                        </>
                    ) : (
                        <>
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-ping inline-block" />
                            <span>BUNKER DEPLOYMENT PIPELINE</span>
                        </>
                    )}
                </div>

                {/* Main Headline */}
                <div className="text-base sm:text-2xl font-black tracking-[0.2em] mb-6 text-center uppercase text-green-400 drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]">
                    {initialText}
                </div>

                {/* Progress Bar Frame */}
                <div className="w-full h-5 sm:h-6 border-2 border-green-800/80 bg-stone-950 p-0.5 relative rounded-sm overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]">
                    <div
                        className="h-full bg-gradient-to-r from-green-700 via-green-500 to-emerald-400 shadow-[0_0_20px_rgba(34,197,94,0.7)] transition-all duration-75 ease-out rounded-xs relative will-change-[width]"
                        style={{ width: `${displayProgress}%`, transform: 'translate3d(0,0,0)' }}
                    >
                        {/* Segment Stripes */}
                        <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_50%,rgba(0,0,0,0.4)_50%)] bg-[size:8px_100%]" />
                    </div>
                    {/* Glass sheen reflection */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-transparent pointer-events-none" />
                </div>

                {/* Metrics Readout */}
                <div className="mt-4 flex items-baseline justify-between w-full font-mono">
                    <span className="text-green-600 text-[10px] sm:text-xs font-bold tracking-widest uppercase">
                        {isNetworkMode ? "HANDSHAKE INTEGRITY" : "ASSET RECONSTRUCTION"}
                    </span>
                    <span className="text-green-400 font-black text-sm sm:text-lg tracking-widest">
                        {Math.round(displayProgress)}%
                    </span>
                </div>

                {typeof progressProp === 'number' && (
                    <div className="mt-2 text-[9px] text-green-600/90 uppercase tracking-[0.2em] font-semibold text-center">
                        STREAMING 3D ASSETS & BUFFER MATRICES
                    </div>
                )}

                {/* Warning Footer Text */}
                <div className="mt-6 text-[9px] sm:text-xs text-green-700 font-bold tracking-[0.18em] uppercase text-center max-w-xs leading-relaxed animate-pulse border-t border-green-950/70 pt-3 w-full">
                    {warningText}
                </div>
            </div>

            {/* Error UI Overlay */}
            {error && (
                <div className="absolute inset-0 z-[310] flex flex-col items-center justify-center bg-black/95 p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.12)_0%,transparent_70%)] pointer-events-none" />

                    <div className="max-w-md w-full border border-red-900/70 bg-stone-950/90 p-8 rounded-2xl shadow-[0_0_80px_rgba(220,38,38,0.2)] flex flex-col items-center text-center relative font-mono">
                        <div className="absolute top-4 left-4 w-3 h-3 border-t border-l border-red-500/50" />
                        <div className="absolute top-4 right-4 w-3 h-3 border-t border-r border-red-500/50" />

                        <div className="text-red-500 mb-5 flex flex-col items-center gap-2">
                            <AlertTriangle size={36} className="text-red-500 animate-bounce" />
                            <div className="text-3xl md:text-4xl font-black tracking-tighter uppercase italic drop-shadow-[0_0_15px_rgba(220,38,38,0.6)]">
                                LINK_FAULT
                            </div>
                            <div className="text-[10px] text-stone-500 font-bold uppercase tracking-[0.35em]">
                                Critical Connection Failure
                            </div>
                        </div>

                        <div className="w-full text-xs text-red-400 border border-red-950 bg-red-950/30 px-4 py-3 rounded-xl uppercase tracking-widest leading-relaxed mb-6 break-all max-h-32 overflow-y-auto font-bold select-text scrollbar-thin">
                            {error}
                        </div>

                        <div className="flex flex-col gap-3 w-full">
                            {onRetry && (
                                <button
                                    onClick={onRetry}
                                    className="h-12 bg-gradient-to-r from-green-950/80 to-green-900/60 hover:from-green-900 hover:to-green-700 text-green-400 hover:text-white border border-green-800/80 hover:border-green-500 font-bold uppercase tracking-[0.25em] text-xs transition-all rounded-xl active:scale-98 cursor-pointer shadow-lg hover:shadow-[0_0_20px_rgba(34,197,94,0.25)] flex items-center justify-center"
                                >
                                    RETRY_CONNECTION
                                </button>
                            )}
                            {onBack && (
                                <button
                                    onClick={onBack}
                                    className="h-11 bg-transparent hover:bg-stone-900/60 border border-stone-800 hover:border-stone-600 text-stone-400 hover:text-stone-200 font-bold uppercase tracking-[0.25em] text-[10px] transition-all rounded-xl active:scale-98 cursor-pointer"
                                >
                                    TERMINATE_INSTANCE
                                </button>
                            )}
                        </div>

                        <div className="mt-6 text-[8px] text-stone-600 font-mono text-center max-w-xs uppercase leading-normal border-t border-stone-900 pt-3 w-full">
                            Hard connection drop executed. Check network route or host proxy server status.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
