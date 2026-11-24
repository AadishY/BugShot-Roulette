import { useState, useEffect } from 'react';

/**
 * useOnlineStatus Hook
 * Monitors network availability in real-time, detecting internet disconnects
 * and transitions between offline/online for PWA survival modes.
 */
export const useOnlineStatus = (): boolean => {
    const [isOnline, setIsOnline] = useState<boolean>(() => {
        if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
            return navigator.onLine;
        }
        return true;
    });

    useEffect(() => {
        const handleOnline = () => {
            console.log('[NetworkStatus] Connectivity restored: Online.');
            setIsOnline(true);
        };

        const handleOffline = () => {
            console.log('[NetworkStatus] Connectivity dropped: Offline Mode engaged.');
            setIsOnline(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return isOnline;
};
