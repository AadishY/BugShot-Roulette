import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { X, Wifi, AlertTriangle, Terminal, ShieldAlert, Cpu, Lock } from 'lucide-react';
import { LOADING_EXIT_DURATION_MS } from '../utils/cinematicTransition';

interface LoadingScreenProps {
    onComplete: () => void;
    onBack?: () => void;
    text?: string;
    duration?: number;
    error?: string | null;
    onRetry?: () => void;
    showClose?: boolean;
    progress?: number;
    getProgress?: () => number;
}

const WARNINGS = [
    "UNAUTHORIZED ACCESS IS PUNISHABLE BY DEATH",
    "THE SHELL DOES NOT DISCRIMINATE",
    "TRUST IS A DECREASING RESOURCE",
    "THE DEALER IS ALWAYS WATCHING",
    "LIVE OR BLANK: DECIDE",
    "MIND THE SAW. IT BITES.",
    "LIABILITY WAIVER: SIGNED AND BOUND",
    "YOUR DEVICE TELEMETRY IS NOW LOCKED",
    "SURRENDER IS NOT AN OPTION IN THIS BUNKER",
    "THE CONTRACT IS BINDING. SOULS ARE NON-REFUNDABLE."
];

interface SimulatedDeviceTrace {
    ip: string;
    gateway: string;
    mac: string;
    port: number;
    nodeId: string;
    osTag: string;
}

const generateSimulatedTrace = (): SimulatedDeviceTrace => {
    const subnet = Math.floor(Math.random() * 200) + 1;
    const host = Math.floor(Math.random() * 220) + 12;
    const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
    const mac = `${hex()}:${hex()}:${hex()}:${hex()}:${hex()}:${hex()}`;
    const ports = [22, 443, 8080, 3389, 5555, 8443];
    const port = ports[Math.floor(Math.random() * ports.length)];
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    let osTag = 'LINUX_X64';
    if (/Android/i.test(ua)) osTag = 'ANDROID_ARM64';
    else if (/iPhone|iPad|iPod/i.test(ua)) osTag = 'IOS_DARWIN';
    else if (/Windows/i.test(ua)) osTag = 'WIN64_NT';
    else if (/Mac/i.test(ua)) osTag = 'MACOS_X64';

    return {
        ip: `192.168.${subnet}.${host}`,
        gateway: `192.168.${subnet}.1`,
        mac,
        port,
        nodeId: `0x${hex()}${hex()}${hex()}`,
        osTag
    };
};

const buildHackerLines = (trace: SimulatedDeviceTrace, isNetworkMode: boolean): string[] => {
    if (isNetworkMode) {
        return [
            `SCANNING TARGET HOST // YOUR IP: ${trace.ip}`,
            `GATEWAY DETECTED: ${trace.gateway} [MAC ${trace.mac}]`,
            `HACKING YOUR DEVICE... PROBING PORT ${trace.port}/TCP`,
            `INJECTING ENCRYPTED SOCKET PAYLOAD [TLS 1.3]`,
            `BYPASSING NAT FIREWALL & RELAYING NODE ${trace.nodeId}`,
            `CLONING OPERATIVE SESSION TOKEN... OK`,
            `HIJACKING BUNKER ENCLAVE TUNNEL... LINK ESTABLISHED`
        ];
    }
    return [
        `INTRUSION DETECTED // YOUR IP: ${trace.ip}`,
        `TARGET FINGERPRINT: ${trace.osTag} // MAC ${trace.mac}`,
        `HACKING YOUR DEVICE... EXPLOITING PORT ${trace.port}`,
        `BYPASSING KERNEL FIREWALL & READING MEMORY HEAP`,
        `DUMPING CREDENTIAL CACHE -> NODE ${trace.nodeId}`,
        `MOUNTING 12-GAUGE CHAMBER & 3D BUNKER GEOMETRY`,
        `OVERRIDING CAMERA & AUDIO DRIVERS... LOCKED`,
        `ROOT ACCESS GRANTED // ENTERING DEALER BUNKER`
    ];
};

