import React, { useEffect, useState } from 'react';
import { audioManager } from '../../utils/audioManager';
import { getDeviceType } from '../../utils/gameUtils';

interface BootScreenProps {
    onContinue?: () => void;
}

export const BootScreen: React.FC<BootScreenProps> = ({ onContinue }) => {
    const [bootLines, setBootLines] = useState<string[]>([]);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [loadingComplete, setLoadingComplete] = useState(false);
    const device = getDeviceType();
    const isMobileOrTablet = device === 'mobile' || device === 'tablet';

    // Run boot sequence immediately
    useEffect(() => {
        setBootLines([]);
        setLoadingProgress(0);
        
        const startTime = Date.now();
        const MAX_LOADING_TIME = 6000; // 6 seconds safety timeout
        const tickRate = isMobileOrTablet ? 30 : 60;
        
        const systemPrints = [
            { pct: 0, text: "INIT BIOS CORE PROTOCOL... OK" },
            { pct: 10, text: `DETECTING CLIENT DEVICE... ${isMobileOrTablet ? 'PORTABLE HANDHELD' : 'STANDARD WORKSTATION'} OK` },
            { pct: 20, text: "MOUNTING AUDIO ENGINE... OK" },
            { pct: 35, text: "CACHING SYSTEM AUDIO RESOURCES..." },
            { pct: 75, text: "COMPILING 3D RENDER SCHEMAS... OK" },
            { pct: 90, text: "SECURING PIPELINE THREADS... BUFFER WAIT" },
            { pct: 100, text: "SYSTEM SYNCHRONIZED. SOUL LINK SECURED." }
        ];
        
        const printedLines = new Set<string>();

        const interval = setInterval(() => {
            const timeElapsed = Date.now() - startTime;
            const audioProgress = audioManager.getAudioLoadingProgress();
            
            setLoadingProgress(p => {
                let nextP = p;
                
                if (p < 90) {
                    nextP = p + (isMobileOrTablet ? 4 : 2);
                    if (nextP > 90) nextP = 90;
                } else if (p >= 90 && p < 100) {
                    if (audioProgress === 100 || timeElapsed >= MAX_LOADING_TIME) {
                        nextP = p + 2;
                        if (nextP > 100) nextP = 100;
                    }
                }
                
                systemPrints.forEach(item => {
                    if (nextP >= item.pct && !printedLines.has(item.text)) {
                        printedLines.add(item.text);
                        setBootLines(prev => [...prev, item.text]);
                    }
                });
                
                if (nextP >= 35 && nextP < 75) {
                    const audioMsg = `BUFFERING AUDIO RESOURCE BLOCK: ${audioProgress}%`;
                    setBootLines(prev => {
                        const filtered = prev.filter(l => !l.startsWith("BUFFERING AUDIO RESOURCE"));
                        return [...filtered, audioMsg];
                    });
                }
                
                if (nextP >= 100) {
                    clearInterval(interval);
                    setTimeout(() => {
                        if (onContinue) onContinue();
                    }, isMobileOrTablet ? 150 : 300);
                    return 100;
                }
                
                return nextP;
            });
        }, tickRate);

        return () => {
            clearInterval(interval);
        };
    }, [isMobileOrTablet]);

    // Boot sequence screen
    return (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col justify-between p-4 md:p-12 font-mono select-none transform translate3d(0,0,0)">
            <div className="flex justify-between items-start text-stone-600 text-[9px] sm:text-xs">
                <span>AADISH_OS v1.0.0</span>
                <span>MEM: 65536KB OK</span>
            </div>
            <div className="flex-1 flex flex-col justify-center max-w-lg mx-auto w-full gap-2 sm:gap-4 my-auto">
                <div className="text-green-500 text-[9px] sm:text-xs md:text-sm space-y-1.5 h-[35vh] max-h-[10rem] sm:max-h-[12rem] overflow-hidden flex flex-col justify-end">
                    {bootLines.map((line, i) => (
                        <div key={i} className="typewriter truncate text-green-400 drop-shadow-[0_0_4px_rgba(74,222,128,0.4)] shrink-0 leading-normal tracking-wider">
                            {`> ${line}`}
                        </div>
                    ))}
                    <div className="text-green-400 animate-pulse drop-shadow-[0_0_4px_rgba(74,222,128,0.4)] shrink-0 leading-normal tracking-wider">_</div>
                </div>
                <div className="w-full h-2 bg-stone-900 border border-stone-850 p-0.5 relative rounded-sm overflow-hidden shadow-inner">
                    <div 
                        className="h-full bg-green-700 relative overflow-hidden transition-all duration-100 ease-out will-change-[width] rounded-sm" 
                        style={{ width: `${Math.min(100, loadingProgress)}%`, transform: 'translate3d(0,0,0)' }} 
                    />
                </div>
            </div>
        </div>
    );
};
