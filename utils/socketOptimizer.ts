export type SocketAction = {
    type: string;
    data: any;
};

export class SocketBatcher {
    private maxBatchSize: number;
    private maxDelayMs: number;
    private callback: (actions: SocketAction[]) => void;
    private queuedActions: SocketAction[] = [];
    private timerId: number | null = null;
    private lastQueuedKey: string | null = null;

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
        // Coalesce consecutive hover/aim packets in the same room — only the latest matters
        if (actionKey === 'HOVER_TARGET' && this.lastQueuedKey === 'HOVER_TARGET') {
            const lastIdx = this.queuedActions.length - 1;
            const lastItem = this.queuedActions[lastIdx];
            if (lastItem && lastItem.data?.action?.type === 'HOVER_TARGET' && lastItem.data?.roomId === roomId) {
                this.queuedActions[lastIdx] = { type, data };
                return;
            }
        }
        this.lastQueuedKey = actionKey || null;

        this.queuedActions.push({ type, data });
        if (this.queuedActions.length >= this.maxBatchSize) {
            this.flush();
            return;
        }

        if (this.timerId === null) {
            this.timerId = window.setTimeout(() => {
                this.timerId = null;
                this.flush();
            }, this.maxDelayMs);
        }
    }

    flush() {
        if (this.timerId !== null) {
            window.clearTimeout(this.timerId);
            this.timerId = null;
        }

        if (this.queuedActions.length === 0) {
            this.lastQueuedKey = null;
            return;
        }

        const actions = this.queuedActions.slice();
        this.queuedActions.length = 0;
        this.lastQueuedKey = null;

        try {
            this.callback(actions);
        } catch (err) {
            console.warn('[SocketBatcher] Error flushing actions:', err);
        }
    }

    clear() {
        this.queuedActions.length = 0;
        this.lastQueuedKey = null;
        if (this.timerId !== null) {
            window.clearTimeout(this.timerId);
            this.timerId = null;
        }
    }
}
