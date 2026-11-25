// Tactical in-game modal confirmation & alert service for BugShot Roulette

export type ModalType = 'confirm' | 'alert' | 'danger' | 'info';
export type ModalIcon = 'warning' | 'shield' | 'info' | 'trash' | 'logout' | 'download';

export interface ConfirmOptions {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
    type?: ModalType;
    icon?: ModalIcon;
}

export interface ModalRequest extends ConfirmOptions {
    id: string;
    resolve: (confirmed: boolean) => void;
}

type ModalListener = (request: ModalRequest | null) => void;

class ModalService {
    private listeners: Set<ModalListener> = new Set();
    private currentRequest: ModalRequest | null = null;
    private queue: ModalRequest[] = [];

    public subscribe(listener: ModalListener): () => void {
        this.listeners.add(listener);
        if (this.currentRequest) {
            listener(this.currentRequest);
        }
        return () => {
            this.listeners.delete(listener);
        };
    }

    private emit() {
        for (const listener of this.listeners) {
            listener(this.currentRequest);
        }
    }

    public show(options: ConfirmOptions): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            const req: ModalRequest = {
                id: Math.random().toString(36).substring(2, 9),
                title: options.title,
                message: options.message,
                confirmText: options.confirmText,
                cancelText: options.cancelText,
                isDanger: options.isDanger,
                type: options.type || (options.isDanger ? 'danger' : 'confirm'),
                icon: options.icon,
                resolve: (val: boolean) => {
                    resolve(val);
                }
            };

            if (!this.currentRequest) {
                this.currentRequest = req;
                this.emit();
            } else {
                this.queue.push(req);
            }

            // Safety net: if no ConfirmModalHost is mounted at all, never hang permanently
            if (this.listeners.size === 0 && typeof window !== 'undefined') {
                setTimeout(() => {
                    if (this.listeners.size === 0 && this.currentRequest?.id === req.id) {
                        this.respond(true);
                    }
                }, 60);
            }
        });
    }

    private next() {
        if (this.queue.length > 0) {
            this.currentRequest = this.queue.shift() || null;
            this.emit();
        } else {
            this.currentRequest = null;
            this.emit();
        }
    }

    public respond(confirmed: boolean) {
        if (this.currentRequest) {
            const resolveFn = this.currentRequest.resolve;
            this.currentRequest = null;
            resolveFn(confirmed);
            this.next();
        }
    }
}

export const modalService = new ModalService();

/**
 * Show an in-game confirmation modal. Returns true if confirmed, false if cancelled.
 */
export const showConfirm = (options: string | ConfirmOptions): Promise<boolean> => {
    if (typeof options === 'string') {
        return modalService.show({
            message: options,
            type: 'confirm'
        });
    }
    return modalService.show({
        ...options,
        type: options.type || (options.isDanger ? 'danger' : 'confirm')
    });
};

/**
 * Show an in-game alert modal with a single acknowledge button.
 */
export const showAlert = (options: string | (ConfirmOptions & { buttonText?: string })): Promise<boolean> => {
    if (typeof options === 'string') {
        return modalService.show({
            title: 'SYSTEM TRANSMISSION',
            message: options,
            confirmText: 'ACKNOWLEDGE',
            type: 'alert'
        });
    }
    return modalService.show({
        title: options.title || 'SYSTEM TRANSMISSION',
        message: options.message,
        confirmText: options.buttonText || options.confirmText || 'ACKNOWLEDGE',
        isDanger: options.isDanger,
        type: 'alert',
        icon: options.icon
    });
};

// Global polyfill for native window.alert to route directly into BugShot inbuilt modal
if (typeof window !== 'undefined') {
    (window as any).__nativeAlert = window.alert;
    window.alert = (message?: any) => {
        showAlert({
            title: 'SYSTEM TRANSMISSION',
            message: String(message ?? '')
        });
    };
}