const getStageInfo = (pct: number, isNetworkMode: boolean, isSlowWait: boolean, trace: SimulatedDeviceTrace) => {
    if (isNetworkMode) {
        if (isSlowWait && pct >= 70) {
            return { stage: 4, total: 4, label: `WAKING REMOTE ENCLAVE // IP ${trace.ip}` };
        }
        if (pct < 25) return { stage: 1, total: 4, label: `TRACING YOUR IP: ${trace.ip}` };
        if (pct < 55) return { stage: 2, total: 4, label: `HACKING PORT ${trace.port} // TLS TUNNEL` };
        if (pct < 75) return { stage: 3, total: 4, label: `SPOOFING SESSION KEY [${trace.nodeId}]` };
        return { stage: 4, total: 4, label: `BREACH COMPLETE — JOINING ENCLAVE` };
    }

    if (pct < 20) return { stage: 1, total: 5, label: `LOCATING TARGET // YOUR IP: ${trace.ip}` };
    if (pct < 42) return { stage: 2, total: 5, label: `HACKING YOUR DEVICE [${trace.osTag}]` };
    if (pct < 66) return { stage: 3, total: 5, label: `BYPASSING FIREWALL // PORT ${trace.port}` };
    if (pct < 90) return { stage: 4, total: 5, label: `INJECTING 3D CHAMBER & AUDIO KERNEL` };
    return { stage: 5, total: 5, label: `ROOT ACCESS GRANTED — ENTERING BUNKER` };
};

