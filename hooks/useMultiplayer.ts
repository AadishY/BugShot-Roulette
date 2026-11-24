import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { MultiplayerGameState, RoomSettings, ChatMessage, MultiplayerPlayer } from '../types';
import { SocketBatcher } from '../utils/socketOptimizer';

const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const HF_BACKEND = import.meta.env.VITE_HF_BACKEND_URL || 'https://yoakatsuki-buckshot.hf.space';
const DEFAULT_SERVER_URL = isLocal ? 'http://localhost:3001' : (typeof window !== 'undefined' ? window.location.origin + '/server' : '');

// REST API endpoint
const REST_SERVER_URL = import.meta.env.VITE_SERVER_URL || DEFAULT_SERVER_URL;

const getSocketConfig = (forceCloudFallback = false) => {
    if (import.meta.env.VITE_SOCKET_URL && !forceCloudFallback) {
        return { socketUrl: import.meta.env.VITE_SOCKET_URL, socketPath: '/socket.io' };
    }
    if (isLocal && !forceCloudFallback) {
        return { socketUrl: 'http://localhost:3001', socketPath: '/socket.io' };
    }
    // Production or fallback: connect directly to backend for native WebSocket
    return {
        socketUrl: HF_BACKEND,
        socketPath: '/socket.io'
    };
};

const loadSavedSettings = (): RoomSettings => {
    let savedSettings: RoomSettings = { rounds: 3, hp: 9, itemsPerShipment: 9, isPrivate: false, isAdvanced: false };
    try {
        const saved = localStorage.getItem('aadish_roulette_last_lobby_settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object') {
                savedSettings = {
                    rounds: typeof parsed.rounds === 'number' && !isNaN(parsed.rounds) ? Math.min(Math.max(1, parsed.rounds), 10) : 3,
                    hp: typeof parsed.hp === 'number' && !isNaN(parsed.hp) ? Math.min(Math.max(1, parsed.hp), 12) : 9,
                    itemsPerShipment: typeof parsed.itemsPerShipment === 'number' && !isNaN(parsed.itemsPerShipment) ? Math.min(Math.max(1, parsed.itemsPerShipment), 12) : 9,
                    isPrivate: Boolean(parsed.isPrivate),
                    isAdvanced: false
                };
            }
        }
    } catch (e) {
        console.error("Failed to load saved settings:", e);
    }
    return savedSettings;
};

const getAuthId = (): string | null => {
    try {
        const saved = localStorage.getItem('aadish_roulette_logged_in_user');
        if (saved) {
            const parsed = JSON.parse(saved);
            return typeof parsed?.username === 'string' ? parsed.username.trim().toLowerCase() : null;
        }
    } catch (e) {}
    return null;
};

const IMMEDIATE_ACTION_TYPES = new Set([
    'SHOOT', 'USE_ITEM', 'SELECT_CARD', 'PICKUP_GUN', 'STEAL_ITEM', 'CANCEL_STEAL',
    'SYNC_STATE', 'SYNC_THREE_PLAYER_STATE', 'SYNC_ROUND', 'SYNC_THREE_PLAYER_ROUND',
    'SYNC_MP_GAME_OVER',
    'DEBUG_SYNC_PLAYER', 'DEBUG_SYNC_DEALER', 'DEBUG_SYNC_GAMESTATE',
    'DEBUG_SYNC_THREE_PLAYER', 'DEBUG_SYNC_PLAYER_MODEL'
]);

