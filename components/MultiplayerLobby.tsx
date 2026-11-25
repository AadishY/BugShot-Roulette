import React, { useState, useEffect, useRef } from 'react';
import {
    Users,
    Settings,
    Play,
    CheckCircle2,
    XCircle,
    ArrowLeft,
    Copy,
    Link,
    Sliders,
    ShieldAlert,
    MessageSquare,
    Crown,
    Check,
    Globe,
    Lock,
    Dices
} from 'lucide-react';
import { RoomSettings } from '../types';
import { audioManager } from '../utils/audioManager';
import { getMultiplayerDefaultWeights } from '../utils/game/inventory';
import { resolvePlayerAvatar, subscribeToNotifications, NotificationCounts } from '../utils/messagingService';
import { getCurrentUserProfile, UserProfile } from '../utils/firebaseService';
import { presenceClient } from '../utils/presenceService';
import { MessagesModal } from './ui/MessagesModal';
import { showConfirm } from '../utils/modalService';

const TACTICAL_PREFIXES = ['VIPER', 'GHOST', 'SHADOW', 'BLACKOUT', 'OMEGA', 'NIGHTFALL', 'DEADLOCK', 'CYBER', 'VOID', 'PHANTOM', 'IRON'];
const TACTICAL_SUFFIXES = ['BUNKER', 'SECTOR', 'OUTPOST', 'CORRIDOR', 'VAULT', 'SANCTUARY', 'REDOUBT', 'HQ', 'CITADEL'];

const generateRandomBunkerName = () => {
    const pre = TACTICAL_PREFIXES[Math.floor(Math.random() * TACTICAL_PREFIXES.length)];
    const suf = TACTICAL_SUFFIXES[Math.floor(Math.random() * TACTICAL_SUFFIXES.length)];
    const num = Math.floor(Math.random() * 90 + 10);
    return `${pre} ${suf} #${num}`;
};

interface MultiplayerLobbyProps {
    room: any;
    playerId: string;
    onUpdateSettings: (settings: RoomSettings) => void;
    onReadyUp: (ready: boolean) => void;
    onStartGame: () => void;
    onBack: () => void;
    onKick?: (targetPlayerId: string) => void;
    onJoinRoom?: (roomId: string) => void;
}

