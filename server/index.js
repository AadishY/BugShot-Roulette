import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import os from 'os';
import compression from 'compression';
import dotenv from 'dotenv';

dotenv.config();
dotenv.config({ path: new URL('.env', import.meta.url) });
dotenv.config({ path: new URL('../.env', import.meta.url) });

const app = express();

// Enable GZIP compression to reduce packet sizes across web hosting infrastructure
app.use(compression());

// Strip /server prefix if present (e.g. when proxied by Cloudflare without stripping)
app.use((req, res, next) => {
    if (req.url.startsWith('/server/')) {
        req.url = req.url.substring(7);
    } else if (req.url === '/server') {
        req.url = '/';
    }
    next();
});

// --- HUGGING FACE & REVERSE PROXY LAYER CONFIGURATION ---
// Hugging Face Spaces route dynamic client traffic through layered reverse proxies.
// Trusting proxies allows the Express core engine to correctly read downstream headers (IPs, proto upgrades).
app.set('trust proxy', true);

const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;
const allowedOrigins = allowedOriginsEnv ? allowedOriginsEnv.split(',').map(s => s.trim()) : [];

// Robust cross-origin validation supporting Hugging Face, Vercel, Cloudflare, Google AI Studio, Localhost, and LAN IPs
const isOriginAllowed = (origin) => {
    // Allow non-browser agents, server-to-server, curl, mobile native webviews
    if (!origin) return true;
    if (allowedOriginsEnv === "*") return true;
    if (allowedOrigins.includes(origin)) return true;

    try {
        const parsed = new URL(origin);
        const host = parsed.hostname.toLowerCase();

        // Hugging Face Spaces (*.hf.space, hf.space)
        if (host === 'hf.space' || host.endsWith('.hf.space')) return true;

        // Vercel Deployments (*.vercel.app, vercel.app)
        if (host === 'vercel.app' || host.endsWith('.vercel.app')) return true;

        // Cloudflare Pages (*.pages.dev, pages.dev)
        if (host === 'pages.dev' || host.endsWith('.pages.dev')) return true;

        // GitHub Pages (*.github.io, github.io)
        if (host === 'github.io' || host.endsWith('.github.io')) return true;

        // Netlify (*.netlify.app, netlify.app)
        if (host === 'netlify.app' || host.endsWith('.netlify.app')) return true;

        // Firebase Web Apps (*.web.app, *.firebaseapp.com)
        if (host === 'web.app' || host.endsWith('.web.app') || host === 'firebaseapp.com' || host.endsWith('.firebaseapp.com')) return true;

        // Render (*.onrender.com)
        if (host === 'onrender.com' || host.endsWith('.onrender.com')) return true;

        // Google AI Studio & Google ecosystems (aistudio.google.com, *.google.com, *.googleusercontent.com)
        if (
            host === 'aistudio.google.com' ||
            host === 'google.com' || host.endsWith('.google.com') ||
            host === 'googleusercontent.com' || host.endsWith('.googleusercontent.com')
        ) return true;

        // Localhost & Loopback
        if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return true;

        // LAN IP ranges: 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12
        if (
            host.startsWith('192.168.') ||
            host.startsWith('10.') ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
        ) return true;

    } catch (e) {
        // Fallback pattern checks for partial or malformed origin strings
        const lower = origin.toLowerCase();
        if (
            lower.includes('.hf.space') ||
            lower.includes('hf.space') ||
            lower.includes('.vercel.app') ||
            lower.includes('vercel.app') ||
            lower.includes('.pages.dev') ||
            lower.includes('pages.dev') ||
            lower.includes('aistudio.google.com') ||
            lower.includes('.google.com') ||
            lower.includes('google.com') ||
            lower.includes('.googleusercontent.com') ||
            lower.includes('localhost') ||
            lower.includes('127.0.0.1') ||
            lower.includes('192.168.') ||
            lower.includes('10.') ||
            lower.includes('172.')
        ) {
            return true;
        }
    }

    return false;
};

const corsOptions = {
    origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
            callback(null, true);
        } else {
            console.warn(`[CORS SECURITY] Blocked unauthorized origin: ${origin}`);
            callback(null, false);
        }
    },
    methods: ["GET", "POST", "HEAD", "OPTIONS"],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Analytics Metric Storage Vitals
const serverStartTime = Date.now();
let globalMatchesPlayed = 0;
let unauthorizedInterventionsBlocked = 0;
let activeConnectionsCount = 0;

// Central State Repository Memory Pool
// Room Context Map: roomId -> { id, hostId, players: [...], settings: {...}, gameState: {...}, lastActivity: timestamp }
const rooms = new Map();

// Timer and Resource Cleanup Utilities to prevent memory leaks and dangling timeouts
const cleanupPlayerTimers = (player) => {
    if (!player) return;
    if (player.disconnectTimer) {
        clearTimeout(player.disconnectTimer);
        delete player.disconnectTimer;
    }
};

const cleanupRoomTimers = (room) => {
    if (!room) return;
    if (room.deletionTimer) {
        clearTimeout(room.deletionTimer);
        delete room.deletionTimer;
    }
    if (Array.isArray(room.players)) {
        room.players.forEach(p => cleanupPlayerTimers(p));
    }
};

const deleteRoomSafely = (roomId) => {
    const room = rooms.get(roomId);
    if (!room) return;
    cleanupRoomTimers(room);
    rooms.delete(roomId);
};

const scheduleRoomDeletion = (room, roomId, delayMs = 20000) => {
    if (!room) return;
    if (room.deletionTimer) {
        clearTimeout(room.deletionTimer);
    }
    room.deletionTimer = setTimeout(() => {
        const current = rooms.get(roomId);
        if (current) {
            const connectedCount = current.players.filter(p => !p.disconnected).length;
            if (connectedCount === 0 || current.players.length === 0) {
                deleteRoomSafely(roomId);
            }
        }
    }, delayMs);
};

// --- REAL-TIME LIVE PRESENCE REPOSITORY ---
// socket.id -> { socketId, username, playerId, displayName, avatarUrl, avatarStyle, status, roomId, matchInfo, connectedAt, lastSeen, isDeveloper }
const presenceMap = new Map();
// username.toLowerCase() -> Set<socket.id>
const userSocketsMap = new Map();
// username.toLowerCase() -> timestamp (Persists real-time last seen across connections)
const userLastSeenMap = new Map();
// Active developer usernames (lowercase) for O(1) privilege lookup
const developerUsernames = new Set();

const MAX_LAST_SEEN_ENTRIES = 2000;
const setTrackedLastSeen = (usernameLower, timestamp) => {
    if (!usernameLower) return;
    userLastSeenMap.set(usernameLower, timestamp);
    if (userLastSeenMap.size > MAX_LAST_SEEN_ENTRIES) {
        const oldestKey = userLastSeenMap.keys().next().value;
        if (oldestKey) userLastSeenMap.delete(oldestKey);
    }
};

// Filter presence details based on viewer privileges
const formatPresenceForClient = (presence, viewerUsername, viewerIsFriend = false) => {
    const isDev = Boolean(viewerUsername && developerUsernames.has(viewerUsername.toLowerCase()));
    const isSelf = Boolean(viewerUsername && viewerUsername.toLowerCase() === presence.username.toLowerCase());
    const effectiveLastSeen = presence.lastSeen || userLastSeenMap.get(presence.username.toLowerCase()) || Date.now();

    return {
        username: presence.username,
        playerId: presence.playerId,
        displayName: presence.displayName,
        avatarUrl: presence.avatarUrl,
        avatarStyle: presence.avatarStyle,
        avatarSeed: presence.avatarSeed,
        status: presence.status,
        roomId: presence.roomId,
        matchInfo: presence.matchInfo,
        connectedAt: presence.connectedAt,
        lastSeen: effectiveLastSeen,
        isDeveloper: presence.isDeveloper
    };
};

const broadcastPresence = (presenceObj) => {
    if (!io) return;
    const formatted = formatPresenceForClient(presenceObj);
    io.emit('presence:user_updated', formatted);
};

const updateSocketPresence = (socketId, updates) => {
    const p = presenceMap.get(socketId);
    if (!p) return;
    Object.assign(p, updates);
    p.lastSeen = Date.now();
    setTrackedLastSeen(p.username.toLowerCase(), p.lastSeen);
    broadcastPresence(p);
};

// Muted users & sockets management
const mutedUsers = new Map(); // username.toLowerCase() -> unmuteTimestamp (ms)
const mutedSockets = new Map(); // socket.id -> unmuteTimestamp (ms)

const isUserOrSocketMuted = (socket, username) => {
    const now = Date.now();
    if (socket && mutedSockets.has(socket.id)) {
        const expiry = mutedSockets.get(socket.id);
        if (now < expiry) return true;
        mutedSockets.delete(socket.id);
    }
    const cleanUser = (username || socket?.username || '').trim().toLowerCase();
    if (cleanUser && mutedUsers.has(cleanUser)) {
        const expiry = mutedUsers.get(cleanUser);
        if (now < expiry) return true;
        mutedUsers.delete(cleanUser);
    }
    return false;
};

const getAdminOverview = () => {
    const activeUsersList = [];
    for (const [sId, p] of presenceMap.entries()) {
        activeUsersList.push({
            socketId: sId,
            username: p.username,
            playerId: p.playerId,
            displayName: p.displayName,
            avatarUrl: p.avatarUrl,
            status: p.status,
            roomId: p.roomId,
            matchInfo: p.matchInfo,
            connectedAt: p.connectedAt,
            lastSeen: p.lastSeen,
            isDeveloper: p.isDeveloper
        });
    }

    const roomSummaries = [];
    for (const [rId, room] of rooms.entries()) {
        roomSummaries.push({
            id: rId,
            name: room.name,
            hostId: room.hostId,
            settings: room.settings,
            lastActivity: room.lastActivity,
            playerCount: room.players.length,
            players: room.players.map(p => ({
                id: p.id,
                name: p.name,
                color: p.color,
                hp: p.hp,
                maxHp: p.maxHp,
                ready: p.ready,
                items: p.items || [],
                isHandcuffed: p.isHandcuffed,
                isSawedActive: p.isSawedActive,
                disconnected: p.disconnected,
                authId: p.authId,
                model: p.model
            })),
            gameState: room.gameState ? {
                round: room.gameState.round,
                turn: room.gameState.turn,
                totalShells: room.gameState.chamber ? room.gameState.chamber.length : 0,
                liveShells: room.gameState.liveShells,
                blankShells: room.gameState.blankShells,
                isSawActive: room.gameState.isSawActive,
                dealerHandcuffed: room.gameState.dealerHandcuffed,
                playerHandcuffed: room.gameState.playerHandcuffed
            } : null
        });
    }

    // Include real-time Singleplayer Combat Chambers in Admin Overview
    for (const [sId, p] of presenceMap.entries()) {
        if (p.status === 'in_match' && (!p.roomId || !rooms.has(p.roomId)) && p.matchInfo) {
            const mi = p.matchInfo;
            const spRoomId = `SP-${p.username.toUpperCase()}`;
            const opponentName = mi.opponent || (mi.gameMode === 'HARD_MODE' ? 'THE REAPER' : 'DEALER');
            
            roomSummaries.push({
                id: spRoomId,
                name: `SINGLEPLAYER: ${p.displayName || p.username} VS ${opponentName}`,
                hostId: sId,
                isSingleplayer: true,
                settings: {
                    mode: mi.gameMode || 'SINGLEPLAYER',
                    hp: mi.totalHealth || 4
                },
                lastActivity: p.lastSeen || Date.now(),
                playerCount: 2,
                players: [
                    {
                        id: sId,
                        name: p.displayName || p.username,
                        color: '#06b6d4',
                        hp: mi.currentHealth ?? 4,
                        maxHp: mi.totalHealth ?? 4,
                        ready: true,
                        items: mi.playerItems || [],
                        isHandcuffed: Boolean(mi.isPlayerHandcuffed),
                        isSawedActive: Boolean(mi.isSawActive && mi.turnOwner === 'PLAYER'),
                        disconnected: false,
                        authId: p.playerId
                    },
                    {
                        id: 'AI_DEALER',
                        name: opponentName,
                        color: mi.gameMode === 'HARD_MODE' ? '#991b1b' : '#dc2626',
                        hp: mi.dealerHealth ?? 4,
                        maxHp: mi.dealerTotalHealth ?? 4,
                        ready: true,
                        items: mi.dealerItems || [],
                        isHandcuffed: Boolean(mi.isDealerHandcuffed),
                        isSawedActive: Boolean(mi.isSawActive && mi.turnOwner === 'DEALER'),
                        disconnected: false,
                        authId: '@dealer#0000'
                    }
                ],
                gameState: {
                    round: mi.round || 1,
                    turn: mi.turnOwner === 'DEALER' ? 'AI_DEALER' : sId,
                    totalShells: (mi.liveShells || 0) + (mi.blankShells || 0),
                    liveShells: mi.liveShells ?? 0,
                    blankShells: mi.blankShells ?? 0,
                    isSawActive: Boolean(mi.isSawActive),
                    dealerHandcuffed: Boolean(mi.isDealerHandcuffed),
                    playerHandcuffed: Boolean(mi.isPlayerHandcuffed)
                }
            });
        }
    }

    const lastSeenObj = {};
    for (const [uname, t] of userLastSeenMap.entries()) {
        lastSeenObj[uname] = t;
    }

    return {
        vitals: {
            uptimeMS: Date.now() - serverStartTime,
            activeConnectionsCount,
            memoryMB: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
            globalMatchesPlayed,
            unauthorizedInterventionsBlocked
        },
        activeUsers: activeUsersList,
        rooms: roomSummaries,
        lastSeenMap: lastSeenObj,
        mutedUsers: Array.from(mutedUsers.keys())
    };
};

