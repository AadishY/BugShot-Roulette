export const UPDATE_RELOAD_STORAGE_KEY = 'bugshot_sw_last_update_reload_v1';
export const UPDATE_RELOAD_COOLDOWN_MS = 45_000;

export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

interface StoredReloadRecord {
    timestamp: number;
    workerKey: string;
}

/**
 * Determines whether an app reload should be allowed for a Service Worker update.
 * Enforces a strict reload-once policy so cached updates reload cleanly once and
 * never bounce into 2-3 consecutive reload loops.
 */
export const shouldAllowUpdateReload = (
    storage: StorageLike | null | undefined,
    workerKey: string = 'default',
    now: number = Date.now(),
    cooldownMs: number = UPDATE_RELOAD_COOLDOWN_MS
): boolean => {
    if (!storage) return true;
    try {
        const raw = storage.getItem(UPDATE_RELOAD_STORAGE_KEY);
        if (!raw) return true;
        const parsed = JSON.parse(raw) as Partial<StoredReloadRecord> | null;
        if (!parsed || typeof parsed.timestamp !== 'number') return true;

        const elapsed = now - parsed.timestamp;
        if (elapsed < 0 || elapsed < cooldownMs) {
            return false;
        }
        if (workerKey && workerKey !== 'default' && parsed.workerKey === workerKey && elapsed < cooldownMs * 4) {
            return false;
        }
    } catch {
        // Ignore malformed storage entries
    }
    return true;
};

/**
 * Records that a single update reload is now executing so the freshly loaded page
 * suppresses any follow-up controllerchange or duplicate SW activation events.
 */
export const recordUpdateReload = (
    storage: StorageLike | null | undefined,
    workerKey: string = 'default',
    now: number = Date.now()
): void => {
    if (!storage) return;
    try {
        const payload: StoredReloadRecord = {
            timestamp: now,
            workerKey: workerKey || 'default'
        };
        storage.setItem(UPDATE_RELOAD_STORAGE_KEY, JSON.stringify(payload));
    } catch {
        // Guard against private browsing / storage restrictions
    }
};