export const LoadingScreen: React.FC<LoadingScreenProps> = React.memo(({
    onComplete,
    onBack,
    text: initialText = "HACKING YOUR DEVICE...",
    duration = 1400,
    error,
    onRetry,
    showClose = false,
    progress: progressProp,
    getProgress
}) => {
    const [displayProgress, setDisplayProgress] = useState(0);
    const [terminalLines, setTerminalLines] = useState<string[]>([]);
    const [isSlowWait, setIsSlowWait] = useState(false);
    const [isExiting, setIsExiting] = useState(false);
    const barFillRef = useRef<HTMLDivElement>(null);

    const trace = useMemo(() => generateSimulatedTrace(), []);
    const warningText = useMemo(
        () => WARNINGS[Math.floor(Math.random() * WARNINGS.length)],
        []
    );

    const onCompleteRef = useRef(onComplete);
    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    const progressPropRef = useRef(progressProp);
    useEffect(() => {
        progressPropRef.current = progressProp;
    }, [progressProp]);

    const getProgressRef = useRef(getProgress);
    useEffect(() => {
        getProgressRef.current = getProgress;
    }, [getProgress]);

    const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearPendingTimers = useCallback(() => {
        if (completionTimerRef.current !== null) {
            clearTimeout(completionTimerRef.current);
            completionTimerRef.current = null;
        }
    }, []);

    const isNetworkMode = showClose || (typeof progressProp === 'undefined' && typeof getProgress === 'undefined');

    useEffect(() => {
        if (error) {
            clearPendingTimers();
            setIsSlowWait(false);
        }
    }, [error, clearPendingTimers]);

    useEffect(() => {
        return () => clearPendingTimers();
    }, [clearPendingTimers]);

    // Smooth non-blocking progress loop (polls live getProgress without freezing or stalling)
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

        const effectiveDuration = Math.max(450, duration);
        // Hard fail-safe cap so slow background GLB preloads never freeze Start Game indefinitely
        const hardFinishMs = Math.max(effectiveDuration * 1.9, 2600);

        const tick = (now: number) => {
            if (!active) return;

            const deltaMs = Math.min(now - lastTime, 50);
            lastTime = now;
            const elapsed = now - startTime;

            const liveTarget =
                typeof getProgressRef.current === 'function'
                    ? getProgressRef.current()
                    : progressPropRef.current;

            if (isNetworkMode) {
                if (internalProgress < 88) {
                    const remaining = 88 - internalProgress;
                    internalProgress += Math.min(remaining * 0.05, (deltaMs / (effectiveDuration * 1.5)) * 60);
                }
                if (elapsed > 4000) {
                    setIsSlowWait(true);
                }
            } else {
                // Minimum smooth time-driven progression so UI feels crisp & alive
                const timeFloor = Math.min(100, (elapsed / effectiveDuration) * 100);
                let targetVal = timeFloor;

                if (typeof liveTarget === 'number' && !Number.isNaN(liveTarget)) {
                    const clampedLive = Math.max(0, Math.min(liveTarget, 100));
                    if (elapsed >= hardFinishMs) {
                        targetVal = 100;
                    } else if (clampedLive >= 100) {
                        targetVal = timeFloor;
                    } else {
                        // Blend asset progress with time floor so bar never freezes at 0% or stalls mid-way
                        targetVal = Math.min(96, Math.max(clampedLive, timeFloor * 0.85));
                    }
                }

                const diff = targetVal - internalProgress;
                if (diff > 0) {
                    internalProgress = Math.min(
                        100,
                        internalProgress + Math.max(diff * 0.22, (deltaMs / effectiveDuration) * 75)
                    );
                } else if (targetVal >= 100) {
                    internalProgress = 100;
                }
            }

            const nextVal = Math.min(100, Math.max(lastRenderedProgress, internalProgress));
            if (barFillRef.current) {
                barFillRef.current.style.transform = `translate3d(${nextVal - 100}%, 0, 0)`;
            }
            if (nextVal - lastRenderedProgress >= 2.0 || (nextVal >= 100 && lastRenderedProgress < 100)) {
                lastRenderedProgress = nextVal;
                setDisplayProgress(nextVal);
            }

            if (!isNetworkMode && nextVal >= 100 && !completionScheduled) {
                completionScheduled = true;
                setIsExiting(true);
                completionTimerRef.current = setTimeout(() => {
                    completionTimerRef.current = null;
                    if (active) onCompleteRef.current();
                }, LOADING_EXIT_DURATION_MS);
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
    }, [duration, error, isNetworkMode]);

    // Escape cancels network loading
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

    // Hacker intrusion terminal stream
    useEffect(() => {
        if (error) return;
        const lines = buildHackerLines(trace, isNetworkMode);
        setTerminalLines([`> ${lines[0]}`]);
        let current = 1;
        const intervalTime = Math.max(110, Math.floor(duration / lines.length));

        const lineInterval = setInterval(() => {
            if (current < lines.length) {
                const lineText = `> ${lines[current]}`;
                current++;
                setTerminalLines((prev) => [...prev, lineText].slice(-5));
            } else {
                clearInterval(lineInterval);
            }
        }, intervalTime);

        return () => clearInterval(lineInterval);
    }, [duration, isNetworkMode, error, trace]);

    const clampedPct = Math.min(100, Math.max(0, displayProgress));
    const roundedPct = Math.round(clampedPct);
    const stageInfo = getStageInfo(clampedPct, isNetworkMode, isSlowWait, trace);

    return (
        <div
            className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black text-green-400 font-mono overflow-hidden select-none"
            style={{
                paddingTop: 'max(env(safe-area-inset-top, 0px), 10px)',
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 10px)',
                paddingLeft: 'max(env(safe-area-inset-left, 0px), 12px)',
                paddingRight: 'max(env(safe-area-inset-right, 0px), 12px)'
            }}
        >
            {/* Cancel / Back button for network/multiplayer loading */}
            {showClose && onBack && (
                <button
                    onClick={onBack}
                    style={{
                        top: 'max(env(safe-area-inset-top, 0px), 12px)',
                        right: 'max(env(safe-area-inset-right, 0px), 12px)'
                    }}
                    className="absolute z-[320] bg-stone-950 hover:bg-stone-900 border border-green-800/80 hover:border-green-400 text-green-400 hover:text-green-200 min-h-[40px] min-w-[40px] px-3 py-1.5 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer touch-manipulation"
                    title="Cancel Connection (Esc)"
                    aria-label="Cancel connection"
                >
                    <span className="text-[10px] tracking-widest font-black hidden sm:inline uppercase">ABORT</span>
                    <X size={16} />
                </button>
            )}

            {/* Lightweight CRT Grid Tech Overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#052e16_1px,transparent_1px),linear-gradient(to_bottom,#052e16_1px,transparent_1px)] bg-[size:3rem_3rem] opacity-25 pointer-events-none" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.09)_0%,rgba(0,0,0,0.92)_70%)] pointer-events-none" />

            {/* Main Center Intrusion Console */}
            <div
                data-testid="loading-console"
                className={`relative z-10 flex flex-col items-center w-[94vw] max-w-lg px-4 py-3.5 sm:p-6 rounded-2xl border border-green-700/70 bg-stone-950/95 shadow-[0_0_40px_rgba(0,0,0,0.95),0_0_24px_rgba(34,197,94,0.16)] ${
                    error ? 'opacity-0 pointer-events-none' : isExiting ? 'cinematic-console-out pointer-events-none' : 'cinematic-console-in'
                }`}
            >
                {/* Tech Corner Brackets */}
                <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-green-500/80 pointer-events-none" />
                <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-green-500/80 pointer-events-none" />
                <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-green-500/80 pointer-events-none" />
                <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-green-500/80 pointer-events-none" />

                {/* Top Telemetry Strip (IP + Status) */}
                <div className="w-full flex items-center justify-between gap-2 mb-2 pb-2 border-b border-green-900/60 text-[9px] sm:text-[10px]">
                    <div className="flex items-center gap-1.5 text-red-400 font-black tracking-[0.18em] uppercase truncate">
                        {isNetworkMode ? (
                            <Wifi size={12} className="text-green-400 shrink-0" />
                        ) : (
                            <ShieldAlert size={12} className="text-red-500 shrink-0" />
                        )}
                        <span className="truncate">{isNetworkMode ? "ENCLAVE BREACH" : "SYSTEM BREACH // ROOT"}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono font-bold text-green-300 tabular-nums shrink-0">
                        <span className="text-green-600">YOUR IP:</span>
                        <span className="px-1.5 py-0.5 rounded bg-green-950/80 border border-green-700/60 text-green-300">
                            {trace.ip}
                        </span>
                    </div>
                </div>

                {/* Main Headline */}
                <div className="text-sm sm:text-xl font-black tracking-[0.18em] mb-2 text-center uppercase text-green-300">
                    {initialText}
                </div>

                {/* Live Hacker Intrusion Console (Visible on mobile landscape + desktop) */}
                <div className="w-full bg-black/90 border border-green-900/70 rounded-xl px-3 py-2 mb-2.5 text-left font-mono text-[9px] sm:text-[10.5px] leading-snug min-h-[76px] sm:min-h-[96px] flex flex-col justify-end overflow-hidden">
                    <div className="flex items-center justify-between text-[8px] text-green-700 border-b border-green-950 pb-1 mb-1 uppercase tracking-widest">
                        <span>root@bunker:~# exploit --target {trace.ip}:{trace.port}</span>
                        <span className="text-red-500 font-bold">MAC {trace.mac.slice(0, 8)}</span>
                    </div>
                    {terminalLines.map((line, i) => {
                        const isLatest = i === terminalLines.length - 1;
                        return (
                            <div
                                key={`${i}-${line.slice(0, 14)}`}
                                className={`truncate tracking-wide ${
                                    isLatest ? 'text-green-300 font-bold' : 'text-green-600/90'
                                }`}
                            >
                                {line}
                            </div>
                        );
                    })}
                </div>

                {/* Progress Bar */}
                <div className="w-full relative">
                    <div className="w-full h-4 sm:h-5 border-2 border-green-800/90 bg-black p-0.5 relative rounded-md overflow-hidden">
                        <div className="w-full h-full relative overflow-hidden rounded-sm">
                            <div
                                ref={barFillRef}
                                className="w-full h-full bg-gradient-to-r from-green-700 via-emerald-500 to-green-400 rounded-sm relative will-change-transform"
                                style={{
                                    transform: 'translate3d(-100%, 0, 0)'
                                }}
                            >
                                <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_50%,rgba(0,0,0,0.4)_50%)] bg-[size:8px_100%]" />
                                <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-white" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Metrics Readout */}
                <div className="mt-2 flex items-center justify-between w-full font-mono px-0.5 gap-2">
                    <span className="text-green-500 text-[9px] sm:text-[10.5px] font-bold tracking-wider uppercase flex items-center gap-1.5 min-w-0">
                        <Terminal size={11} className="text-green-400 shrink-0" />
                        <span className="truncate">{stageInfo.label}</span>
                    </span>
                    <span className="text-green-300 font-black text-sm sm:text-lg tracking-wider tabular-nums shrink-0">
                        {roundedPct}%
                    </span>
                </div>

                {/* Footer Warning Strip */}
                <div className="mt-2 pt-2 border-t border-green-950/90 w-full flex items-center justify-between gap-2 text-[8px] sm:text-[9px] text-green-700 font-bold tracking-[0.14em] uppercase">
                    <span className="flex items-center gap-1 truncate">
                        <Lock size={10} className="text-green-700 shrink-0" />
                        <span className="truncate">{warningText}</span>
                    </span>
                    <span className="flex items-center gap-1 text-green-600 shrink-0 tabular-nums">
                        <Cpu size={10} />
                        <span>{stageInfo.stage}/{stageInfo.total}</span>
                    </span>
                </div>
            </div>

            {/* Error UI Overlay */}
            {error && (
                <div className="absolute inset-0 z-[310] flex flex-col items-center justify-center bg-black/95 p-4 sm:p-6">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.18)_0%,transparent_70%)] pointer-events-none" />

                    <div className="max-w-md w-full border-2 border-red-700/80 bg-stone-950 p-5 sm:p-7 rounded-2xl shadow-[0_0_60px_rgba(220,38,38,0.3)] flex flex-col items-center text-center relative font-mono">
                        <div className="absolute top-3 left-3 w-3 h-3 border-t-2 border-l-2 border-red-500 pointer-events-none" />
                        <div className="absolute top-3 right-3 w-3 h-3 border-t-2 border-r-2 border-red-500 pointer-events-none" />
                        <div className="absolute bottom-3 left-3 w-3 h-3 border-b-2 border-l-2 border-red-500 pointer-events-none" />
                        <div className="absolute bottom-3 right-3 w-3 h-3 border-b-2 border-r-2 border-red-500 pointer-events-none" />

                        <div className="text-red-500 mb-3 flex flex-col items-center gap-1.5">
                            <AlertTriangle size={36} className="text-red-500" />
                            <div className="text-xl sm:text-2xl font-black tracking-tight uppercase italic">
                                SERVER OFFLINE
                            </div>
                            <div className="text-[10px] text-stone-400 font-bold uppercase tracking-[0.22em]">
                                Multiplayer Enclave Unreachable
                            </div>
                        </div>

                        <div className="w-full text-xs text-red-300 border border-red-900/60 bg-red-950/40 px-4 py-2.5 rounded-xl uppercase tracking-wider leading-relaxed mb-4 break-words max-h-28 overflow-y-auto font-semibold select-text">
                            {error}
                        </div>

                        <div className="flex flex-col gap-2 w-full">
                            {onRetry && (
                                <button
                                    onClick={onRetry}
                                    className="min-h-[44px] bg-gradient-to-r from-green-950 via-green-900 to-green-950 hover:from-green-900 hover:to-green-800 text-green-300 hover:text-white border border-green-700/80 hover:border-green-400 font-bold uppercase tracking-[0.22em] text-xs transition-all rounded-xl active:scale-98 cursor-pointer flex items-center justify-center touch-manipulation"
                                >
                                    RETRY CONNECTION
                                </button>
                            )}
                            {onBack && (
                                <button
                                    onClick={onBack}
                                    className="min-h-[42px] bg-stone-900 hover:bg-stone-800 border border-stone-700 hover:border-stone-500 text-stone-300 hover:text-white font-bold uppercase tracking-[0.22em] text-xs transition-all rounded-xl active:scale-98 cursor-pointer touch-manipulation"
                                >
                                    RETURN TO MAIN MENU
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

LoadingScreen.displayName = 'LoadingScreen';