const PLAYER_COLORS = [
    '#06b6d4', // Cyan
    '#f59e0b', // Amber/Yellow
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#3b82f6', // Cobalt/Electric Blue
    '#f97316'  // Orange
];

const httpServer = createServer(app);

// --- LOW-LATENCY SOCKET.IO NETWORK ENGINE ---
const io = new Server(httpServer, {
    cors: {
        origin: allowedOriginsEnv === "*" ? true : (origin, callback) => {
            if (isOriginAllowed(origin)) {
                callback(null, true);
            } else {
                callback(null, false);
            }
        },
        methods: ["GET", "POST"],
        credentials: true
    },
    pingTimeout: 20000,        // Allow 20s for mobile/high-latency networks to avoid spurious drops
    pingInterval: 10000,       // 10s heartbeats provide optimal synchronization without bandwidth thrashing
    connectTimeout: 20000,
    cookie: false,             // Avoid parsing session cookies to preserve packet header bandwidth
    transports: ['websocket', 'polling'], // Native WebSockets with polling fallback
    allowEIO3: true,           // Backwards compatibility layer support fallback
    maxHttpBufferSize: 1e6,    // Hard ceiling packet capacity threshold at 1MB to protect against buffer exploits
    perMessageDeflate: { threshold: 512 } // Compress large sync payloads without taxing small action packets
});

const RECONNECT_GRACE_MS = 25000;
const LOBBY_RECONNECT_GRACE_MS = 20000;
const MAX_ROOM_ID_ATTEMPTS = 1000;
const MAX_PLAYER_NAME_LENGTH = 18;
const ROOM_ID_PATTERN = /^[0-9]{4}$/;
const THROTTLE_EXEMPT_ACTIONS = new Set([
    'SHOOT', 'USE_ITEM', 'SELECT_CARD', 'PICKUP_GUN', 'STEAL_ITEM', 'CANCEL_STEAL',
    'SYNC_STATE', 'SYNC_THREE_PLAYER_STATE', 'SYNC_ROUND', 'SYNC_THREE_PLAYER_ROUND',
    'SYNC_MP_GAME_OVER',
    'DEBUG_SYNC_PLAYER', 'DEBUG_SYNC_DEALER', 'DEBUG_SYNC_GAMESTATE',
    'DEBUG_SYNC_THREE_PLAYER', 'DEBUG_SYNC_PLAYER_MODEL', 'DEBUG_SET_PLAYER_MODEL'
]);
const VALID_GAME_ACTIONS = new Set([
    'SHOOT', 'USE_ITEM', 'SELECT_CARD', 'PICKUP_GUN', 'STEAL_ITEM', 'CANCEL_STEAL', 'HOVER_TARGET',
    'SYNC_STATE', 'SYNC_THREE_PLAYER_STATE', 'SYNC_ROUND', 'SYNC_THREE_PLAYER_ROUND',
    'SYNC_MP_GAME_OVER',
    'DEBUG_SYNC_PLAYER', 'DEBUG_SYNC_DEALER', 'DEBUG_SYNC_GAMESTATE',
    'DEBUG_SYNC_THREE_PLAYER', 'DEBUG_SYNC_PLAYER_MODEL', 'DEBUG_SET_PLAYER_MODEL'
]);
const VALID_MODEL_KEYS = new Set(['DEFAULT', 'YASH', 'YUVRAJ', 'ASP', 'AADISH']);
const MAX_ACTION_BYTES = 250000;

const sanitizePlayerName = (name) => {
    if (typeof name !== 'string') return 'Player';
    const cleaned = name.trim().substring(0, MAX_PLAYER_NAME_LENGTH);
    return cleaned.length > 0 ? cleaned : 'Player';
};

const sanitizeRoomId = (roomId) => {
    if (typeof roomId !== 'string') return null;
    const trimmed = roomId.trim();
    return ROOM_ID_PATTERN.test(trimmed) ? trimmed : null;
};

const sanitizeShortString = (val, maxLen = 64) => {
    if (typeof val !== 'string') return undefined;
    const trimmed = val.trim().slice(0, maxLen);
    return trimmed.length > 0 ? trimmed : undefined;
};

const sanitizeAvatarUrl = (val) => {
    if (typeof val !== 'string') return undefined;
    const trimmed = val.trim();
    if (!trimmed || trimmed.length > 512) return undefined;
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            return parsed.toString();
        }
    } catch (e) {}
    return undefined;
};

const isBlockedPreviewHost = (hostname) => {
    if (!hostname) return true;
    const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
        h === 'localhost' ||
        h === '0.0.0.0' ||
        h === '::1' ||
        h.endsWith('.local') ||
        h.endsWith('.internal') ||
        h.endsWith('.localhost')
    ) return true;
    if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return true;
    if (/^(fc|fd|fe80)/i.test(h)) return true;
    return false;
};

const LINK_PREVIEW_CACHE_MAX = 100;
const LINK_PREVIEW_TTL_MS = 10 * 60 * 1000;
const linkPreviewCache = new Map();

// Room status inspection endpoint for invite previews
app.get(['/api/room/:roomId', '/room-status/:roomId'], (req, res) => {
    const safeRoomId = sanitizeRoomId(req.params.roomId);
    if (!safeRoomId) return res.json({ exists: false, status: 'closed' });
    const room = rooms.get(safeRoomId);
    if (!room) return res.json({ exists: false, status: 'closed' });
    const activePlayers = room.players.filter(p => !p.disconnected);
    const maxPlayers = room.settings?.maxPlayers || 4;
    if (room.gameState) {
        return res.json({
            exists: true,
            status: 'in_match',
            playerCount: activePlayers.length,
            maxPlayers,
            hostName: room.hostName || 'Host'
        });
    }
    if (activePlayers.length >= maxPlayers) {
        return res.json({
            exists: true,
            status: 'full',
            playerCount: activePlayers.length,
            maxPlayers,
            hostName: room.hostName || 'Host'
        });
    }
    return res.json({
        exists: true,
        status: 'open',
        playerCount: activePlayers.length,
        maxPlayers,
        hostName: room.hostName || 'Host'
    });
});

// Deployment Health Assessment Vector
const getHealthStatus = () => {
    const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);
    return {
        status: 'OK',
        healthy: true,
        uptime: uptimeSeconds,
        uptimeFormatted: `${Math.floor(uptimeSeconds / 86400)}d ${Math.floor((uptimeSeconds % 86400) / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`,
        timestamp: Date.now(),
        roomCount: rooms.size,
        activeConnections: activeConnectionsCount,
        memoryUsageMB: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
        version: '1.0.0'
    };
};

// Explicit HEAD / handler returning 200 OK with status & uptime headers for Hugging Face Spaces health pings
app.head('/', (req, res) => {
    const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);
    res.status(200)
       .set({
           'Content-Type': 'application/json',
           'X-Server-Status': 'OK',
           'X-Server-Uptime': uptimeSeconds.toString()
       })
       .end();
});

