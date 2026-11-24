import { io, Socket } from 'socket.io-client';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { UserProfile } from './firebaseService';

export interface UserPresence {
    username: string;
    playerId?: string;
    displayName?: string;
    avatarUrl?: string;
    avatarStyle?: string;
    status: 'online' | 'in_lobby' | 'in_match' | 'offline';
    roomId?: string | null;
    matchInfo?: {
        roomId?: string;
        round?: number;
        opponent?: string;
        totalHealth?: number;
        currentHealth?: number;
        gameMode?: string;
    } | null;
    connectedAt?: number;
    lastSeen?: number;
    isDeveloper?: boolean;
}

export interface AdminRoomPlayer {
    id: string;
    name: string;
    color: string;
    hp: number;
    maxHp: number;
    ready: boolean;
    items: string[];
    isHandcuffed: boolean;
    isSawedActive: boolean;
    disconnected: boolean;
    authId?: string | null;
    model?: string;
}

export interface AdminRoomSummary {
    id: string;
    name: string;
    hostId: string;
    settings: any;
    lastActivity: number;
    playerCount: number;
    players: AdminRoomPlayer[];
    gameState: {
        round?: number;
        turn?: string;
        totalShells?: number;
        liveShells?: number;
        blankShells?: number;
        isSawActive?: boolean;
        dealerHandcuffed?: boolean;
        playerHandcuffed?: boolean;
    } | null;
}

export interface AdminOverviewData {
    vitals: {
        uptimeMS: number;
        activeConnectionsCount: number;
        memoryMB: string;
        globalMatchesPlayed: number;
        unauthorizedInterventionsBlocked: number;
    };
    activeUsers: Array<UserPresence & { socketId: string }>;
    rooms: AdminRoomSummary[];
    lastSeenMap?: Record<string, number>;
    mutedUsers?: string[];
}

