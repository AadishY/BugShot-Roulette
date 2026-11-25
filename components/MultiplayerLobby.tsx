import React, { useState, useEffect } from 'react';
import { Users, Settings, Play, CheckCircle2, XCircle, ArrowLeft, Copy, Link, Sliders, ShieldAlert, MessageSquare, Crown, Activity, Check } from 'lucide-react';
import { RoomSettings } from '../types';
import { audioManager } from '../utils/audioManager';
import { getMultiplayerDefaultWeights } from '../utils/game/inventory';
import { resolvePlayerAvatar, subscribeToNotifications, NotificationCounts } from '../utils/messagingService';
import { getCurrentUserProfile, UserProfile } from '../utils/firebaseService';
import { presenceClient } from '../utils/presenceService';
import { MessagesModal } from './ui/MessagesModal';
import { showConfirm } from '../utils/modalService';

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

// Dynamic multiplayer default weights are imported from utils/game/inventory

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
        isAdvanced: false
    };
    const roomSettings: RoomSettings = { ...defaultSettings, ...(room?.settings || {}) };
    const isHost = room?.hostId === playerId;
    const currentPlayer = roomPlayers.find((p: any) => p?.id === playerId);
    const isReady = currentPlayer?.ready || false;

    const [copiedCode, setCopiedCode] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showMessagesModal, setShowMessagesModal] = useState(false);
    const [targetMessageUser, setTargetMessageUser] = useState<string | null>(null);

    const copyTimeoutRef = React.useRef<any>(null);
    const toastTimeoutRef = React.useRef<any>(null);
    useEffect(() => {
        return () => {
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
            if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        };
    }, []);

    // Keyboard support: Escape closes messaging modal or advanced drawer
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

    const handleSettingChange = (key: keyof RoomSettings, value: any) => {
        if (!isHost) return;
        onUpdateSettings({ ...roomSettings, [key]: value });
    };

    const showToast = (msg: string) => {
        setToastMessage(msg);
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 2500);
    };

    const handleCopyCode = () => {
        if (!room?.id) return;
        audioManager.playSound('click');
        navigator.clipboard.writeText(room.id);
        setCopiedCode(true);
        showToast(`ROOM CODE [${room.id}] COPIED TO CLIPBOARD`);
        if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = setTimeout(() => setCopiedCode(false), 2000);
    };

    const handleCopyLink = () => {
        if (!room?.id) return;
        audioManager.playSound('click');
        const inviteLink = `${window.location.origin}${window.location.pathname}?room=${room.id}`;
        navigator.clipboard.writeText(inviteLink);
        setCopiedLink(true);
        showToast('MATCH INVITE LINK COPIED TO CLIPBOARD');
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
        onUpdateSettings({
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
            {/* Real-time Toast Feedback Notification */}
            {toastMessage && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[300] px-4 py-2 bg-stone-950/95 border border-cyan-400 rounded-xl shadow-[0_0_30px_rgba(6,182,212,0.5)] text-cyan-300 font-mono text-[10px] sm:text-xs font-black uppercase tracking-widest flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-200">
                    <CheckCircle2 size={15} className="text-cyan-400 animate-pulse shrink-0" />
                    <span>{toastMessage}</span>
                </div>
            )}
            {/* Header */}
            <div className="p-2 sm:p-4 border-b border-stone-900 bg-stone-900/10 flex flex-row justify-between items-center gap-2 sm:gap-4 select-none relative shrink-0">
                {/* Left: Back & Title */}
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink">
                    <button 
                        onClick={async () => {
                            audioManager.playSound('click');
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
                        }} 
                        className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-stone-900 border border-stone-850 hover:border-red-500/50 rounded-xl text-stone-400 hover:text-red-400 transition-all cursor-pointer shrink-0"
                        title="Leave Lobby"
                        aria-label="Leave Lobby"
                    >
                        <ArrowLeft size={16} className="shrink-0" />
                    </button>
                    <div className="min-w-0">
                        <h1 className="text-xs sm:text-base lg:text-lg font-black tracking-widest uppercase text-white italic leading-tight truncate">
                            Lobby
                        </h1>
                        <p className="text-[7.5px] sm:text-[9px] text-stone-500 uppercase tracking-widest mt-0.5 hidden sm:block">
                            Tactical Deployment Station
                        </p>
                    </div>
                </div>

                {/* Center: MESSAGE Button */}
                <div className="lg:absolute lg:left-1/2 lg:-translate-x-1/2 flex items-center justify-center shrink-0">
                    <button
                        onClick={() => {
                            audioManager.playSound('click');
                            setTargetMessageUser(null);
                            setShowMessagesModal(true);
                        }}
                        className="relative flex items-center justify-center gap-1.5 sm:gap-2.5 px-3 py-2 min-h-[44px] sm:px-5 sm:py-2 bg-gradient-to-r from-stone-900 via-cyan-950/50 to-stone-900 hover:from-cyan-950/70 hover:via-cyan-900/50 hover:to-cyan-950/70 border border-cyan-500/50 hover:border-cyan-400 rounded-xl text-cyan-300 hover:text-white text-[10px] sm:text-xs font-mono font-black tracking-[0.15em] uppercase transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] group cursor-pointer active:scale-95"
                        title="Direct Messages & Tactical Comms"
                        aria-label="Direct Messages & Tactical Comms"
                    >
                        <MessageSquare size={15} className="text-cyan-400 group-hover:scale-110 transition-transform shrink-0" />
                        <span className="font-black">COMMS</span>
                        {notificationCounts.total > 0 && (
                            <span className="flex items-center justify-center px-1.5 py-0.5 min-w-[18px] bg-red-600 border border-red-300 text-white text-[9px] font-black rounded-full shadow-[0_0_12px_rgba(220,38,38,0.9)] animate-pulse">
                                {notificationCounts.total > 9 ? '9+' : notificationCounts.total}
                            </span>
                        )}
                    </button>
                </div>

                {/* Right: Nodes Status */}
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] sm:px-3 bg-cyan-950/20 border border-cyan-900/30 rounded-lg text-cyan-400 text-[8.5px] sm:text-[10px] font-bold uppercase tracking-wider shrink-0">
                    <Users size={12} className="animate-pulse shrink-0" />
                    <span>{roomPlayers.length}/{room?.settings?.maxPlayers || room?.maxPlayers || 4} <span className="hidden sm:inline">NODES</span></span>
                </div>
            </div>

            {/* Room Tunnel Details */}
            <div className="px-2.5 sm:px-5 py-2 sm:py-3 bg-stone-900/10 border-b border-stone-900 shrink-0">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3">
                    <div className="text-center sm:text-left select-none flex sm:block items-baseline gap-2 flex-wrap justify-center">
                        <span className="hidden sm:block text-[8px] font-black text-stone-500 uppercase tracking-widest">SECURE_ROOM_TUNNEL</span>
                        <div className="flex items-baseline gap-2 sm:gap-3 flex-wrap justify-center">
                            <span className="text-lg sm:text-2xl lg:text-3xl font-black text-white tracking-[0.2em]">{room?.id || '----'}</span>
                            {room?.name && (
                                <span className="text-[10px] sm:text-xs font-bold text-cyan-400 uppercase tracking-wider truncate max-w-[160px] sm:max-w-xs">
                                    [ {room.name} ]
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-center sm:justify-end gap-1.5 w-full sm:w-auto">
                        {isHost ? (
                            <button
                                onClick={() => handleSettingChange('isPrivate', !roomSettings.isPrivate)}
                                className={`px-3 py-2 min-h-[44px] text-[9px] font-black tracking-widest uppercase rounded-lg border transition-all cursor-pointer flex items-center justify-center ${
                                    roomSettings.isPrivate 
                                        ? 'bg-amber-955/20 text-amber-500 border-amber-805 hover:border-amber-500' 
                                        : 'bg-cyan-950/20 text-cyan-400 border-cyan-800 hover:border-cyan-500'
                                }`}
                            >
                                {roomSettings.isPrivate ? 'PRIVATE' : 'PUBLIC'}
                            </button>
                        ) : (
                            <span className={`px-3 py-2 min-h-[44px] text-[9px] font-black tracking-widest uppercase rounded-lg border select-none flex items-center justify-center ${
                                roomSettings.isPrivate 
                                    ? 'bg-amber-955/10 text-amber-600/70 border-amber-900/40' 
                                    : 'bg-cyan-950/10 text-cyan-600/80 border-cyan-900/40'
                            }`}>
                                {roomSettings.isPrivate ? 'PRIVATE' : 'PUBLIC'}
                            </span>
                        )}
                        <button 
                            onClick={handleCopyCode}
                            className="flex-none px-3 py-2 min-h-[44px] bg-stone-900 hover:bg-stone-850 border border-stone-800 hover:border-cyan-500 text-stone-300 hover:text-cyan-400 text-[9px] font-black tracking-widest uppercase rounded-lg transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                        >
                            {copiedCode ? <Check size={13} className="text-emerald-400 shrink-0" /> : <Copy size={12} className="shrink-0" />}
                            <span className={copiedCode ? "text-emerald-400" : ""}>{copiedCode ? 'COPIED!' : 'CODE'}</span>
                        </button>
                        <button 
                            onClick={handleCopyLink}
                            className="flex-none px-3 py-2 min-h-[44px] bg-cyan-955/20 hover:bg-cyan-955/40 border border-cyan-800/60 hover:border-cyan-400 text-cyan-300 hover:text-white text-[9px] font-black tracking-widest uppercase rounded-lg transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(6,182,212,0.15)] shrink-0"
                        >
                            {copiedLink ? <Check size={13} className="text-emerald-400 shrink-0" /> : <Link size={12} className="shrink-0" />}
                            <span className={copiedLink ? "text-emerald-400" : ""}>{copiedLink ? 'COPIED!' : 'INVITE'}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Area */}
            <div className="flex-1 p-2 sm:p-4 flex flex-col md:flex-row gap-2.5 sm:gap-4 overflow-y-auto md:overflow-hidden min-h-0 custom-scrollbar">
                
                {/* Settings Column */}
                <div className="flex-1 md:w-1/2 md:overflow-y-auto pr-0.5 custom-scrollbar min-w-0 gpu-accelerated lobby-settings-column bg-stone-900/20 border border-stone-850/60 rounded-xl p-2.5">
                    <h2 className="text-[9px] sm:text-[10px] font-black text-stone-400 uppercase flex items-center gap-2 select-none border-b border-stone-900 pb-1.5 tracking-widest">
                        <Settings size={10} /> Match Configuration
                    </h2>

                    <div className="space-y-2.5 sm:space-y-4 p-0.5 mt-1.5">
                        {/* Standard Settings */}
                        <div className="space-y-2 sm:space-y-3">
                            <div className="space-y-0.5">
                                <div className="flex justify-between items-baseline select-none">
                                    <label className="text-[8px] sm:text-[9px] uppercase font-black text-stone-400 tracking-wider">Rounds to Win</label>
                                    <span className="text-xs sm:text-sm font-black text-cyan-400">{roomSettings.rounds}</span>
                                </div>
                                <input
                                    type="range" min="1" max="7" step="2" value={roomSettings.rounds}
                                    disabled={!isHost}
                                    onChange={(e) => handleSettingChange('rounds', parseInt(e.target.value))}
                                    className="w-full accent-cyan-500 cursor-pointer h-2 bg-stone-900 rounded-lg appearance-none opacity-85 hover:opacity-100 disabled:opacity-40 transition-opacity min-h-[38px] py-2.5"
                                    style={{ touchAction: 'pan-x' }}
                                />
                            </div>

                            <div className="space-y-0.5">
                                <div className="flex justify-between items-baseline select-none">
                                    <label className="text-[8px] sm:text-[9px] uppercase font-black text-stone-400 tracking-wider">Starting Health Points</label>
                                    <span className="text-xs sm:text-sm font-black text-cyan-400">
                                        {roomSettings.hp === 9 ? 'RANDOM' : `${roomSettings.hp} HP`}
                                    </span>
                                </div>
                                <input
                                    type="range" min="2" max="9" value={roomSettings.hp}
                                    disabled={!isHost}
                                    onChange={(e) => handleSettingChange('hp', parseInt(e.target.value))}
                                    className="w-full accent-cyan-500 cursor-pointer h-2 bg-stone-900 rounded-lg appearance-none opacity-85 hover:opacity-100 disabled:opacity-40 transition-opacity min-h-[38px] py-2.5"
                                    style={{ touchAction: 'pan-x' }}
                                />
                            </div>

                            <div className="space-y-0.5">
                                <div className="flex justify-between items-baseline select-none">
                                    <label className="text-[8px] sm:text-[9px] uppercase font-black text-stone-400 tracking-wider">Items per Shipment</label>
                                    <span className="text-xs sm:text-sm font-black text-cyan-400">
                                        {roomSettings.itemsPerShipment === 9 ? 'RANDOM' : roomSettings.itemsPerShipment}
                                    </span>
                                </div>
                                <input
                                    type="range" min="0" max="9" value={roomSettings.itemsPerShipment}
                                    disabled={!isHost}
                                    onChange={(e) => handleSettingChange('itemsPerShipment', parseInt(e.target.value))}
                                    className="w-full accent-cyan-500 cursor-pointer h-2 bg-stone-900 rounded-lg appearance-none opacity-85 hover:opacity-100 disabled:opacity-40 transition-opacity min-h-[38px] py-2.5"
                                    style={{ touchAction: 'pan-x' }}
                                />
                            </div>
                        </div>

                        {/* Advanced Settings Switch & Reset */}
                        <div className="pt-2 border-t border-stone-900 flex items-center justify-between gap-2">
                            <div className="select-none text-left min-w-0">
                                <span className="text-[8px] sm:text-[9px] uppercase font-black text-white tracking-wider flex items-center gap-1.5">
                                    <Sliders size={12} className="text-cyan-400 shrink-0" />
                                    <span className="truncate">Advanced Config</span>
                                </span>
                                <span className="text-[7px] sm:text-[8px] text-stone-500 uppercase block mt-0.5 truncate">Custom drop weights</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                {isHost && roomSettings.isAdvanced && (
                                    <button
                                        onClick={() => {
                                            audioManager.playSound('click');
                                            onUpdateSettings({
                                                ...roomSettings,
                                                itemWeights: getMultiplayerDefaultWeights(roomPlayers.length)
                                            });
                                        }}
                                        className="px-2.5 py-2 min-h-[44px] text-[8px] sm:text-[9px] font-black tracking-widest uppercase rounded-lg border border-red-900/40 bg-red-955/20 text-red-400 hover:bg-red-900/30 hover:border-red-500/60 transition-all cursor-pointer flex items-center justify-center"
                                    >
                                        RESET
                                    </button>
                                )}
                                <button
                                    onClick={handleToggleAdvanced}
                                    className={`px-3 py-2 min-h-[44px] text-[8px] sm:text-[9px] font-black tracking-widest uppercase rounded-lg border transition-all cursor-pointer flex items-center justify-center ${
                                        roomSettings.isAdvanced 
                                            ? 'bg-cyan-950/20 text-cyan-400 border-cyan-800' 
                                            : 'bg-stone-950 text-stone-500 border-stone-850 hover:text-stone-300 hover:border-stone-700'
                                        }`}
                                >
                                    {roomSettings.isAdvanced ? 'ENABLED' : 'DISABLED'}
                                </button>
                            </div>
                        </div>

                        {/* Advanced Grid */}
                        {showAdvanced && (
                            <div className="pt-2.5 mt-2 border-t border-stone-900 grid grid-cols-2 lg:grid-cols-3 gap-1.5 sm:gap-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
                                {Object.keys(defaultWeights)
                                    .filter(item => item !== 'REMOTE')
                                    .map((item) => {
                                        const weight = itemWeights[item] !== undefined ? itemWeights[item] : defaultWeights[item];
                                        const percentage = totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : 0;
                                        return (
                                            <div key={item} className="flex flex-col gap-1 p-2 bg-stone-900/20 border border-stone-900/60 rounded-lg hover:bg-stone-900/35 transition-all">
                                                <div className="flex justify-between items-center select-none min-w-0 gap-1 text-left">
                                                    <span className="text-[7px] sm:text-[8px] font-bold text-stone-300 uppercase tracking-wider truncate block">{item.replace('_', ' ')}</span>
                                                    <span className="text-[7px] sm:text-[8px] font-mono text-cyan-400 font-bold shrink-0">
                                                        {weight === 0 ? '0%' : `${weight}(${percentage}%)`}
                                                    </span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="10"
                                                    value={weight}
                                                    disabled={!isHost}
                                                    onChange={(e) => {
                                                        const val = parseInt(e.target.value);
                                                        const currentWeights = roomSettings.itemWeights || defaultWeights;
                                                        onUpdateSettings({
                                                            ...roomSettings,
                                                            itemWeights: {
                                                                ...currentWeights,
                                                                [item]: val
                                                            }
                                                        });
                                                    }}
                                                    className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-stone-950 rounded-lg appearance-none opacity-80 hover:opacity-100 transition-opacity min-h-[38px] py-2"
                                                    style={{ touchAction: 'pan-x' }}
                                                />
                                            </div>
                                        );
                                    })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Players Column */}
                <div className="flex-1 md:w-1/2 md:overflow-y-auto pr-0.5 custom-scrollbar min-w-0 gpu-accelerated lobby-players-column bg-stone-900/20 border border-stone-850/60 rounded-xl p-2.5">
                    <h2 className="text-[9px] sm:text-[10px] font-black text-stone-400 uppercase flex items-center gap-2 select-none border-b border-stone-900 pb-1.5 mb-2 tracking-widest">
                        <Users size={10} /> Registered Agents
                    </h2>

                    <div className="space-y-2">
                        {roomPlayers.map((player: any) => {
                            const isMe = player.id === playerId;
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
                                    className="p-2 sm:p-2.5 bg-stone-900/25 border border-stone-900/80 rounded-xl flex items-center justify-between group hover:bg-stone-900/45 hover:border-stone-800 transition-all gap-2"
                                    style={{ borderLeftColor: player.color, borderLeftWidth: '4px' }}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                        <div
                                            className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden bg-stone-950 border shrink-0 flex items-center justify-center p-0.5 shadow-sm group-hover:scale-105 transition-transform"
                                            style={{ borderColor: player.color ? `${player.color}90` : '#3f3f46' }}
                                        >
                                            <img
                                                src={avatarUrl}
                                                alt={player.name}
                                                className="w-full h-full object-contain rounded-lg"
                                                loading="lazy"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).src = '/image/favicon/android-chrome-192x192.png';
                                                }}
                                            />
                                            {/* Online status indicator beacon */}
                                            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border border-stone-950 ring-1 ring-emerald-400/50 animate-pulse" />
                                        </div>
                                        <div className="flex flex-col min-w-0 text-left flex-1 pr-1">
                                            <div className="flex flex-wrap items-center gap-1 min-w-0">
                                                <span className="font-black uppercase tracking-wide text-xs text-stone-200 truncate">{player.name}</span>
                                                <div className="flex gap-0.5 shrink-0 flex-wrap items-center">
                                                    {player.id === room.hostId && (
                                                        <span className="text-[7px] bg-amber-955/30 text-amber-400 px-1 py-0.5 rounded border border-amber-800/50 font-black tracking-widest flex items-center gap-0.5 shadow-[0_0_8px_rgba(245,158,11,0.2)]">
                                                            <Crown size={8} className="text-amber-400" />
                                                            HOST
                                                        </span>
                                                    )}
                                                    {player.name?.toLowerCase() === 'aadish' && (
                                                        <span className="text-[7px] bg-red-955/30 text-red-400 px-1 py-0.5 rounded border border-red-800/50 font-black tracking-widest">
                                                            DEV
                                                        </span>
                                                    )}
                                                    {isMe && (
                                                        <span className="text-[7px] bg-cyan-950/30 text-cyan-400 px-1 py-0.5 rounded border border-cyan-800/50 font-black tracking-widest">
                                                            YOU
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[7px] sm:text-[8px] text-stone-500 font-mono select-none">ID: {player.id.slice(0, 4).toUpperCase()}</span>
                                                <span className="text-[7px] sm:text-[8px] text-stone-600">•</span>
                                                <span className="text-[7px] sm:text-[8px] text-emerald-400/80 font-mono flex items-center gap-0.5">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-ping" />
                                                    24ms
                                                </span>
                                            </div>
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
                                                className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center bg-stone-900/80 hover:bg-cyan-950/40 border border-stone-800 hover:border-cyan-500/50 rounded-xl text-stone-400 hover:text-cyan-300 transition-all cursor-pointer shadow-sm active:scale-95"
                                                title={`Direct Message ${player.name}`}
                                                aria-label={`Direct Message ${player.name}`}
                                            >
                                                <MessageSquare size={14} />
                                            </button>
                                        )}
                                        {isHost && player.id !== playerId && (
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
                                                className="px-3 py-2 min-h-[44px] bg-red-955/20 hover:bg-red-900/30 border border-red-900/40 hover:border-red-500/60 text-red-400 hover:text-white text-[8px] sm:text-[9px] font-black tracking-widest uppercase rounded-xl transition-all active:scale-95 cursor-pointer shadow-sm flex items-center justify-center"
                                            >
                                                KICK
                                            </button>
                                        )}
                                        {player.ready ? (
                                            <div className="flex items-center gap-1 bg-emerald-950/20 border border-emerald-900/40 px-2 py-1 min-h-[36px] rounded-lg text-emerald-400 text-[8px] sm:text-[9px] font-black select-none">
                                                <CheckCircle2 size={11} className="text-emerald-500 animate-pulse shrink-0" />
                                                <span>READY</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1 bg-stone-900 border border-stone-850 px-2 py-1 min-h-[36px] rounded-lg text-stone-550 text-[8px] sm:text-[9px] font-black select-none">
                                                <XCircle size={11} className="text-stone-750 shrink-0" />
                                                <span>WAITING</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {[...Array(Math.max(0, (room?.settings?.maxPlayers || room?.maxPlayers || 4) - roomPlayers.length))].map((_, i) => (
                            <div key={`empty-${i}`} className="p-2.5 sm:p-4 bg-stone-950 border border-dashed border-stone-900 rounded-lg flex items-center justify-center select-none min-h-[48px]">
                                <span className="text-[8px] sm:text-[9px] text-stone-750 uppercase font-bold tracking-[0.3em] flex items-center gap-1.5">
                                    <ShieldAlert size={11} className="text-stone-800 animate-pulse shrink-0" />
                                    WAITING FOR NODES...
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Bottom Actions */}
            <div
                className="p-2 sm:p-4 border-t border-stone-900 bg-stone-950/80 select-none keyboard-aware-bottom shrink-0"
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
                        className={`flex-1 h-11 sm:h-12 min-h-[44px] border font-black uppercase text-[9.5px] sm:text-xs tracking-[0.12em] rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer px-2 ${
                            isReady 
                                ? 'bg-emerald-600 text-black hover:bg-emerald-500 border-emerald-500' 
                                : 'bg-transparent text-amber-500 border-amber-900 hover:text-amber-400 hover:border-amber-500 hover:bg-amber-950/10'
                        }`}
                    >
                        {isReady ? <CheckCircle2 size={15} className="shrink-0" /> : <XCircle size={15} className="shrink-0" />}
                        <span className="truncate">{isReady ? 'READY' : 'STAND BY'}</span>
                    </button>

                    {isHost && (
                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                onStartGame();
                            }}
                            disabled={roomPlayers.length < 2 || !roomPlayers.every((p: any) => p?.ready)}
                            className="flex-1 h-11 sm:h-12 min-h-[44px] bg-red-600 hover:bg-red-500 disabled:bg-stone-900 disabled:border-stone-850 disabled:text-stone-600 text-white font-black uppercase text-[9.5px] sm:text-xs tracking-[0.12em] rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer shadow-[0_0_30px_rgba(220,38,38,0.15)] border border-red-600 disabled:shadow-none px-2"
                        >
                            <Play size={15} fill="currentColor" className="shrink-0" />
                            <span className="truncate">LAUNCH</span>
                        </button>
                    )}
                </div>
                
                {/* Status Notice */}
                <p className="mt-1.5 sm:mt-2 text-center text-[7.5px] sm:text-[9px] text-stone-500 font-bold uppercase tracking-[0.2em] animate-pulse truncate">
                    {roomPlayers.length < 2 ? 'MINIMUM 2 NODES REQUIRED' :
                        !roomPlayers.every((p: any) => p?.ready) ? 'WAITING ON NODE SYNC...' : 'LOBBY READY // LAUNCH AUTHORIZED'}
                </p>
            </div>

            {/* In-Lobby Comms & Messaging Popup Modal */}
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