export const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({
    room,
    playerId,
    onUpdateSettings,
    onReadyUp,
    onStartGame,
    onBack,
    onKick,
    onJoinRoom
}) => {
    const roomPlayers = Array.isArray(room?.players) ? room.players : [];
    const defaultSettings: RoomSettings = {
        rounds: 3,
        hp: 4,
        itemsPerShipment: 4,
        isPrivate: false,
        isAdvanced: false,
        maxPlayers: room?.maxPlayers || 4
    };
    const roomSettings: RoomSettings = { ...defaultSettings, ...(room?.settings || {}) };
    const effectiveMaxPlayers = roomSettings.maxPlayers || room?.maxPlayers || 4;
    const isHost = room?.hostId === playerId;
    const currentPlayer = roomPlayers.find((p: any) => p?.id === playerId);
    const isReady = currentPlayer?.ready || false;

    const [roomNameDraft, setRoomNameDraft] = useState<string>(room?.name || '');
    const [copiedCode, setCopiedCode] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showMessagesModal, setShowMessagesModal] = useState(false);
    const [targetMessageUser, setTargetMessageUser] = useState<string | null>(null);

    const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync local bunker name draft when server broadcasts room updates
    useEffect(() => {
        if (typeof room?.name === 'string') {
            setRoomNameDraft(room.name);
        }
    }, [room?.name]);

    useEffect(() => {
        return () => {
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (showMessagesModal) {
                    setShowMessagesModal(false);
                } else if (showAdvanced) {
                    setShowAdvanced(false);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showMessagesModal, showAdvanced]);

    const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => getCurrentUserProfile());
    const [notificationCounts, setNotificationCounts] = useState<NotificationCounts>({
        unreadDMs: 0,
        pendingRequests: 0,
        total: 0,
        unreadBySender: {}
    });

    useEffect(() => {
        if (showMessagesModal) {
            const u = getCurrentUserProfile();
            if (u) setCurrentUser(u);
        }
    }, [showMessagesModal]);

    useEffect(() => {
        if (!currentUser?.username) return;
        const unsubscribe = subscribeToNotifications(currentUser.username, (counts) => {
            setNotificationCounts(counts);
        });
        return () => unsubscribe();
    }, [currentUser?.username]);

    const persistAndEmitSettings = (nextSettings: RoomSettings) => {
        if (!isHost) return;
        try {
            localStorage.setItem('aadish_roulette_last_lobby_settings', JSON.stringify(nextSettings));
        } catch {}
        onUpdateSettings(nextSettings);
    };

    const handleSettingChange = (key: keyof RoomSettings, value: any) => {
        if (!isHost) return;
        persistAndEmitSettings({ ...roomSettings, [key]: value });
    };

    const commitRoomName = (nextName: string) => {
        if (!isHost) return;
        const trimmed = nextName.trim().slice(0, 24);
        if (!trimmed || trimmed === room?.name) return;
        persistAndEmitSettings({
            ...roomSettings,
            roomName: trimmed,
            name: trimmed
        });
    };

    const showToast = (msg: string) => {
        setToastMessage(msg);
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 2400);
    };

    const handleCopyCode = () => {
        if (!room?.id) return;
        audioManager.playSound('click');
        navigator.clipboard?.writeText(room.id).catch(() => {});
        setCopiedCode(true);
        showToast(`ROOM CODE [${room.id}] COPIED`);
        if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = setTimeout(() => setCopiedCode(false), 2000);
    };

    const handleCopyLink = () => {
        if (!room?.id) return;
        audioManager.playSound('click');
        const inviteLink = `${window.location.origin}${window.location.pathname}?room=${room.id}`;
        navigator.clipboard?.writeText(inviteLink).catch(() => {});
        setCopiedLink(true);
        showToast('INVITE LINK COPIED TO CLIPBOARD');
        if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = setTimeout(() => setCopiedLink(false), 2000);
    };

    const handleToggleAdvanced = () => {
        audioManager.playSound('click');
        if (!isHost) {
            setShowAdvanced(!showAdvanced);
            return;
        }
        const isCurrentlyAdvanced = !!roomSettings.isAdvanced;
        persistAndEmitSettings({
            ...roomSettings,
            isAdvanced: !isCurrentlyAdvanced,
            itemWeights: roomSettings.itemWeights || getMultiplayerDefaultWeights(roomPlayers.length)
        });
        setShowAdvanced(!isCurrentlyAdvanced);
    };

    const defaultWeights = getMultiplayerDefaultWeights(roomPlayers.length);
    const itemWeights = roomSettings.itemWeights || defaultWeights;
    const totalWeight = Object.keys(defaultWeights)
        .filter(item => item !== 'REMOTE')
        .reduce((sum, item) => {
            const w = itemWeights[item] !== undefined ? itemWeights[item] : defaultWeights[item];
            return sum + w;
        }, 0);

    const readyCount = roomPlayers.filter((p: any) => p?.ready).length;
    const canLaunch = roomPlayers.length >= 2 && roomPlayers.every((p: any) => p?.ready);

    return (
        <div
            className="flex flex-col h-full w-full bg-stone-950 font-mono text-stone-300 md:border-r border-stone-900 select-none overflow-hidden lobby-three-cols-container relative"
            style={{
                paddingTop: 'max(env(safe-area-inset-top, 0px), 0px)',
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
                paddingLeft: 'max(env(safe-area-inset-left, 0px), 8px)',
                paddingRight: 'max(env(safe-area-inset-right, 0px), 8px)'
            }}
        >
            {/* Toast Notification */}
            {toastMessage && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[300] px-4 py-2 bg-stone-950 border border-cyan-400 rounded-xl shadow-[0_0_24px_rgba(6,182,212,0.4)] text-cyan-300 font-mono text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-cyan-400 shrink-0" />
                    <span>{toastMessage}</span>
                </div>
            )}

            {/* Header */}
            <div className="px-2.5 py-2 sm:px-4 sm:py-3 border-b border-stone-900 bg-stone-900/20 flex flex-row justify-between items-center gap-2 sm:gap-3 relative shrink-0">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
                    <button
                        type="button"
                        onClick={async () => {
                            audioManager.playSound('click');
                            try {
                                const confirmed = await showConfirm({
                                    title: "LEAVE LOBBY",
                                    message: "ARE YOU SURE YOU WANT TO LEAVE THE LOBBY AND DISCONNECT?",
                                    confirmText: "LEAVE LOBBY",
                                    cancelText: "STAY",
                                    isDanger: true,
                                    icon: "logout"
                                });
                                if (confirmed) {
                                    onBack();
                                }
                            } catch {
                                onBack();
                            }
                        }}
                        className="h-10 sm:h-11 min-w-[40px] px-2.5 sm:px-3.5 flex items-center justify-center gap-1.5 bg-stone-900/70 hover:bg-red-950/50 border border-stone-800 hover:border-red-500/60 rounded-xl text-stone-300 hover:text-red-300 transition-colors cursor-pointer shrink-0 active:scale-95"
                        title="Leave Lobby"
                        aria-label="Leave Lobby"
                    >
                        <ArrowLeft size={16} className="shrink-0" />
                        <span className="hidden sm:inline text-[10px] font-black tracking-[0.16em] uppercase">BACK</span>
                    </button>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h1 className="text-xs sm:text-base font-black tracking-[0.18em] uppercase text-white leading-tight truncate">
                                {room?.name || 'BUNKER LOBBY'}
                            </h1>
                            <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/60 text-cyan-300 text-[9px] font-black tracking-widest tabular-nums shrink-0">
                                #{room?.id || '----'}
                            </span>
                        </div>
                        <p className="text-[8px] sm:text-[9px] text-stone-500 uppercase tracking-widest mt-0.5 truncate">
                            {isHost ? 'HOST CONTROL // ALL SETTINGS LIVE' : 'OPERATIVE STAGING STATION'}
                        </p>
                    </div>
                </div>

                {/* Right Toolbar: Comms, Capacity */}
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    <button
                        onClick={() => {
                            audioManager.playSound('click');
                            setTargetMessageUser(null);
                            setShowMessagesModal(true);
                        }}
                        className="relative flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] bg-stone-900 hover:bg-cyan-950/50 border border-cyan-700/50 hover:border-cyan-400 rounded-xl text-cyan-300 hover:text-white text-[9.5px] sm:text-[10.5px] font-mono font-black tracking-[0.15em] uppercase transition-all cursor-pointer active:scale-95"
                        title="Direct Messages & Tactical Comms"
                        aria-label="Direct Messages & Tactical Comms"
                    >
                        <MessageSquare size={14} className="text-cyan-400 shrink-0" />
                        <span className="hidden sm:inline">COMMS</span>
                        {notificationCounts.total > 0 && (
                            <span className="flex items-center justify-center px-1.5 py-0.5 min-w-[18px] bg-red-600 text-white text-[9px] font-black rounded-full">
                                {notificationCounts.total > 9 ? '9+' : notificationCounts.total}
                            </span>
                        )}
                    </button>

                    <div className="flex items-center gap-1.5 px-2.5 py-2 min-h-[40px] bg-cyan-950/30 border border-cyan-900/50 rounded-xl text-cyan-300 text-[9px] sm:text-[10px] font-black uppercase tracking-wider shrink-0 tabular-nums">
                        <Users size={13} className="shrink-0" />
                        <span>{roomPlayers.length}/{effectiveMaxPlayers}</span>
                    </div>
                </div>
            </div>

            {/* Quick Invite & Room Code Strip */}
            <div className="px-2.5 sm:px-4 py-2 bg-black/50 border-b border-stone-900 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                        <span className="text-[8.5px] font-black text-stone-500 uppercase tracking-widest">ROOM CODE</span>
                        <span className="text-base sm:text-xl font-black text-white tracking-[0.22em] tabular-nums">{room?.id || '----'}</span>
                        <span className={`px-2 py-0.5 text-[8.5px] font-black tracking-widest uppercase rounded border ${
                            roomSettings.isPrivate
                                ? 'bg-amber-950/40 text-amber-400 border-amber-800/60'
                                : 'bg-cyan-950/40 text-cyan-400 border-cyan-800/60'
                        }`}>
                            {roomSettings.isPrivate ? 'PRIVATE' : 'PUBLIC'}
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={handleCopyCode}
                            className="px-3 py-1.5 min-h-[38px] bg-stone-900 hover:bg-stone-800 border border-stone-700 hover:border-cyan-500 text-stone-200 hover:text-cyan-300 text-[9px] font-black tracking-widest uppercase rounded-lg transition-colors active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                        >
                            {copiedCode ? <Check size={13} className="text-emerald-400 shrink-0" /> : <Copy size={12} className="shrink-0" />}
                            <span className={copiedCode ? "text-emerald-400" : ""}>{copiedCode ? 'COPIED' : 'COPY CODE'}</span>
                        </button>
                        <button
                            onClick={handleCopyLink}
                            className="px-3 py-1.5 min-h-[38px] bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-700/70 hover:border-cyan-400 text-cyan-300 hover:text-white text-[9px] font-black tracking-widest uppercase rounded-lg transition-colors active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                        >
                            {copiedLink ? <Check size={13} className="text-emerald-400 shrink-0" /> : <Link size={12} className="shrink-0" />}
                            <span className={copiedLink ? "text-emerald-400" : ""}>{copiedLink ? 'COPIED' : 'INVITE LINK'}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Two-Column Staging Area */}
            <div className="flex-1 p-2 sm:p-4 flex flex-col md:flex-row gap-2.5 sm:gap-4 overflow-y-auto md:overflow-hidden min-h-0 custom-scrollbar">
                {/* Left Column: All Bunker & Match Settings */}
                <div className="w-full shrink-0 md:shrink md:flex-1 md:w-1/2 md:overflow-y-auto pr-0.5 custom-scrollbar min-w-0 lobby-settings-column bg-stone-900/25 border border-stone-850 rounded-xl p-2.5 sm:p-3.5">
                    <div className="flex items-center justify-between border-b border-stone-850 pb-2 mb-2.5">
                        <h2 className="text-[9.5px] sm:text-[10.5px] font-black text-stone-300 uppercase flex items-center gap-2 tracking-widest">
                            <Settings size={12} className="text-cyan-400" />
                            <span>BUNKER SETTINGS</span>
                        </h2>
                        {!isHost && (
                            <span className="text-[8px] font-bold uppercase tracking-widest text-stone-500">
                                HOST CONTROLLED
                            </span>
                        )}
                    </div>

                    <div className="space-y-3">
                        {/* Bunker Name (Editable directly inside lobby) */}
                        <div className="space-y-1">
                            <label className="text-[8.5px] sm:text-[9px] uppercase font-black text-stone-400 tracking-wider block">
                                Bunker Codename
                            </label>
                            <div className="flex items-center gap-1.5">
                                <input
                                    type="text"
                                    maxLength={24}
                                    value={roomNameDraft}
                                    disabled={!isHost}
                                    onChange={(e) => setRoomNameDraft(e.target.value)}
                                    onBlur={() => commitRoomName(roomNameDraft)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.currentTarget.blur();
                                        }
                                    }}
                                    placeholder="ENTER BUNKER NAME..."
                                    className="flex-1 min-w-0 min-h-[38px] bg-stone-950 border border-stone-800 focus:border-cyan-500/70 disabled:opacity-60 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-white uppercase tracking-wide outline-none"
                                />
                                {isHost && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            audioManager.playSound('click');
                                            const next = generateRandomBunkerName();
                                            setRoomNameDraft(next);
                                            commitRoomName(next);
                                        }}
                                        className="px-2.5 min-h-[38px] bg-stone-900 hover:bg-stone-800 border border-stone-700 hover:border-cyan-500/60 text-cyan-400 rounded-lg flex items-center gap-1 text-[9px] font-black uppercase tracking-wider cursor-pointer shrink-0 active:scale-95"
                                        title="Randomize Bunker Name"
                                    >
                                        <Dices size={13} />
                                        <span className="hidden sm:inline">RANDOM</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Visibility & Squad Capacity */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div className="space-y-1">
                                <label className="text-[8.5px] sm:text-[9px] uppercase font-black text-stone-400 tracking-wider block">
                                    Visibility
                                </label>
                                <div className="grid grid-cols-2 gap-1.5">
                                    <button
                                        type="button"
                                        disabled={!isHost}
                                        onClick={() => {
                                            audioManager.playSound('click');
                                            handleSettingChange('isPrivate', false);
                                        }}
                                        className={`py-2 min-h-[38px] rounded-lg border text-[9px] font-black tracking-wider uppercase flex items-center justify-center gap-1 transition-all ${
                                            !roomSettings.isPrivate
                                                ? 'bg-cyan-950/50 border-cyan-500 text-cyan-300'
                                                : 'bg-stone-950 border-stone-850 text-stone-500 hover:text-stone-300'
                                        } ${isHost ? 'cursor-pointer' : 'cursor-default opacity-80'}`}
                                    >
                                        <Globe size={11} />
                                        <span>PUBLIC</span>
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!isHost}
                                        onClick={() => {
                                            audioManager.playSound('click');
                                            handleSettingChange('isPrivate', true);
                                        }}
                                        className={`py-2 min-h-[38px] rounded-lg border text-[9px] font-black tracking-wider uppercase flex items-center justify-center gap-1 transition-all ${
                                            roomSettings.isPrivate
                                                ? 'bg-amber-950/50 border-amber-500 text-amber-300'
                                                : 'bg-stone-950 border-stone-850 text-stone-500 hover:text-stone-300'
                                        } ${isHost ? 'cursor-pointer' : 'cursor-default opacity-80'}`}
                                    >
                                        <Lock size={11} />
                                        <span>PRIVATE</span>
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[8.5px] sm:text-[9px] uppercase font-black text-stone-400 tracking-wider block">
                                    Squad Capacity
                                </label>
                                <div className="grid grid-cols-3 gap-1">
                                    {([2, 3, 4] as const).map((cap) => {
                                        const tooSmall = cap < roomPlayers.length;
                                        return (
                                            <button
                                                key={cap}
                                                type="button"
                                                disabled={!isHost || tooSmall}
                                                onClick={() => {
                                                    audioManager.playSound('click');
                                                    handleSettingChange('maxPlayers', cap);
                                                }}
                                                className={`py-2 min-h-[38px] rounded-lg border text-[9px] font-black tracking-wider uppercase transition-all tabular-nums ${
                                                    effectiveMaxPlayers === cap
                                                        ? 'bg-cyan-950/50 border-cyan-500 text-cyan-300'
                                                        : 'bg-stone-950 border-stone-850 text-stone-500 hover:text-stone-300'
                                                } ${isHost && !tooSmall ? 'cursor-pointer' : 'cursor-not-allowed opacity-45'}`}
                                            >
                                                {cap}P
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Core Sliders */}
                        <div className="space-y-2.5 pt-2 border-t border-stone-900">
                            <div>
                                <div className="flex justify-between items-baseline">
                                    <label className="text-[8.5px] sm:text-[9px] uppercase font-black text-stone-400 tracking-wider">Rounds to Win</label>
                                    <span className="text-xs sm:text-sm font-black text-cyan-400 tabular-nums">Best of {roomSettings.rounds}</span>
                                </div>
                                <input
                                    type="range" min="1" max="7" step="2" value={roomSettings.rounds}
                                    disabled={!isHost}
                                    onChange={(e) => handleSettingChange('rounds', parseInt(e.target.value, 10))}
                                    className="w-full accent-cyan-500 cursor-pointer h-2 bg-stone-900 rounded-lg appearance-none disabled:opacity-45 min-h-[34px] py-2"
                                    style={{ touchAction: 'pan-x' }}
                                />
                            </div>

                            <div>
                                <div className="flex justify-between items-baseline">
                                    <label className="text-[8.5px] sm:text-[9px] uppercase font-black text-stone-400 tracking-wider">Starting Vitality</label>
                                    <span className="text-xs sm:text-sm font-black text-cyan-400 tabular-nums">
                                        {roomSettings.hp === 9 ? 'RANDOM (2–6)' : `${roomSettings.hp} HP`}
                                    </span>
                                </div>
                                <input
                                    type="range" min="2" max="9" value={roomSettings.hp}
                                    disabled={!isHost}
                                    onChange={(e) => handleSettingChange('hp', parseInt(e.target.value, 10))}
                                    className="w-full accent-cyan-500 cursor-pointer h-2 bg-stone-900 rounded-lg appearance-none disabled:opacity-45 min-h-[34px] py-2"
                                    style={{ touchAction: 'pan-x' }}
                                />
                            </div>

                            <div>
                                <div className="flex justify-between items-baseline">
                                    <label className="text-[8.5px] sm:text-[9px] uppercase font-black text-stone-400 tracking-wider">Items per Shipment</label>
                                    <span className="text-xs sm:text-sm font-black text-cyan-400 tabular-nums">
                                        {roomSettings.itemsPerShipment === 9 ? 'RANDOM (1–5)' : `${roomSettings.itemsPerShipment} ITEMS`}
                                    </span>
                                </div>
                                <input
                                    type="range" min="0" max="9" value={roomSettings.itemsPerShipment}
                                    disabled={!isHost}
                                    onChange={(e) => handleSettingChange('itemsPerShipment', parseInt(e.target.value, 10))}
                                    className="w-full accent-cyan-500 cursor-pointer h-2 bg-stone-900 rounded-lg appearance-none disabled:opacity-45 min-h-[34px] py-2"
                                    style={{ touchAction: 'pan-x' }}
                                />
                            </div>
                        </div>

                        {/* Advanced Item Weights */}
                        <div className="pt-2 border-t border-stone-900 flex items-center justify-between gap-2">
                            <div className="text-left min-w-0">
                                <span className="text-[8.5px] sm:text-[9.5px] uppercase font-black text-white tracking-wider flex items-center gap-1.5">
                                    <Sliders size={12} className="text-cyan-400 shrink-0" />
                                    <span className="truncate">Custom Item Drop Weights</span>
                                </span>
                                <span className="text-[7.5px] sm:text-[8.5px] text-stone-500 uppercase block mt-0.5 truncate">
                                    Tune probabilities per gadget
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                {isHost && roomSettings.isAdvanced && (
                                    <button
                                        onClick={() => {
                                            audioManager.playSound('click');
                                            persistAndEmitSettings({
                                                ...roomSettings,
                                                itemWeights: getMultiplayerDefaultWeights(roomPlayers.length)
                                            });
                                        }}
                                        className="px-2.5 py-2 min-h-[38px] text-[8.5px] font-black tracking-widest uppercase rounded-lg border border-red-900/50 bg-red-950/30 text-red-400 hover:bg-red-900/40 transition-colors cursor-pointer"
                                    >
                                        RESET
                                    </button>
                                )}
                                <button
                                    onClick={handleToggleAdvanced}
                                    className={`px-3 py-2 min-h-[38px] text-[8.5px] font-black tracking-widest uppercase rounded-lg border transition-colors cursor-pointer ${
                                        roomSettings.isAdvanced
                                            ? 'bg-cyan-950/40 text-cyan-300 border-cyan-600'
                                            : 'bg-stone-950 text-stone-400 border-stone-800 hover:text-stone-200'
                                    }`}
                                >
                                    {roomSettings.isAdvanced ? 'CUSTOM ON' : 'DEFAULT'}
                                </button>
                            </div>
                        </div>

                        {showAdvanced && (
                            <div className="pt-2.5 border-t border-stone-900 grid grid-cols-2 lg:grid-cols-3 gap-2">
                                {Object.keys(defaultWeights)
                                    .filter(item => item !== 'REMOTE')
                                    .map((item) => {
                                        const weight = itemWeights[item] !== undefined ? itemWeights[item] : defaultWeights[item];
                                        const rawPct = totalWeight > 0 ? (weight / totalWeight) * 100 : 0;
                                        const pctLabel = weight <= 0 ? '0%' : (rawPct < 1 ? '<1%' : `${Math.round(rawPct)}%`);
                                        return (
                                            <div key={item} className="flex flex-col gap-1 p-2 bg-stone-950 border border-stone-850 rounded-lg">
                                                <div className="flex justify-between items-center min-w-0 gap-1 text-left">
                                                    <span className="text-[7.5px] sm:text-[8px] font-bold text-stone-300 uppercase tracking-wider truncate block">
                                                        {item.replace('_', ' ')}
                                                    </span>
                                                    <span className="text-[7.5px] sm:text-[8px] font-mono text-cyan-400 font-bold shrink-0 tabular-nums">
                                                        {pctLabel}
                                                    </span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="10"
                                                    step="0.5"
                                                    value={weight}
                                                    disabled={!isHost}
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value);
                                                        const currentWeights = roomSettings.itemWeights || defaultWeights;
                                                        persistAndEmitSettings({
                                                            ...roomSettings,
                                                            itemWeights: {
                                                                ...currentWeights,
                                                                [item]: val
                                                            }
                                                        });
                                                    }}
                                                    className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-stone-900 rounded-lg appearance-none min-h-[32px] py-1.5"
                                                    style={{ touchAction: 'pan-x' }}
                                                />
                                            </div>
                                        );
                                    })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column: Registered Squad Roster */}
                <div className="w-full shrink-0 md:shrink md:flex-1 md:w-1/2 md:overflow-y-auto pr-0.5 custom-scrollbar min-w-0 lobby-players-column bg-stone-900/25 border border-stone-850 rounded-xl p-2.5 sm:p-3.5">
                    <div className="flex items-center justify-between border-b border-stone-850 pb-2 mb-2.5">
                        <h2 className="text-[9.5px] sm:text-[10.5px] font-black text-stone-300 uppercase flex items-center gap-2 tracking-widest">
                            <Users size={12} className="text-cyan-400" />
                            <span>SQUAD ROSTER</span>
                        </h2>
                        <span className="text-[8.5px] font-black uppercase tracking-widest text-emerald-400 tabular-nums">
                            {readyCount}/{roomPlayers.length} READY
                        </span>
                    </div>

                    <div className="space-y-2">
                        {roomPlayers.map((player: any, idx: number) => {
                            const isMe = player.id === playerId;
                            const isPlayerHost = player.id === room.hostId;
                            const avatarUrl = resolvePlayerAvatar({
                                username: player.name,
                                avatarUrl: player.avatarUrl,
                                avatarStyle: player.avatarStyle,
                                avatarSeed: player.avatarSeed || player.name,
                                isDeveloper: player.name?.toLowerCase() === 'aadish'
                            });

                            return (
                                <div
                                    key={player.id}
                                    className={`p-2.5 rounded-xl flex items-center justify-between gap-2 border transition-colors ${
                                        player.ready
                                            ? 'bg-emerald-950/15 border-emerald-800/50'
                                            : 'bg-stone-950/80 border-stone-850'
                                    }`}
                                    style={{ borderLeftColor: player.color || '#06b6d4', borderLeftWidth: '4px' }}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                        <div
                                            className="relative w-10 h-10 rounded-xl overflow-hidden bg-stone-900 border shrink-0 flex items-center justify-center p-0.5"
                                            style={{ borderColor: player.color ? `${player.color}90` : '#3f3f46' }}
                                        >
                                            <img
                                                src={avatarUrl}
                                                alt={player.name}
                                                referrerPolicy="no-referrer"
                                                className="w-full h-full object-cover rounded-lg"
                                                loading="lazy"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).src = '/image/favicon/android-chrome-192x192.png';
                                                }}
                                            />
                                        </div>
                                        <div className="flex flex-col min-w-0 text-left flex-1">
                                            <div className="flex flex-wrap items-center gap-1 min-w-0">
                                                <span className="font-black uppercase tracking-wide text-xs text-white truncate">
                                                    {player.name}
                                                </span>
                                                {isPlayerHost && (
                                                    <span className="text-[7px] bg-amber-950/60 text-amber-300 px-1.5 py-0.5 rounded border border-amber-700/60 font-black tracking-widest flex items-center gap-0.5">
                                                        <Crown size={8} />
                                                        HOST
                                                    </span>
                                                )}
                                                {player.name?.toLowerCase() === 'aadish' && (
                                                    <span className="text-[7px] bg-red-950/60 text-red-400 px-1.5 py-0.5 rounded border border-red-800/60 font-black tracking-widest">
                                                        DEV
                                                    </span>
                                                )}
                                                {isMe && (
                                                    <span className="text-[7px] bg-cyan-950/60 text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-800/60 font-black tracking-widest">
                                                        YOU
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[8px] text-stone-500 font-mono uppercase tracking-wider mt-0.5">
                                                SEAT #{idx + 1} // NODE {player.id.slice(0, 4).toUpperCase()}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {!isMe && (
                                            <button
                                                onClick={() => {
                                                    audioManager.playSound('click');
                                                    setTargetMessageUser(player.name);
                                                    setShowMessagesModal(true);
                                                }}
                                                className="w-9 h-9 min-w-[36px] min-h-[36px] flex items-center justify-center bg-stone-900 hover:bg-cyan-950/50 border border-stone-800 hover:border-cyan-500/60 rounded-lg text-stone-400 hover:text-cyan-300 transition-colors cursor-pointer"
                                                title={`Message ${player.name}`}
                                                aria-label={`Message ${player.name}`}
                                            >
                                                <MessageSquare size={14} />
                                            </button>
                                        )}
                                        {isHost && !isMe && (
                                            <button
                                                onClick={async () => {
                                                    audioManager.playSound('click');
                                                    const confirmed = await showConfirm({
                                                        title: "EXPEL AGENT",
                                                        message: `EXPEL AGENT ${player.name.toUpperCase()} FROM THE BUNKER?`,
                                                        confirmText: "EXPEL",
                                                        cancelText: "CANCEL",
                                                        isDanger: true,
                                                        icon: "warning"
                                                    });
                                                    if (confirmed) {
                                                        onKick?.(player.id);
                                                    }
                                                }}
                                                className="px-2.5 py-1.5 min-h-[36px] bg-red-950/30 hover:bg-red-900/50 border border-red-900/60 text-red-400 hover:text-white text-[8.5px] font-black tracking-widest uppercase rounded-lg transition-colors cursor-pointer"
                                            >
                                                KICK
                                            </button>
                                        )}
                                        {player.ready ? (
                                            <div className="flex items-center gap-1 bg-emerald-950/40 border border-emerald-700/60 px-2.5 py-1.5 rounded-lg text-emerald-400 text-[8.5px] font-black">
                                                <CheckCircle2 size={11} className="shrink-0" />
                                                <span>READY</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1 bg-stone-900 border border-stone-800 px-2.5 py-1.5 rounded-lg text-stone-500 text-[8.5px] font-black">
                                                <XCircle size={11} className="shrink-0" />
                                                <span>WAITING</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        {[...Array(Math.max(0, effectiveMaxPlayers - roomPlayers.length))].map((_, i) => (
                            <div
                                key={`empty-${i}`}
                                className="p-3 bg-stone-950/60 border border-dashed border-stone-850 rounded-xl flex items-center justify-between px-3.5 min-h-[54px]"
                            >
                                <span className="text-[9px] text-stone-600 uppercase font-bold tracking-[0.22em] flex items-center gap-2">
                                    <ShieldAlert size={12} className="text-stone-700 shrink-0" />
                                    <span>OPEN SEAT #{roomPlayers.length + i + 1}</span>
                                </span>
                                <span className="text-[8px] text-stone-700 uppercase font-bold tracking-widest">
                                    SHARE CODE {room?.id}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Bottom Action Bar */}
            <div
                className="p-2.5 sm:p-3.5 border-t border-stone-900 bg-black/80 select-none keyboard-aware-bottom shrink-0"
                style={{
                    paddingBottom: 'max(calc(env(safe-area-inset-bottom, 0px) + env(keyboard-inset-height, 0px)), 8px)'
                }}
            >
                <div className="flex flex-row gap-2 w-full">
                    <button
                        onClick={() => {
                            audioManager.playSound('click');
                            onReadyUp(!isReady);
                        }}
                        className={`flex-1 h-11 sm:h-12 min-h-[44px] border font-black uppercase text-[10px] sm:text-xs tracking-[0.16em] rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer px-2 ${
                            isReady
                                ? 'bg-emerald-500 text-black hover:bg-emerald-400 border-emerald-400'
                                : 'bg-stone-900 text-amber-400 border-amber-700/70 hover:text-amber-300 hover:border-amber-500'
                        }`}
                    >
                        {isReady ? <CheckCircle2 size={15} className="shrink-0" /> : <XCircle size={15} className="shrink-0" />}
                        <span className="truncate">{isReady ? 'READY FOR DEPLOYMENT' : 'MARK READY'}</span>
                    </button>

                    {isHost && (
                        <button
                            onClick={() => {
                                audioManager.playSound('confirm');
                                onStartGame();
                            }}
                            disabled={!canLaunch}
                            className="flex-1 h-11 sm:h-12 min-h-[44px] bg-red-600 hover:bg-red-500 disabled:bg-stone-900 disabled:border-stone-800 disabled:text-stone-600 text-white font-black uppercase text-[10px] sm:text-xs tracking-[0.16em] rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer border border-red-500 px-2"
                        >
                            <Play size={15} fill="currentColor" className="shrink-0" />
                            <span className="truncate">LAUNCH MATCH</span>
                        </button>
                    )}
                </div>

                <p className="mt-1.5 text-center text-[8px] sm:text-[9px] text-stone-500 font-bold uppercase tracking-[0.2em] truncate">
                    {roomPlayers.length < 2
                        ? 'WAITING FOR AT LEAST 2 OPERATIVES'
                        : !canLaunch
                            ? `WAITING ON READY CHECK (${readyCount}/${roomPlayers.length})`
                            : 'ALL OPERATIVES READY // LAUNCH AUTHORIZED'}
                </p>
            </div>

            {showMessagesModal && (
                <MessagesModal
                    isOpen={showMessagesModal}
                    onClose={() => {
                        setShowMessagesModal(false);
                        setTargetMessageUser(null);
                    }}
                    currentUser={currentUser}
                    getUserPresence={(username) => presenceClient.getPresence(username)}
                    initialTargetUsername={targetMessageUser}
                    onJoinRoom={(roomId) => {
                        setShowMessagesModal(false);
                        setTargetMessageUser(null);
                        if (onJoinRoom) {
                            onJoinRoom(roomId);
                        }
                    }}
                />
            )}
        </div>
    );
};