// User-friendly relative time formatter for last seen telemetry
export const formatLastSeen = (timestamp?: number): string => {
    if (!timestamp || timestamp <= 0) return 'Offline';
    const diffMs = Date.now() - timestamp;
    if (diffMs < 0) return 'Just now';
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export interface BroadcastNotification {
    id: string;
    sender: string;
    title: string;
    text: string;
    timestamp: number;
}

export interface DirectMessageNotification {
    id: string;
    sender: string;
    fromUsername: string;
    text: string;
    timestamp: number;
}

const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const HF_BACKEND = import.meta.env.VITE_HF_BACKEND_URL || 'https://yoakatsuki-buckshot.hf.space';

const getSocketConfig = () => {
    if (import.meta.env.VITE_SOCKET_URL) {
        return { socketUrl: import.meta.env.VITE_SOCKET_URL, socketPath: '/socket.io' };
    }
    if (isLocal) {
        return { socketUrl: 'http://localhost:3001', socketPath: '/socket.io' };
    }
    return {
        socketUrl: HF_BACKEND,
        socketPath: '/socket.io'
    };
};

class PresenceClient {
    private socket: Socket | null = null;
    private presenceMap = new Map<string, UserPresence>();
    private listeners = new Set<() => void>();
    private broadcastListeners = new Set<(msg: BroadcastNotification) => void>();
    private dmListeners = new Set<(msg: DirectMessageNotification) => void>();
    private clearBroadcastListeners = new Set<() => void>();
    private currentUser: UserProfile | null = null;
    private currentStatus: 'online' | 'in_lobby' | 'in_match' = 'online';
    private currentMatchInfo: any = null;
    private isConnected = false;
    private heartbeatTimer: any = null;
    private visibilityListenerAdded = false;

    constructor() {
        if (typeof window !== 'undefined') {
            this.initSocket();
            this.initVisibilityListener();
            this.initNetworkListener();
        }
    }

    private initNetworkListener() {
        if (typeof window === 'undefined') return;
        window.addEventListener('online', () => {
            if (this.socket && !this.socket.connected) {
                this.socket.connect();
            }
            if (this.currentUser) {
                this.socket?.emit('presence:request_all');
            }
        });
    }

    private initVisibilityListener() {
        if (this.visibilityListenerAdded || typeof document === 'undefined') return;
        this.visibilityListenerAdded = true;
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                if (this.socket && !this.socket.connected) {
                    this.socket.connect();
                }
                if (this.currentUser) {
                    this.updateStatus(this.currentStatus, this.currentMatchInfo);
                    this.socket?.emit('presence:request_all');
                }
            }
        });
    }

    private startHeartbeat() {
        this.stopHeartbeat();
        if (typeof window === 'undefined') return;
        this.heartbeatTimer = setInterval(() => {
            if (this.socket && this.socket.connected && this.currentUser) {
                this.socket.emit('presence:status', {
                    status: this.currentStatus,
                    matchInfo: this.currentMatchInfo
                });
                const clean = this.currentUser.username.trim().toLowerCase();
                const existing = this.presenceMap.get(clean);
                if (existing) {
                    existing.lastSeen = Date.now();
                }
            }
        }, 25000);
    }

    private stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    private initSocket() {
        if (this.socket) return;
        const { socketUrl, socketPath } = getSocketConfig();

        this.socket = io(socketUrl, {
            path: socketPath,
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 50,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 4000,
            timeout: 15000
        });

        this.socket.on('connect', () => {
            this.isConnected = true;
            if (this.currentUser) {
                this.identify(this.currentUser, this.currentStatus, this.currentMatchInfo);
            }
            this.startHeartbeat();
            this.socket?.emit('presence:request_all');
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            this.stopHeartbeat();
        });

        this.socket.on('presence:sync', (users: UserPresence[]) => {
            if (Array.isArray(users)) {
                users.forEach(u => {
                    if (u.username) {
                        this.presenceMap.set(u.username.toLowerCase(), u);
                    }
                });
                this.notifyListeners();
            }
        });

        this.socket.on('presence:user_updated', (user: UserPresence) => {
            if (user?.username) {
                this.presenceMap.set(user.username.toLowerCase(), user);
                this.notifyListeners();
            }
        });

        this.socket.on('presence:user_offline', (data: { username: string; playerId?: string; lastSeen?: number }) => {
            if (data?.username) {
                const clean = data.username.toLowerCase();
                const existing = this.presenceMap.get(clean);
                if (existing) {
                    existing.status = 'offline';
                    existing.lastSeen = data.lastSeen || Date.now();
                    this.presenceMap.set(clean, existing);
                } else {
                    this.presenceMap.set(clean, {
                        username: data.username,
                        playerId: data.playerId,
                        status: 'offline',
                        lastSeen: data.lastSeen || Date.now()
                    });
                }
                this.notifyListeners();
            }
        });

        this.socket.on('system:broadcast', (msg: BroadcastNotification) => {
            if (msg) {
                this.broadcastListeners.forEach(fn => fn(msg));
            }
        });

        this.socket.on('system:broadcast_clear', () => {
            this.broadcastListeners.forEach(fn => fn(null as any));
            this.clearBroadcastListeners.forEach(fn => fn());
        });

        this.socket.on('system:direct_message', (msg: DirectMessageNotification) => {
            this.dmListeners.forEach(fn => fn(msg));
        });
    }

    public identify(user: UserProfile, status: 'online' | 'in_lobby' | 'in_match' = 'online', matchInfo: any = null) {
        this.currentUser = user;
        this.currentStatus = status;
        this.currentMatchInfo = matchInfo;
        this.startHeartbeat();

        const clean = user.username.trim().toLowerCase();
        this.presenceMap.set(clean, {
            username: user.username,
            playerId: user.playerId,
            displayName: user.displayName || user.username,
            avatarUrl: user.avatarUrl,
            avatarStyle: user.avatarStyle,
            status,
            matchInfo,
            connectedAt: Date.now(),
            lastSeen: Date.now(),
            isDeveloper: user.username?.toLowerCase() === 'aadish' || Boolean(user.isDeveloper)
        });
        this.notifyListeners();

        if (this.socket && this.socket.connected) {
            this.socket.emit('presence:identify', {
                username: user.username,
                playerId: user.playerId,
                displayName: user.displayName || user.username,
                avatarUrl: user.avatarUrl,
                avatarStyle: user.avatarStyle,
                status,
                matchInfo,
                isDeveloper: user.username?.toLowerCase() === 'aadish' || Boolean(user.isDeveloper)
            });
        }
    }

    public updateStatus(status: 'online' | 'in_lobby' | 'in_match', matchInfo: any = null, roomId: string | null = null) {
        this.currentStatus = status;
        this.currentMatchInfo = matchInfo;

        if (this.currentUser) {
            const clean = this.currentUser.username.trim().toLowerCase();
            const existing = this.presenceMap.get(clean);
            if (existing) {
                existing.status = status;
                existing.matchInfo = matchInfo;
                existing.roomId = roomId;
                existing.lastSeen = Date.now();
                this.presenceMap.set(clean, existing);
            } else {
                this.presenceMap.set(clean, {
                    username: this.currentUser.username,
                    playerId: this.currentUser.playerId,
                    displayName: this.currentUser.displayName || this.currentUser.username,
                    avatarUrl: this.currentUser.avatarUrl,
                    avatarStyle: this.currentUser.avatarStyle,
                    status,
                    matchInfo,
                    roomId,
                    connectedAt: Date.now(),
                    lastSeen: Date.now(),
                    isDeveloper: this.currentUser.username?.toLowerCase() === 'aadish' || Boolean(this.currentUser.isDeveloper)
                });
            }
            this.notifyListeners();
        }

        if (this.socket && this.socket.connected) {
            this.socket.emit('presence:status', {
                status,
                matchInfo,
                roomId
            });
        }
    }

    public getPresence(username: string): UserPresence | null {
        if (!username) return null;
        return this.presenceMap.get(username.trim().toLowerCase()) || null;
    }

    public getAllPresences(): Map<string, UserPresence> {
        return new Map(this.presenceMap);
    }

    public subscribe(fn: () => void): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    public onBroadcast(fn: (msg: BroadcastNotification) => void): () => void {
        this.broadcastListeners.add(fn);
        return () => this.broadcastListeners.delete(fn);
    }

    public onBroadcastClear(fn: () => void): () => void {
        this.clearBroadcastListeners.add(fn);
        return () => this.clearBroadcastListeners.delete(fn);
    }

    public onDirectMessage(fn: (msg: DirectMessageNotification) => void): () => void {
        this.dmListeners.add(fn);
        return () => this.dmListeners.delete(fn);
    }

    private notifyListeners() {
        this.listeners.forEach(fn => {
            try { fn(); } catch (e) { console.error('Presence listener error:', e); }
        });
    }

    // Admin commands
    public async fetchAdminOverview(): Promise<AdminOverviewData | null> {
        return new Promise((resolve) => {
            if (!this.socket || !this.socket.connected) {
                // Fallback to HTTP
                const authUser = (this.currentUser?.username || '').toLowerCase();
                const endpoint = `${getSocketConfig().socketUrl}/api/admin/overview?auth=${authUser}`;
                fetch(endpoint)
                    .then(res => res.json())
                    .then(data => resolve(data))
                    .catch(() => resolve(null));
                return;
            }

            this.socket.emit('admin:get_overview', (res: any) => {
                if (res?.success && res.data) {
                    resolve(res.data);
                } else {
                    resolve(null);
                }
            });

            setTimeout(() => resolve(null), 6000);
        });
    }

    public async sendAdminBroadcast(title: string, text: string): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket || !this.socket.connected) {
                resolve({ success: false, error: 'Socket disconnected' });
                return;
            }
            this.socket.emit('admin:broadcast_message', { title, text }, (res: any) => {
                if (res?.success) {
                    resolve({ success: true });
                } else {
                    resolve({ success: false, error: res?.error || 'Broadcast failed' });
                }
            });
            setTimeout(() => resolve({ success: false, error: 'Timeout waiting for server confirmation' }), 6000);
        });
    }

    public async clearAdminBroadcast(): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket || !this.socket.connected) {
                resolve({ success: false, error: 'Socket disconnected' });
                return;
            }
            this.socket.emit('admin:clear_broadcast', (res: any) => {
                if (res?.success) {
                    resolve({ success: true });
                } else {
                    resolve({ success: false, error: res?.error || 'Failed to clear broadcast' });
                }
            });
            setTimeout(() => resolve({ success: true }), 3000);
        });
    }

    public async sendAdminDM(targetUsername: string, text: string): Promise<{ success: boolean; count?: number; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket || !this.socket.connected) {
                resolve({ success: false, error: 'Socket disconnected' });
                return;
            }
            this.socket.emit('admin:send_dm', { targetUsername, text }, (res: any) => {
                if (res?.success) {
                    resolve({ success: true, count: res.count });
                } else {
                    resolve({ success: false, error: res?.error || 'Direct transmission failed' });
                }
            });
            setTimeout(() => resolve({ success: false, error: 'Timeout waiting for server confirmation' }), 6000);
        });
    }

    public async kickPlayer(roomId: string, targetPlayerId?: string, targetUsername?: string): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket || !this.socket.connected) {
                resolve({ success: false, error: 'Socket disconnected' });
                return;
            }
            this.socket.emit('admin:kick_player', { roomId, targetPlayerId, targetUsername }, (res: any) => {
                if (res?.success) {
                    resolve({ success: true });
                } else {
                    resolve({ success: false, error: res?.error || 'Kick command failed' });
                }
            });
            setTimeout(() => resolve({ success: false, error: 'Timeout waiting for server confirmation' }), 6000);
        });
    }

    public async mutePlayer(targetUsername: string, durationMs: number = 30 * 60 * 1000): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket || !this.socket.connected) {
                resolve({ success: false, error: 'Socket disconnected' });
                return;
            }
            this.socket.emit('admin:mute_player', { targetUsername, durationMs }, (res: any) => {
                if (res?.success) {
                    resolve({ success: true });
                } else {
                    resolve({ success: false, error: res?.error || 'Mute command failed' });
                }
            });
            setTimeout(() => resolve({ success: false, error: 'Timeout waiting for server confirmation' }), 6000);
        });
    }

    public async unmutePlayer(targetUsername: string): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve) => {
            if (!this.socket || !this.socket.connected) {
                resolve({ success: false, error: 'Socket disconnected' });
                return;
            }
            this.socket.emit('admin:unmute_player', { targetUsername }, (res: any) => {
                if (res?.success) {
                    resolve({ success: true });
                } else {
                    resolve({ success: false, error: res?.error || 'Unmute command failed' });
                }
            });
            setTimeout(() => resolve({ success: false, error: 'Timeout waiting for server confirmation' }), 6000);
        });
    }

    public async checkRoomStatus(roomId: string): Promise<{
        exists: boolean;
        status: 'open' | 'in_match' | 'full' | 'closed';
        playerCount?: number;
        maxPlayers?: number;
        hostName?: string;
    }> {
        const cleanRoom = (roomId || '').trim();
        if (!cleanRoom || !/^[0-9]{4}$/.test(cleanRoom)) {
            return { exists: false, status: 'closed' };
        }

        // Try Socket.IO ack first if connected
        if (this.socket && this.socket.connected) {
            try {
                const res = await new Promise<any>((resolve) => {
                    const timer = setTimeout(() => resolve(null), 2500);
                    this.socket!.emit('checkRoomStatus', { roomId: cleanRoom }, (data: any) => {
                        clearTimeout(timer);
                        resolve(data);
                    });
                });
                if (res && typeof res.status === 'string') {
                    return res;
                }
            } catch (e) {}
        }

        // Fallback to HTTP endpoint
        try {
            const { socketUrl } = getSocketConfig();
            const res = await fetch(`${socketUrl}/api/room/${cleanRoom}`, { signal: AbortSignal.timeout(3000) });
            if (res.ok) {
                const data = await res.json();
                return data;
            }
        } catch (e) {}

        return { exists: false, status: 'closed' };
    }
}

