import React, { useEffect, useState, useRef, useCallback } from 'react';
import { RefreshCw, Sparkles, X, ArrowRight, ShieldCheck } from 'lucide-react';

interface UpdateNotificationProps {
    isGameActive: boolean;
}

export const UpdateNotification: React.FC<UpdateNotificationProps> = ({ isGameActive }) => {
    const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
    const [isReloading, setIsReloading] = useState<boolean>(false);
    const [countdown, setCountdown] = useState<number | null>(null);
    const [isDismissed, setIsDismissed] = useState<boolean>(false);
    const [versionTag, setVersionTag] = useState<string | null>(null);
    const waitingWorkerRef = useRef<ServiceWorker | null>(null);

    // Apply the update: trigger skipWaiting if worker is pending and reload the window
    const applyUpdate = useCallback(() => {
        setIsReloading(true);
        try {
            if (waitingWorkerRef.current) {
                waitingWorkerRef.current.postMessage({ type: 'SKIP_WAITING' });
            } else if (navigator.serviceWorker?.controller) {
                navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
            }
        } catch {
            // Ignore messaging errors and proceed to reload
        }

        // Small grace period for service worker to claim clients before reload
        setTimeout(() => {
            window.location.reload();
        }, 150);
    }, []);

    // Service Worker Event & Message Listeners
    useEffect(() => {
        if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
            return;
        }

        const handleUpdateAvailable = (event: any) => {
            console.log('[PWA Update] Service worker update available.');
            const registration = event.detail as ServiceWorkerRegistration | undefined;
            if (registration?.waiting) {
                waitingWorkerRef.current = registration.waiting;
            }
            setUpdateAvailable(true);
            setIsDismissed(false);
        };

        const handleControllerChanged = () => {
            console.log('[PWA Update] Service worker controller changed. Fresh assets deployed.');
            setUpdateAvailable(true);
            setIsDismissed(false);
        };

        const handleSWMessage = (event: MessageEvent) => {
            if (event.data && event.data.type === 'UPDATE_AVAILABLE') {
                console.log('[PWA Update] Received UPDATE_AVAILABLE message:', event.data.version);
                if (event.data.version) {
                    setVersionTag(event.data.version);
                }
                setUpdateAvailable(true);
                setIsDismissed(false);
            }
        };

        window.addEventListener('sw-update-available', handleUpdateAvailable);
        window.addEventListener('sw-controller-changed', handleControllerChanged);
        navigator.serviceWorker.addEventListener('message', handleSWMessage);

        // Immediate check if a waiting worker is already parked
        navigator.serviceWorker.getRegistration().then((reg) => {
            if (reg?.waiting && navigator.serviceWorker.controller) {
                waitingWorkerRef.current = reg.waiting;
                setUpdateAvailable(true);
            }
        }).catch(() => {});

        return () => {
            window.removeEventListener('sw-update-available', handleUpdateAvailable);
            window.removeEventListener('sw-controller-changed', handleControllerChanged);
            navigator.serviceWorker.removeEventListener('message', handleSWMessage);
        };
    }, []);

    // Auto-reload countdown when in menu/lobby (never during active combat)
    useEffect(() => {
        if (!updateAvailable || isDismissed || isGameActive || isReloading) {
            setCountdown(null);
            return;
        }

        // Initialize 3-second countdown
        setCountdown(3);

        const timer = setInterval(() => {
            setCountdown((prev) => {
                if (prev === null) return null;
                if (prev <= 1) {
                    clearInterval(timer);
                    applyUpdate();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [updateAvailable, isDismissed, isGameActive, isReloading, applyUpdate]);

    if (!updateAvailable || isDismissed) {
        return null;
    }

    // Active Combat Mode: Non-intrusive floating HUD badge in the corner
    if (isGameActive) {
        return (
            <div className="fixed top-4 right-4 z-[99990] flex items-center gap-2 bg-stone-950/95 border border-emerald-500/50 text-emerald-400 px-3 py-2 rounded-xl shadow-[0_0_25px_rgba(16,185,129,0.25)] font-mono text-xs backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-300 pointer-events-auto">
                <div className="relative flex items-center justify-center">
                    <Sparkles size={14} className="text-emerald-400 animate-pulse" />
                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">UPDATE READY</span>
                    <span className="text-[9px] text-stone-400 font-bold">Applies after round</span>
                </div>
                <button
                    onClick={applyUpdate}
                    disabled={isReloading}
                    className="ml-2 bg-emerald-600/90 hover:bg-emerald-500 text-black px-2.5 py-1 rounded-lg font-black text-[10px] tracking-wider uppercase transition-all duration-150 active:scale-95 flex items-center gap-1 cursor-pointer"
                    title="Reload immediately"
                >
                    <RefreshCw size={11} className={isReloading ? "animate-spin" : ""} />
                    {isReloading ? "REFRESHING..." : "RELOAD"}
                </button>
                <button
                    onClick={() => setIsDismissed(true)}
                    className="text-stone-500 hover:text-stone-300 p-1 rounded-md transition-colors cursor-pointer"
                    title="Dismiss notification"
                >
                    <X size={13} />
                </button>
            </div>
        );
    }

    // Menu / Lobby Mode: Sleek Cyberpunk Terminal Notification Banner
    return (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[99990] w-[92vw] max-w-lg bg-stone-950/95 border border-emerald-500/60 rounded-2xl shadow-[0_0_40px_rgba(16,185,129,0.28)] p-3.5 sm:p-4 font-mono text-emerald-400 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-300 pointer-events-auto select-none">
            {/* Top ambient glow bar */}
            <div className="absolute top-0 left-8 right-8 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />

            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 p-2 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 shrink-0 shadow-inner">
                        <RefreshCw size={18} className={isReloading ? "animate-spin" : "animate-[spin_4s_linear_infinite]"} />
                    </div>
                    <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] sm:text-xs font-black tracking-widest text-emerald-300 uppercase">
                                [⚡ SYSTEM UPDATE DEPLOYED]
                            </span>
                            {versionTag && (
                                <span className="text-[8px] bg-emerald-950 text-emerald-400 border border-emerald-600/40 px-1.5 py-0.2 rounded font-mono font-bold">
                                    {versionTag}
                                </span>
                            )}
                        </div>
                        <p className="text-[10px] sm:text-[11px] text-stone-300 font-bold tracking-wide">
                            Fresh build & offline cache prepared.
                        </p>
                        <p className="text-[9px] text-emerald-400/90 font-mono tracking-wider">
                            {countdown !== null
                                ? `Reloading bunker in ${countdown}s to initialize...`
                                : `Ready to initialize updated protocols.`}
                        </p>
                    </div>
                </div>

                <button
                    onClick={() => {
                        setIsDismissed(true);
                        setCountdown(null);
                    }}
                    className="text-stone-500 hover:text-stone-300 p-1 rounded-lg hover:bg-stone-900/60 transition-colors shrink-0 cursor-pointer"
                    title="Dismiss"
                >
                    <X size={15} />
                </button>
            </div>

            {/* Bottom action controls */}
            <div className="mt-3 pt-2.5 border-t border-emerald-950/80 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[9px] text-stone-400 font-bold uppercase tracking-wider">
                    <ShieldCheck size={12} className="text-emerald-500" />
                    <span>100% Offline Compatible</span>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            setIsDismissed(true);
                            setCountdown(null);
                        }}
                        className="px-2.5 py-1 text-[10px] font-bold text-stone-400 hover:text-stone-200 tracking-wider uppercase transition-colors cursor-pointer"
                    >
                        LATER
                    </button>
                    <button
                        onClick={applyUpdate}
                        disabled={isReloading}
                        className="bg-emerald-500 hover:bg-emerald-400 text-stone-950 px-3.5 py-1.5 rounded-xl font-black text-[10px] sm:text-[11px] tracking-widest uppercase transition-all duration-150 active:scale-95 flex items-center gap-1.5 shadow-[0_0_15px_rgba(16,185,129,0.35)] cursor-pointer"
                    >
                        <span>{isReloading ? "RELOADING..." : "RELOAD NOW"}</span>
                        <ArrowRight size={12} className="stroke-[3]" />
                    </button>
                </div>
            </div>
        </div>
    );
};
