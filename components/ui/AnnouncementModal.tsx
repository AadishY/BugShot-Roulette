import React, { useEffect, useState } from 'react';
import { X, Bell } from 'lucide-react';

interface AnnouncementModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AnnouncementModal: React.FC<AnnouncementModalProps> = ({ isOpen, onClose }) => {
    const [isFrameLoaded, setIsFrameLoaded] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setIsFrameLoaded(false);
            return;
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        const timer = window.setTimeout(() => setIsFrameLoaded(true), 180);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.clearTimeout(timer);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-300"
            role="dialog"
            aria-modal="true"
            aria-label="System Announcement"
            style={{
                paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
                paddingLeft: 'max(env(safe-area-inset-left, 0px), 8px)',
                paddingRight: 'max(env(safe-area-inset-right, 0px), 8px)'
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    onClose();
                }
            }}
        >
            <div className="relative w-full max-w-3xl max-h-[95dvh] sm:max-h-[92dvh] bg-stone-950/95 border-2 border-stone-800/80 p-2 sm:p-5 rounded-xl sm:rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] font-mono flex flex-col overflow-hidden [@media(max-height:540px)]:p-2">
                <button
                    onClick={onClose}
                    className="small-btn absolute top-1.5 right-1.5 sm:top-3.5 sm:right-3.5 [@media(max-height:540px)]:top-1.5 [@media(max-height:540px)]:right-1.5 text-stone-300 hover:text-red-400 bg-stone-900/60 hover:bg-red-955/30 border border-stone-850 hover:border-red-500/45 w-7 h-7 sm:w-9 sm:h-9 [@media(max-height:540px)]:w-7 [@media(max-height:540px)]:h-7 rounded-lg z-50 cursor-pointer flex items-center justify-center shadow-lg hover:shadow-[0_0_15px_rgba(239,68,68,0.25)] transition-all"
                    title="Close Announcement"
                    aria-label="Close Announcement"
                >
                    <X size={14} />
                </button>

                <div className="absolute top-0 left-0 w-full h-[2px] bg-amber-500/30 animate-[scan-line-move_4s_linear_infinite]" />

                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-stone-900 mb-2 sm:pb-2.5 sm:mb-3 pr-9 sm:pr-12 [@media(max-height:540px)]:pr-9 [@media(max-height:540px)]:pb-1 [@media(max-height:540px)]:mb-1.5 shrink-0">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <div className="p-1 sm:p-1.5 bg-amber-500/10 text-amber-300 rounded-lg">
                            <Bell size={13} className="sm:w-[17px] sm:h-[17px]" />
                        </div>
                        <div>
                            <p className="text-[7.5px] sm:text-[9.5px] uppercase tracking-[0.2em] sm:tracking-[0.3em] text-amber-400 font-black">System Announcement</p>
                            <h2 className="text-[11px] sm:text-base md:text-lg font-black text-stone-100 tracking-wider sm:tracking-widest leading-tight">Live Broadcast Panel</h2>
                        </div>
                    </div>
                    <span className="px-1.5 py-0.5 text-[7px] sm:text-[9px] uppercase tracking-[0.2em] sm:tracking-[0.3em] font-black bg-stone-900 border border-amber-500/30 text-amber-300 rounded-full shrink-0">
                        Active
                    </span>
                </div>

                <div className="flex flex-col gap-2 sm:gap-3 [@media(max-height:540px)]:grid [@media(max-height:540px)]:grid-cols-2 [@media(max-height:540px)]:items-center [@media(max-height:540px)]:gap-2 overflow-y-auto pr-1 text-stone-300 custom-scrollbar">
                    <div className="bg-stone-900/80 border border-stone-800 p-2 sm:p-3.5 rounded-xl flex flex-col justify-center items-start gap-1">
                        <div className="text-left space-y-0.5 sm:space-y-1.5">
                            <p className="text-amber-300 uppercase tracking-[0.2em] sm:tracking-[0.3em] text-[7.5px] sm:text-[9.5px] font-black">NEW PLAYER MODELS</p>
                            <h3 className="text-stone-100 text-[11px] sm:text-sm md:text-base font-black tracking-wide sm:tracking-wider leading-snug">Fresh character visuals are now live.</h3>
                            <p className="text-stone-400 text-[8.5px] sm:text-xs leading-snug sm:leading-relaxed">
                                Dive into the updated player model lineup with enhanced animation detail, sharper textures, and a more expressive lobby presence. Watch the preview to see the new rigs in action.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                        <div className="relative overflow-hidden rounded-xl sm:rounded-2xl border border-stone-800/90 bg-stone-950/90 shadow-[0_16px_50px_rgba(0,0,0,0.85)]">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.18),transparent_55%)] pointer-events-none" />
                            <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/70 pointer-events-none" />
                            <div className="relative aspect-video w-full overflow-hidden rounded-xl sm:rounded-2xl bg-stone-950">
                                {!isFrameLoaded && (
                                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-stone-950/95">
                                        <div className="flex flex-col items-center gap-2 text-center">
                                            <div className="h-7 w-7 sm:h-9 sm:w-9 animate-spin rounded-full border-2 border-amber-400/40 border-t-amber-300" />
                                            <p className="text-[8.5px] sm:text-[10px] uppercase tracking-[0.25em] text-stone-400">Loading preview…</p>
                                        </div>
                                    </div>
                                )}
                                <iframe
                                    className={`absolute inset-0 h-full w-full rounded-xl sm:rounded-2xl border-0 transition-opacity duration-300 ${isFrameLoaded ? 'opacity-100' : 'opacity-0'}`}
                                    src="https://www.youtube.com/embed/nwWeNF0ljNQ?si=VZKOk7WieMm5P6iK&rel=0&modestbranding=1&playsinline=1&controls=1&showinfo=0"
                                    title="New Player Models Preview"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                    allowFullScreen
                                    loading="eager"
                                    referrerPolicy="strict-origin-when-cross-origin"
                                    onLoad={() => setIsFrameLoaded(true)}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
