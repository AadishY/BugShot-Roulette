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
        this.maxBatchSize = maxBatchSize;
        this.maxDelayMs = maxDelayMs;
        this.callback = callback;
    }

    queue(type: string, data: any) {
        const actionKey = data?.action?.type;
        // Coalesce duplicate hover/aim packets — only the latest matters
        if (actionKey === 'HOVER_TARGET' && this.lastQueuedKey === 'HOVER_TARGET') {
            const lastIdx = this.queuedActions.length - 1;
            if (lastIdx >= 0 && this.queuedActions[lastIdx].data?.action?.type === 'HOVER_TARGET') {
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
        if (this.queuedActions.length === 0) {
            return;
        }

        const actions = this.queuedActions.slice();
        this.queuedActions.length = 0;
        this.lastQueuedKey = null;

        if (this.timerId !== null) {
            window.clearTimeout(this.timerId);
            this.timerId = null;
        }

        this.callback(actions);
    }
}