export function useMultiplayer() {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [room, setRoom] = useState<any>(null);
    const [playerId, setPlayerId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [latencyMs, setLatencyMs] = useState<number | null>(null);

    const connectionAttemptsRef = useRef(0);
    const hasFallenBackRef = useRef(false);
    const socketRef = useRef<Socket | null>(null);
    const socketBatcherRef = useRef<SocketBatcher | null>(null);
    const lastJoinRef = useRef<{ roomId: string; playerName: string } | null>(null);
    const playerNameRef = useRef<string>('');
    const actionQueueRef = useRef<{ roomId: string; action: any; isImmediate?: boolean }[]>([]);
    const fallbackConnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const flushActionQueue = useCallback(() => {
        const s = socketRef.current;
        if (!s || !s.connected || actionQueueRef.current.length === 0) return;
        const queued = actionQueueRef.current.slice();
        actionQueueRef.current = [];
        if (queued.length === 1) {
            s.emit('gameAction', { roomId: queued[0].roomId, action: queued[0].action });
        } else {
            const batch = queued.map(q => ({ type: 'gameAction', data: { roomId: q.roomId, action: q.action } }));
            s.emit('gameActionBatch', { actions: batch });
        }
    }, []);

    // Callback for incoming actions
    const onActionRef = useRef<((data: { playerId: string, action: any }) => void) | null>(null);
    const setOnAction = useCallback((callback: (data: { playerId: string, action: any }) => void) => {
        onActionRef.current = callback;
    }, []);

    const onFullSyncRequestRef = useRef<(() => void) | null>(null);
    const setOnFullSyncRequest = useCallback((callback: () => void) => {
        onFullSyncRequestRef.current = callback;
    }, []);

    const connect = useCallback((playerName?: string) => {
        if (playerName) playerNameRef.current = playerName;

        // Prevent socket leaks if connect is called while already connected
        if (socketRef.current) {
            try {
                socketBatcherRef.current?.flush();
                socketRef.current.removeAllListeners();
                socketRef.current.disconnect();
            } catch (e) {}
            socketRef.current = null;
        }
        setIsConnecting(true);
        setError(null);
        setConnectionStatus('ESTABLISHING LINK...');
        connectionAttemptsRef.current = 0;

        // Clear any previous connection watchdog timer
        if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
        }

        // Hard watchdog timeout (12s): Prevents hanging on dormant cloud spaces or silent socket stalls
        connectionTimeoutRef.current = setTimeout(() => {
            if (!socketRef.current?.connected) {
                console.warn("[Socket] Connection timed out after 12s.");
                try {
                    socketRef.current?.removeAllListeners();
                    socketRef.current?.disconnect();
                } catch (e) {}
                setIsConnecting(false);
                setConnectionStatus('');
                setError('SERVER OFFLINE: Connection timed out. The multiplayer server is unreachable or asleep. Please click Retry to wake it up or return to the main menu.');
            }
        }, 12000);

        const { socketUrl, socketPath } = getSocketConfig(hasFallenBackRef.current);

        const newSocket = io(socketUrl, {
            reconnection: true,
            reconnectionAttempts: 50,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 4000,
            randomizationFactor: 0.3,
            timeout: 10000,
            path: socketPath,
            transports: ['websocket', 'polling'],
            upgrade: true,
            rememberUpgrade: true
        });

        newSocket.on('connect', () => {
            if (connectionTimeoutRef.current) {
                clearTimeout(connectionTimeoutRef.current);
                connectionTimeoutRef.current = null;
            }
            setIsConnected(true);
            setIsConnecting(false);
            setSocket(newSocket);
            socketRef.current = newSocket;
            setError(null);
            setConnectionStatus('');
            connectionAttemptsRef.current = 0;

            // Auto-rejoin room after reconnect (lobby or mid-game grace window)
            const pending = lastJoinRef.current;
            if (pending && playerNameRef.current) {
                let avatarData: any = {};
                try {
                    const raw = localStorage.getItem('aadish_roulette_logged_in_user');
                    if (raw) {
                        const u = JSON.parse(raw);
                        avatarData = { avatarUrl: u.avatarUrl, avatarStyle: u.avatarStyle, avatarSeed: u.avatarSeed };
                    }
                } catch (e) {}
                newSocket.emit('joinRoom', {
                    roomId: pending.roomId,
                    playerName: playerNameRef.current,
                    authId: getAuthId(),
                    ...avatarData
                });
            }

            // Flush any pending queued actions upon link recovery
            flushActionQueue();

            // Initialize socket batcher for non-critical game actions (2 actions or 50ms)
            socketBatcherRef.current = new SocketBatcher(2, 50, (actions) => {
                if (actions.length === 1) {
                    const action = actions[0];
                    newSocket.emit('gameAction', action.data);
                } else {
                    newSocket.emit('gameActionBatch', { actions });
                }
            });
        });

        (newSocket.io as any).on('ping', () => {
            (newSocket as any)._pingSentAt = Date.now();
        });
        (newSocket.io as any).on('pong', () => {
            const sent = (newSocket as any)._pingSentAt;
            if (sent) setLatencyMs(Date.now() - sent);
        });

        (newSocket.io as any).on('reconnect_attempt', (attempt: number) => {
            setConnectionStatus(`RECONNECTING TO MAINFRAME (${attempt}/50)...`);
        });

        (newSocket.io as any).on('reconnect', () => {
            setIsConnected(true);
            setIsConnecting(false);
            setError(null);
            setConnectionStatus('');
            flushActionQueue();
        });

        (newSocket.io as any).on('reconnect_failed', () => {
            console.warn("Socket reconnection failed after 50 attempts.");
            setError('Connection lost: Server unreachable after multiple reconnection attempts.');
            setIsConnecting(false);
            setIsConnected(false);
            setConnectionStatus('');
        });

        (newSocket.io as any).on('reconnect_error', (err: any) => {
            console.warn("Socket reconnect error:", err);
        });

        newSocket.on('connect_error', (err) => {
            connectionAttemptsRef.current += 1;
            console.warn(`[Socket] Connection error attempt ${connectionAttemptsRef.current}:`, (err as any)?.message || err);

            // If local server is offline, auto-route to cloud backend on attempt 2
            if (isLocal && !hasFallenBackRef.current && connectionAttemptsRef.current >= 2) {
                hasFallenBackRef.current = true;
                setConnectionStatus('ROUTING TO CLOUD BUNKER...');
                try {
                    newSocket.removeAllListeners();
                    newSocket.disconnect();
                } catch (e) {}
                if (fallbackConnectTimeoutRef.current) clearTimeout(fallbackConnectTimeoutRef.current);
                fallbackConnectTimeoutRef.current = setTimeout(() => {
                    connect(playerNameRef.current);
                    fallbackConnectTimeoutRef.current = null;
                }, 200);
                return;
            }

            // Cloud connection or after fallback: fail fast after 3 attempts (~6-8s) instead of hanging indefinitely
            const maxAttempts = (isLocal && !hasFallenBackRef.current) ? 2 : 3;
            if (connectionAttemptsRef.current >= maxAttempts) {
                if (connectionTimeoutRef.current) {
                    clearTimeout(connectionTimeoutRef.current);
                    connectionTimeoutRef.current = null;
                }
                setError('SERVER OFFLINE: Multiplayer server is unreachable or asleep. Please click Retry to wake it up or return to the main menu.');
                setIsConnecting(false);
                setConnectionStatus('');
                try {
                    newSocket.removeAllListeners();
                    newSocket.disconnect();
                } catch (e) {}
            } else {
                setConnectionStatus(`CONNECTING TO SERVER (ATTEMPT ${connectionAttemptsRef.current}/${maxAttempts})...`);
            }
        });

        newSocket.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            setIsConnected(false);
            try {
                socketBatcherRef.current?.flush();
            } catch (e) {}
            if (reason === 'io server disconnect') {
                try {
                    newSocket.connect();
                } catch (e) {
                    console.error("Failed to reconnect after server disconnect:", e);
                }
            } else if (reason === 'transport close' || reason === 'ping timeout') {
                setConnectionStatus('CONNECTION INTERRUPTED. RECONNECTING...');
            }
        });

        newSocket.on('joinedRoom', ({ room, playerId, reconnected }) => {
            if (!room) return;
            if (room.debugPlayerModels) {
                room.multiplayerState = {
                    ...(room.multiplayerState || {}),
                    debugPlayerModels: room.debugPlayerModels
                };
            }
            setRoom(room);
            setPlayerId(playerId || null);
            setMessages(Array.isArray(room.messages) ? room.messages : []);
            if (room.id) {
                lastJoinRef.current = { roomId: room.id, playerName: playerNameRef.current };
            }
            flushActionQueue();
            if (reconnected) {
                setConnectionStatus('RECONNECTED');
                if (reconnectStatusTimeoutRef.current) clearTimeout(reconnectStatusTimeoutRef.current);
                reconnectStatusTimeoutRef.current = setTimeout(() => {
                    setConnectionStatus('');
                    reconnectStatusTimeoutRef.current = null;
                }, 2000);
            }
        });

        newSocket.on('roomUpdated', (updatedRoom) => {
            if (!updatedRoom) return;
            if (updatedRoom.debugPlayerModels) {
                updatedRoom.multiplayerState = {
                    ...(updatedRoom.multiplayerState || {}),
                    debugPlayerModels: updatedRoom.debugPlayerModels
                };
            }
            setRoom(updatedRoom);
            if (Array.isArray(updatedRoom.messages)) {
                setMessages(updatedRoom.messages);
            }
        });

        newSocket.on('chatMessageReceived', (msg: ChatMessage) => {
            if (msg) {
                setMessages(prev => [...prev, msg].slice(-50));
            }
        });

        newSocket.on('gameActionReceived', (data: { playerId: string, action: any }) => {
            try {
                if (onActionRef.current && data) {
                    onActionRef.current(data);
                }
            } catch (err) {
                console.error("Error executing onAction callback:", err);
            }
        });

        newSocket.on('requestFullSync', () => {
            try {
                if (onFullSyncRequestRef.current) {
                    onFullSyncRequestRef.current();
                }
            } catch (err) {
                console.error("Error executing onFullSyncRequest callback:", err);
            }
        });

        newSocket.on('matchAborted', () => {
            // Match abort state is handled by App state and room updates.
        });

        newSocket.on('kicked', () => {
            setError('You were kicked from the room.');
            setRoom(null);
            setPlayerId(null);
            lastJoinRef.current = null;
            try {
                newSocket.disconnect();
            } catch (e) {}
        });

        newSocket.on('error', (err: string) => {
            setError(err || 'An unknown multiplayer error occurred.');
        });

        return newSocket;
    }, []);

    const disconnect = useCallback(() => {
        if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
        }
        if (fallbackConnectTimeoutRef.current) {
            clearTimeout(fallbackConnectTimeoutRef.current);
            fallbackConnectTimeoutRef.current = null;
        }
        if (reconnectStatusTimeoutRef.current) {
            clearTimeout(reconnectStatusTimeoutRef.current);
            reconnectStatusTimeoutRef.current = null;
        }
        const activeSocket = socketRef.current || socket;
        if (activeSocket) {
            try {
                socketBatcherRef.current?.clear();
                activeSocket.removeAllListeners();
                activeSocket.disconnect();
            } catch (e) {
                console.warn("Error disconnecting socket:", e);
            }
        }
        actionQueueRef.current = [];
        socketRef.current = null;
        socketBatcherRef.current = null;
        setSocket(null);
        setIsConnected(false);
        setIsConnecting(false);
        setConnectionStatus('');
        connectionAttemptsRef.current = 0;
        setRoom(null);
        setPlayerId(null);
        setError(null);
        lastJoinRef.current = null;
    }, [socket]);

    useEffect(() => {
        return () => {
            if (connectionTimeoutRef.current) {
                clearTimeout(connectionTimeoutRef.current);
                connectionTimeoutRef.current = null;
            }
            if (fallbackConnectTimeoutRef.current) {
                clearTimeout(fallbackConnectTimeoutRef.current);
                fallbackConnectTimeoutRef.current = null;
            }
            if (reconnectStatusTimeoutRef.current) {
                clearTimeout(reconnectStatusTimeoutRef.current);
                reconnectStatusTimeoutRef.current = null;
            }
            actionQueueRef.current = [];
            if (socketRef.current) {
                try {
                    socketBatcherRef.current?.clear();
                    socketRef.current.removeAllListeners();
                    socketRef.current.disconnect();
                } catch (e) {}
                socketRef.current = null;
                socketBatcherRef.current = null;
            }
        };
    }, []);

    const getStoredAvatarData = () => {
        try {
            const raw = localStorage.getItem('aadish_roulette_logged_in_user');
            if (raw) {
                const u = JSON.parse(raw);
                if (u && typeof u === 'object') {
                    return {
                        avatarUrl: typeof u.avatarUrl === 'string' ? u.avatarUrl : undefined,
                        avatarStyle: typeof u.avatarStyle === 'string' ? u.avatarStyle : undefined,
                        avatarSeed: typeof u.avatarSeed === 'string' ? u.avatarSeed : undefined
                    };
                }
            }
        } catch (e) {}
        return {};
    };

    const joinRoom = (roomId: string, playerName: string) => {
        if (!roomId || !playerName) return;
        playerNameRef.current = playerName;
        lastJoinRef.current = { roomId, playerName };
        const activeSocket = socketRef.current || socket;
        activeSocket?.emit('joinRoom', { roomId, playerName, authId: getAuthId(), ...getStoredAvatarData() });
    };

    const createRoom = (playerName: string) => {
        if (!playerName) return;
        playerNameRef.current = playerName;
        const savedSettings = loadSavedSettings();
        const activeSocket = socketRef.current || socket;
        activeSocket?.emit('createRoom', { playerName, settings: savedSettings, authId: getAuthId(), ...getStoredAvatarData() });
    };

    const quickJoin = (playerName: string) => {
        if (!playerName) return;
        playerNameRef.current = playerName;
        const savedSettings = loadSavedSettings();
        const activeSocket = socketRef.current || socket;
        activeSocket?.emit('quickJoin', { playerName, settings: savedSettings, authId: getAuthId(), ...getStoredAvatarData() });
    };

    const clearError = useCallback(() => {
        setError(null);
        if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
        }
    }, []);

    const updateSettings = (roomId: string, settings: RoomSettings) => {
        if (!roomId || !settings) return;
        try {
            const settingsToSave = { ...settings, isAdvanced: false };
            localStorage.setItem('aadish_roulette_last_lobby_settings', JSON.stringify(settingsToSave));
        } catch (e) {
            console.error("Failed to save settings:", e);
        }
        const activeSocket = socketRef.current || socket;
        activeSocket?.emit('updateSettings', { roomId, settings });
    };

    const readyUp = (roomId: string, ready: boolean) => {
        if (!roomId) return;
        const activeSocket = socketRef.current || socket;
        activeSocket?.emit('readyUp', { roomId, ready });
    };

    const startGame = (roomId: string, gameData: any) => {
        if (!roomId) return;
        const activeSocket = socketRef.current || socket;
        activeSocket?.emit('startGame', { roomId, gameData });
    };

    const sendMessage = (roomId: string, message: string) => {
        if (!roomId || !message?.trim()) return;
        const activeSocket = socketRef.current || socket;
        activeSocket?.emit('chatMessage', { roomId, message: message.trim() });
    };

    const sendAction = (roomId: string, action: any) => {
        if (!roomId || !action) return;
        const activeSocket = socketRef.current || socket;
        if (IMMEDIATE_ACTION_TYPES.has(action?.type)) {
            try {
                socketBatcherRef.current?.flush();
            } catch (e) {}
            if (activeSocket?.connected) {
                activeSocket.emit('gameAction', { roomId, action });
            } else {
                if (actionQueueRef.current.length < 30) {
                    actionQueueRef.current.push({ roomId, action, isImmediate: true });
                }
            }
            return;
        }

        if (socketBatcherRef.current && activeSocket?.connected) {
            socketBatcherRef.current.queue('gameAction', { roomId, action });
        } else if (activeSocket?.connected) {
            activeSocket.emit('gameAction', { roomId, action });
        } else {
            if (actionQueueRef.current.length < 30) {
                actionQueueRef.current.push({ roomId, action, isImmediate: false });
            }
        }
    };

    // Bypass batcher for latency-sensitive events (aim, shoot, state sync)
    const sendImmediateAction = (roomId: string, action: any) => {
        if (!roomId || !action) return;
        const activeSocket = socketRef.current || socket;
        try {
            socketBatcherRef.current?.flush();
        } catch (e) {}
        if (activeSocket?.connected) {
            activeSocket.emit('gameAction', { roomId, action });
        } else {
            if (actionQueueRef.current.length < 30) {
                actionQueueRef.current.push({ roomId, action, isImmediate: true });
            }
        }
    };

    const kickPlayer = (roomId: string, targetPlayerId: string) => {
        if (!roomId || !targetPlayerId) return;
        const activeSocket = socketRef.current || socket;
        activeSocket?.emit('kickPlayer', { roomId, targetPlayerId });
    };

    const updatePlayerAvatar = (roomId: string, avatarData: { avatarUrl?: string; avatarStyle?: string; avatarSeed?: string }) => {
        if (!roomId) return;
        const activeSocket = socketRef.current || socket;
        activeSocket?.emit('updatePlayerAvatar', { roomId, ...avatarData });
    };

    const resetRoomState = (roomId: string) => {
        if (!roomId) return;
        const activeSocket = socketRef.current || socket;
        activeSocket?.emit('resetRoomState', { roomId });
    };

    const getActiveRooms = useCallback(async () => {
        if (!REST_SERVER_URL) return [];
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        try {
            const res = await fetch(`${REST_SERVER_URL}/active-rooms`, { signal: controller.signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch active rooms`);
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                console.warn("Error fetching active rooms:", err);
            }
            return [];
        } finally {
            clearTimeout(timeoutId);
        }
    }, []);

    return {
        socket,
        room,
        playerId,
        error,
        isConnected,
        isConnecting,
        connectionStatus,
        messages,
        latencyMs,
        connect,
        disconnect,
        joinRoom,
        createRoom,
        quickJoin,
        clearError,
        kickPlayer,
        updatePlayerAvatar,
        resetRoomState,
        getActiveRooms,
        updateSettings,
        readyUp,
        startGame,
        sendMessage,
        sendAction,
        sendImmediateAction,
        setOnAction,
        setOnFullSyncRequest
    };
}