// --- ENGINE RADAR TERMINAL PAGE ---
// Accessing the root server URL parses a high-contrast industrial diagnostic dark dashboard (or JSON if requested)
app.get('/', (req, res) => {
    if (req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('text/html')) {
        return res.status(200).json(getHealthStatus());
    }

    const uptimeMS = Date.now() - serverStartTime;
    const days = Math.floor(uptimeMS / (24 * 60 * 60 * 1000));
    const hours = Math.floor((uptimeMS % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((uptimeMS % (60 * 60 * 1000)) / (60 * 1000));
    const seconds = Math.floor((uptimeMS % (60 * 1000)) / 1000);
    
    let activePlayersTotal = 0;
    let liveMatchesTotal = 0;
    rooms.forEach(r => {
        activePlayersTotal += r.players.length;
        if (r.gameState) liveMatchesTotal++;
    });

    const memoryUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const systemPlatform = `${os.platform()} (${os.arch()})`;
    const loadAverage = os.loadavg().map(v => v.toFixed(2)).join(', ');

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BUGSHOT ROULETTE // ENGINE CORE</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&display=swap');
            body { font-family: 'JetBrains Mono', monospace; background-color: #0c0a09; }
            .scanline {
                background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.3));
                background-size: 100% 4px;
            }
        </style>
    </head>
    <body class="text-stone-300 min-h-screen p-4 md:p-8 relative overflow-x-hidden scanline">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(28,25,23,0.4)_0%,#0c0a09_100%)] pointer-events-none z-0"></div>
        
        <main class="max-w-6xl mx-auto relative z-10 space-y-6">
            <header class="border border-stone-850 bg-stone-950/80 backdrop-blur-md p-6 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-2xl">
                <div>
                    <div class="flex items-center gap-3">
                        <span class="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></span>
                        <h1 class="text-xl md:text-2xl font-black text-white tracking-wider uppercase">BUGSHOT-ROULETTE CORE</h1>
                    </div>
                    <p class="text-[10px] text-stone-500 mt-1 uppercase tracking-widest">Network Architecture Protocol V2.5 // Live Processing Diagnostics</p>
                </div>
                <div class="bg-stone-900 border border-stone-800 px-4 py-2 rounded-lg text-right w-full md:w-auto">
                    <span class="text-[10px] block text-stone-500 uppercase font-bold tracking-widest">Core Integrity</span>
                    <span class="text-emerald-400 font-black tracking-widest text-sm uppercase">ONLINE // SECURE</span>
                </div>
            </header>

            <section class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="bg-stone-950/60 backdrop-blur-md border border-stone-850 p-5 rounded-xl">
                    <span class="text-[10px] font-black text-stone-500 tracking-wider block uppercase">Active Lobbies</span>
                    <span class="text-3xl font-black text-white block mt-2">${rooms.size}</span>
                    <span class="text-[10px] text-stone-400 block mt-1 uppercase">${liveMatchesTotal} Active Match Threads</span>
                </div>
                <div class="bg-stone-950/60 backdrop-blur-md border border-stone-850 p-5 rounded-xl">
                    <span class="text-[10px] font-black text-stone-500 tracking-wider block uppercase">Connected Nodes</span>
                    <span class="text-3xl font-black text-white block mt-2">${activePlayersTotal}</span>
                    <span class="text-[10px] text-stone-500 block mt-1 uppercase">Global Sockets: ${activeConnectionsCount}</span>
                </div>
                <div class="bg-stone-950/60 backdrop-blur-md border border-stone-850 p-5 rounded-xl">
                    <span class="text-[10px] font-black text-stone-500 tracking-wider block uppercase">Continuous Uptime</span>
                    <span class="text-xl font-black text-red-500 block mt-3 uppercase tracking-tighter">${days}d : ${hours}h : ${minutes}m : ${seconds}s</span>
                    <span class="text-[10px] text-stone-600 block mt-1 uppercase">Engine Lifetime Tracking</span>
                </div>
                <div class="bg-stone-950/60 backdrop-blur-md border border-stone-850 p-5 rounded-xl">
                    <span class="text-[10px] font-black text-stone-500 tracking-wider block uppercase">Matches Handled</span>
                    <span class="text-3xl font-black text-white block mt-2">${globalMatchesPlayed}</span>
                    <span class="text-[10px] text-yellow-600 block mt-1 uppercase font-bold">${unauthorizedInterventionsBlocked} Sec. Violations Blocked</span>
                </div>
            </section>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="bg-stone-950/40 backdrop-blur-md border border-stone-850 p-6 rounded-xl space-y-4">
                    <h2 class="text-xs font-black text-white tracking-widest uppercase border-b border-stone-850 pb-2">Hardware Vital Specs</h2>
                    <div class="space-y-3 text-xs font-mono">
                        <div class="flex justify-between"><span class="text-stone-500 uppercase">Heap Memory Load</span><span class="text-stone-200 font-bold">${memoryUsage} MB</span></div>
                        <div class="flex justify-between"><span class="text-stone-500 uppercase">Platform Target</span><span class="text-stone-200 font-bold">${systemPlatform}</span></div>
                        <div class="flex justify-between"><span class="text-stone-500 uppercase">OS CPU Load Avg</span><span class="text-stone-200 font-bold">${loadAverage}</span></div>
                        <div class="flex justify-between"><span class="text-stone-500 uppercase">Process ID</span><span class="text-stone-200 font-bold">#${process.pid}</span></div>
                        <div class="flex justify-between"><span class="text-stone-500 uppercase">Runtime Context</span><span class="text-stone-200 font-bold">Node ${process.version}</span></div>
                    </div>
                </div>

                <div class="lg:col-span-2 bg-stone-950/40 backdrop-blur-md border border-stone-850 p-6 rounded-xl flex flex-col">
                    <h2 class="text-xs font-black text-white tracking-widest uppercase border-b border-stone-850 pb-2 mb-4">Live Allocated Pipelines</h2>
                    <div class="space-y-3 flex-1 overflow-y-auto max-h-[240px] text-xs">
                        ${rooms.size === 0 ? `
                            <div class="text-center py-12 text-stone-600 uppercase tracking-wider font-bold">
                                // No active communication channels currently deployed.
                            </div>
                        ` : Array.from(rooms.values()).map(room => `
                            <div class="border border-stone-850 bg-stone-900/30 p-3 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div class="space-y-1">
                                    <div class="flex items-center gap-2">
                                        <span class="font-bold text-stone-200 uppercase">Room Matrix ID: ${room.id}</span>
                                        <span class="px-1.5 py-0.5 text-[9px] font-black rounded ${room.gameState ? 'bg-red-950 text-red-400 border border-red-900/40' : 'bg-stone-800 text-stone-400'} uppercase">${room.gameState ? 'MATCH_IN_PROGRESS' : 'LOBBY_STAGE'}</span>
                                    </div>
                                    <div class="text-stone-500 text-[10px] uppercase">Registered Sockets: <span class="text-stone-400">${room.players.map(p => p.name).join(', ')}</span></div>
                                </div>
                                <div class="text-right shrink-0">
                                    <span class="text-[9px] block text-stone-500 uppercase">Attributes Context</span>
                                    <span class="text-stone-400 font-medium font-mono">${room.settings.hp === 9 ? 'RNDM' : room.settings.hp}HP | ${room.settings.rounds}R | ${room.settings.itemsPerShipment === 9 ? 'RNDM' : room.settings.itemsPerShipment}I</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </main>
    </body>
    </html>
    `;
    res.status(200).send(htmlContent);
});

// Deployment Health Vector mapping check (Hugging Face Spaces, Kubernetes, uptime monitors)
app.get(['/health', '/healthz'], (req, res) => {
    res.status(200).json(getHealthStatus());
});

app.head(['/health', '/healthz'], (req, res) => {
    const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);
    res.status(200)
       .set({
           'Content-Type': 'application/json',
           'X-Server-Status': 'OK',
           'X-Server-Uptime': uptimeSeconds.toString()
       })
       .end();
});

// Active rooms query vector
app.get('/active-rooms', (req, res) => {
    const activeRooms = [];
    rooms.forEach((room) => {
        if (room.settings?.isPrivate) return;
        const activePlayers = room.players.filter(p => !p.disconnected);
        if (activePlayers.length === 0) return;
        activeRooms.push({
            id: room.id,
            name: room.name || `${activePlayers[0]?.name || 'Unknown'}'s Bunker`,
            hostName: room.hostName || activePlayers[0]?.name || 'Host',
            playerCount: activePlayers.length,
            maxPlayers: room.settings?.maxPlayers || 4,
            settings: room.settings,
            isPlaying: !!room.gameState
        });
    });
    res.status(200).json(activeRooms);
});

// Link preview parser vector for chat rich embeds
app.get('/api/link-preview', async (req, res) => {
    const urlStr = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!urlStr || urlStr.length > 2048) {
        return res.status(400).json({ error: 'Valid URL parameter required' });
    }

    // Static override for mockup matching and offline developer test integrity
    if (urlStr.includes('gameslists.pages.dev')) {
        return res.json({
            title: 'Steam Backlog Tracker — Organise Your Games in Style',
            description: 'A premium, gaming-themed backlog tracker for Steam users. Track your collection with neon aesthetics and snapping interactions.',
            image: 'https://gameslists.pages.dev/preview.png',
            siteName: 'gameslists.pages.dev'
        });
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(urlStr);
    } catch (e) {
        return res.status(400).json({ error: 'Invalid destination URL format' });
    }

    if ((parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') || isBlockedPreviewHost(parsedUrl.hostname)) {
        return res.status(400).json({ error: 'Blocked or unsupported URL destination' });
    }

    const cacheKey = parsedUrl.toString();
    const cached = linkPreviewCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < LINK_PREVIEW_TTL_MS) {
        return res.json(cached.data);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
        const response = await fetch(cacheKey, {
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        // Guard against redirected SSRF
        if (response.url) {
            const finalUrl = new URL(response.url);
            if ((finalUrl.protocol !== 'http:' && finalUrl.protocol !== 'https:') || isBlockedPreviewHost(finalUrl.hostname)) {
                throw new Error('Blocked redirect destination');
            }
        }

        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
            const fallbackData = {
                title: parsedUrl.hostname,
                description: 'External media or file link',
                image: '',
                siteName: parsedUrl.hostname
            };
            return res.json(fallbackData);
        }

        // Cap body read to 256KB to prevent memory bloat on huge pages
        let html = '';
        const MAX_PREVIEW_BYTES = 262144;
        if (response.body && typeof response.body.getReader === 'function') {
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8', { fatal: false });
            let bytesRead = 0;
            while (bytesRead < MAX_PREVIEW_BYTES) {
                const { done, value } = await reader.read();
                if (done) break;
                bytesRead += value.byteLength;
                html += decoder.decode(value, { stream: true });
                if (html.includes('</head>')) break;
            }
            reader.cancel().catch(() => {});
        } else {
            html = (await response.text()).slice(0, MAX_PREVIEW_BYTES);
        }

        const getMetaTag = (text, propertyOrName) => {
            const regex = new RegExp(`<meta[^>]*(?:property|name)=["']${propertyOrName}["'][^>]*content=["']([^"']+)["']`, 'i');
            const match = text.match(regex);
            if (match) return match[1];

            const regexAlt = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${propertyOrName}["']`, 'i');
            const matchAlt = text.match(regexAlt);
            return matchAlt ? matchAlt[1] : null;
        };

        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        const title = (getMetaTag(html, 'og:title') || (titleMatch ? titleMatch[1] : parsedUrl.hostname) || '').trim().slice(0, 200);
        const description = (getMetaTag(html, 'og:description') || getMetaTag(html, 'description') || '').trim().slice(0, 400);
        let image = (getMetaTag(html, 'og:image') || '').trim();

        if (image && !image.startsWith('http')) {
            try {
                image = new URL(image, parsedUrl.origin).toString();
            } catch (e) {
                image = '';
            }
        }
        if (image) {
            try {
                const imgUrl = new URL(image);
                if (imgUrl.protocol !== 'https:' && imgUrl.protocol !== 'http:') image = '';
            } catch (e) {
                image = '';
            }
        }

        const result = {
            title: title || parsedUrl.hostname,
            description,
            image: image.slice(0, 512),
            siteName: parsedUrl.hostname
        };

        linkPreviewCache.set(cacheKey, { ts: Date.now(), data: result });
        if (linkPreviewCache.size > LINK_PREVIEW_CACHE_MAX) {
            const oldestKey = linkPreviewCache.keys().next().value;
            if (oldestKey) linkPreviewCache.delete(oldestKey);
        }

        res.json(result);
    } catch (err) {
        console.error("Link preview extraction failure:", err.message);
        res.json({
            title: parsedUrl.hostname,
            description: 'External link target',
            image: '',
            siteName: parsedUrl.hostname
        });
    } finally {
        clearTimeout(timeoutId);
    }
});

// Developer-Only Telemetry Overview REST API
app.get('/api/admin/overview', (req, res) => {
    const auth = (req.query.auth || req.headers['x-admin-key'] || '').toLowerCase();
    let isDev = false;
    if (auth) {
        for (const p of presenceMap.values()) {
            if (p.username.toLowerCase() === auth && p.isDeveloper) {
                isDev = true;
                break;
            }
        }
    }
    if (!isDev) {
        return res.status(403).json({ error: 'Access Denied: Developer authentication required' });
    }
    res.json(getAdminOverview());
});

// Periodic Automatic Stale Registry Memory Garbage Collector
const roomGcInterval = setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of rooms.entries()) {
        const allDisconnected = room.players.length === 0 || room.players.every(p => p.disconnected);
        const isAbandoned = allDisconnected && (room.lastActivity && now - room.lastActivity > 30000);
        const isStale = (room.lastActivity && now - room.lastActivity > 3600000);
        if (room.players.length === 0 || isAbandoned || isStale) {
            // Eject and notify any lingering players in the room, clearing disconnect timers
            room.players.forEach(p => {
                cleanupPlayerTimers(p);
                const s = io.sockets.sockets.get(p.id);
                if (s) {
                    s.emit('error', 'Lobby closed due to inactivity.');
                    s.leave(roomId);
                }
            });
            deleteRoomSafely(roomId);
        }
    }
}, 60000); // 1-minute check interval
if (roomGcInterval.unref) roomGcInterval.unref();