export const presenceClient = new PresenceClient();

// React Hook for seamless real-time UI integration
export function usePresence(currentUser: UserProfile | null = null) {
    const [, setTick] = useState(0);
    const [broadcastMsg, setBroadcastMsg] = useState<BroadcastNotification | null>(null);
    const [dmMsg, setDmMsg] = useState<DirectMessageNotification | null>(null);

    useEffect(() => {
        if (currentUser) {
            presenceClient.identify(currentUser, 'online');
        }
    }, [currentUser]);

    useEffect(() => {
        const unsubscribePresence = presenceClient.subscribe(() => {
            setTick(t => t + 1);
        });

        const unsubscribeBroadcast = presenceClient.onBroadcast((msg) => {
            setBroadcastMsg(msg);
        });

        const unsubscribeClearBroadcast = presenceClient.onBroadcastClear(() => {
            setBroadcastMsg(null);
        });

        const unsubscribeDM = presenceClient.onDirectMessage((msg) => {
            setDmMsg(msg);
        });

        return () => {
            unsubscribePresence();
            unsubscribeBroadcast();
            unsubscribeClearBroadcast();
            unsubscribeDM();
        };
    }, []);

    const getUserPresence = useCallback((username: string): UserPresence | null => {
        return presenceClient.getPresence(username);
    }, []);

    const updateMyPresence = useCallback((status: 'online' | 'in_lobby' | 'in_match', matchInfo: any = null, roomId: string | null = null) => {
        presenceClient.updateStatus(status, matchInfo, roomId);
    }, []);

    return {
        getUserPresence,
        updateMyPresence,
        allPresences: presenceClient.getAllPresences(),
        broadcastMsg,
        clearBroadcast: () => setBroadcastMsg(null),
        clearAdminBroadcast: () => presenceClient.clearAdminBroadcast(),
        dmMsg,
        clearDM: () => setDmMsg(null),
        adminAPI: {
            fetchOverview: () => presenceClient.fetchAdminOverview(),
            broadcast: (title: string, text: string) => presenceClient.sendAdminBroadcast(title, text),
            clearBroadcast: () => presenceClient.clearAdminBroadcast(),
            dm: (targetUsername: string, text: string) => presenceClient.sendAdminDM(targetUsername, text),
            kickPlayer: (roomId: string, targetPlayerId?: string, targetUsername?: string) => presenceClient.kickPlayer(roomId, targetPlayerId, targetUsername),
            mutePlayer: (targetUsername: string, durationMs?: number) => presenceClient.mutePlayer(targetUsername, durationMs),
            unmutePlayer: (targetUsername: string) => presenceClient.unmutePlayer(targetUsername)
        }
    };
}
