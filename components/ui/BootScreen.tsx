import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { audioManager } from '../../utils/audioManager';
import { getDeviceType } from '../../utils/gameUtils';

interface BootScreenProps {
    onContinue?: () => void;
}

const SYSTEM_PRINTS = [
    { pct: 0, text: "INIT BIOS CORE PROTOCOL... OK" },
    { pct: 2, text: "LOADING OS KERNEL v1.1.3... SUCCESS" },
    { pct: 4, text: "VERIFYING CRYPTOGRAPHIC HANDSHAKE... OK" },
    { pct: 7, text: "VERIFYING SYSTEM MEMORY INTEGRITY... 65536KB SYSTEM RAM OK" },
    { pct: 10, text: "MOUNTING SECTOR A-12 FILE SYSTEM... READ-ONLY" },
    { pct: 16, text: "ALLOCATING SEGMENT SPACE... SUCCESS" },
    { pct: 20, text: "MOUNTING AUDIO ENGINE... OK" },
    { pct: 24, text: "INITIALIZING GRAPHICS PIPELINE ENGINE... OK" },
    { pct: 28, text: "ESTABLISHING SOULS CONTRACT DIRECTIVES... SECURE" },
    { pct: 32, text: "CACHING SYSTEM AUDIO RESOURCES..." },
    { pct: 36, text: "DETECTING WEBGL 2.0 DEVICE CONTEXT... COMPATIBLE" },
    { pct: 40, text: "COMPILING DEPTH PASS FRAGMENT SHADERS... SUCCESS" },
    { pct: 44, text: "PARSING MODEL MESH CONSTRAINTS... OK" },
    { pct: 48, text: "DESERIALIZING SHOTGUN CHAMBER GEOMETRIES... OK" },
    { pct: 52, text: "CACHING HIGH-RESOLUTION TEXTURE ATLAS... LOADED" },
    { pct: 56, text: "LOAD ADRENALINE EXTRACTION SYSTEMS... OK" },
    { pct: 60, text: "INJECTING DEALER AI BEHAVIOR PATTERNS... GOD MODE ACTIVE" },
    { pct: 64, text: "ESTABLISHING NEURAL LINK... SECURED" },
    { pct: 68, text: "LOADING COMPRESSED SFX BUFFERS... OK" },
    { pct: 72, text: "COMPILING 3D RENDER SCHEMAS... OK" },
    { pct: 76, text: "OPTIMIZING SHADER CACHE STRATEGY... OK" },
    { pct: 80, text: "WARMING UP WEBGL CONTEXT BUFFER... OK" },
    { pct: 84, text: "WARMING UP GPU INSTANCED DRAW BUFFERS... OK" },
    { pct: 88, text: "SECURING PIPELINE THREADS... BUFFER WAIT" },
    { pct: 92, text: "VALIDATING SECURE WEBSOCKET HANDSHAKE... SECURED" },
    { pct: 96, text: "FINALIZING LOBBY STAGING HANDSHAKE... OK" },
    { pct: 99, text: "COMMENCING SOUL EXTRACTION PIPELINE... READY" },
    { pct: 100, text: "SYSTEM SYNCHRONIZED. SOUL LINK SECURED." }
];