// --- REAL-TIME SERVER TRANSACTION HANDLERS ---
const parseHpSetting = (val) => {
    const parsed = parseInt(val);
    if (isNaN(parsed)) return 9; // Default to 9 (Random)
    return Math.min(Math.max(parsed, 2), 9); // Allow 2 to 9
};

const parseItemsSetting = (val) => {
    const parsed = parseInt(val);
    if (isNaN(parsed)) return 9; // Default to 9 (Random)
    return Math.min(Math.max(parsed, 0), 9); // Allow 0 to 9
};

const parseMaxPlayersSetting = (val) => {
    const parsed = parseInt(val);
    if (isNaN(parsed)) return 4;
    return Math.min(Math.max(parsed, 2), 4);
};

const sanitizeItemWeights = (weights) => {
    if (!weights || typeof weights !== 'object' || Array.isArray(weights)) return null;
    const cleaned = {};
    const keys = Object.keys(weights).slice(0, 32);
    for (const key of keys) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        const safeKey = key.trim().slice(0, 32);
        const num = Number(weights[key]);
        if (safeKey && Number.isFinite(num)) {
            cleaned[safeKey] = Math.min(Math.max(0, Math.round(num)), 100);
        }
    }
    return Object.keys(cleaned).length > 0 ? cleaned : null;
};

const buildRoomSettings = (settings, forceDisableAdvanced = false) => {
    const defaultSettings = { rounds: 3, hp: 9, itemsPerShipment: 9, isPrivate: false, isAdvanced: false, maxPlayers: 4, itemWeights: null };
    if (!settings || typeof settings !== 'object') return defaultSettings;
    return {
        rounds: Math.min(Math.max(parseInt(settings.rounds) || 3, 1), 7),
        hp: parseHpSetting(settings.hp),
        itemsPerShipment: parseItemsSetting(settings.itemsPerShipment),
        isPrivate: !!settings.isPrivate,
        isAdvanced: forceDisableAdvanced ? false : !!settings.isAdvanced,
        maxPlayers: parseMaxPlayersSetting(settings.maxPlayers),
        itemWeights: sanitizeItemWeights(settings.itemWeights)
    };
};

const createRoomObject = (roomId, hostId, hostName, settings) => {
    const finalSettings = buildRoomSettings(settings, true);
    const customName = sanitizeShortString(settings?.roomName || settings?.name, 32);

    return {
        id: roomId,
        name: customName || `${hostName}'s Bunker`,
        hostId,
        hostName,
        players: [],
        settings: finalSettings,
        gameState: null,
        messages: [],
        debugPlayerModels: {},
        lastActivity: Date.now()
    };
};

const serializeRoomForClient = (room) => {
    const safeGameState = room.gameState && typeof room.gameState === 'object'
        ? { ...room.gameState, multiplayerState: undefined }
        : room.gameState;

    return {
        id: room.id,
        name: room.name,
        hostId: room.hostId,
        hostName: room.hostName || (room.players.find(p => p.id === room.hostId)?.name) || 'Host',
        players: Array.isArray(room.players) ? room.players.map((player) => ({
            id: player.id,
            name: player.name,
            color: player.color,
            ready: !!player.ready,
            hp: player.hp,
            maxHp: player.maxHp,
            items: Array.isArray(player.items) ? player.items.slice() : [],
            isHandcuffed: !!player.isHandcuffed,
            isSawedActive: !!player.isSawedActive,
            disconnected: !!player.disconnected,
            authId: player.authId,
            model: player.model,
            avatarUrl: player.avatarUrl,
            avatarStyle: player.avatarStyle,
            avatarSeed: player.avatarSeed,
            isDeveloper: !!player.isDeveloper
        })) : [],
        settings: room.settings,
        gameState: safeGameState,
        messages: Array.isArray(room.messages) ? room.messages.slice(-50) : [],
        debugPlayerModels: room.debugPlayerModels || {},
        lastActivity: room.lastActivity
    };
};

const emitRoomUpdated = (roomId, room) => {
    io.to(roomId).emit('roomUpdated', serializeRoomForClient(room));
};

const finalizeMidGameAbort = (room, roomId, disconnectedName) => {
    room.gameState = null;
    cleanupRoomTimers(room);
    
    // Prune any players who are still marked disconnected
    for (let i = room.players.length - 1; i >= 0; i--) {
        if (room.players[i].disconnected) {
            cleanupPlayerTimers(room.players[i]);
            room.players.splice(i, 1);
        } else {
            room.players[i].ready = false;
            room.players[i].items = [];
            room.players[i].isHandcuffed = false;
            room.players[i].isSawedActive = false;
        }
    }

    if (room.players.length === 0) {
        deleteRoomSafely(roomId);
        return;
    }

    // Ensure host is assigned to an active remaining player if previous host was purged
    if (!room.players.some(p => p.id === room.hostId && !p.disconnected)) {
        const nextHost = room.players.find(p => !p.disconnected);
        if (nextHost) {
            room.hostId = nextHost.id;
            room.hostName = nextHost.name;
        }
    }

    io.to(roomId).emit('matchAborted', { abortedBy: disconnectedName });
    emitRoomUpdated(roomId, room);
};

const getActionSize = (action) => {
    try {
        return Buffer.byteLength(JSON.stringify(action), 'utf8');
    } catch (err) {
        return MAX_ACTION_BYTES + 1;
    }
};

const sanitizeObjectKeys = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    delete obj.__proto__;
    delete obj.constructor;
    delete obj.prototype;
    for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            sanitizeObjectKeys(obj[key]);
        }
    }
};

const normalizeGameAction = (action, room) => {
    if (!action || typeof action !== 'object' || Array.isArray(action)) return null;
    if (typeof action.type !== 'string' || !VALID_GAME_ACTIONS.has(action.type)) return null;
    if (getActionSize(action) > MAX_ACTION_BYTES) return null;

    sanitizeObjectKeys(action);

    const normalized = { ...action };
    const roomPlayerIds = new Set(room.players.map(p => p.id));

    if (normalized.targetId && !roomPlayerIds.has(normalized.targetId)) {
        delete normalized.targetId;
    }
    if (normalized.targetPlayerId && !roomPlayerIds.has(normalized.targetPlayerId)) {
        delete normalized.targetPlayerId;
    }
    if (normalized.shooterId && !roomPlayerIds.has(normalized.shooterId)) {
        delete normalized.shooterId;
    }
    if (normalized.playerId && !roomPlayerIds.has(normalized.playerId)) {
        delete normalized.playerId;
    }

    // Protect against out-of-range action indices and malformed payloads
    if (normalized.index !== undefined) {
        if (typeof normalized.index !== 'number' || !Number.isInteger(normalized.index) || normalized.index < 0 || normalized.index > 32) {
            delete normalized.index;
        }
    }
    if (normalized.crushIndex !== undefined) {
        if (typeof normalized.crushIndex !== 'number' || !Number.isInteger(normalized.crushIndex) || normalized.crushIndex < 0 || normalized.crushIndex > 32) {
            delete normalized.crushIndex;
        }
    }
    if (normalized.phoneFutureIndex !== undefined) {
        if (typeof normalized.phoneFutureIndex !== 'number' || !Number.isInteger(normalized.phoneFutureIndex) || normalized.phoneFutureIndex < 0 || normalized.phoneFutureIndex > 32) {
            delete normalized.phoneFutureIndex;
        }
    }
    if (normalized.playerIndex !== undefined) {
        if (typeof normalized.playerIndex !== 'number' || !Number.isInteger(normalized.playerIndex) || normalized.playerIndex < 0 || normalized.playerIndex >= room.players.length) {
            delete normalized.playerIndex;
        }
    }

    // String field limits
    if (normalized.item !== undefined) {
        if (typeof normalized.item !== 'string' || normalized.item.length > 64) {
            delete normalized.item;
        }
    }
    if (normalized.target !== undefined) {
        if (typeof normalized.target !== 'string' || normalized.target.length > 64) {
            delete normalized.target;
        }
    }
    if (normalized.jackpotOutcome !== undefined) {
        if (typeof normalized.jackpotOutcome !== 'string' || normalized.jackpotOutcome.length > 32) {
            delete normalized.jackpotOutcome;
        }
    }

    if (normalized.gameState && typeof normalized.gameState === 'object') {
        // Prevent local client-side multiplayer state references from leaking into the socket payload.
        delete normalized.gameState.multiplayerState;
    }
    if (normalized.playerState && typeof normalized.playerState === 'object') {
        delete normalized.playerState.multiplayerState;
    }
    if (normalized.dealerState && typeof normalized.dealerState === 'object') {
        delete normalized.dealerState.multiplayerState;
    }
    if (normalized.player3State && typeof normalized.player3State === 'object') {
        delete normalized.player3State.multiplayerState;
    }
    if (normalized.player4State && typeof normalized.player4State === 'object') {
        delete normalized.player4State.multiplayerState;
    }

    if ((normalized.type === 'DEBUG_SYNC_PLAYER_MODEL' || normalized.type === 'DEBUG_SET_PLAYER_MODEL') && !VALID_MODEL_KEYS.has(normalized.modelKey)) {
        return null;
    }

    return normalized;
};

const leaveOtherRoomsForSocket = (socket, exceptRoomId = null) => {
    for (const [otherRoomId, otherRoom] of rooms.entries()) {
        if (otherRoomId === exceptRoomId) continue;
        const pIdx = otherRoom.players.findIndex(p => p.id === socket.id);
        if (pIdx === -1) continue;

        const leavingPlayer = otherRoom.players[pIdx];
        cleanupPlayerTimers(leavingPlayer);
        otherRoom.players.splice(pIdx, 1);
        socket.leave(otherRoomId);

        const leaveMsg = {
            sender: 'SYSTEM',
            color: '#737373',
            text: `${leavingPlayer.name} has left the bunker.`,
            timestamp: Date.now()
        };
        otherRoom.messages.push(leaveMsg);
        if (otherRoom.messages.length > 50) otherRoom.messages.shift();
        io.to(otherRoomId).emit('chatMessageReceived', leaveMsg);

        if (otherRoom.players.length === 0) {
            deleteRoomSafely(otherRoomId);
        } else if (otherRoom.gameState) {
            finalizeMidGameAbort(otherRoom, otherRoomId, leavingPlayer.name);
        } else {
            if (otherRoom.hostId === socket.id) {
                const nextHost = otherRoom.players.find(p => !p.disconnected);
                if (nextHost) {
                    otherRoom.hostId = nextHost.id;
                    otherRoom.hostName = nextHost.name;
                }
            }
            emitRoomUpdated(otherRoomId, otherRoom);
        }
    }
};

