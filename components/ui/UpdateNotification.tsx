import React, { useEffect, useState, useCallback, useRef } from 'react';
import { RefreshCw, X, Sparkles, WifiOff, Wifi } from 'lucide-react';
import { shouldAllowUpdateReload, recordUpdateReload } from '../../utils/updateGuard';

interface UpdateNotificationProps {
    onUpdateAccepted?: () => void;
}

const getSafeSessionStorage = () => {
    try {
        return typeof window !== 'undefined' ? window.sessionStorage : null;
    } catch {
        return null;
    }
};

const getWorkerKey = (registration?: ServiceWorkerRegistration | null): string => {
    const sw = registration?.waiting || registration?.installing || registration?.active;
    if (!sw) return 'default';
    return `${sw.scriptURL || 'sw.js'}::${sw.state || 'waiting'}`;
};

export const UpdateNotification: React.FC<UpdateNotificationProps> = ({ onUpdateAccepted }) => {
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [showOnlineToast, setShowOnlineToast] = useState(false);
    const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

    const hasReloadedRef = useRef(false);
    const isApplyingRef = useRef(false);
    const workerKeyRef = useRef<string>('default');

    const executeSingleReload = useCallback(() => {
        if (hasReloadedRef.current) return;
        const storage = getSafeSessionStorage();
        if (!shouldAllowUpdateReload(storage, workerKeyRef.current)) {
            setUpdateAvailable(false);
            setIsUpdating(false);
            return;
        }
        hasReloadedRef.current = true;
        recordUpdateReload(storage, workerKeyRef.current);
        window.location.reload();
    }, []);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            setShowOnlineToast(true);
            setTimeout(() => setShowOnlineToast(false), 3000);
        };

        const handleOffline = () => {
            setIsOnline(false);
            setShowOnlineToast(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        const storage = getSafeSessionStorage();
        // If we just finished an update reload moments ago, suppress duplicate banner/reloads on this load
        if (!shouldAllowUpdateReload(storage, 'recent')) {
            return;
        }

        const handleUpdateAvailable = (event: Event) => {
            if (hasReloadedRef.current || isApplyingRef.current) return;
            const customEvent = event as CustomEvent<ServiceWorkerRegistration>;
            const reg = customEvent.detail || (window as any).swRegistration || null;
            if (!reg?.waiting) return;

            const key = getWorkerKey(reg);
            if (!shouldAllowUpdateReload(storage, key)) return;

            workerKeyRef.current = key;
            setRegistration(reg);
            setUpdateAvailable(true);
            setDismissed(false);
        };

        const handleControllerChanged = () => {
            // Only reload when WE triggered SKIP_WAITING, OR once if another tab activated a new SW
            if (isApplyingRef.current) {
                executeSingleReload();
                return;
            }
            if (!hasReloadedRef.current && shouldAllowUpdateReload(storage, 'controllerchange')) {
                workerKeyRef.current = 'controllerchange';
                executeSingleReload();
            }
        };

        window.addEventListener('sw-update-available', handleUpdateAvailable);
        window.addEventListener('sw-controller-changed', handleControllerChanged);

        // Check if a waiting SW is already queued from index.html registration
        const existingReg = (window as any).swRegistration as ServiceWorkerRegistration | undefined;
        if (existingReg?.waiting && navigator.serviceWorker?.controller) {
            const key = getWorkerKey(existingReg);
            if (shouldAllowUpdateReload(storage, key)) {
                workerKeyRef.current = key;
                setRegistration(existingReg);
                setUpdateAvailable(true);
            }
        }

        return () => {
            window.removeEventListener('sw-update-available', handleUpdateAvailable);
            window.removeEventListener('sw-controller-changed', handleControllerChanged);
        };
    }, [executeSingleReload]);

    const applyUpdate = useCallback(() => {
        if (isApplyingRef.current || hasReloadedRef.current) return;
        isApplyingRef.current = true;
        setIsUpdating(true);
        if (onUpdateAccepted) {
            onUpdateAccepted();
        }

        const activeReg = registration || (window as any).swRegistration;
        if (activeReg && activeReg.waiting) {
            activeReg.waiting.postMessage({ type: 'SKIP_WAITING' });
            // Wait for controllerchange; fallback once after 1200ms if controllerchange doesn't fire
            window.setTimeout(() => {
                executeSingleReload();
            }, 1200);
        } else {
            executeSingleReload();
        }
    }, [registration, onUpdateAccepted, executeSingleReload]);

    // Auto-apply update ONCE after a 3s grace period so cached users get fresh builds without looping
    useEffect(() => {
        if (!updateAvailable || dismissed || isUpdating) return;
        const autoReloadTimer = window.setTimeout(() => {
            applyUpdate();
        }, 3000);
        return () => window.clearTimeout(autoReloadTimer);
    }, [updateAvailable, dismissed, isUpdating, applyUpdate]);

    const handleDismiss = () => {
        setDismissed(true);
    };

    return (
        <>
            {!isOnline && (
                <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[150] pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center gap-2 px-3.5 py-1.5 bg-amber-950/95 border border-amber-500/50 rounded-full shadow-[0_0_25px_rgba(245,158,11,0.3)] font-mono">
                        <WifiOff size={13} className="text-amber-400 animate-pulse" />
                        <span className="text-[10px] sm:text-xs font-black tracking-widest text-amber-200 uppercase">
                            OFFLINE MODE • SOLO READY
                        </span>
                    </div>
                </div>
            )}

            {showOnlineToast && isOnline && (
                <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[150] pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-950/95 border border-emerald-500/50 rounded-full shadow-[0_0_25px_rgba(16,185,129,0.3)] font-mono">
                        <Wifi size={13} className="text-emerald-400" />
                        <span className="text-[10px] sm:text-xs font-black tracking-widest text-emerald-200 uppercase">
                            CONNECTION RESTORED
                        </span>
                    </div>
                </div>
            )}

            {updateAvailable && !dismissed && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[160] w-[calc(100%-24px)] max-w-md pointer-events-auto animate-in fade-in slide-in-from-bottom-6 duration-300">
                    <div className="relative bg-stone-950/98 border border-red-500/70 rounded-2xl p-3.5 sm:p-4 shadow-[0_12px_45px_rgba(0,0,0,0.9),0_0_30px_rgba(220,38,38,0.25)] font-mono overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-red-600 via-amber-500 to-red-600" />

                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-red-950/80 border border-red-600/50 flex items-center justify-center shrink-0">
                                {isUpdating ? (
                                    <RefreshCw size={18} className="text-red-400 animate-spin" />
                                ) : (
                                    <Sparkles size={18} className="text-amber-400" />
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <h4 className="text-xs sm:text-sm font-black text-white tracking-wider uppercase flex items-center gap-1.5">
                                    <span>UPDATE AVAILABLE</span>
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                                </h4>
                                <p className="text-[10px] sm:text-xs text-stone-400 leading-snug mt-0.5">
                                    {isUpdating
                                        ? 'Applying update and refreshing once...'
                                        : 'A fresh version is ready. Updating automatically in 3s...'}
                                </p>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                    onClick={applyUpdate}
                                    disabled={isUpdating}
                                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 active:scale-95 disabled:opacity-60 text-white font-black text-[10px] sm:text-xs tracking-widest uppercase rounded-lg shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-all cursor-pointer flex items-center gap-1.5"
                                >
                                    <RefreshCw size={12} className={isUpdating ? 'animate-spin' : ''} />
                                    <span>{isUpdating ? 'UPDATING' : 'NOW'}</span>
                                </button>

                                {!isUpdating && (
                                    <button
                                        onClick={handleDismiss}
                                        className="p-1.5 text-stone-500 hover:text-stone-200 hover:bg-stone-800/80 rounded-lg transition-colors cursor-pointer"
                                        title="Dismiss"
                                        aria-label="Dismiss update notification"
                                    >
                                        <X size={15} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
