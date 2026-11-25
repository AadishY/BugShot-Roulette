import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { RoomSettings, ChatMessage } from '../types';
import { SocketBatcher } from '../utils/socketOptimizer';
import { compactOfflineActionQueue } from '../utils/syncOptimizer';

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

type ExtendedRoomSettings = RoomSettings & {
    name?: string;
    roomName?: string;
    maxPlayers?: number;
};

const loadSavedSettings = (): ExtendedRoomSettings => {
    let savedSettings: ExtendedRoomSettings = { rounds: 3, hp: 9, itemsPerShipment: 9, isPrivate: false, isAdvanced: false, maxPlayers: 4 };
    try {
        const saved = localStorage.getItem('aadish_roulette_last_lobby_settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && typeof parsed === 'object') {
                const roomName = typeof parsed.roomName === 'string' && parsed.roomName.trim()
                    ? parsed.roomName.trim().slice(0, 32)
                    : (typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim().slice(0, 32) : undefined);
                savedSettings = {
                    rounds: typeof parsed.rounds === 'number' && !isNaN(parsed.rounds) ? Math.min(Math.max(1, Math.round(parsed.rounds)), 7) : 3,
                    hp: typeof parsed.hp === 'number' && !isNaN(parsed.hp) ? Math.min(Math.max(2, Math.round(parsed.hp)), 9) : 9,
                    itemsPerShipment: typeof parsed.itemsPerShipment === 'number' && !isNaN(parsed.itemsPerShipment) ? Math.min(Math.max(0, Math.round(parsed.itemsPerShipment)), 9) : 9,
                    isPrivate: Boolean(parsed.isPrivate),
                    isAdvanced: false,
                    maxPlayers: typeof parsed.maxPlayers === 'number' && !isNaN(parsed.maxPlayers) ? Math.min(Math.max(2, Math.round(parsed.maxPlayers)), 4) : 4,
                    ...(roomName ? { name: roomName, roomName } : {})
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

const IMMEDIATE_ACTION_TYPES = new Set([
    'SHOOT', 'USE_ITEM', 'SELECT_CARD', 'PICKUP_GUN', 'STEAL_ITEM', 'CANCEL_STEAL',
    'SYNC_STATE', 'SYNC_THREE_PLAYER_STATE', 'SYNC_ROUND', 'SYNC_THREE_PLAYER_ROUND',
    'SYNC_MP_GAME_OVER',
    'DEBUG_SYNC_PLAYER', 'DEBUG_SYNC_DEALER', 'DEBUG_SYNC_GAMESTATE',
    'DEBUG_SYNC_THREE_PLAYER', 'DEBUG_SYNC_PLAYER_MODEL', 'DEBUG_SET_PLAYER_MODEL'
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
    const hasConnectedOnceRef = useRef(false);
    const isMountedRef = useRef(true);
    const socketRef = useRef<Socket | null>(null);
    const socketBatcherRef = useRef<SocketBatcher | null>(null);
    const managerCleanupRef = useRef<(() => void) | null>(null);
    const lastJoinRef = useRef<{ roomId: string; playerName: string } | null>(null);
    const playerNameRef = useRef<string>('');
    const actionQueueRef = useRef<{ roomId: string; action: any; isImmediate?: boolean }[]>([]);
    const fallbackConnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reconnectStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearTimers = useCallback(() => {
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
    }, []);

    const teardownActiveSocket = useCallback((emitLeave = false) => {
        const activeSocket = socketRef.current;
        if (managerCleanupRef.current) {
            try {
                managerCleanupRef.current();
            } catch (e) {}
            managerCleanupRef.current = null;
        }
        if (socketBatcherRef.current) {
            try {
                socketBatcherRef.current.clear();
            } catch (e) {}
            socketBatcherRef.current = null;
        }
        if (activeSocket) {
            try {
                if (emitLeave && activeSocket.connected && lastJoinRef.current?.roomId) {
                    activeSocket.emit('leaveRoom', { roomId: lastJoinRef.current.roomId });
                }
                activeSocket.removeAllListeners();
                activeSocket.disconnect();
            } catch (e) {}
            socketRef.current = null;
        }
    }, []);

    const enqueueOfflineAction = useCallback((roomId: string, action: any, isImmediate = false) => {
        if (!roomId || !action) return;
        actionQueueRef.current = compactOfflineActionQueue(
            [...actionQueueRef.current, { roomId, action, isImmediate }],
            30
        );
    }, []);

    const flushActionQueue = useCallback(() => {
        const s = socketRef.current;
        if (!s || !s.connected || actionQueueRef.current.length === 0) return;
        const queued = compactOfflineActionQueue(actionQueueRef.current, 30);
        actionQueueRef.current = [];
        if (queued.length === 0) return;
        if (queued.length === 1) {
            s.emit('gameAction', { roomId: queued[0].roomId, action: queued[0].action });
            return;
        }
        const MAX_BATCH = 24;
        for (let i = 0; i < queued.length; i += MAX_BATCH) {
            const chunk = queued.slice(i, i + MAX_BATCH);
            if (chunk.length === 1) {
                s.emit('gameAction', { roomId: chunk[0].roomId, action: chunk[0].action });
            } else {
                const batch = chunk.map(q => ({ type: 'gameAction', data: { roomId: q.roomId, action: q.action } }));
                s.emit('gameActionBatch', { actions: batch });
            }
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

        // Prevent socket leaks if connect is called while already connected or connecting
        teardownActiveSocket(false);
        clearTimers();
        hasConnectedOnceRef.current = false;
        setIsConnecting(true);
        setError(null);
        setConnectionStatus('ESTABLISHING LINK...');
        connectionAttemptsRef.current = 0;

        // Hard watchdog timeout (12s): Prevents hanging on dormant cloud spaces or silent socket stalls
        connectionTimeoutRef.current = setTimeout(() => {
            connectionTimeoutRef.current = null;
            if (!isMountedRef.current) return;
            if (!socketRef.current?.connected) {
                console.warn("[Socket] Connection timed out after 12s.");
                teardownActiveSocket(false);
                setSocket(null);
                setIsConnected(false);
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
        // Assign immediately so cancel/timeout/double-connect always tears down this socket
        socketRef.current = newSocket;

        newSocket.on('connect', () => {
            if (socketRef.current !== newSocket || !isMountedRef.current) return;
            if (connectionTimeoutRef.current) {
                clearTimeout(connectionTimeoutRef.current);
                connectionTimeoutRef.current = null;
            }
            hasConnectedOnceRef.current = true;
            setIsConnected(true);
            setIsConnecting(false);
            setSocket(newSocket);
            setError(null);
            setConnectionStatus('');
            connectionAttemptsRef.current = 0;

            // Clear any prior batcher before initializing a fresh one on reconnect
            if (socketBatcherRef.current) {
                socketBatcherRef.current.clear();
            }
            socketBatcherRef.current = new SocketBatcher(4, 40, (actions) => {
                if (!newSocket.connected) {
                    for (const act of actions) {
                        if (act?.data?.roomId && act?.data?.action) {
                            enqueueOfflineAction(act.data.roomId, act.data.action, false);
                        }
                    }
                    return;
                }
                if (actions.length === 1) {
                    newSocket.emit('gameAction', actions[0].data);
                } else {
                    newSocket.emit('gameActionBatch', { actions });
                }
            });

            // Auto-rejoin room after reconnect (lobby or mid-game grace window)
            const pending = lastJoinRef.current;
            if (pending && playerNameRef.current) {
                newSocket.emit('joinRoom', {
                    roomId: pending.roomId,
                    playerName: playerNameRef.current,
                    authId: getAuthId(),
                    ...getStoredAvatarData()
                });
            } else {
                // Flush any pending queued actions only if no rejoin is pending
                flushActionQueue();
            }
        });

        const ioManager = newSocket.io as any;
        let engineCleanup: (() => void) | null = null;
        const onPing = () => {
            (newSocket as any)._pingSentAt = Date.now();
        };
        const onPong = () => {
            if (socketRef.current !== newSocket || !isMountedRef.current) return;
            const sent = (newSocket as any)._pingSentAt;
            if (sent) {
                const rtt = Date.now() - sent;
                if (rtt >= 0 && rtt < 15000) setLatencyMs(rtt);
            }
        };
        const attachEngineRttListeners = () => {
            if (engineCleanup) {
                try { engineCleanup(); } catch {}
                engineCleanup = null;
            }
            const engine = (newSocket.io as any)?.engine;
            if (!engine || typeof engine.on !== 'function') return;
            let lastPacketOut = 0;
            const onPacketCreate = (packet: any) => {
                if (packet?.type === 'pong') {
                    lastPacketOut = Date.now();
                }
            };
            const onEnginePing = () => {
                if (lastPacketOut > 0) {
                    // Track round-trip jitter when transport handles heartbeats
                    const now = Date.now();
                    if (now - lastPacketOut < 15000) {
                        (newSocket as any)._pingSentAt = now;
                    }
                } else {
                    (newSocket as any)._pingSentAt = Date.now();
                }
            };
            engine.on('packetCreate', onPacketCreate);
            engine.on('ping', onEnginePing);
            engineCleanup = () => {
                engine.off?.('packetCreate', onPacketCreate);
                engine.off?.('ping', onEnginePing);
            };
        };
        const onReconnectAttempt = (attempt: number) => {
            if (socketRef.current !== newSocket || !isMountedRef.current) return;
            setConnectionStatus(`RECONNECTING TO MAINFRAME (${attempt}/50)...`);
        };
        const onReconnect = () => {
            if (socketRef.current !== newSocket || !isMountedRef.current) return;
            setIsConnected(true);
            setIsConnecting(false);
            setError(null);
            setConnectionStatus('');
            attachEngineRttListeners();
            if (!lastJoinRef.current) {
                flushActionQueue();
            }
        };
        const onReconnectFailed = () => {
            if (socketRef.current !== newSocket || !isMountedRef.current) return;
            console.warn("Socket reconnection failed after 50 attempts.");
            clearTimers();
            teardownActiveSocket(false);
            hasConnectedOnceRef.current = false;
            setSocket(null);
            setError('Connection lost: Server unreachable after multiple reconnection attempts.');
            setIsConnecting(false);
            setIsConnected(false);
            setConnectionStatus('');
        };
        const onReconnectError = (err: any) => {
            if (socketRef.current !== newSocket) return;
            console.warn("Socket reconnect error:", err);
        };
        const onBrowserOnline = () => {
            if (socketRef.current === newSocket && isMountedRef.current && !newSocket.connected) {
                setConnectionStatus('NETWORK RESTORED. RECONNECTING...');
                try { newSocket.connect(); } catch {}
            }
        };
        const onBrowserOffline = () => {
            if (socketRef.current === newSocket && isMountedRef.current) {
                setIsConnected(false);
                setConnectionStatus('OFFLINE: WAITING FOR NETWORK...');
            }
        };
        if (typeof window !== 'undefined') {
            window.addEventListener('online', onBrowserOnline);
            window.addEventListener('offline', onBrowserOffline);
        }

        if (ioManager && typeof ioManager.on === 'function') {
            ioManager.on('ping', onPing);
            ioManager.on('pong', onPong);
            ioManager.on('reconnect_attempt', onReconnectAttempt);
            ioManager.on('reconnect', onReconnect);
            ioManager.on('reconnect_failed', onReconnectFailed);
            ioManager.on('reconnect_error', onReconnectError);
            attachEngineRttListeners();
        }
        managerCleanupRef.current = () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('online', onBrowserOnline);
                window.removeEventListener('offline', onBrowserOffline);
            }
            if (engineCleanup) {
                try { engineCleanup(); } catch {}
                engineCleanup = null;
            }
            if (ioManager && typeof ioManager.off === 'function') {
                ioManager.off('ping', onPing);
                ioManager.off('pong', onPong);
                ioManager.off('reconnect_attempt', onReconnectAttempt);
                ioManager.off('reconnect', onReconnect);
                ioManager.off('reconnect_failed', onReconnectFailed);
                ioManager.off('reconnect_error', onReconnectError);
            }
        };

        newSocket.on('connect_error', (err) => {
            if (socketRef.current !== newSocket || !isMountedRef.current) return;
            connectionAttemptsRef.current += 1;
            console.warn(`[Socket] Connection error attempt ${connectionAttemptsRef.current}:`, (err as any)?.message || err);

            // If local server is offline before initial connect, auto-route to cloud backend on attempt 2
            if (!hasConnectedOnceRef.current && isLocal && !hasFallenBackRef.current && connectionAttemptsRef.current >= 2) {
                hasFallenBackRef.current = true;
                setConnectionStatus('ROUTING TO CLOUD BUNKER...');
                teardownActiveSocket(false);
                if (fallbackConnectTimeoutRef.current) clearTimeout(fallbackConnectTimeoutRef.current);
                fallbackConnectTimeoutRef.current = setTimeout(() => {
                    fallbackConnectTimeoutRef.current = null;
                    if (!isMountedRef.current) return;
                    connect(playerNameRef.current);
                }, 200);
                return;
            }

            // Once already connected in-session, allow Socket.IO's reconnectionAttempts & online recovery to continue
            if (hasConnectedOnceRef.current) {
                setIsConnecting(false);
                if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                    setConnectionStatus('OFFLINE: WAITING FOR NETWORK...');
                }
                return;
            }

            // Initial cloud connection or after fallback: fail fast after 3 attempts (~6-8s) instead of hanging indefinitely
            const maxAttempts = (isLocal && !hasFallenBackRef.current) ? 2 : 3;
            if (connectionAttemptsRef.current >= maxAttempts) {
                if (connectionTimeoutRef.current) {
                    clearTimeout(connectionTimeoutRef.current);
                    connectionTimeoutRef.current = null;
                }
                teardownActiveSocket(false);
                setSocket(null);
                setError('SERVER OFFLINE: Multiplayer server is unreachable or asleep. Please click Retry to wake it up or return to the main menu.');
                setIsConnecting(false);
                setConnectionStatus('');
            } else {
                setConnectionStatus(`CONNECTING TO SERVER (ATTEMPT ${connectionAttemptsRef.current}/${maxAttempts})...`);
            }
        });

        newSocket.on('disconnect', (reason) => {
            if (socketRef.current !== newSocket || !isMountedRef.current) return;
            console.log('Socket disconnected:', reason);
            setIsConnected(false);
            try {
                socketBatcherRef.current?.flush();
            } catch (e) {}
            if (reason === 'io server disconnect') {
                setIsConnecting(true);
                setConnectionStatus('SERVER DISCONNECTED. RECONNECTING...');
                try {
                    newSocket.connect();
                } catch (e) {
                    console.error("Failed to reconnect after server disconnect:", e);
                    setIsConnecting(false);
                    setConnectionStatus('');
                }
            } else if (reason === 'io client disconnect') {
                setIsConnecting(false);
                setConnectionStatus('');
            } else if (reason === 'transport close' || reason === 'ping timeout') {
                setIsConnecting(false);
                const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
                setConnectionStatus(isOffline ? 'OFFLINE: WAITING FOR NETWORK...' : 'CONNECTION INTERRUPTED. RECONNECTING...');
            }
        });

        newSocket.on('joinedRoom', ({ room: joinedRoom, playerId: joinedPlayerId, reconnected }) => {
            if (socketRef.current !== newSocket || !isMountedRef.current) return;
            if (!joinedRoom) return;
            if (joinedRoom.debugPlayerModels) {
                joinedRoom.multiplayerState = {
                    ...(joinedRoom.multiplayerState || {}),
                    debugPlayerModels: joinedRoom.debugPlayerModels
                };
            }
            setRoom(joinedRoom);
            setPlayerId(joinedPlayerId || null);
            setMessages(Array.isArray(joinedRoom.messages) ? joinedRoom.messages : []);
            if (joinedRoom.id) {
                lastJoinRef.current = { roomId: joinedRoom.id, playerName: playerNameRef.current };
            }
            flushActionQueue();
            if (reconnected) {
                setConnectionStatus('RECONNECTED');
                if (reconnectStatusTimeoutRef.current) clearTimeout(reconnectStatusTimeoutRef.current);
                reconnectStatusTimeoutRef.current = setTimeout(() => {
                    reconnectStatusTimeoutRef.current = null;
                    if (!isMountedRef.current) return;
                    setConnectionStatus('');
                }, 2000);
            }
        });

        newSocket.on('roomUpdated', (updatedRoom) => {
            if (socketRef.current !== newSocket || !isMountedRef.current) return;
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
            if (socketRef.current !== newSocket || !isMountedRef.current) return;
            if (msg) {
                setMessages(prev => [...prev, msg].slice(-50));
            }
        });

        newSocket.on('gameActionReceived', (data: { playerId: string, action: any }) => {
            if (socketRef.current !== newSocket || !isMountedRef.current) return;
            try {
                if (onActionRef.current && data) {
                    onActionRef.current(data);
                }
            } catch (err) {
                console.error("Error executing onAction callback:", err);
            }
        });

        newSocket.on('requestFullSync', () => {
            if (socketRef.current !== newSocket || !isMountedRef.current) return;
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
            if (socketRef.current !== newSocket || !isMountedRef.current) return;
            clearTimers();
            teardownActiveSocket(false);
            hasConnectedOnceRef.current = false;
            setSocket(null);
            setIsConnected(false);
            setIsConnecting(false);
            setConnectionStatus('');
            setLatencyMs(null);
            setError('You were kicked from the room.');
            setRoom(null);
            setPlayerId(null);
            lastJoinRef.current = null;
            actionQueueRef.current = [];
        });

        newSocket.on('error', (err: string) => {
            if (socketRef.current !== newSocket || !isMountedRef.current) return;
            setError(err || 'An unknown multiplayer error occurred.');
        });

        return newSocket;
    }, [clearTimers, enqueueOfflineAction, flushActionQueue, teardownActiveSocket]);

    const disconnect = useCallback(() => {
        clearTimers();
        teardownActiveSocket(true);
        hasConnectedOnceRef.current = false;
        actionQueueRef.current = [];
        setSocket(null);
        setIsConnected(false);
        setIsConnecting(false);
        setConnectionStatus('');
        connectionAttemptsRef.current = 0;
        setRoom(null);
        setPlayerId(null);
        setMessages([]);
        setLatencyMs(null);
        setError(null);
        lastJoinRef.current = null;
    }, [clearTimers, teardownActiveSocket]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            hasConnectedOnceRef.current = false;
            clearTimers();
            actionQueueRef.current = [];
            teardownActiveSocket(true);
        };
    }, [clearTimers, teardownActiveSocket]);

    const joinRoom = useCallback((roomId: string, playerName: string) => {
        if (!roomId || !playerName) return;
        playerNameRef.current = playerName;
        lastJoinRef.current = { roomId, playerName };
        socketRef.current?.emit('joinRoom', { roomId, playerName, authId: getAuthId(), ...getStoredAvatarData() });
    }, []);

    const createRoom = useCallback((playerName: string) => {
        if (!playerName) return;
        playerNameRef.current = playerName;
        const savedSettings = loadSavedSettings();
        socketRef.current?.emit('createRoom', { playerName, settings: savedSettings, authId: getAuthId(), ...getStoredAvatarData() });
    }, []);

    const quickJoin = useCallback((playerName: string) => {
        if (!playerName) return;
        playerNameRef.current = playerName;
        const savedSettings = loadSavedSettings();
        socketRef.current?.emit('quickJoin', { playerName, settings: savedSettings, authId: getAuthId(), ...getStoredAvatarData() });
    }, []);

    const leaveRoom = useCallback((roomId: string) => {
        if (!roomId) return;
        socketRef.current?.emit('leaveRoom', { roomId });
        if (lastJoinRef.current?.roomId === roomId) {
            lastJoinRef.current = null;
        }
        actionQueueRef.current = [];
        setRoom(null);
        setMessages([]);
    }, []);

    const clearError = useCallback(() => {
        setError(null);
        if (connectionTimeoutRef.current) {
            clearTimeout(connectionTimeoutRef.current);
            connectionTimeoutRef.current = null;
        }
    }, []);

    const updateSettings = useCallback((roomId: string, settings: RoomSettings) => {
        if (!roomId || !settings) return;
        try {
            const settingsToSave = { ...settings, isAdvanced: false };
            localStorage.setItem('aadish_roulette_last_lobby_settings', JSON.stringify(settingsToSave));
        } catch (e) {
            console.error("Failed to save settings:", e);
        }
        socketRef.current?.emit('updateSettings', { roomId, settings });
    }, []);

    const readyUp = useCallback((roomId: string, ready: boolean) => {
        if (!roomId) return;
        socketRef.current?.emit('readyUp', { roomId, ready });
    }, []);

    const startGame = useCallback((roomId: string, gameData: any) => {
        if (!roomId) return;
        socketRef.current?.emit('startGame', { roomId, gameData });
    }, []);

    const sendMessage = useCallback((roomId: string, message: string) => {
        if (!roomId || !message?.trim()) return;
        const senderUsername = getAuthId();
        const avatarData = getStoredAvatarData();
        socketRef.current?.emit('chatMessage', {
            roomId,
            message: message.trim(),
            ...(senderUsername ? { senderUsername, isDeveloper: senderUsername === 'aadish' } : {}),
            ...avatarData
        });
    }, []);

    const sendAction = useCallback((roomId: string, action: any) => {
        if (!roomId || !action) return;
        const activeSocket = socketRef.current;
        if (IMMEDIATE_ACTION_TYPES.has(action?.type)) {
            try {
                socketBatcherRef.current?.flush();
            } catch (e) {}
            if (activeSocket?.connected) {
                activeSocket.emit('gameAction', { roomId, action });
            } else {
                enqueueOfflineAction(roomId, action, true);
            }
            return;
        }

        if (socketBatcherRef.current && activeSocket?.connected) {
            socketBatcherRef.current.queue('gameAction', { roomId, action });
        } else if (activeSocket?.connected) {
            activeSocket.emit('gameAction', { roomId, action });
        } else {
            enqueueOfflineAction(roomId, action, false);
        }
    }, [enqueueOfflineAction]);

    // Bypass batcher for latency-sensitive events (aim, shoot, state sync)
    const sendImmediateAction = useCallback((roomId: string, action: any) => {
        if (!roomId || !action) return;
        const activeSocket = socketRef.current;
        try {
            socketBatcherRef.current?.flush();
        } catch (e) {}
        if (activeSocket?.connected) {
            activeSocket.emit('gameAction', { roomId, action });
        } else {
            enqueueOfflineAction(roomId, action, true);
        }
    }, [enqueueOfflineAction]);

    const kickPlayer = useCallback((roomId: string, targetPlayerId: string) => {
        if (!roomId || !targetPlayerId) return;
        socketRef.current?.emit('kickPlayer', { roomId, targetPlayerId });
    }, []);

    const updatePlayerAvatar = useCallback((roomId: string, avatarData: { avatarUrl?: string; avatarStyle?: string; avatarSeed?: string; displayName?: string }) => {
        const activeSocket = socketRef.current;
        if (!activeSocket?.connected) return;
        activeSocket.emit('updatePlayerAvatar', { roomId: roomId || undefined, ...avatarData });
    }, []);

    const resetRoomState = useCallback((roomId: string) => {
        if (!roomId) return;
        socketRef.current?.emit('resetRoomState', { roomId });
    }, []);

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

    return useMemo(() => ({
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
        leaveRoom,
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
    }), [
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
        leaveRoom,
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
    ]);
}