export const BootScreen: React.FC<BootScreenProps> = React.memo(({ onContinue }) => {
    const [bootLines, setBootLines] = useState<string[]>([]);
    const [isExiting, setIsExiting] = useState(false);
    const hasCompletedRef = useRef(false);
    const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const progressRef = useRef(0);
    const barFillRef = useRef<HTMLDivElement>(null);
    const onContinueRef = useRef(onContinue);

    useEffect(() => {
        onContinueRef.current = onContinue;
    }, [onContinue]);

    const isMobileOrTablet = useMemo(() => {
        const device = getDeviceType();
        return device === 'mobile' || device === 'tablet';
    }, []);

    const finishBoot = useCallback(() => {
        if (hasCompletedRef.current) return;
        hasCompletedRef.current = true;
        setIsExiting(true);
        if (completeTimerRef.current !== null) {
            clearTimeout(completeTimerRef.current);
        }
        completeTimerRef.current = setTimeout(() => {
            completeTimerRef.current = null;
            if (onContinueRef.current) onContinueRef.current();
        }, 150);
    }, []);

    useEffect(() => {
        setBootLines([]);
        progressRef.current = 0;
        if (barFillRef.current) {
            barFillRef.current.style.transform = 'translate3d(-100%, 0, 0)';
        }

        const startTime = Date.now();
        const MAX_LOADING_TIME = 2400;
        const tickRate = isMobileOrTablet ? 40 : 45;
        const deviceLine = `DETECTING CLIENT DEVICE... ${isMobileOrTablet ? 'PORTABLE HANDHELD' : 'STANDARD WORKSTATION'} OK`;

        const printedLines = new Set<string>();
        let lastAudioPct = -1;

        const interval = setInterval(() => {
            if (hasCompletedRef.current) {
                clearInterval(interval);
                return;
            }

            const timeElapsed = Date.now() - startTime;
            const audioProgress = audioManager.getAudioLoadingProgress();
            const p = progressRef.current;
            let nextP = p;

            if (p < 88) {
                nextP = Math.min(88, p + (isMobileOrTablet ? 5.2 : 3.2));
            } else if (p < 100) {
                if (audioProgress === 100 || timeElapsed >= MAX_LOADING_TIME) {
                    nextP = Math.min(100, p + 6.0);
                }
            }

            if (nextP !== p) {
                progressRef.current = nextP;
                if (barFillRef.current) {
                    barFillRef.current.style.transform = `translate3d(${Math.min(100, Math.max(0, nextP)) - 100}%, 0, 0)`;
                }
            }

            const newlyAdded: string[] = [];
            for (const item of SYSTEM_PRINTS) {
                if (nextP >= item.pct && !printedLines.has(item.text)) {
                    printedLines.add(item.text);
                    newlyAdded.push(item.text);
                    if (item.pct === 7 && !printedLines.has(deviceLine)) {
                        printedLines.add(deviceLine);
                        newlyAdded.push(deviceLine);
                    }
                }
            }

            const showAudioLine = nextP >= 35 && nextP < 75 && audioProgress !== lastAudioPct;
            if (showAudioLine) {
                lastAudioPct = audioProgress;
            }

            if (newlyAdded.length > 0 || showAudioLine) {
                setBootLines((prev) => {
                    let next = showAudioLine
                        ? prev.filter((l) => !l.startsWith('BUFFERING AUDIO RESOURCE'))
                        : prev.slice();
                    if (newlyAdded.length > 0) {
                        next = next.concat(newlyAdded);
                    }
                    if (showAudioLine) {
                        next.push(`BUFFERING AUDIO RESOURCE BLOCK: ${audioProgress}%`);
                    }
                    return next.slice(-20);
                });
            }

            if (nextP >= 100) {
                clearInterval(interval);
                finishBoot();
            }
        }, tickRate);

        return () => {
            clearInterval(interval);
            if (completeTimerRef.current !== null) {
                clearTimeout(completeTimerRef.current);
                completeTimerRef.current = null;
            }
        };
    }, [isMobileOrTablet, finishBoot]);

    return (
        <div
            className={`fixed inset-0 z-[100] h-[100dvh] bg-black flex flex-col justify-between gap-2 p-4 md:p-12 font-mono select-none transform-gpu transition-opacity duration-200 overflow-y-auto overscroll-contain ${
                isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
            style={{
                paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)',
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
                paddingLeft: 'max(env(safe-area-inset-left, 0px), 16px)',
                paddingRight: 'max(env(safe-area-inset-right, 0px), 16px)'
            }}
        >
            <div className="flex justify-between items-start gap-2 text-stone-600 text-[9px] sm:text-xs shrink-0">
                <span className="truncate">BUGSHOT_OS v1.0.0</span>
                <span className="shrink-0">MEM: 65536KB OK</span>
            </div>
            <div className="flex-1 min-h-0 flex flex-col justify-center max-w-lg mx-auto w-full gap-2 sm:gap-4 my-auto min-w-0">
                <div className="text-green-500 text-[9px] sm:text-xs md:text-sm space-y-1 flex-1 min-h-0 max-h-[16rem] sm:max-h-[24rem] md:max-h-[30rem] overflow-hidden flex flex-col justify-end min-w-0">
                    {bootLines.map((line, i) => (
                        <div
                            key={`${i}-${line.slice(0, 12)}`}
                            className="typewriter truncate text-green-400 shrink-0 leading-normal tracking-wider min-w-0"
                        >
                            {`> ${line}`}
                        </div>
                    ))}
                    <div className="text-green-400 animate-pulse shrink-0 leading-normal tracking-wider">
                        _
                    </div>
                </div>
                <div className="w-full h-2 shrink-0 bg-stone-900 border border-stone-850 p-0.5 relative rounded-sm overflow-hidden shadow-inner">
                    <div
                        ref={barFillRef}
                        className="w-full h-full bg-green-700 rounded-sm will-change-transform"
                        style={{
                            transform: 'translate3d(-100%, 0, 0)'
                        }}
                    />
                </div>
            </div>
            <div className="flex items-center justify-between gap-2 text-stone-600 text-[9px] sm:text-[10px] shrink-0">
                <span className="truncate tracking-widest uppercase">INITIALIZING AUDIO &amp; 3D PIPELINE...</span>
                <span className="shrink-0 uppercase tracking-widest text-green-700">SECURE</span>
            </div>
        </div>
    );
});

BootScreen.displayName = 'BootScreen';