const joinSocketToRoom = (socket, room, playerName, authId, avatarUrl, avatarStyle, avatarSeed) => {
    leaveOtherRoomsForSocket(socket, room.id);

    const safeInputName = typeof playerName === 'string' ? playerName.trim().substring(0, 14) : '';
    const newPlayerName = safeInputName.length > 0 ? safeInputName : `Player ${room.players.length + 1}`;
    const cleanAuthId = typeof authId === 'string' && authId.trim() ? authId.trim().toLowerCase().slice(0, 64) : null;

    const presence = presenceMap.get(socket.id);
    const effAvatarUrl = sanitizeAvatarUrl(avatarUrl) || sanitizeAvatarUrl(presence?.avatarUrl) || null;
    const effAvatarStyle = sanitizeShortString(avatarStyle, 40) || sanitizeShortString(presence?.avatarStyle, 40) || null;
    const effAvatarSeed = sanitizeShortString(avatarSeed, 64) || sanitizeShortString(presence?.avatarSeed, 64) || null;

    // Check if player is reconnecting or switching networks (both logged-in and guest players)
    const existingPlayerIndex = room.players.findIndex(p => {
        if (cleanAuthId && p.authId) {
            return p.authId === cleanAuthId;
        }
        return p.name.toLowerCase() === newPlayerName.toLowerCase();
    });

    if (existingPlayerIndex !== -1) {
        const returning = room.players[existingPlayerIndex];
        const wasHost = room.hostId === returning.id;
        const oldSocketId = returning.id;

        cleanupPlayerTimers(returning);
        if (room.deletionTimer) {
            clearTimeout(room.deletionTimer);
            delete room.deletionTimer;
        }

        // Update player's socket ID BEFORE disconnecting the replaced socket to prevent disconnect race
        returning.id = socket.id;
        returning.disconnected = false;
        returning.name = newPlayerName;
        if (effAvatarUrl) returning.avatarUrl = effAvatarUrl;
        if (effAvatarStyle) returning.avatarStyle = effAvatarStyle;
        if (effAvatarSeed) returning.avatarSeed = effAvatarSeed;
        returning.isDeveloper = Boolean(returning.isDeveloper || socket.isDeveloper || presence?.isDeveloper || cleanAuthId === 'aadish');

        if (oldSocketId !== socket.id) {
            if (room.debugPlayerModels && room.debugPlayerModels[oldSocketId]) {
                room.debugPlayerModels[socket.id] = room.debugPlayerModels[oldSocketId];
                delete room.debugPlayerModels[oldSocketId];
            }
            const oldSocket = io.sockets.sockets.get(oldSocketId);
            if (oldSocket) {
                oldSocket._replacedByReconnect = true;
                oldSocket.leave(room.id);
                try {
                    oldSocket.disconnect(true);
                } catch (e) {}
            }
        }
        
        if (wasHost || !room.players.some(p => p.id === room.hostId && !p.disconnected)) {
            room.hostId = socket.id;
            room.hostName = returning.name;
        }

        room.lastActivity = Date.now();
        socket.join(room.id);

        const reconnectMessage = {
            sender: 'SYSTEM',
            color: '#737373',
            text: `${returning.name} reconnected to the bunker.`,
            timestamp: Date.now()
        };
        room.messages.push(reconnectMessage);
        if (room.messages.length > 50) room.messages.shift();

        emitRoomUpdated(room.id, room);
        socket.emit('joinedRoom', { room: serializeRoomForClient(room), playerId: socket.id, reconnected: true });
        io.to(room.id).emit('chatMessageReceived', reconnectMessage);
        if (room.gameState) {
            io.to(room.id).emit('requestFullSync', { forPlayerId: socket.id });
        }
        return;
    }

    // New player validations
    if (room.gameState) {
        socket.emit('error', 'Match is already in progress in this room.');
        return;
    }

    const maxPlayers = room.settings?.maxPlayers || 4;
    if (room.players.filter(p => !p.disconnected).length >= maxPlayers) {
        socket.emit('error', `Lobby is full (Max ${maxPlayers} players allowed).`);
        return;
    }

    if (room.deletionTimer) {
        clearTimeout(room.deletionTimer);
        delete room.deletionTimer;
    }

    // Disambiguate same-name players: append suffix if name already exists in room
    let finalName = newPlayerName;
    const nameLower = newPlayerName.toLowerCase();
    const existingNames = room.players.map(p => p.name.toLowerCase());
    if (existingNames.includes(nameLower)) {
        let suffix = 2;
        while (existingNames.includes(`${nameLower}(${suffix})`)) {
            suffix++;
        }
        finalName = `${newPlayerName}(${suffix})`;
    }

    // Name-based head model mapping (case-insensitive prefixes)
    const ALL_PLAYER_MODELS = ['AADISH', 'ASP', 'YASH', 'YUVRAJ'];
    const lowerFinal = finalName.toLowerCase();
    let preferredModel = null;
    if (lowerFinal.startsWith('aadish')) {
        preferredModel = 'AADISH';
    } else if (lowerFinal.startsWith('yuvraj')) {
        preferredModel = 'YUVRAJ';
    } else if (lowerFinal.startsWith('yash')) {
        preferredModel = 'YASH';
    } else if (lowerFinal.startsWith('aditya')) {
        preferredModel = 'ASP';
    }

    const usedModels = room.players.map(p => p.model).filter(Boolean);
    let assignedModel;

    if (preferredModel && !usedModels.includes(preferredModel)) {
        assignedModel = preferredModel;
    } else {
        const availableModels = ALL_PLAYER_MODELS.filter(m => !usedModels.includes(m));
        if (availableModels.length > 0) {
            const randIndex = Math.floor(Math.random() * availableModels.length);
            assignedModel = availableModels[randIndex];
        } else {
            assignedModel = preferredModel || ALL_PLAYER_MODELS[Math.floor(Math.random() * ALL_PLAYER_MODELS.length)];
        }
    }

    const playerColor = PLAYER_COLORS[room.players.length % PLAYER_COLORS.length];
    const newPlayer = {
        id: socket.id,
        name: finalName,
        color: playerColor,
        ready: false,
        hp: room.settings.hp,
        maxHp: room.settings.hp,
        items: [],
        isHandcuffed: false,
        isSawedActive: false,
        disconnected: false,
        authId: cleanAuthId,
        model: assignedModel,
        avatarUrl: effAvatarUrl,
        avatarStyle: effAvatarStyle,
        avatarSeed: effAvatarSeed,
        isDeveloper: Boolean(socket.isDeveloper || presence?.isDeveloper || cleanAuthId === 'aadish')
    };

    room.players.push(newPlayer);
    room.lastActivity = Date.now();
    socket.join(room.id);

    const joinMessage = {
        sender: 'SYSTEM',
        color: '#737373',
        text: `${newPlayer.name} entered the bunker.`,
        timestamp: Date.now()
    };
    room.messages.push(joinMessage);
    if (room.messages.length > 50) room.messages.shift();
    
    emitRoomUpdated(room.id, room);
    socket.emit('joinedRoom', { room: serializeRoomForClient(room), playerId: socket.id });
    socket.to(room.id).emit('chatMessageReceived', joinMessage);
};

