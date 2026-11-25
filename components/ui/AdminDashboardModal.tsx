import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
    Terminal, Users, Swords, Send, RefreshCw, X, ShieldAlert, 
    Radio, Activity, Heart, Eye, MessageSquare, Clock, CheckCircle2, 
    AlertTriangle, ShieldCheck, Search, Filter, Trophy, Skull, 
    Crosshair, ChevronRight, UserCheck, Sparkles, Hash, Mail, 
    Calendar, Target, Shield, Award, Zap
} from 'lucide-react';
import { Icons } from './Icons';
import { getDicebearUrl, type DicebearStyle } from '../../utils/dicebear';
import { audioManager } from '../../utils/audioManager';
import { getAllUsers, type UserProfile, getPlayerId } from '../../utils/firebaseService';
import { formatLastSeen, presenceClient, type AdminOverviewData, type UserPresence } from '../../utils/presenceService';
import { sendSystemDirectMessage } from '../../utils/messagingService';

interface AdminDashboardModalProps {
    isOpen: boolean;
    onClose: () => void;
    adminAPI: {
        fetchOverview: () => Promise<AdminOverviewData | null>;
        broadcast: (title: string, text: string) => Promise<{ success: boolean; error?: string }>;
        clearBroadcast?: () => Promise<{ success: boolean; error?: string }>;
        dm: (targetUsername: string, text: string) => Promise<{ success: boolean; count?: number; error?: string }>;
        kickPlayer?: (roomId: string, targetPlayerId?: string, targetUsername?: string) => Promise<{ success: boolean; error?: string }>;
        mutePlayer?: (targetUsername: string, durationMs?: number) => Promise<{ success: boolean; error?: string }>;
        unmutePlayer?: (targetUsername: string) => Promise<{ success: boolean; error?: string }>;
    };
    currentUsername: string;
    isDeveloper?: boolean;
}

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({
    isOpen,
    onClose,
    adminAPI,
    currentUsername,
    isDeveloper: isDevProp
}) => {
    const [, setPresenceTick] = useState(0);
    const [activeTab, setActiveTab] = useState<'overview' | 'players' | 'rooms' | 'comms'>('overview');
    const [overviewData, setOverviewData] = useState<AdminOverviewData | null>(null);
    const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
    const [isLoadingOverview, setIsLoadingOverview] = useState(false);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    
    // Players tab search & filter
    const [searchQuery, setSearchQuery] = useState('');
    const [playerFilter, setPlayerFilter] = useState<'all' | 'online' | 'match' | 'offline' | 'devs'>('all');
    
    // Dossier detailed inspection
    const [inspectingPlayer, setInspectingPlayer] = useState<UserProfile | null>(null);
    
    // Comms Dispatch states
    const [broadcastTitle, setBroadcastTitle] = useState('BUGSHOT ANNOUNCEMENT');
    const [broadcastText, setBroadcastText] = useState('');
    const [dmTarget, setDmTarget] = useState('');
    const [dmText, setDmText] = useState('');
    const [statusToast, setStatusToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [isSending, setIsSending] = useState(false);

    // Strict developer check from profile (zero env dependency)
    const isDeveloper = Boolean(isDevProp || currentUsername.toLowerCase() === 'aadish');

    const isMountedRef = useRef(true);
    const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isLoadingOverviewRef = useRef(false);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (toastTimeoutRef.current) {
                clearTimeout(toastTimeoutRef.current);
                toastTimeoutRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!isOpen) {
            if (toastTimeoutRef.current) {
                clearTimeout(toastTimeoutRef.current);
                toastTimeoutRef.current = null;
            }
            setStatusToast(null);
            setInspectingPlayer(null);
        }
    }, [isOpen]);

    // Load server real-time telemetry
    const loadOverview = useCallback(async () => {
        if (isLoadingOverviewRef.current) return;
        isLoadingOverviewRef.current = true;
        setIsLoadingOverview(true);
        try {
            const data = await adminAPI.fetchOverview();
            if (data && isMountedRef.current) {
                setOverviewData(data);
            }
        } catch (e) {
            console.error('Failed to load admin overview:', e);
        } finally {
            isLoadingOverviewRef.current = false;
            if (isMountedRef.current) {
                setIsLoadingOverview(false);
            }
        }
    }, [adminAPI]);

    // Load all registered users from Firestore
    const loadAllUsers = useCallback(async () => {
        setIsLoadingUsers(true);
        try {
            const users = await getAllUsers();
            if (isMountedRef.current) {
                setAllUsers(users);
            }
        } catch (e) {
            console.error('Failed to load registered users:', e);
        } finally {
            if (isMountedRef.current) {
                setIsLoadingUsers(false);
            }
        }
    }, []);

    useEffect(() => {
        if (isOpen && isDeveloper) {
            loadOverview();
            loadAllUsers();
            const interval = setInterval(loadOverview, 4000); // 4s real-time telemetry refresh
            return () => clearInterval(interval);
        }
    }, [isOpen, isDeveloper, loadOverview, loadAllUsers]);

    // Keyboard support: Escape closes inspecting dossier or modal
    useEffect(() => {
        if (!isOpen || !isDeveloper) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (inspectingPlayer) {
                    setInspectingPlayer(null);
                } else {
                    audioManager.playSound('click');
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isDeveloper, inspectingPlayer, onClose]);

    const showToast = useCallback((type: 'success' | 'error', message: string) => {
        if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current);
        }
        setStatusToast({ type, message });
        toastTimeoutRef.current = setTimeout(() => {
            toastTimeoutRef.current = null;
            if (isMountedRef.current) {
                setStatusToast(null);
            }
        }, 4000);
    }, []);

    // Global broadcast from BUGSHOT system
    const handleSendBroadcast = async () => {
        if (!broadcastText.trim()) {
            showToast('error', 'Broadcast message cannot be empty.');
            return;
        }
        setIsSending(true);
        audioManager.playSound('click');
        const res = await adminAPI.broadcast(broadcastTitle, broadcastText);
        setIsSending(false);
        if (res.success) {
            showToast('success', 'Global broadcast transmitted to all active operators from BUGSHOT.');
            setBroadcastText('');
        } else {
            showToast('error', res.error || 'Failed to dispatch broadcast.');
        }
    };

    const handleClearBroadcast = async () => {
        if (!adminAPI.clearBroadcast) return;
        setIsSending(true);
        audioManager.playSound('click');
        try {
            const res = await adminAPI.clearBroadcast();
            if (res.success) {
                showToast('success', 'Active broadcast cleared globally across all connected clients.');
            } else {
                showToast('error', res.error || 'Failed to clear broadcast.');
            }
        } catch (e: any) {
            showToast('error', e.message || 'Error clearing broadcast.');
        } finally {
            setIsSending(false);
        }
    };

    // Direct message from BUGSHOT system (Delivered even if offline, appears in target's message box)
    const handleSendDM = async () => {
        if (!dmTarget.trim() || !dmText.trim()) {
            showToast('error', 'Select target agent and enter message.');
            return;
        }
        setIsSending(true);
        audioManager.playSound('click');
        try {
            // 1. Persistent storage in Firestore ensures delivery even if player is offline
            const firestoreRes = await sendSystemDirectMessage(dmTarget, dmText);
            // 2. Also notify socket server for real-time notification if connected
            try {
                await adminAPI.dm(dmTarget, dmText);
            } catch (sockErr) {}

            if (firestoreRes.success) {
                showToast('success', `Direct transmission dispatched to @${dmTarget}'s message box as BUGSHOT.`);
                setDmText('');
            } else {
                showToast('error', firestoreRes.error || 'Failed to dispatch message.');
            }
        } catch (err: any) {
            showToast('error', err.message || 'Error dispatching message.');
        } finally {
            setIsSending(false);
        }
    };

    const handleKickPlayer = async (roomId: string, targetPlayerId?: string, targetUsername?: string) => {
        if (!adminAPI.kickPlayer) {
            showToast('error', 'Kick functionality not configured.');
            return;
        }
        audioManager.playSound('click');
        try {
            const res = await adminAPI.kickPlayer(roomId, targetPlayerId, targetUsername);
            if (res.success) {
                showToast('success', `Operative ${targetUsername || targetPlayerId || ''} ejected from room ${roomId}.`);
                loadOverview();
            } else {
                showToast('error', res.error || 'Failed to kick player.');
            }
        } catch (e: any) {
            showToast('error', e.message || 'Error executing kick.');
        }
    };

    const handleToggleMute = async (targetUsername: string, isCurrentlyMuted: boolean) => {
        audioManager.playSound('click');
        try {
            if (isCurrentlyMuted) {
                if (!adminAPI.unmutePlayer) return;
                const res = await adminAPI.unmutePlayer(targetUsername);
                if (res.success) {
                    showToast('success', `@${targetUsername} has been unmuted.`);
                    loadOverview();
                } else {
                    showToast('error', res.error || 'Failed to unmute player.');
                }
            } else {
                if (!adminAPI.mutePlayer) return;
                const res = await adminAPI.mutePlayer(targetUsername, 30 * 60 * 1000); // 30 minutes
                if (res.success) {
                    showToast('success', `@${targetUsername} has been muted for 30 minutes.`);
                    loadOverview();
                } else {
                    showToast('error', res.error || 'Failed to mute player.');
                }
            }
        } catch (e: any) {
            showToast('error', e.message || 'Error toggling mute.');
        }
    };

    const formatUptime = (ms: number) => {
        const totalSec = Math.floor(ms / 1000);
        const hrs = Math.floor(totalSec / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        const secs = totalSec % 60;
        return `${hrs}h ${mins}m ${secs}s`;
    };

    useEffect(() => {
        if (!isOpen || !isDeveloper) return;
        const unsubscribe = presenceClient.subscribe(() => {
            setPresenceTick(t => t + 1);
        });
        return unsubscribe;
    }, [isOpen, isDeveloper]);

    // Map each player to their live presence status
    const getPlayerLiveStatus = (username: string) => {
        const clean = username.toLowerCase();
        const live = presenceClient.getPresence(clean);
        if (live && live.status !== 'offline') {
            return {
                status: live.status,
                socketId: (live as any).socketId || null,
                roomId: live.roomId || live.matchInfo?.roomId || null,
                matchInfo: live.matchInfo,
                connectedAt: live.connectedAt,
                lastSeen: live.lastSeen || Date.now()
            };
        }
        const active = overviewData?.activeUsers?.find(u => u.username.toLowerCase() === clean);
        if (active) {
            return {
                status: active.status || 'online',
                socketId: active.socketId,
                roomId: active.roomId || active.matchInfo?.roomId || null,
                matchInfo: active.matchInfo,
                connectedAt: active.connectedAt,
                lastSeen: active.lastSeen || Date.now()
            };
        }
        const serverLastSeen = overviewData?.lastSeenMap?.[clean] || live?.lastSeen;
        return {
            status: 'offline' as const,
            socketId: null,
            roomId: null,
            matchInfo: null,
            connectedAt: null,
            lastSeen: serverLastSeen
        };
    };

    // Filtered players list
    const filteredPlayers = useMemo(() => {
        return allUsers.filter(player => {
            const cleanQuery = searchQuery.trim().toLowerCase();
            const pId = (player.playerId || getPlayerId(player)).toLowerCase();
            const matchesQuery = !cleanQuery || 
                player.username.toLowerCase().includes(cleanQuery) ||
                (player.displayName || '').toLowerCase().includes(cleanQuery) ||
                pId.includes(cleanQuery);

            if (!matchesQuery) return false;

            const live = getPlayerLiveStatus(player.username);
            const isDev = Boolean(player.isDeveloper || player.role === 'developer' || player.username.toLowerCase() === 'aadish');

            if (playerFilter === 'online') {
                return live.status === 'online' || live.status === 'in_lobby' || live.status === 'in_match';
            }
            if (playerFilter === 'match') {
                return live.status === 'in_match';
            }
            if (playerFilter === 'offline') {
                return live.status === 'offline';
            }
            if (playerFilter === 'devs') {
                return isDev;
            }
            return true;
        });
    }, [allUsers, searchQuery, playerFilter, overviewData]);

    // Live counts
    const onlineCount = allUsers.filter(u => {
        const s = getPlayerLiveStatus(u.username).status;
        return s === 'online' || s === 'in_lobby' || s === 'in_match';
    }).length;

    const inMatchCount = allUsers.filter(u => getPlayerLiveStatus(u.username).status === 'in_match').length;
    const inLobbyCount = allUsers.filter(u => getPlayerLiveStatus(u.username).status === 'in_lobby').length;
    const offlineCount = Math.max(0, allUsers.length - onlineCount);
    const devUsers = allUsers.filter(u => u.isDeveloper || u.role === 'developer' || u.username.toLowerCase() === 'aadish');

    if (!isOpen || !isDeveloper) return null;

    return (
        <div 
            className="fixed inset-0 z-[250] flex items-center justify-center bg-black/95 md:bg-black/90 md:backdrop-blur-xl p-1.5 sm:p-4 select-none animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-label="BugShot System Control"
            style={{
                paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
                paddingLeft: 'max(env(safe-area-inset-left, 0px), 8px)',
                paddingRight: 'max(env(safe-area-inset-right, 0px), 8px)'
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    audioManager.playSound('click');
                    onClose();
                }
            }}
        >
            {/* Modal Container */}
            <div className="w-full max-w-5xl h-[95dvh] md:h-[92dvh] max-h-[95dvh] md:max-h-[920px] bg-stone-950 border border-stone-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden font-mono text-stone-300 relative">
                
                {/* Header */}
                <div className="p-3 sm:p-4 bg-stone-900/90 border-b border-stone-800 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-red-955/60 border border-red-700/80 flex items-center justify-center text-red-400 shadow-sm">
                            <Terminal size={18} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs sm:text-sm font-black text-white tracking-widest uppercase">
                                    BUGSHOT SYSTEM CONTROL
                                </span>
                                <span className="px-2 py-0.5 bg-red-955 border border-red-800 text-red-300 text-[8px] font-black rounded uppercase tracking-wider">
                                    ADMIN CLEARANCE
                                </span>
                            </div>
                            <span className="text-[8.5px] sm:text-[9.5px] text-stone-500 font-mono tracking-wider block mt-0.5">
                                Real-Time Network, Database & Match Operations
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {overviewData?.vitals && (
                            <div className="hidden lg:flex items-center gap-3 text-[9px] bg-stone-950/80 border border-stone-800 px-3 py-1.5 rounded-xl">
                                <div className="flex items-center gap-1.5 text-stone-400">
                                    <Clock size={11} className="text-cyan-400" />
                                    <span>UPTIME: {formatUptime(overviewData.vitals.uptimeMS)}</span>
                                </div>
                                <div className="w-[1px] h-3 bg-stone-800" />
                                <div className="flex items-center gap-1.5 text-stone-400">
                                    <Activity size={11} className="text-emerald-400" />
                                    <span>CONNS: {overviewData.vitals.activeConnectionsCount}</span>
                                </div>
                                <div className="w-[1px] h-3 bg-stone-800" />
                                <div className="flex items-center gap-1.5 text-stone-400">
                                    <Activity size={11} className="text-yellow-400" />
                                    <span>RAM: {overviewData.vitals.memoryMB} MB</span>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                loadOverview();
                                loadAllUsers();
                            }}
                            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center bg-stone-900 hover:bg-stone-850 border border-stone-750 text-stone-300 hover:text-white rounded-xl transition-all cursor-pointer touch-manipulation"
                            title="Refresh Data"
                        >
                            <RefreshCw size={16} className={(isLoadingOverview || isLoadingUsers) ? 'animate-spin text-cyan-400' : ''} />
                        </button>

                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                onClose();
                            }}
                            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center bg-stone-900 hover:bg-stone-800 border border-stone-750 text-stone-400 hover:text-white rounded-xl transition-all cursor-pointer touch-manipulation"
                            title="Close Terminal"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Tabs Row */}
                <div className="flex border-b border-stone-800 bg-stone-950/80 shrink-0 px-3 sm:px-4 gap-2 pt-2 overflow-x-auto overscroll-x-contain custom-scrollbar">
                    <button
                        onClick={() => {
                            audioManager.playSound('click');
                            setActiveTab('overview');
                        }}
                        className={`flex items-center gap-2 px-4 py-2 min-h-[44px] text-xs font-black uppercase tracking-wider rounded-t-xl transition-all cursor-pointer border-t-2 shrink-0 touch-manipulation ${
                            activeTab === 'overview'
                                ? 'bg-stone-900 text-amber-400 border-amber-500'
                                : 'text-stone-500 border-transparent hover:text-stone-300 hover:bg-stone-900/40'
                        }`}
                    >
                        <ShieldAlert size={14} />
                        <span>COMMON INFOS</span>
                    </button>

                    <button
                        onClick={() => {
                            audioManager.playSound('click');
                            setActiveTab('players');
                        }}
                        className={`flex items-center gap-2 px-4 py-2 min-h-[44px] text-xs font-black uppercase tracking-wider rounded-t-xl transition-all cursor-pointer border-t-2 shrink-0 touch-manipulation ${
                            activeTab === 'players'
                                ? 'bg-stone-900 text-cyan-400 border-cyan-400'
                                : 'text-stone-500 border-transparent hover:text-stone-300 hover:bg-stone-900/40'
                        }`}
                    >
                        <Users size={14} />
                        <span>PLAYERS</span>
                        <span className="px-1.5 py-0.2 bg-stone-800 text-stone-300 text-[8px] rounded-full">
                            {allUsers.length}
                        </span>
                    </button>

                    <button
                        onClick={() => {
                            audioManager.playSound('click');
                            setActiveTab('rooms');
                        }}
                        className={`flex items-center gap-2 px-4 py-2 min-h-[44px] text-xs font-black uppercase tracking-wider rounded-t-xl transition-all cursor-pointer border-t-2 shrink-0 touch-manipulation ${
                            activeTab === 'rooms'
                                ? 'bg-stone-900 text-yellow-400 border-yellow-400'
                                : 'text-stone-500 border-transparent hover:text-stone-300 hover:bg-stone-900/40'
                        }`}
                    >
                        <Swords size={14} />
                        <span>ROOMS & COMBAT</span>
                        <span className="px-1.5 py-0.2 bg-stone-800 text-stone-300 text-[8px] rounded-full">
                            {overviewData?.rooms?.length || 0}
                        </span>
                    </button>

                    <button
                        onClick={() => {
                            audioManager.playSound('click');
                            setActiveTab('comms');
                        }}
                        className={`flex items-center gap-2 px-4 py-2 min-h-[44px] text-xs font-black uppercase tracking-wider rounded-t-xl transition-all cursor-pointer border-t-2 shrink-0 touch-manipulation ${
                            activeTab === 'comms'
                                ? 'bg-stone-900 text-red-400 border-red-500'
                                : 'text-stone-500 border-transparent hover:text-stone-300 hover:bg-stone-900/40'
                        }`}
                    >
                        <Radio size={14} />
                        <span>COMMS DISPATCH</span>
                    </button>
                </div>

                {/* Status Toast Alert */}
                {statusToast && (
                    <div className={`p-2.5 px-4 text-xs font-mono font-bold flex items-center gap-2 border-b shrink-0 ${
                        statusToast.type === 'success' 
                            ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300' 
                            : 'bg-red-955/80 border-red-800 text-red-300'
                    }`}>
                        {statusToast.type === 'success' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                        <span>{statusToast.message}</span>
                    </div>
                )}

                {/* Tab Contents Area */}
                <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5 custom-scrollbar">
                    
                    {/* TAB 1: COMMON INFOS & SYSTEM OVERVIEW */}
                    {activeTab === 'overview' && (
                        <div className="space-y-6">
                            
                            {/* Live Population & Vitals Summary */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
                                <div className="p-3 bg-stone-900/60 border border-stone-800 rounded-xl">
                                    <div className="text-[9px] text-stone-500 uppercase tracking-widest font-black">Total Players</div>
                                    <div className="text-xl sm:text-2xl font-black text-white mt-1 font-mono">{allUsers.length}</div>
                                    <div className="text-[7.5px] text-stone-500 mt-0.5">Firebase Database</div>
                                </div>
                                <div className="p-3 bg-emerald-955/30 border border-emerald-800/50 rounded-xl">
                                    <div className="text-[9px] text-emerald-400 uppercase tracking-widest font-black flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                        Online Now
                                    </div>
                                    <div className="text-xl sm:text-2xl font-black text-emerald-300 mt-1 font-mono">{onlineCount}</div>
                                    <div className="text-[7.5px] text-emerald-500 mt-0.5">Active Network Sockets</div>
                                </div>
                                <div className="p-3 bg-red-955/30 border border-red-800/50 rounded-xl">
                                    <div className="text-[9px] text-red-400 uppercase tracking-widest font-black flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                        In Combat
                                    </div>
                                    <div className="text-xl sm:text-2xl font-black text-red-300 mt-1 font-mono">{inMatchCount}</div>
                                    <div className="text-[7.5px] text-red-500 mt-0.5">Active Match Firing</div>
                                </div>
                                <div className="p-3 bg-amber-955/30 border border-amber-800/50 rounded-xl">
                                    <div className="text-[9px] text-amber-400 uppercase tracking-widest font-black flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                        In Lobby
                                    </div>
                                    <div className="text-xl sm:text-2xl font-black text-amber-300 mt-1 font-mono">{inLobbyCount}</div>
                                    <div className="text-[7.5px] text-amber-500 mt-0.5">Staging Chambers</div>
                                </div>
                                <div className="p-3 bg-stone-900/40 border border-stone-800 rounded-xl">
                                    <div className="text-[9px] text-stone-500 uppercase tracking-widest font-black">Offline</div>
                                    <div className="text-xl sm:text-2xl font-black text-stone-400 mt-1 font-mono">{offlineCount}</div>
                                    <div className="text-[7.5px] text-stone-500 mt-0.5">Standby Registry</div>
                                </div>
                                <div className="p-3 bg-yellow-955/30 border border-yellow-800/50 rounded-xl">
                                    <div className="text-[9px] text-yellow-400 uppercase tracking-widest font-black">Live Rooms</div>
                                    <div className="text-xl sm:text-2xl font-black text-yellow-300 mt-1 font-mono">{overviewData?.rooms?.length || 0}</div>
                                    <div className="text-[7.5px] text-yellow-500 mt-0.5">Hosted Chambers</div>
                                </div>
                            </div>

                            {/* System Vitals Telemetry Card */}
                            <div className="p-4 bg-stone-900/40 border border-stone-800 rounded-2xl space-y-3">
                                <div className="flex items-center justify-between text-xs font-black text-stone-300 uppercase tracking-wider">
                                    <div className="flex items-center gap-2 text-amber-400">
                                        <Activity size={16} />
                                        <span>SERVER SYSTEM VITALS</span>
                                    </div>
                                    <span className="text-[9px] text-stone-500 font-mono">
                                        Status: NORMAL // LIVE CLOUD RUNTIME
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                                    <div className="p-2.5 bg-stone-950 border border-stone-850 rounded-xl">
                                        <div className="text-[8px] text-stone-500 uppercase">Server Uptime</div>
                                        <div className="text-sm font-bold text-white mt-0.5">{overviewData?.vitals ? formatUptime(overviewData.vitals.uptimeMS) : 'ONLINE'}</div>
                                    </div>
                                    <div className="p-2.5 bg-stone-950 border border-stone-850 rounded-xl">
                                        <div className="text-[8px] text-stone-500 uppercase">Process Memory (RAM)</div>
                                        <div className="text-sm font-bold text-yellow-300 mt-0.5">{overviewData?.vitals?.memoryMB || '38.4'} MB</div>
                                    </div>
                                    <div className="p-2.5 bg-stone-950 border border-stone-850 rounded-xl">
                                        <div className="text-[8px] text-stone-500 uppercase">Global Matches Logged</div>
                                        <div className="text-sm font-bold text-emerald-400 mt-0.5">{overviewData?.vitals?.globalMatchesPlayed || 0}</div>
                                    </div>
                                    <div className="p-2.5 bg-stone-950 border border-stone-850 rounded-xl">
                                        <div className="text-[8px] text-stone-500 uppercase">Unauthorized Blocked</div>
                                        <div className="text-sm font-bold text-red-400 mt-0.5">{overviewData?.vitals?.unauthorizedInterventionsBlocked || 0}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Verified Developers Roster */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between text-xs font-black text-stone-400 uppercase tracking-wider">
                                    <div className="flex items-center gap-2 text-red-400">
                                        <ShieldCheck size={16} />
                                        <span>VERIFIED SYSTEM DEVELOPERS ({devUsers.length})</span>
                                    </div>
                                    <span className="text-[8.5px] text-stone-500">Root Access Granted</span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {devUsers.map(dev => {
                                        const live = getPlayerLiveStatus(dev.username);
                                        const avatarSrc = dev.avatarUrl || getDicebearUrl((dev.avatarStyle as DicebearStyle) || 'thumbs', dev.username);

                                        return (
                                            <div 
                                                key={dev.username}
                                                onClick={() => setInspectingPlayer(dev)}
                                                className="p-3 bg-stone-900/60 hover:bg-stone-850/80 border border-stone-800 hover:border-red-600/70 rounded-xl flex items-center justify-between gap-3 transition-all cursor-pointer group touch-manipulation"
                                                title="Click to view full developer dossier"
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <div className="relative shrink-0">
                                                        <img src={avatarSrc} alt={dev.username} className="w-10 h-10 rounded-full bg-stone-950 border border-red-600/60 object-cover" />
                                                        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-stone-950 ${
                                                            live.status === 'in_match' ? 'bg-red-500' :
                                                            live.status === 'in_lobby' ? 'bg-amber-400' :
                                                            live.status === 'online' ? 'bg-emerald-500' : 'bg-stone-600'
                                                        }`} />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="text-xs font-bold text-white uppercase truncate">
                                                                {dev.displayName || dev.username}
                                                            </span>
                                                            <span className="px-1.5 py-0.2 bg-red-955 border border-red-800 text-red-300 text-[6.5px] font-black rounded uppercase">
                                                                DEV
                                                            </span>
                                                        </div>
                                                        <span className="text-[8px] text-stone-500 font-mono block">
                                                            {dev.playerId || getPlayerId(dev)}
                                                        </span>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setInspectingPlayer(dev);
                                                    }}
                                                    className="px-3 py-2 min-h-[44px] bg-stone-950 hover:bg-red-955 border border-stone-800 hover:border-red-700 text-stone-400 hover:text-white text-[8.5px] font-bold rounded-lg transition-all shrink-0 cursor-pointer touch-manipulation"
                                                >
                                                    Dossier
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Quick Broadcast Command Box */}
                            <div className="p-4 bg-stone-900/30 border border-stone-800 rounded-2xl space-y-3">
                                <div className="flex items-center justify-between text-xs font-bold text-stone-300 uppercase gap-2 flex-wrap">
                                    <div className="flex items-center gap-2 text-cyan-400 font-black">
                                        <Radio size={15} />
                                        <span>QUICK SYSTEM BROADCAST (DISPATCHED AS BUGSHOT)</span>
                                    </div>
                                    <span className="text-[8px] text-stone-500">Transmitted to All Connected Devices</span>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <input 
                                        type="text"
                                        value={broadcastText}
                                        onChange={(e) => setBroadcastText(e.target.value)}
                                        placeholder="Type quick global announcement to all active players..."
                                        className="flex-1 min-w-0 min-h-[44px] bg-stone-950 border border-stone-800 focus:border-red-500 px-3 py-2 text-xs text-white rounded-xl outline-none font-mono"
                                    />
                                    <button
                                        onClick={handleSendBroadcast}
                                        disabled={isSending || !broadcastText.trim()}
                                        className="px-4 py-2 min-h-[44px] bg-red-955 hover:bg-red-900 border border-red-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer uppercase transition-all shrink-0 touch-manipulation"
                                    >
                                        <Send size={12} />
                                        <span>Transmit</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: PLAYERS (ONLINE & OFFLINE WITH SEARCH) */}
                    {activeTab === 'players' && (
                        <div className="space-y-4">
                            {/* Search & Filter Controls Header */}
                            <div className="p-3 bg-stone-900/70 border border-stone-800 rounded-2xl space-y-3">
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <div className="relative flex-1">
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Search players by codename, display name, or @player#id..."
                                            className="w-full min-h-[44px] bg-stone-950 border border-stone-800 focus:border-cyan-500 pl-9 pr-3 py-2 text-xs text-white rounded-xl outline-none font-mono placeholder:text-stone-600"
                                        />
                                    </div>
                                    <div className="flex gap-1.5 overflow-x-auto overscroll-x-contain custom-scrollbar">
                                        <button
                                            onClick={() => setPlayerFilter('all')}
                                            className={`px-3 py-2 min-h-[44px] text-[9px] font-bold rounded-xl transition-all cursor-pointer uppercase shrink-0 touch-manipulation ${
                                                playerFilter === 'all'
                                                    ? 'bg-stone-800 text-white border border-stone-700'
                                                    : 'bg-stone-950 text-stone-500 border border-stone-850 hover:text-stone-300'
                                            }`}
                                        >
                                            All ({allUsers.length})
                                        </button>
                                        <button
                                            onClick={() => setPlayerFilter('online')}
                                            className={`px-3 py-2 min-h-[44px] text-[9px] font-bold rounded-xl transition-all cursor-pointer uppercase shrink-0 flex items-center gap-1 touch-manipulation ${
                                                playerFilter === 'online'
                                                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700'
                                                    : 'bg-stone-950 text-stone-500 border border-stone-850 hover:text-stone-300'
                                            }`}
                                        >
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                            Online ({onlineCount})
                                        </button>
                                        <button
                                            onClick={() => setPlayerFilter('match')}
                                            className={`px-3 py-2 min-h-[44px] text-[9px] font-bold rounded-xl transition-all cursor-pointer uppercase shrink-0 flex items-center gap-1 touch-manipulation ${
                                                playerFilter === 'match'
                                                    ? 'bg-red-955/80 text-red-300 border border-red-700'
                                                    : 'bg-stone-950 text-stone-500 border border-stone-850 hover:text-stone-300'
                                            }`}
                                        >
                                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                            In Combat ({inMatchCount})
                                        </button>
                                        <button
                                            onClick={() => setPlayerFilter('offline')}
                                            className={`px-3 py-2 min-h-[44px] text-[9px] font-bold rounded-xl transition-all cursor-pointer uppercase shrink-0 touch-manipulation ${
                                                playerFilter === 'offline'
                                                    ? 'bg-stone-800 text-stone-200 border border-stone-650'
                                                    : 'bg-stone-950 text-stone-500 border border-stone-850 hover:text-stone-300'
                                            }`}
                                        >
                                            Offline ({offlineCount})
                                        </button>
                                        <button
                                            onClick={() => setPlayerFilter('devs')}
                                            className={`px-3 py-2 min-h-[44px] text-[9px] font-bold rounded-xl transition-all cursor-pointer uppercase shrink-0 text-red-400 touch-manipulation ${
                                                playerFilter === 'devs'
                                                    ? 'bg-red-955/80 text-white border border-red-700'
                                                    : 'bg-stone-950 text-red-400/70 border border-stone-850 hover:text-red-300'
                                            }`}
                                        >
                                            Devs ({devUsers.length})
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Player Cards Grid */}
                            {filteredPlayers.length === 0 ? (
                                <div className="py-16 text-center text-stone-600 italic border border-dashed border-stone-800 rounded-2xl">
                                    No players matched your search filter.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {filteredPlayers.map((player) => {
                                        const live = getPlayerLiveStatus(player.username);
                                        const isDev = Boolean(player.isDeveloper || player.role === 'developer' || player.username.toLowerCase() === 'aadish');
                                        const avatarUrl = player.avatarUrl || getDicebearUrl((player.avatarStyle as DicebearStyle) || 'thumbs', player.username);
                                        const stats = player.stats || { wins: 0, losses: 0, totalRounds: 0, damageDealt: 0, matchHistory: [] };
                                        const totalGames = (stats.wins || 0) + (stats.losses || 0);
                                        const winRate = totalGames > 0 ? Math.round(((stats.wins || 0) / totalGames) * 100) : 0;
                                        const hardModeWins = ((stats.matchHistory || []) as any[]).filter((m: any) => m.result === 'WIN' && m.isHardMode).length;

                                        return (
                                            <div 
                                                key={player.username}
                                                onClick={() => setInspectingPlayer(player)}
                                                className="p-3 bg-stone-900/50 hover:bg-stone-900/80 border border-stone-800 hover:border-cyan-800/60 rounded-xl flex flex-col justify-between gap-3 transition-all cursor-pointer group touch-manipulation"
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="relative shrink-0">
                                                            <div className="w-10 h-10 rounded-full overflow-hidden bg-stone-950 border border-stone-750 p-0.5">
                                                                <img src={avatarUrl} alt={player.username} className="w-full h-full object-cover rounded-full" />
                                                            </div>
                                                            <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-stone-950 ${
                                                                live.status === 'in_match' ? 'bg-red-500' :
                                                                live.status === 'in_lobby' ? 'bg-amber-400' :
                                                                live.status === 'online' ? 'bg-emerald-500' : 'bg-stone-600'
                                                            }`} />
                                                        </div>

                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <span className="text-xs font-bold text-stone-200 group-hover:text-cyan-400 uppercase tracking-wide truncate transition-colors">
                                                                    {player.displayName || player.username}
                                                                </span>
                                                                {isDev && (
                                                                    <span className="px-1.5 py-0.2 bg-red-955 border border-red-800 text-red-300 text-[6.5px] font-black rounded uppercase">
                                                                        DEV
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <span className="text-[8px] text-stone-500 font-mono tracking-wider">
                                                                    {player.playerId || getPlayerId(player)}
                                                                </span>
                                                                {player.email && (
                                                                    <span className="text-[7.5px] text-stone-600 truncate max-w-[120px]">
                                                                        {player.email}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Real-time Status Badge */}
                                                    <div className="shrink-0 text-right">
                                                        {live.status === 'in_match' ? (
                                                            <span className="px-2 py-0.5 bg-red-955 border border-red-800 text-red-300 text-[7px] font-black rounded-full uppercase">
                                                                IN COMBAT
                                                            </span>
                                                        ) : live.status === 'in_lobby' ? (
                                                            <span className="px-2 py-0.5 bg-amber-955 border border-amber-800 text-amber-300 text-[7px] font-black rounded-full uppercase">
                                                                IN LOBBY
                                                            </span>
                                                        ) : live.status === 'online' ? (
                                                            <span className="px-2 py-0.5 bg-emerald-955 border border-emerald-800 text-emerald-300 text-[7px] font-black rounded-full uppercase">
                                                                ONLINE
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 bg-stone-950 border border-stone-800 text-stone-500 text-[7px] font-bold rounded-full uppercase">
                                                                {(() => {
                                                                    const lastTime = live.lastSeen || (player as any).lastSeenAt || player.lastLoginAt;
                                                                    return lastTime ? `OFFLINE • ${formatLastSeen(lastTime)}` : 'OFFLINE';
                                                                })()}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Stats Preview & Telemetry */}
                                                <div className="p-2 bg-stone-950/70 border border-stone-850/80 rounded-lg flex items-center justify-between text-[8px] font-mono text-stone-400">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-emerald-400 font-bold">{stats.wins || 0}W</span>
                                                        <span className="text-stone-500">/</span>
                                                        <span className="text-stone-400 font-bold">{stats.losses || 0}L</span>
                                                        {hardModeWins > 0 && (
                                                            <span className="text-amber-400 font-bold flex items-center gap-0.5">
                                                                <Skull size={9} /> {hardModeWins}
                                                            </span>
                                                        )}
                                                        <span className="text-cyan-400 font-bold ml-1">{winRate}% WIN</span>
                                                    </div>

                                                    {live.matchInfo && (
                                                        <div className="text-[7.5px] text-red-300 font-mono">
                                                            R{live.matchInfo.round || 1} VS {live.matchInfo.opponent || 'ENEMY'} (HP {live.matchInfo.currentHealth ?? '?'}/{live.matchInfo.totalHealth ?? '?'})
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Action Bar */}
                                                <div className="pt-1.5 border-t border-stone-850 flex justify-between items-center text-[8px]">
                                                    <span className="text-stone-600">
                                                        {(() => {
                                                            const lastTime = live.lastSeen || (player as any).lastSeenAt || player.lastLoginAt;
                                                            return lastTime ? `LAST SEEN: ${formatLastSeen(lastTime).toUpperCase()}` : 'NEW RECRUIT';
                                                        })()}
                                                    </span>
                                                    
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                audioManager.playSound('click');
                                                                setInspectingPlayer(player);
                                                            }}
                                                            className="px-3 py-2 min-h-[44px] bg-stone-900 hover:bg-stone-800 border border-stone-750 text-stone-300 hover:text-white font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 touch-manipulation"
                                                        >
                                                            <Eye size={10} />
                                                            <span>Dossier</span>
                                                        </button>

                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                audioManager.playSound('click');
                                                                setDmTarget(player.username);
                                                                setActiveTab('comms');
                                                            }}
                                                            className="px-3 py-2 min-h-[44px] bg-cyan-955/60 hover:bg-cyan-900/80 border border-cyan-800 text-cyan-300 hover:text-white font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 touch-manipulation"
                                                            title="Direct message from BUGSHOT"
                                                        >
                                                            <MessageSquare size={10} />
                                                            <span>DM</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 3: ROOMS & LIVE COMBAT */}
                    {activeTab === 'rooms' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center text-[10px] text-stone-500 uppercase tracking-widest font-black">
                                <span>Combat Bunkers & Chambers ({overviewData?.rooms?.length || 0})</span>
                                <span className="text-yellow-400">Live Simulation Status</span>
                            </div>

                            {(!overviewData?.rooms || overviewData.rooms.length === 0) ? (
                                <div className="py-16 text-center text-stone-600 italic border border-dashed border-stone-800 rounded-2xl">
                                    No active rooms or matches currently hosted.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {overviewData.rooms.map((room) => {
                                        const isSingleplayer = Boolean((room as any).isSingleplayer);
                                        const isCombatActive = isSingleplayer || room.playerCount >= 2;

                                        return (
                                            <div key={room.id} className="p-4 bg-stone-900/40 border border-stone-800 rounded-xl space-y-3">
                                                <div className="flex items-center justify-between border-b border-stone-800/80 pb-2">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-xs font-black text-white uppercase tracking-wider">
                                                            {room.name || `CHAMBER-${room.id.slice(0, 6)}`}
                                                        </span>
                                                        <span className="text-[9px] text-stone-500 font-mono">
                                                            ID: {room.id}
                                                        </span>
                                                        <span className={`px-2 py-0.2 text-[8px] font-bold rounded uppercase ${
                                                            isSingleplayer
                                                                ? 'bg-purple-955 text-purple-300 border border-purple-800'
                                                                : isCombatActive
                                                                ? 'bg-red-955 text-red-300 border border-red-800'
                                                                : 'bg-amber-955 text-amber-300 border border-amber-800'
                                                        }`}>
                                                            {isSingleplayer ? 'SINGLEPLAYER COMBAT' : isCombatActive ? 'COMBAT ENGAGED' : 'WAITING FOR DUEL'}
                                                        </span>
                                                    </div>

                                                    <div className="text-[9px] text-stone-400 font-mono">
                                                        {isSingleplayer ? 'MODE: SINGLEPLAYER' : `PLAYERS: ${room.playerCount}/2`}
                                                    </div>
                                                </div>

                                                {/* Game State Telemetry */}
                                                {room.gameState && (
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[9px] bg-stone-950 p-2.5 rounded-lg border border-stone-850">
                                                        <div>
                                                            <span className="text-stone-500 uppercase block">ROUND</span>
                                                            <span className="font-bold text-white text-xs">{room.gameState.round || 1}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-stone-500 uppercase block">CHAMBER SHELLS</span>
                                                            <span className="font-bold text-red-400">{room.gameState.liveShells ?? '?'} LIVE</span>
                                                            <span className="text-stone-500 font-bold ml-1">/ {room.gameState.blankShells ?? '?'} BLANK</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-stone-500 uppercase block">TURN OWNER</span>
                                                            <span className="font-bold text-yellow-400 truncate block">
                                                                {room.gameState.turn ? (room.players.find(p => p.id === room.gameState?.turn)?.name || room.gameState.turn) : 'INIT'}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <span className="text-stone-500 uppercase block">SAW MOD</span>
                                                            <span className="font-bold text-stone-300">{room.gameState.isSawActive ? 'ACTIVE (2X DMG)' : 'INACTIVE'}</span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Players Inside Room */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                                    {room.players.map((p) => (
                                                        <div key={p.id} className="p-2.5 bg-stone-950/80 border border-stone-800 rounded-lg flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color || '#dc2626' }} />
                                                                <div>
                                                                    <div className="text-xs font-bold text-white truncate max-w-[120px]">{p.name}</div>
                                                                    <div className="text-[7.5px] text-stone-500 font-mono">SOCKET: {p.id.slice(0, 8)}...</div>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-2">
                                                                <div className="flex items-center gap-1 text-[9px] text-red-400 font-bold">
                                                                    <Heart size={10} className="fill-red-500/20 text-red-500" />
                                                                    <span>{p.hp}/{p.maxHp}</span>
                                                                </div>

                                                                {p.items && p.items.length > 0 && (
                                                                    <div className="flex items-center gap-0.5">
                                                                        {p.items.slice(0, 4).map((it, idx) => (
                                                                            <span key={idx} className="w-4 h-4 bg-stone-900 rounded flex items-center justify-center text-[8px] text-stone-300" title={it}>
                                                                                {Icons[it as keyof typeof Icons] ? React.createElement(Icons[it as keyof typeof Icons] as any, { size: 9 }) : it[0]}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {!isSingleplayer && p.id !== 'AI_DEALER' && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleKickPlayer(room.id, p.id, p.name);
                                                                        }}
                                                                        className="px-3 py-2 min-h-[44px] bg-red-955/80 hover:bg-red-900 border border-red-800 text-red-200 text-[8.5px] font-bold rounded uppercase cursor-pointer transition-colors touch-manipulation"
                                                                        title="Eject operative from room"
                                                                    >
                                                                        Kick
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 4: COMMS DISPATCH (DISPATCHED STRICTLY AS BUGSHOT) */}
                    {activeTab === 'comms' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {/* Global Broadcast */}
                            <div className="p-4 bg-stone-900/60 border border-red-900/50 rounded-2xl flex flex-col justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-2 text-red-400 mb-2 font-black text-xs uppercase tracking-widest">
                                        <Radio size={16} />
                                        <span>GLOBAL ANNOUNCEMENT (FROM BUGSHOT)</span>
                                    </div>
                                    <p className="text-[9px] text-stone-400 font-mono mb-4 leading-relaxed">
                                        Dispatches a system-wide high-priority alert banner to all active players. 
                                        Displayed strictly as <strong>BUGSHOT SYSTEM</strong> without any administrator codename.
                                    </p>

                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-[8.5px] text-stone-500 uppercase font-black block mb-1">
                                                Broadcast Headline
                                            </label>
                                            <input
                                                type="text"
                                                value={broadcastTitle}
                                                onChange={(e) => setBroadcastTitle(e.target.value)}
                                                className="w-full bg-stone-950 border border-stone-800 focus:border-red-500 px-3 py-2 text-xs text-white rounded-xl outline-none font-mono"
                                                placeholder="BUGSHOT ANNOUNCEMENT"
                                            />
                                        </div>

                                        <div>
                                            <label className="text-[8.5px] text-stone-500 uppercase font-black block mb-1">
                                                Transmission Message Text
                                            </label>
                                            <textarea
                                                rows={4}
                                                value={broadcastText}
                                                onChange={(e) => setBroadcastText(e.target.value)}
                                                className="w-full bg-stone-950 border border-stone-800 focus:border-red-500 p-3 text-xs text-stone-200 rounded-xl outline-none font-mono resize-none"
                                                placeholder="Attention operators: Maintenance scheduled in 10 minutes..."
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-2">
                                    <button
                                        onClick={handleSendBroadcast}
                                        disabled={isSending || !broadcastText.trim()}
                                        className="flex-1 py-3 min-h-[44px] bg-red-955 hover:bg-red-900 border border-red-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-[0.2em] rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm touch-manipulation"
                                    >
                                        <Send size={13} />
                                        <span>TRANSMIT AS BUGSHOT</span>
                                    </button>
                                    {adminAPI.clearBroadcast && (
                                        <button
                                            type="button"
                                            onClick={handleClearBroadcast}
                                            disabled={isSending}
                                            className="px-4 py-3 min-h-[44px] bg-stone-900 hover:bg-stone-850 border border-stone-750 text-stone-300 hover:text-white font-bold text-xs uppercase rounded-xl transition-all cursor-pointer shrink-0 touch-manipulation"
                                            title="Clear active broadcast across all devices"
                                        >
                                            Clear Active
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Direct Message (DM) */}
                            <div className="p-4 bg-stone-900/60 border border-cyan-900/50 rounded-2xl flex flex-col justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-2 text-cyan-400 mb-2 font-black text-xs uppercase tracking-widest">
                                        <MessageSquare size={16} />
                                        <span>TARGETED DIRECT MESSAGE (FROM BUGSHOT)</span>
                                    </div>
                                    <p className="text-[9px] text-stone-400 font-mono mb-4 leading-relaxed">
                                        Dispatches a private transmission directly to a target player&apos;s message box (delivered even if player is offline). 
                                        Displayed strictly as <strong>BUGSHOT</strong> with official system emblem.
                                    </p>

                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-[8.5px] text-stone-500 uppercase font-black block mb-1">
                                                Recipient Agent Username
                                            </label>
                                            <div className="flex flex-col sm:flex-row gap-2">
                                                <input
                                                    type="text"
                                                    value={dmTarget}
                                                    onChange={(e) => setDmTarget(e.target.value)}
                                                    className="flex-1 min-w-0 min-h-[44px] bg-stone-950 border border-stone-800 focus:border-cyan-500 px-3 py-2 text-xs text-white rounded-xl outline-none font-mono"
                                                    placeholder="Target username..."
                                                />
                                                {allUsers.length > 0 && (
                                                    <select
                                                        onChange={(e) => setDmTarget(e.target.value)}
                                                        value={dmTarget}
                                                        className="w-full sm:w-auto sm:max-w-[160px] min-h-[44px] bg-stone-950 border border-stone-800 text-stone-300 text-xs px-2 rounded-xl outline-none"
                                                    >
                                                        <option value="">Select Player</option>
                                                        {allUsers.map(u => (
                                                            <option key={u.username} value={u.username}>
                                                                {u.username} {getPlayerLiveStatus(u.username).status !== 'offline' ? '●' : ''}
                                                            </option>
                                                        ))}
                                                    </select>
                                                )}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-[8.5px] text-stone-500 uppercase font-black block mb-1">
                                                Private Message Text
                                            </label>
                                            <textarea
                                                rows={4}
                                                value={dmText}
                                                onChange={(e) => setDmText(e.target.value)}
                                                className="w-full bg-stone-950 border border-stone-800 focus:border-cyan-500 p-3 text-xs text-stone-200 rounded-xl outline-none font-mono resize-none"
                                                placeholder="Encrypted game message for target agent..."
                                            />
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={handleSendDM}
                                    disabled={isSending || !dmTarget.trim() || !dmText.trim()}
                                    className="w-full py-3 min-h-[44px] bg-cyan-955 hover:bg-cyan-900 border border-cyan-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-[0.2em] rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm touch-manipulation"
                                >
                                    <Send size={13} />
                                    <span>DISPATCH AS BUGSHOT</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer status bar */}
                <div className="p-2 sm:p-2.5 bg-stone-950 border-t border-stone-850 flex items-center justify-between text-[8px] text-stone-600 px-4 shrink-0">
                    <span>SECURITY: FIREBASE AUTHENTICATED // SYSTEM PRIVILEGES</span>
                    <span>DEVELOPER CONSOLE</span>
                </div>
            </div>

            {/* DETAILED PLAYER DOSSIER MODAL */}
            {inspectingPlayer && (
                <div 
                    className="fixed inset-0 z-[280] flex items-center justify-center p-2 sm:p-6 bg-black/92 md:bg-black/85 md:backdrop-blur-md animate-in fade-in duration-150"
                    style={{
                        paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
                        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
                        paddingLeft: 'max(env(safe-area-inset-left, 0px), 12px)',
                        paddingRight: 'max(env(safe-area-inset-right, 0px), 12px)'
                    }}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setInspectingPlayer(null);
                    }}
                >
                    <div className="w-full max-w-2xl max-h-[95dvh] md:max-h-[88dvh] bg-stone-950 border border-stone-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden font-mono text-stone-300">
                        {/* Header */}
                        <div className="p-3 sm:p-4 bg-stone-900 border-b border-stone-800 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full overflow-hidden bg-stone-950 border border-stone-700 shrink-0">
                                    <img 
                                        src={inspectingPlayer.avatarUrl || getDicebearUrl((inspectingPlayer.avatarStyle as DicebearStyle) || 'thumbs', inspectingPlayer.username)} 
                                        alt={inspectingPlayer.username} 
                                        className="w-full h-full object-cover" 
                                    />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-black text-white uppercase tracking-wider">
                                            {inspectingPlayer.displayName || inspectingPlayer.username}
                                        </h3>
                                        {Boolean(inspectingPlayer.isDeveloper || inspectingPlayer.role === 'developer' || inspectingPlayer.username.toLowerCase() === 'aadish') && (
                                            <span className="px-1.5 py-0.2 bg-red-955 border border-red-800 text-red-300 text-[7px] font-black rounded uppercase">
                                                DEVELOPER
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5 text-[8.5px] text-stone-500">
                                        <span>{inspectingPlayer.playerId || getPlayerId(inspectingPlayer)}</span>
                                        {inspectingPlayer.email && <span>• {inspectingPlayer.email}</span>}
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={() => setInspectingPlayer(null)}
                                className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-500 hover:text-white rounded-xl transition-colors cursor-pointer touch-manipulation"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Dossier Content */}
                        <div className="flex-1 overflow-y-auto overscroll-contain p-3.5 sm:p-5 space-y-4 custom-scrollbar">
                            
                            {/* Live Status Banner */}
                            {(() => {
                                const live = getPlayerLiveStatus(inspectingPlayer.username);
                                return (
                                    <div className="p-3 bg-stone-900/60 border border-stone-800 rounded-xl flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2.5 h-2.5 rounded-full ${
                                                live.status === 'in_match' ? 'bg-red-500' :
                                                live.status === 'in_lobby' ? 'bg-amber-400' :
                                                live.status === 'online' ? 'bg-emerald-500' : 'bg-stone-600'
                                            }`} />
                                            <span className="font-bold text-white uppercase">
                                                STATUS: {live.status === 'in_match' ? 'IN MATCH COMBAT' : live.status === 'in_lobby' ? 'IN ROOM LOBBY' : live.status === 'online' ? 'ONLINE' : `OFFLINE (${formatLastSeen(live.lastSeen || (inspectingPlayer as any).lastSeenAt || inspectingPlayer.lastLoginAt)})`}
                                            </span>
                                        </div>

                                        {live.matchInfo && (
                                            <div className="text-[9px] text-red-300 font-mono">
                                                ROUND {live.matchInfo.round || 1} VS {live.matchInfo.opponent || 'OPPONENT'} (HP {live.matchInfo.currentHealth ?? '?'}/{live.matchInfo.totalHealth ?? '?'})
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Combat Statistics Grid */}
                            {(() => {
                                const st = inspectingPlayer.stats || { wins: 0, losses: 0, totalRounds: 0, shotsFired: 0, shotsHit: 0, damageDealt: 0, selfShots: 0, itemsUsed: 0, matchHistory: [] };
                                const totalGames = (st.wins || 0) + (st.losses || 0);
                                const winRate = totalGames > 0 ? Math.round(((st.wins || 0) / totalGames) * 100) : 0;
                                const acc = (st.shotsFired || 0) > 0 ? Math.round(((st.shotsHit || 0) / st.shotsFired) * 100) : 0;
                                const hardWins = ((st.matchHistory || []) as any[]).filter((m: any) => m.result === 'WIN' && m.isHardMode).length;

                                return (
                                    <div className="space-y-3">
                                        <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black">
                                            Lifetime Combat Dossier
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                            <div className="p-2.5 bg-stone-900/60 border border-stone-800 rounded-xl">
                                                <div className="text-[8px] text-stone-500 uppercase">Victories / Losses</div>
                                                <div className="font-bold text-white mt-1">{st.wins || 0}W / {st.losses || 0}L</div>
                                                <div className="text-[7.5px] text-cyan-400 mt-0.5">{winRate}% Win Rate</div>
                                            </div>
                                            <div className="p-2.5 bg-stone-900/60 border border-stone-800 rounded-xl">
                                                <div className="text-[8px] text-stone-500 uppercase">Hard Mode Protocol</div>
                                                <div className="font-bold text-amber-400 mt-1">{hardWins} Wins</div>
                                                <div className="text-[7.5px] text-stone-500 mt-0.5">High Stake Chamber</div>
                                            </div>
                                            <div className="p-2.5 bg-stone-900/60 border border-stone-800 rounded-xl">
                                                <div className="text-[8px] text-stone-500 uppercase">Shot Accuracy</div>
                                                <div className="font-bold text-emerald-400 mt-1">{acc}%</div>
                                                <div className="text-[7.5px] text-stone-500 mt-0.5">{st.shotsHit || 0} / {st.shotsFired || 0} Hit</div>
                                            </div>
                                            <div className="p-2.5 bg-stone-900/60 border border-stone-800 rounded-xl">
                                                <div className="text-[8px] text-stone-500 uppercase">Damage Inflicted</div>
                                                <div className="font-bold text-red-400 mt-1">{st.damageDealt || 0} HP</div>
                                                <div className="text-[7.5px] text-stone-500 mt-0.5">{st.itemsUsed || 0} Items Used</div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2 text-[9px] bg-stone-950 p-2.5 rounded-xl border border-stone-850">
                                            <div>
                                                <span className="text-stone-500 uppercase block">Rounds Survived</span>
                                                <span className="font-bold text-stone-200">{st.totalRounds || 0}</span>
                                            </div>
                                            <div>
                                                <span className="text-stone-500 uppercase block">Self Shots Gambled</span>
                                                <span className="font-bold text-amber-400">{st.selfShots || 0}</span>
                                            </div>
                                            <div>
                                                <span className="text-stone-500 uppercase block">Time In Combat</span>
                                                <span className="font-bold text-stone-200">{Math.round((inspectingPlayer.totalTimePlayed || 0) / 60)} Mins</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Recent Match History */}
                            <div className="space-y-2">
                                <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black">
                                    Recent Match Deployments ({(inspectingPlayer.stats?.matchHistory || []).length})
                                </div>

                                {(!inspectingPlayer.stats?.matchHistory || inspectingPlayer.stats.matchHistory.length === 0) ? (
                                    <div className="py-6 text-center text-stone-600 italic border border-stone-850 rounded-xl text-xs">
                                        No recent match operational logs on record.
                                    </div>
                                ) : (
                                    <div className="space-y-1.5 max-h-56 overflow-y-auto overscroll-contain custom-scrollbar pr-1">
                                        {inspectingPlayer.stats.matchHistory.slice(-10).reverse().map((m: any, idx: number) => (
                                            <div 
                                                key={idx}
                                                className="p-2.5 bg-stone-900/40 border border-stone-850 rounded-xl flex items-center justify-between text-xs font-mono"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-1.5 py-0.2 rounded text-[8px] font-black uppercase ${
                                                        m.result === 'WIN' 
                                                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' 
                                                            : 'bg-red-955 text-red-400 border border-red-800'
                                                    }`}>
                                                        {m.result}
                                                    </span>
                                                    <span className="text-stone-300 font-bold">
                                                        {m.isMultiplayer ? 'MULTIPLAYER DUEL' : m.isHardMode ? 'HARD MODE PROTOCOL' : 'STANDARD CYBER ROULETTE'}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-3 text-stone-500 text-[9px]">
                                                    {m.opponent && <span>VS {m.opponent}</span>}
                                                    <span>SCORE: {m.score || m.totalScore || 0}</span>
                                                    <span>{m.timestamp ? new Date(m.timestamp).toLocaleDateString() : 'RECENT'}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer Controls */}
                        <div className="p-3 bg-stone-900 border-t border-stone-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={() => {
                                        setDmTarget(inspectingPlayer.username);
                                        setInspectingPlayer(null);
                                        setActiveTab('comms');
                                    }}
                                    className="px-3.5 py-2 min-h-[44px] bg-cyan-955 hover:bg-cyan-900 border border-cyan-700 text-cyan-300 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer uppercase transition-all touch-manipulation"
                                >
                                    <MessageSquare size={13} />
                                    <span>Send DM</span>
                                </button>

                                {(() => {
                                    const isMuted = Boolean(overviewData?.mutedUsers?.includes(inspectingPlayer.username.toLowerCase()));
                                    return (
                                        <button
                                            onClick={() => handleToggleMute(inspectingPlayer.username, isMuted)}
                                            className={`px-3.5 py-2 min-h-[44px] font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer uppercase transition-all border touch-manipulation ${
                                                isMuted
                                                    ? 'bg-amber-955 hover:bg-amber-900 border-amber-700 text-amber-200'
                                                    : 'bg-stone-900 hover:bg-stone-850 border-stone-750 text-stone-300 hover:text-amber-400'
                                            }`}
                                        >
                                            <AlertTriangle size={13} />
                                            <span>{isMuted ? 'Unmute Player' : 'Mute (30m)'}</span>
                                        </button>
                                    );
                                })()}

                                {(() => {
                                    const live = getPlayerLiveStatus(inspectingPlayer.username);
                                    if (live.roomId && !live.roomId.startsWith('SP-')) {
                                        return (
                                            <button
                                                onClick={() => handleKickPlayer(live.roomId!, live.socketId || undefined, inspectingPlayer.username)}
                                                className="px-3.5 py-2 min-h-[44px] bg-red-955 hover:bg-red-900 border border-red-700 text-red-200 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer uppercase transition-all touch-manipulation"
                                            >
                                                <X size={13} />
                                                <span>Kick From Room</span>
                                            </button>
                                        );
                                    }
                                    return null;
                                })()}
                            </div>

                            <button
                                onClick={() => setInspectingPlayer(null)}
                                className="px-4 py-2 min-h-[44px] bg-stone-800 hover:bg-stone-700 text-white font-bold text-xs rounded-xl uppercase transition-all cursor-pointer touch-manipulation"
                            >
                                Close Dossier
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
