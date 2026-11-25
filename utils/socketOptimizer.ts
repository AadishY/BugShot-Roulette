export type SocketAction = {
    type: string;
    data: any;
};

const COALESCEABLE_BATCH_ACTIONS = new Set([
    'HOVER_TARGET',
    'SYNC_STATE',
    'SYNC_THREE_PLAYER_STATE',
]);

export class SocketBatcher {
    private maxBatchSize: number;
    private maxDelayMs: number;
    private callback: (actions: SocketAction[]) => void;
    private queuedActions: SocketAction[] = [];
    private timerId: ReturnType<typeof setTimeout> | null = null;

    constructor(maxBatchSize: number, maxDelayMs: number, callback: (actions: SocketAction[]) => void) {
        this.maxBatchSize = Math.max(1, maxBatchSize);
        this.maxDelayMs = Math.max(0, maxDelayMs);
        this.callback = callback;
    }

    queue(type: string, data: any) {
        const roomId = data?.roomId;
        const currentRoomId = this.queuedActions[0]?.data?.roomId;
        if (this.queuedActions.length > 0 && currentRoomId !== undefined && roomId !== currentRoomId) {
            this.flush();
        }

        const actionKey = data?.action?.type;
        // Coalesce idempotent overwrite packets in the same room — only the latest state matters
        if (actionKey && COALESCEABLE_BATCH_ACTIONS.has(actionKey)) {
            for (let i = this.queuedActions.length - 1; i >= 0; i--) {
                const existing = this.queuedActions[i];
                if (existing?.data?.action?.type === actionKey && existing?.data?.roomId === roomId) {
                    this.queuedActions[i] = { type, data };
                    return;
                }
            }
        }

        this.queuedActions.push({ type, data });
        if (this.queuedActions.length >= this.maxBatchSize) {
            this.flush();
            return;
        }

        if (this.timerId === null) {
            this.timerId = globalThis.setTimeout(() => {
                this.timerId = null;
                this.flush();
            }, this.maxDelayMs);
        }
    }

    flush() {
        if (this.timerId !== null) {
            globalThis.clearTimeout(this.timerId);
            this.timerId = null;
        }

        if (this.queuedActions.length === 0) {
            return;
        }

        const actions = this.queuedActions.slice();
        this.queuedActions.length = 0;

        try {
            this.callback(actions);
        } catch (err) {
            console.warn('[SocketBatcher] Error flushing actions:', err);
        }
    }

    clear() {
        this.queuedActions.length = 0;
        if (this.timerId !== null) {
            globalThis.clearTimeout(this.timerId);
            this.timerId = null;
        }
    }
}