io.on('connection', (socket) => {
    activeConnectionsCount++;
    socket.on('error', (err) => {
        console.warn(`[SOCKET ERROR ${socket.id}]:`, err?.message || err);
    });
    let requestPacketCounter = 0;
    let hoverPacketCounter = 0;
    let lastThrottleReset = Date.now();
    
    const relayGameAction = (roomId, rawAction, player) => {
        const room = rooms.get(roomId);
        if (!room) return;
        const action = normalizeGameAction(rawAction, room);
        if (!action) {
            socket.emit('error', 'Invalid or oversized game action ignored.');
            return;
        }

        const containsDebugFlags = action.type?.toUpperCase().includes('DEBUG') || action.isDebug;
        if (containsDebugFlags) {
            if (!socket.isDeveloper) {
                unauthorizedInterventionsBlocked++;
                console.warn(`[SECURITY WARNING] Intercepted unauthorized debug runtime execution try by player: ${player.name} inside room: ${roomId}`);
                socket.emit('error', 'Access Denied: Debug tools are strictly restricted to the developer account.');
                return;
            }
            console.log(`[DEVELOPER SYSTEM CALL] Authorized account deployed debugging hook element: ${action.type}`);
        }

        if (action.type === 'DEBUG_SET_PLAYER_MODEL' || action.type === 'DEBUG_SYNC_PLAYER_MODEL') {
            const modelKey = action.modelKey;
            let playerId = action.playerId;
            if (playerId && !room.players.some(p => p.id === playerId)) {
                playerId = undefined;
            }
            if (!playerId && typeof action.playerIndex === 'number' && action.playerIndex >= 0 && action.playerIndex < room.players.length) {
                playerId = room.players[action.playerIndex].id;
            }
            if (!playerId) {
                console.warn(`[DEBUG] Ignoring invalid player reference for ${action.type}:`, action.playerId ?? action.playerIndex);
            } else {
                room.debugPlayerModels = {
                    ...(room.debugPlayerModels || {}),
                    [playerId]: modelKey
                };
                if (room.gameState) {
                    room.gameState = {
                        ...room.gameState,
                        multiplayerState: {
                            ...(room.gameState.multiplayerState || {}),
                            debugPlayerModels: room.debugPlayerModels
                        }
                    };
                }
                room.lastActivity = Date.now();
                emitRoomUpdated(roomId, room);
            }
        }

        if (action.type === 'USE_ITEM') {
            action.playerName = player.name;
        }

        socket.to(roomId).emit('gameActionReceived', { playerId: socket.id, action });
    };

    // Antiflood: exempt latency-critical actions; separate budget for aim hover
    const shouldThrottle = (action) => {
        if (!action?.type || THROTTLE_EXEMPT_ACTIONS.has(action.type)) return false;

        const now = Date.now();
        if (now - lastThrottleReset > 1000) {
            requestPacketCounter = 0;
            hoverPacketCounter = 0;
            lastThrottleReset = now;
        }

        if (action.type === 'HOVER_TARGET') {
            hoverPacketCounter++;
            return hoverPacketCounter > 30;
        }

        requestPacketCounter++;
        return requestPacketCounter > 60;
    };

    socket.on('createRoom', (data = {}) => {
        if (!data || typeof data !== 'object') return;
        const { playerName, settings, authId, avatarUrl, avatarStyle, avatarSeed } = data;
        if (shouldThrottle({ type: 'LOBBY' })) return;
        if (typeof authId !== 'string' || !authId.trim()) {
            socket.emit('error', 'Authentication required. Please sign in to access multiplayer.');
            return;
        }
        
        let roomId;
        let attempts = 0;
        do {
            roomId = Math.floor(1000 + Math.random() * 9000).toString();
            attempts++;
        } while (rooms.has(roomId) && attempts < MAX_ROOM_ID_ATTEMPTS);

        if (rooms.has(roomId)) {
            socket.emit('error', 'Failed to generate a unique room code. Try again.');
            return;
        }

        const hostName = sanitizePlayerName(playerName);
        const room = createRoomObject(roomId, socket.id, hostName, settings);
        rooms.set(roomId, room);

        joinSocketToRoom(socket, room, playerName, authId, avatarUrl, avatarStyle, avatarSeed);
        if (room.players.length === 0) {
            deleteRoomSafely(roomId);
        }
    });

    socket.on('joinRoom', (data = {}) => {
        if (!data || typeof data !== 'object') return;
        const { roomId, playerName, authId, avatarUrl, avatarStyle, avatarSeed } = data;
        if (shouldThrottle({ type: 'LOBBY' })) return;
        if (typeof authId !== 'string' || !authId.trim()) {
            socket.emit('error', 'Authentication required. Please sign in to access multiplayer.');
            return;
        }
        const safeRoomId = sanitizeRoomId(roomId);
        if (!safeRoomId) {
            socket.emit('error', 'Invalid room code.');
            return;
        }

        const room = rooms.get(safeRoomId);
        if (!room) {
            socket.emit('error', 'Room not found.');
            return;
        }

        joinSocketToRoom(socket, room, playerName, authId, avatarUrl, avatarStyle, avatarSeed);
    });

    socket.on('quickJoin', (data = {}) => {
        if (!data || typeof data !== 'object') return;
        const { playerName, settings, authId, avatarUrl, avatarStyle, avatarSeed } = data;
        if (shouldThrottle({ type: 'LOBBY' })) return;
        if (typeof authId !== 'string' || !authId.trim()) {
            socket.emit('error', 'Authentication required. Please sign in to access multiplayer.');
            return;
        }
        
        let availableRoom = null;
        for (const room of rooms.values()) {
            const maxPlayers = room.settings?.maxPlayers || 4;
            if (room.players.filter(p => !p.disconnected).length < maxPlayers && !room.gameState && !room.settings?.isPrivate) {
                availableRoom = room;
                break;
            }
        }

        if (availableRoom) {
            joinSocketToRoom(socket, availableRoom, playerName, authId, avatarUrl, avatarStyle, avatarSeed);
        } else {
            let roomId;
            let attempts = 0;
            do {
                roomId = Math.floor(1000 + Math.random() * 9000).toString();
                attempts++;
            } while (rooms.has(roomId) && attempts < MAX_ROOM_ID_ATTEMPTS);

            if (rooms.has(roomId)) {
                socket.emit('error', 'Failed to generate a unique room code. Try again.');
                return;
            }

            const hostName = sanitizePlayerName(playerName);
            const room = createRoomObject(roomId, socket.id, hostName, { ...(settings && typeof settings === 'object' ? settings : {}), isPrivate: false });
            rooms.set(roomId, room);

            joinSocketToRoom(socket, room, playerName, authId, avatarUrl, avatarStyle, avatarSeed);
            if (room.players.length === 0) {
                deleteRoomSafely(roomId);
            }
        }
    });

    socket.on('updateSettings', (data = {}) => {
        if (!data || typeof data !== 'object') return;
        const { roomId, settings } = data;
        if (shouldThrottle({ type: 'LOBBY' })) return;
        const safeRoomId = sanitizeRoomId(roomId);
        if (!safeRoomId || !settings || typeof settings !== 'object') return;
        const room = rooms.get(safeRoomId);
        if (room && room.hostId === socket.id && !room.gameState) {
            const nextSettings = buildRoomSettings(settings, false);
            if (room.settings?.maxPlayers && settings.maxPlayers === undefined) {
                nextSettings.maxPlayers = room.settings.maxPlayers;
            }
            room.settings = nextSettings;
            room.lastActivity = Date.now();
            emitRoomUpdated(safeRoomId, room);
        }
    });

    socket.on('readyUp', (data = {}) => {
        if (!data || typeof data !== 'object') return;
        const { roomId, ready } = data;
        if (shouldThrottle({ type: 'LOBBY' })) return;
        const safeRoomId = sanitizeRoomId(roomId);
        if (!safeRoomId) return;
        const room = rooms.get(safeRoomId);
        if (room) {
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.ready = !!ready;
                room.lastActivity = Date.now();
                emitRoomUpdated(safeRoomId, room);
            }
        }
    });

    socket.on('updatePlayerAvatar', (data = {}) => {
        if (!data || typeof data !== 'object') return;
        if (shouldThrottle({ type: 'LOBBY' })) return;

        const cleanUrl = sanitizeAvatarUrl(data.avatarUrl);
        const cleanStyle = sanitizeShortString(data.avatarStyle, 40);
        const cleanSeed = sanitizeShortString(data.avatarSeed, 64);
        const cleanDisplayName = sanitizeShortString(data.displayName, 24);

        const safeRoomId = sanitizeRoomId(data.roomId);
        const targetRooms = [];
        if (safeRoomId && rooms.has(safeRoomId)) {
            targetRooms.push([safeRoomId, rooms.get(safeRoomId)]);
        } else {
            for (const [rId, r] of rooms.entries()) {
                if (r.players.some(p => p.id === socket.id)) {
                    targetRooms.push([rId, r]);
                }
            }
        }

        for (const [rId, room] of targetRooms) {
            const player = room.players.find(p => p.id === socket.id);
            if (!player) continue;
            if (cleanUrl !== undefined) player.avatarUrl = cleanUrl;
            if (cleanStyle !== undefined) player.avatarStyle = cleanStyle;
            if (cleanSeed !== undefined) player.avatarSeed = cleanSeed;

            // Propagate updated avatar metadata onto recent room chat messages from this player
            if (Array.isArray(room.messages)) {
                for (const msg of room.messages) {
                    if (!msg || msg.sender === 'SYSTEM') continue;
                    const matchesSender =
                        msg.senderId === player.id ||
                        (player.authId && msg.authId === player.authId) ||
                        msg.sender === player.name;
                    if (matchesSender) {
                        if (cleanUrl !== undefined) msg.avatarUrl = cleanUrl;
                        if (cleanStyle !== undefined) msg.avatarStyle = cleanStyle;
                        if (cleanSeed !== undefined) msg.avatarSeed = cleanSeed;
                    }
                }
            }

            room.lastActivity = Date.now();
            emitRoomUpdated(rId, room);
        }

        const presenceUpdates = {};
        if (cleanUrl !== undefined) presenceUpdates.avatarUrl = cleanUrl;
        if (cleanStyle !== undefined) presenceUpdates.avatarStyle = cleanStyle;
        if (cleanSeed !== undefined) presenceUpdates.avatarSeed = cleanSeed;
        if (cleanDisplayName !== undefined) presenceUpdates.displayName = cleanDisplayName;
        if (Object.keys(presenceUpdates).length > 0) {
            updateSocketPresence(socket.id, presenceUpdates);
        }
    });

    socket.on('startGame', (data = {}) => {
        if (!data || typeof data !== 'object') return;
        const { roomId, gameData } = data;
        if (shouldThrottle({ type: 'LOBBY' })) return;
        const safeRoomId = sanitizeRoomId(roomId);
        if (!safeRoomId || !gameData || typeof gameData !== 'object' || Array.isArray(gameData)) return;
        if (getActionSize(gameData) > MAX_ACTION_BYTES) {
            socket.emit('error', 'Payload exceeds maximum size.');
            return;
        }
        sanitizeObjectKeys(gameData);
        const room = rooms.get(safeRoomId);
        if (room && room.hostId === socket.id) {
            if (room.gameState) return;
            const activePlayers = room.players.filter(p => !p.disconnected);
            if (activePlayers.length < 2) {
                socket.emit('error', 'Need at least 2 players to start.');
                return;
            }
            if (!activePlayers.every(p => p.ready)) {
                socket.emit('error', 'All players must be ready.');
                return;
            }

            room.gameState = gameData;
            room.lastActivity = Date.now();
            globalMatchesPlayed++;
            
            // System message arrays removed to prevent structural layout pollution
            io.to(safeRoomId).emit('gameStarted', { room: serializeRoomForClient(room), gameData });
        }
    });

    socket.on('gameAction', (data = {}) => {
        if (!data || typeof data !== 'object') return;
        const { roomId, action } = data;
        if (!action || shouldThrottle(action)) return;
        const safeRoomId = sanitizeRoomId(roomId);
        if (!safeRoomId) return;
        const room = rooms.get(safeRoomId);
        if (!room) return;
        room.lastActivity = Date.now();

        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.disconnected) return;

        relayGameAction(safeRoomId, action, player);
    });

    socket.on('gameActionBatch', (data = {}) => {
        if (!data || typeof data !== 'object') return;
        const { actions } = data;
        if (!Array.isArray(actions) || actions.length === 0) return;
        if (actions.length > 24) {
            socket.emit('error', 'Action batch too large.');
            return;
        }
        const safeRoomId = sanitizeRoomId(actions[0]?.data?.roomId || actions[0]?.roomId);
        if (!safeRoomId) return;
        const room = rooms.get(safeRoomId);
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.disconnected) return;

        room.lastActivity = Date.now();
        for (const entry of actions) {
            const payload = entry?.data || entry;
            if (sanitizeRoomId(payload?.roomId) !== safeRoomId) continue;
            const action = payload?.action;
            if (!action || shouldThrottle(action)) continue;
            relayGameAction(safeRoomId, action, player);
        }
    });

    socket.on('chatMessage', (data = {}) => {
        if (!data || typeof data !== 'object') return;
        const { roomId, message } = data;
        if (shouldThrottle({ type: 'CHAT' })) return;
        const safeRoomId = sanitizeRoomId(roomId);
        if (!safeRoomId) return;
        const room = rooms.get(safeRoomId);
        if (room) {
            const player = room.players.find(p => p.id === socket.id);
            if (isUserOrSocketMuted(socket, player?.name)) {
                socket.emit('chatMessageReceived', {
                    sender: 'SYSTEM',
                    color: '#ef4444',
                    text: 'You are currently muted by an administrator.',
                    timestamp: Date.now()
                });
                return;
            }
            const safeText = typeof message === 'string' ? message.trim().substring(0, 140) : '';
            if (player && safeText.length > 0) {
                const presence = presenceMap.get(socket.id);
                const msgAvatarUrl = player.avatarUrl || presence?.avatarUrl || sanitizeAvatarUrl(data.avatarUrl) || undefined;
                const msgAvatarStyle = player.avatarStyle || presence?.avatarStyle || sanitizeShortString(data.avatarStyle, 40) || undefined;
                const msgAvatarSeed = player.avatarSeed || presence?.avatarSeed || sanitizeShortString(data.avatarSeed, 64) || undefined;
                const msgUsername = player.authId || presence?.username || sanitizeShortString(data.senderUsername, 64)?.toLowerCase() || undefined;
                const msgIsDev = Boolean(player.isDeveloper || socket.isDeveloper || presence?.isDeveloper || msgUsername === 'aadish');
                const chatEntry = {
                    sender: player.name,
                    senderId: player.id,
                    senderUsername: msgUsername,
                    authId: player.authId || undefined,
                    avatarUrl: msgAvatarUrl,
                    avatarStyle: msgAvatarStyle,
                    avatarSeed: msgAvatarSeed,
                    isDeveloper: msgIsDev,
                    color: player.color,
                    text: safeText,
                    timestamp: Date.now()
                };
                room.messages.push(chatEntry);
                room.lastActivity = Date.now();
                if (room.messages.length > 50) room.messages.shift();
                io.to(safeRoomId).emit('chatMessageReceived', chatEntry);
            }
        }
    });

    socket.on('kickPlayer', (data = {}) => {
        if (!data || typeof data !== 'object') return;
        const { roomId, targetPlayerId } = data;
        if (shouldThrottle({ type: 'LOBBY' })) return;
        const safeRoomId = sanitizeRoomId(roomId);
        if (!safeRoomId || typeof targetPlayerId !== 'string') return;
        const room = rooms.get(safeRoomId);
        if (room && room.hostId === socket.id && !room.gameState && targetPlayerId !== socket.id) {
            const playerIndex = room.players.findIndex(p => p.id === targetPlayerId);
            if (playerIndex !== -1) {
                const kickedPlayer = room.players[playerIndex];
                cleanupPlayerTimers(kickedPlayer);
                room.players.splice(playerIndex, 1);
                
                const targetSocket = io.sockets.sockets.get(targetPlayerId);
                if (targetSocket) {
                    targetSocket.leave(safeRoomId);
                    targetSocket.emit('kicked');
                }

                const kickMessage = {
                    sender: 'SYSTEM',
                    color: '#737373',
                    text: `${kickedPlayer.name} was expelled from the bunker.`,
                    timestamp: Date.now()
                };
                room.messages.push(kickMessage);
                if (room.messages.length > 50) room.messages.shift();
                io.to(safeRoomId).emit('chatMessageReceived', kickMessage);

                emitRoomUpdated(safeRoomId, room);
                console.log(`[KICK] Host ${socket.id} kicked player ${kickedPlayer.name} (${targetPlayerId}) from room ${safeRoomId}`);
            }
        }
    });

    socket.on('resetRoomState', (data = {}) => {
        if (!data || typeof data !== 'object') return;
        const { roomId } = data;
        if (shouldThrottle({ type: 'LOBBY' })) return;
        const safeRoomId = sanitizeRoomId(roomId);
        if (!safeRoomId) return;
        const room = rooms.get(safeRoomId);
        if (room && room.hostId === socket.id) {
            room.gameState = null;
            room.players.forEach(p => {
                p.ready = false;
                p.items = [];
                p.isHandcuffed = false;
                p.isSawedActive = false;
            });
            room.lastActivity = Date.now();
            emitRoomUpdated(safeRoomId, room);
            io.to(safeRoomId).emit('matchReset');
            console.log(`[RESET] Host ${socket.id} reset room ${safeRoomId} back to lobby.`);
        }
    });

    // --- PRESENCE & ADMIN SOCKET HANDLERS ---
    socket.on('presence:identify', (data = {}) => {
        if (!data || typeof data !== 'object' || shouldThrottle({ type: 'PRESENCE' })) return;
        const cleanUsername = typeof data.username === 'string' ? data.username.trim().toLowerCase().slice(0, 64) : '';
        if (!cleanUsername) return;

        socket.username = cleanUsername;
        const isRootDev = cleanUsername === 'aadish';
        const hasValidAdminSecret = Boolean(process.env.ADMIN_SECRET && data.adminSecret === process.env.ADMIN_SECRET);
        socket.isDeveloper = isRootDev || hasValidAdminSecret;
        if (socket.isDeveloper) {
            developerUsernames.add(cleanUsername);
        }
        socket.playerId = typeof data.playerId === 'string' ? data.playerId.slice(0, 64) : `@${cleanUsername}#0000`;

        const pObj = {
            socketId: socket.id,
            username: cleanUsername,
            playerId: socket.playerId,
            displayName: sanitizeShortString(data.displayName, 24) || data.username.trim().slice(0, 24),
            avatarUrl: sanitizeAvatarUrl(data.avatarUrl) || '',
            avatarStyle: sanitizeShortString(data.avatarStyle, 40) || 'thumbs',
            avatarSeed: sanitizeShortString(data.avatarSeed, 64) || cleanUsername,
            status: typeof data.status === 'string' ? data.status.slice(0, 24) : 'online',
            roomId: sanitizeRoomId(data.roomId) || null,
            matchInfo: data.matchInfo && typeof data.matchInfo === 'object' ? data.matchInfo : null,
            connectedAt: Date.now(),
            lastSeen: Date.now(),
            isDeveloper: socket.isDeveloper
        };
        presenceMap.set(socket.id, pObj);
        setTrackedLastSeen(cleanUsername, Date.now());

        if (!userSocketsMap.has(cleanUsername)) {
            userSocketsMap.set(cleanUsername, new Set());
        }
        userSocketsMap.get(cleanUsername).add(socket.id);

        broadcastPresence(pObj);
    });

    socket.on('presence:status', (data = {}) => {
        if (!data || typeof data !== 'object' || shouldThrottle({ type: 'PRESENCE' })) return;
        const p = presenceMap.get(socket.id);
        if (p) {
            if (typeof data.status === 'string' && data.status.trim()) p.status = data.status.trim().slice(0, 24);
            if (data.matchInfo !== undefined) p.matchInfo = data.matchInfo && typeof data.matchInfo === 'object' ? data.matchInfo : null;
            if (data.roomId !== undefined) p.roomId = sanitizeRoomId(data.roomId) || null;
            const cleanUrl = sanitizeAvatarUrl(data.avatarUrl);
            const cleanStyle = sanitizeShortString(data.avatarStyle, 40);
            const cleanSeed = sanitizeShortString(data.avatarSeed, 64);
            if (cleanUrl !== undefined) p.avatarUrl = cleanUrl;
            if (cleanStyle !== undefined) p.avatarStyle = cleanStyle;
            if (cleanSeed !== undefined) p.avatarSeed = cleanSeed;
            p.lastSeen = Date.now();
            setTrackedLastSeen(p.username.toLowerCase(), p.lastSeen);
            broadcastPresence(p);
        }
    });

    socket.on('presence:request_all', () => {
        if (shouldThrottle({ type: 'PRESENCE' })) return;
        const viewerUsername = socket.username;
        const list = [];
        const userPresenceAgg = new Map();
        for (const p of presenceMap.values()) {
            const clean = p.username.toLowerCase();
            const existing = userPresenceAgg.get(clean);
            if (!existing || (existing.status === 'online' && p.status !== 'online')) {
                userPresenceAgg.set(clean, p);
            }
        }
        for (const p of userPresenceAgg.values()) {
            list.push(formatPresenceForClient(p, viewerUsername, false));
        }
        // Include recorded offline users
        for (const [uname, lastSeen] of userLastSeenMap.entries()) {
            if (!userPresenceAgg.has(uname)) {
                list.push({
                    username: uname,
                    status: 'offline',
                    lastSeen
                });
            }
        }
        socket.emit('presence:sync', list);
    });

    socket.on('checkRoomStatus', (data = {}, ack) => {
        if (!ack || typeof ack !== 'function') return;
        if (shouldThrottle({ type: 'LOBBY' })) return ack({ exists: false, status: 'rate_limited' });
        const safeRoomId = sanitizeRoomId(data?.roomId);
        if (!safeRoomId) return ack({ exists: false, status: 'closed' });
        const room = rooms.get(safeRoomId);
        if (!room) return ack({ exists: false, status: 'closed' });
        const activePlayers = room.players.filter(p => !p.disconnected);
        const maxPlayers = room.settings?.maxPlayers || 4;
        if (room.gameState) {
            return ack({
                exists: true,
                status: 'in_match',
                playerCount: activePlayers.length,
                maxPlayers,
                hostName: room.hostName || 'Host'
            });
        }
        if (activePlayers.length >= maxPlayers) {
            return ack({
                exists: true,
                status: 'full',
                playerCount: activePlayers.length,
                maxPlayers,
                hostName: room.hostName || 'Host'
            });
        }
        return ack({
            exists: true,
            status: 'open',
            playerCount: activePlayers.length,
            maxPlayers,
            hostName: room.hostName || 'Host'
        });
    });

    socket.on('leaveRoom', (data = {}) => {
        if (!data || typeof data !== 'object' || shouldThrottle({ type: 'LOBBY' })) return;
        const safeRoomId = sanitizeRoomId(data.roomId);
        if (!safeRoomId) return;
        const room = rooms.get(safeRoomId);
        if (room) {
            const pIdx = room.players.findIndex(p => p.id === socket.id);
            if (pIdx !== -1) {
                const leavingPlayer = room.players[pIdx];
                cleanupPlayerTimers(leavingPlayer);
                room.players.splice(pIdx, 1);
                socket.leave(safeRoomId);
                
                const leaveMsg = {
                    sender: 'SYSTEM',
                    color: '#737373',
                    text: `${leavingPlayer.name} has left the bunker.`,
                    timestamp: Date.now()
                };
                room.messages.push(leaveMsg);
                if (room.messages.length > 50) room.messages.shift();
                io.to(safeRoomId).emit('chatMessageReceived', leaveMsg);
                
                if (room.players.length === 0) {
                    deleteRoomSafely(safeRoomId);
                } else if (room.gameState) {
                    finalizeMidGameAbort(room, safeRoomId, leavingPlayer.name);
                } else {
                    if (room.hostId === socket.id) {
                        const nextHost = room.players.find(p => !p.disconnected);
                        if (nextHost) {
                            room.hostId = nextHost.id;
                            room.hostName = nextHost.name;
                        }
                    }
                    emitRoomUpdated(safeRoomId, room);
                }
            }
        }
        updateSocketPresence(socket.id, {
            status: 'online',
            roomId: null,
            matchInfo: null
        });
    });

    // Developer Admin Overview
    socket.on('admin:get_overview', (ack) => {
        if (!socket.isDeveloper) {
            if (typeof ack === 'function') ack({ error: 'Access Denied: Developer account required.' });
            return;
        }
        if (typeof ack === 'function') ack({ success: true, data: getAdminOverview() });
    });

    // Developer Admin Broadcast Message (Sent from BUGSHOT system)
    socket.on('admin:broadcast_message', (data = {}, ack) => {
        const { title, text } = data || {};
        if (!socket.isDeveloper) {
            if (typeof ack === 'function') ack({ error: 'Access Denied: Developer account required.' });
            return;
        }
        if (!text || !text.trim()) {
            if (typeof ack === 'function') ack({ error: 'Message cannot be empty.' });
            return;
        }
        const payload = {
            id: Date.now().toString(),
            sender: 'BUGSHOT',
            title: (title || 'SYSTEM BROADCAST').trim(),
            text: text.trim(),
            timestamp: Date.now()
        };
        io.emit('system:broadcast', payload);
        console.log(`[BUGSHOT BROADCAST DISPATCHED] Title: "${payload.title}" Message: "${payload.text}"`);
        if (typeof ack === 'function') ack({ success: true });
    });

    // Developer Admin Clear Broadcast (Dismiss for all active players)
    socket.on('admin:clear_broadcast', (ack) => {
        if (!socket.isDeveloper) {
            if (typeof ack === 'function') ack({ error: 'Access Denied: Developer account required.' });
            return;
        }
        io.emit('system:broadcast_clear');
        console.log(`[BUGSHOT BROADCAST DISMISSED GLOBALLY BY ADMIN]`);
        if (typeof ack === 'function') ack({ success: true });
    });

    // Developer Admin DM to any Player (Sent from BUGSHOT system)
    socket.on('admin:send_dm', (data = {}, ack) => {
        const { targetUsername, text } = data || {};
        if (!socket.isDeveloper) {
            if (typeof ack === 'function') ack({ error: 'Access Denied: Developer account required.' });
            return;
        }
        const cleanTarget = (targetUsername || '').trim().toLowerCase();
        if (!cleanTarget || !text || !text.trim()) {
            if (typeof ack === 'function') ack({ error: 'Target player and message required.' });
            return;
        }
        const targetSockets = userSocketsMap.get(cleanTarget);
        const count = targetSockets ? targetSockets.size : 0;
        const dmPayload = {
            id: Date.now().toString(),
            sender: 'BUGSHOT',
            fromUsername: 'BUGSHOT',
            text: text.trim(),
            timestamp: Date.now()
        };
        if (targetSockets && targetSockets.size > 0) {
            for (const sId of targetSockets) {
                io.to(sId).emit('system:direct_message', dmPayload);
            }
        }
        console.log(`[BUGSHOT DM DISPATCHED] To: "${cleanTarget}" Message: "${dmPayload.text}" (online sockets: ${count})`);
        if (typeof ack === 'function') ack({ success: true, count, isOnline: count > 0 });
    });

    // Developer Admin Kick Player from any room
    socket.on('admin:kick_player', (data = {}, ack) => {
        if (!socket.isDeveloper && socket.username?.toLowerCase() !== 'aadish') {
            if (typeof ack === 'function') ack({ error: 'Access Denied: Developer account required.' });
            return;
        }
        const { roomId, targetPlayerId, targetUsername } = data || {};
        const safeRoomId = sanitizeRoomId(roomId);
        if (!safeRoomId) {
            if (typeof ack === 'function') ack({ error: 'Valid room ID required.' });
            return;
        }
        const room = rooms.get(safeRoomId);
        if (!room) {
            if (typeof ack === 'function') ack({ error: 'Room not found.' });
            return;
        }

        const playerIndex = room.players.findIndex(p => 
            p.id === targetPlayerId || 
            (targetUsername && p.name.toLowerCase() === targetUsername.toLowerCase())
        );

        if (playerIndex === -1) {
            if (typeof ack === 'function') ack({ error: 'Target player not found in room.' });
            return;
        }

        const kickedPlayer = room.players[playerIndex];
        cleanupPlayerTimers(kickedPlayer);
        room.players.splice(playerIndex, 1);

        const targetSocket = io.sockets.sockets.get(kickedPlayer.id);
        if (targetSocket) {
            targetSocket.leave(safeRoomId);
            targetSocket.emit('kicked', { reason: 'Expelled from room by administrator.' });
        }

        const kickMessage = {
            sender: 'SYSTEM',
            color: '#ef4444',
            text: `${kickedPlayer.name} was expelled by an administrator.`,
            timestamp: Date.now()
        };
        room.messages.push(kickMessage);
        if (room.messages.length > 50) room.messages.shift();
        io.to(safeRoomId).emit('chatMessageReceived', kickMessage);

        if (room.gameState) {
            const activeRemaining = room.players.filter(p => !p.disconnected);
            if (activeRemaining.length <= 1) {
                finalizeMidGameAbort(room, safeRoomId, kickedPlayer.name);
            }
        }

        emitRoomUpdated(safeRoomId, room);
        console.log(`[ADMIN KICK] Developer kicked ${kickedPlayer.name} (${kickedPlayer.id}) from room ${safeRoomId}`);
        if (typeof ack === 'function') ack({ success: true });
    });

    // Developer Admin Mute Player
    socket.on('admin:mute_player', (data = {}, ack) => {
        if (!socket.isDeveloper && socket.username?.toLowerCase() !== 'aadish') {
            if (typeof ack === 'function') ack({ error: 'Access Denied: Developer account required.' });
            return;
        }
        const { targetUsername, durationMs = 30 * 60 * 1000 } = data || {};
        const cleanUser = (targetUsername || '').trim().toLowerCase();
        if (!cleanUser) {
            if (typeof ack === 'function') ack({ error: 'Target username required.' });
            return;
        }

        const expiry = Date.now() + Math.max(durationMs, 60000);
        mutedUsers.set(cleanUser, expiry);

        const targetSockets = userSocketsMap.get(cleanUser);
        if (targetSockets) {
            for (const sId of targetSockets) {
                mutedSockets.set(sId, expiry);
                const s = io.sockets.sockets.get(sId);
                if (s) {
                    s.emit('chatMessageReceived', {
                        sender: 'SYSTEM',
                        color: '#ef4444',
                        text: 'You have been muted by an administrator.',
                        timestamp: Date.now()
                    });
                }
            }
        }

        console.log(`[ADMIN MUTE] Developer muted ${cleanUser} for ${durationMs}ms`);
        if (typeof ack === 'function') ack({ success: true, muted: true, expiry });
    });

    // Developer Admin Unmute Player
    socket.on('admin:unmute_player', (data = {}, ack) => {
        if (!socket.isDeveloper && socket.username?.toLowerCase() !== 'aadish') {
            if (typeof ack === 'function') ack({ error: 'Access Denied: Developer account required.' });
            return;
        }
        const { targetUsername } = data || {};
        const cleanUser = (targetUsername || '').trim().toLowerCase();
        if (!cleanUser) {
            if (typeof ack === 'function') ack({ error: 'Target username required.' });
            return;
        }

        mutedUsers.delete(cleanUser);
        const targetSockets = userSocketsMap.get(cleanUser);
        if (targetSockets) {
            for (const sId of targetSockets) {
                mutedSockets.delete(sId);
                const s = io.sockets.sockets.get(sId);
                if (s) {
                    s.emit('chatMessageReceived', {
                        sender: 'SYSTEM',
                        color: '#10b981',
                        text: 'Your voice transmission privilege has been restored.',
                        timestamp: Date.now()
                    });
                }
            }
        }

        console.log(`[ADMIN UNMUTE] Developer unmuted ${cleanUser}`);
        if (typeof ack === 'function') ack({ success: true, muted: false });
    });

    socket.on('disconnect', () => {
        activeConnectionsCount = Math.max(0, activeConnectionsCount - 1);
        mutedSockets.delete(socket.id);
        
        // Clean up from Presence Repository
        const pObj = presenceMap.get(socket.id);
        if (pObj) {
            presenceMap.delete(socket.id);
            const userSockets = userSocketsMap.get(pObj.username);
            if (userSockets) {
                userSockets.delete(socket.id);
                if (userSockets.size === 0) {
                    userSocketsMap.delete(pObj.username);
                    developerUsernames.delete(pObj.username);
                    const now = Date.now();
                    setTrackedLastSeen(pObj.username.toLowerCase(), now);
                    io.emit('presence:user_offline', {
                        username: pObj.username,
                        playerId: pObj.playerId,
                        lastSeen: now
                    });
                }
            }
        }

        if (socket._replacedByReconnect) {
            return;
        }
        
        rooms.forEach((room, roomId) => {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex === -1) return;

            const disconnectedPlayer = room.players[playerIndex];
            disconnectedPlayer.disconnected = true;
            cleanupPlayerTimers(disconnectedPlayer);

            if (room.gameState) {
                const disconnectMsg = {
                    sender: 'SYSTEM',
                    color: '#737373',
                    text: `${disconnectedPlayer.name} disconnected. Reconnecting... (25s grace)`,
                    timestamp: Date.now()
                };
                room.messages.push(disconnectMsg);
                if (room.messages.length > 50) room.messages.shift();
                io.to(roomId).emit('chatMessageReceived', disconnectMsg);

                emitRoomUpdated(roomId, room);

                disconnectedPlayer.disconnectTimer = setTimeout(() => {
                    const roomAfterTimeout = rooms.get(roomId);
                    if (roomAfterTimeout) {
                        const pIdx = roomAfterTimeout.players.findIndex(p => p.id === disconnectedPlayer.id);
                        if (pIdx !== -1 && roomAfterTimeout.players[pIdx].disconnected) {
                            cleanupPlayerTimers(roomAfterTimeout.players[pIdx]);
                            roomAfterTimeout.players.splice(pIdx, 1);
                            if (roomAfterTimeout.players.length === 0) {
                                deleteRoomSafely(roomId);
                            } else {
                                finalizeMidGameAbort(roomAfterTimeout, roomId, disconnectedPlayer.name);
                            }
                        }
                    }
                }, RECONNECT_GRACE_MS);
                return;
            }

            // Lobby stage disconnect with grace period for mobile network switches
            const disconnectMsg = {
                sender: 'SYSTEM',
                color: '#737373',
                text: `${disconnectedPlayer.name} disconnected. (Holding slot for 20s)`,
                timestamp: Date.now()
            };
            room.messages.push(disconnectMsg);
            if (room.messages.length > 50) room.messages.shift();
            io.to(roomId).emit('chatMessageReceived', disconnectMsg);

            emitRoomUpdated(roomId, room);

            // If all players in room are disconnected, schedule room deletion after grace period
            const activeConnected = room.players.filter(p => !p.disconnected).length;
            if (activeConnected === 0) {
                scheduleRoomDeletion(room, roomId, LOBBY_RECONNECT_GRACE_MS);
            }

            disconnectedPlayer.disconnectTimer = setTimeout(() => {
                const roomAfterTimeout = rooms.get(roomId);
                if (roomAfterTimeout) {
                    const pIdx = roomAfterTimeout.players.findIndex(p => p.id === disconnectedPlayer.id);
                    if (pIdx !== -1 && roomAfterTimeout.players[pIdx].disconnected) {
                        cleanupPlayerTimers(roomAfterTimeout.players[pIdx]);
                        roomAfterTimeout.players.splice(pIdx, 1);

                        if (roomAfterTimeout.players.length === 0) {
                            deleteRoomSafely(roomId);
                        } else {
                            if (roomAfterTimeout.hostId === socket.id) {
                                const nextHost = roomAfterTimeout.players.find(p => !p.disconnected);
                                if (nextHost) {
                                    roomAfterTimeout.hostId = nextHost.id;
                                    roomAfterTimeout.hostName = nextHost.name;
                                }
                            }
                            emitRoomUpdated(roomId, roomAfterTimeout);
                        }
                    }
                }
            }, LOBBY_RECONNECT_GRACE_MS);
        });
    });
});

