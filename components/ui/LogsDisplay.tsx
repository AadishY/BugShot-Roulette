import React, { useRef, useState, useEffect } from 'react';
import { LogEntry } from '../../types';
import { ChevronDown, ChevronUp, Terminal, Activity } from 'lucide-react';
import { audioManager } from '../../utils/audioManager';

interface LogsDisplayProps {
    logs: LogEntry[];
}

export const LogsDisplay: React.FC<LogsDisplayProps> = ({ logs }) => {
    const [isLogsOpen, setIsLogsOpen] = useState(false);
    const logsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isLogsOpen && logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, isLogsOpen]);

    const safeLogs = logs || [];

    const handleToggle = () => {
        audioManager.playSound('click');
        setIsLogsOpen(prev => !prev);
    };

    return (
        <div
            className={`transition-all duration-300 flex flex-col pointer-events-auto shadow-2xl backdrop-blur-2xl border border-stone-800 rounded-xl overflow-hidden bg-black/90 ${
                isLogsOpen ? 'h-64 sm:h-76 w-72 sm:w-84' : 'h-10 sm:h-11 w-32 sm:w-38'
            }`}
        >
            <button
                type="button"
                onClick={handleToggle}
                className="w-full h-10 sm:h-11 min-h-[40px] sm:min-h-[44px] flex items-center justify-between px-3 py-1.5 cursor-pointer bg-gradient-to-r from-stone-900 via-stone-950 to-black border-b border-stone-800/80 hover:bg-stone-850 transition-colors text-left select-none active:scale-98"
                aria-label="Toggle combat telemetry log"
            >
                <div className="flex items-center gap-1.5 text-stone-300">
                    <Terminal size={14} className="text-cyan-400 shrink-0" />
                    <span className="text-[9px] sm:text-[10px] font-mono font-black tracking-widest uppercase">
                        LOGS {safeLogs.length > 0 && `(${safeLogs.length})`}
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                </div>
                <div className="text-stone-400 p-0.5">
                    {isLogsOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </div>
            </button>

            {isLogsOpen && (
                <div className="relative flex-1 overflow-y-auto font-mono text-[9px] sm:text-xs p-2.5 sm:p-3 flex flex-col justify-end scrollbar-thin scrollbar-thumb-stone-800 scrollbar-track-transparent">
                    {/* Scanline pattern */}
                    <div className="absolute inset-0 bg-[linear-gradient(transparent_0%,rgba(255,255,255,0.02)_50%,transparent_100%)] bg-[length:100%_3px] pointer-events-none" />

                    <div className="space-y-1.5 relative z-10">
                        {safeLogs.map((log, idx) => {
                            let typeColor = 'text-stone-400';
                            let tagBadge = '[SYS]';
                            let tagColor = 'text-stone-500 bg-stone-900 border-stone-800';

                            if (log.type === 'danger') {
                                typeColor = 'text-red-400 font-bold';
                                tagBadge = '[CRIT]';
                                tagColor = 'text-red-400 bg-red-955/80 border-red-500/40';
                            } else if (log.type === 'safe') {
                                typeColor = 'text-emerald-400 font-bold';
                                tagBadge = '[SAFE]';
                                tagColor = 'text-emerald-400 bg-emerald-955/80 border-emerald-500/40';
                            } else if (log.type === 'info') {
                                typeColor = 'text-cyan-300';
                                tagBadge = '[INTEL]';
                                tagColor = 'text-cyan-400 bg-cyan-955/80 border-cyan-500/40';
                            } else if (log.type === 'dealer') {
                                typeColor = 'text-amber-400 font-black';
                                tagBadge = '[HOSTILE]';
                                tagColor = 'text-amber-400 bg-amber-955/80 border-amber-500/40';
                            }

                            return (
                                <div key={log.id || idx} className={`leading-relaxed break-words text-[8.5px] sm:text-[10px] flex items-baseline gap-1.5 ${typeColor}`}>
                                    <span className={`text-[7px] font-mono px-1 py-0.2 rounded border font-bold uppercase shrink-0 ${tagColor}`}>
                                        {tagBadge}
                                    </span>
                                    <span>{log.text}</span>
                                </div>
                            );
                        })}
                        <div ref={logsEndRef} />
                    </div>
                </div>
            )}
        </div>
    );
};