const PORT = process.env.PORT || 7860;

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[CORE ROUTING PROTOCOLS READY] Core engine operational. Active interface target: 0.0.0.0:${PORT} (Default/HF Spaces port: 7860)`);
});

// --- HARDENED PROCESS LIFECYCLE & GRACEFUL SHUTDOWN HANDLERS ---
let isShuttingDown = false;

const performGracefulShutdown = (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[SYSTEM SHUTDOWN] Received ${signal}. Initiating graceful shutdown...`);

    // Stop recurring background garbage collection
    if (roomGcInterval) {
        clearInterval(roomGcInterval);
    }

    // Broadcast server maintenance alert to all connected sockets
    try {
        io.emit('system:broadcast', {
            id: Date.now().toString(),
            sender: 'BUGSHOT',
            title: 'SERVER RESTART',
            text: 'Server is restarting or shutting down for maintenance. Active links will reconnect.',
            timestamp: Date.now()
        });
    } catch (err) {
        console.error('[SYSTEM SHUTDOWN] Failed to broadcast shutdown alert:', err.message);
    }

    // Clear all player and room disconnect timers to release event loop
    for (const [roomId, room] of rooms.entries()) {
        cleanupRoomTimers(room);
    }
    rooms.clear();
    presenceMap.clear();
    userSocketsMap.clear();
    userLastSeenMap.clear();
    developerUsernames.clear();

    // Disconnect active socket clients cleanly
    try {
        io.disconnectSockets(true);
        io.close(() => {
            console.log('[SYSTEM SHUTDOWN] Socket.io network engine closed cleanly.');
        });
    } catch (err) {
        console.error('[SYSTEM SHUTDOWN] Error closing Socket.io:', err.message);
    }

    // Stop accepting HTTP requests and finish active transactions
    httpServer.close((err) => {
        if (err) {
            console.error('[SYSTEM SHUTDOWN] Error during HTTP server termination:', err);
            process.exit(1);
        }
        console.log('[SYSTEM SHUTDOWN] HTTP server closed gracefully. Core termination complete.');
        process.exit(0);
    });

    // Forced exit timeout fallback (5000ms threshold)
    const forceExitTimer = setTimeout(() => {
        console.error('[SYSTEM SHUTDOWN] Forced shutdown invoked after 5000ms timeout threshold.');
        process.exit(1);
    }, 5000);
    if (forceExitTimer.unref) forceExitTimer.unref();
};

process.on('SIGTERM', () => performGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => performGracefulShutdown('SIGINT'));

// Guard against unhandled rejections and uncaught exceptions with structured logging
process.on('uncaughtException', (err, origin) => {
    console.error(`[CRITICAL ERROR - UNCAUGHT EXCEPTION] [${new Date().toISOString()}] Origin: ${origin}`, {
        name: err?.name,
        message: err?.message,
        stack: err?.stack
    });
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`[CRITICAL ERROR - UNHANDLED REJECTION] [${new Date().toISOString()}]`, {
        reason: reason instanceof Error ? { name: reason.name, message: reason.message, stack: reason.stack } : reason,
        promise
    });
});
