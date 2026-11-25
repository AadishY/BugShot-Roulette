import React, { useState, useEffect, useMemo } from 'react';
import { Users, Plus, Key, ArrowLeft, Swords, AlertTriangle, RefreshCw, Search } from 'lucide-react';
import { audioManager } from '../utils/audioManager';

interface MultiplayerSelectionProps {
    playerName: string;
    onQuickJoin: () => void;
    onCreateRoom: () => void;
    onJoinRoom: (roomId: string) => void;
    onBack: () => void;
    error: string | null;
    clearError: () => void;
    isConnecting: boolean;
    getActiveRooms?: () => Promise<any[]>;
}

export const MultiplayerSelection: React.FC<MultiplayerSelectionProps> = ({
    playerName,
    onQuickJoin,
    onCreateRoom,
    onJoinRoom,
    onBack,
    error,
    clearError,
    isConnecting,
    getActiveRooms
}) => {
    const [roomCode, setRoomCode] = useState('');
    const [isBrowserOpen, setIsBrowserOpen] = useState(false);
    const [activeRooms, setActiveRooms] = useState<any[]>([]);
    const [isLoadingRooms, setIsLoadingRooms] = useState(false);

    // Browser Search & Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [roomFilter, setRoomFilter] = useState<'all' | 'open' | 'playing'>('all');

    const [scale, setScale] = useState(1);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 768 || window.innerHeight < 550;
            setIsMobile(mobile);
            if (mobile) {
                setScale(1);
            } else {
                const hScale = Math.min(1, (window.innerHeight - 20) / 640);
                const wScale = Math.min(1, (window.innerWidth - 20) / 980);
                let newScale = Math.min(hScale, wScale);
                newScale = Math.max(newScale, 0.55);
                setScale(newScale);
            }
        };
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        clearError();
    }, [clearError]);

    // Escape exits browser or returns to main menu
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isBrowserOpen) {
                    audioManager.playSound('click');
                    setIsBrowserOpen(false);
                } else if (error) {
                    clearError();
                } else {
                    audioManager.playSound('click');
                    onBack();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isBrowserOpen, error, onBack, clearError]);

    const handleJoinSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (roomCode.length === 4) {
            audioManager.playSound('click');
            onJoinRoom(roomCode);
        }
    };

    const handleRoomCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
        setRoomCode(val);
        if (error) clearError();
    };

    const handleOpenBrowser = async () => {
        setIsBrowserOpen(true);
        await fetchRooms();
    };

    const fetchRooms = async () => {
        if (!getActiveRooms) return;
        setIsLoadingRooms(true);
        try {
            const roomsList = await getActiveRooms();
            setActiveRooms(roomsList || []);
        } catch (e) {
            console.error("Error fetching rooms in browser:", e);
        } finally {
            setIsLoadingRooms(false);
        }
    };

    const filteredRooms = useMemo(() => {
        return activeRooms.filter((room) => {
            if (roomFilter === 'open' && room.isPlaying) return false;
            if (roomFilter === 'playing' && !room.isPlaying) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const matchesName = (room.name || '').toLowerCase().includes(q);
                const matchesId = (room.id || '').toLowerCase().includes(q);
                const matchesHost = (room.hostName || '').toLowerCase().includes(q);
                return matchesName || matchesId || matchesHost;
            }
            return true;
        });
    }, [activeRooms, roomFilter, searchQuery]);

    return (
        <div
            style={isMobile ? {
                paddingTop: 'max(env(safe-area-inset-top, 0px), 4px)',
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 4px)',
                paddingLeft: 'max(env(safe-area-inset-left, 0px), 4px)',
                paddingRight: 'max(env(safe-area-inset-right, 0px), 4px)'
            } : { transform: `scale(${scale})`, transformOrigin: 'center center' }}
            className="flex flex-col w-full max-w-[min(96vw,960px)] max-h-[94dvh] lg:h-[600px] shrink-0 bg-stone-950 border-2 border-cyan-500/25 rounded-xl overflow-hidden shadow-[0_0_60px_rgba(6,182,212,0.15)] font-mono text-stone-300 relative"
        >
            {/* Header */}
            <div className="p-2.5 sm:p-4 border-b border-stone-850 bg-stone-900/30 flex justify-between items-center relative shrink-0 gap-2">
                <div className="absolute top-2 left-2 w-2 h-2 border-t border-l border-cyan-500/40" />
                <div className="absolute top-2 right-2 w-2 h-2 border-t border-r border-cyan-500/40" />

                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <button
                        onClick={() => {
                            audioManager.playSound('click');
                            onBack();
                        }}
                        className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-stone-900 border border-stone-800 hover:border-cyan-500/50 text-stone-400 hover:text-cyan-400 rounded-xl transition-colors cursor-pointer shrink-0"
                        title="Return to Menu"
                        aria-label="Return to Menu"
                    >
                        <ArrowLeft size={16} />
                    </button>
                    <div className="min-w-0">
                        <h1 className="text-sm sm:text-xl font-black tracking-widest uppercase text-white flex items-center gap-2 truncate">
                            <Swords size={16} className="text-cyan-400 sm:w-5 sm:h-5 shrink-0" />
                            <span className="truncate">MULTIPLAYER</span>
                        </h1>
                        <p className="text-[8.5px] sm:text-[10px] text-stone-500 tracking-wider uppercase mt-0.5 truncate">
                            AGENT: <span className="text-cyan-400 font-bold">{playerName}</span>
                        </p>
                    </div>
                </div>
                <div className="px-2.5 py-1 bg-cyan-950/30 border border-cyan-900/40 rounded text-cyan-400 text-[8.5px] sm:text-[10px] font-bold uppercase tracking-wider shrink-0">
                    2–4 PLAYERS
                </div>
            </div>

            {/* Content Options */}
            <div className={`flex-1 p-2.5 sm:p-5 flex flex-col md:flex-row gap-2.5 sm:gap-4 justify-start ${isMobile ? 'overflow-y-auto' : 'md:justify-center md:overflow-hidden'} items-stretch custom-scrollbar min-h-0`}>
                {/* Quick Join Card */}
                <div className="flex-1 border border-stone-850 hover:border-cyan-500/40 bg-stone-900/20 hover:bg-cyan-950/10 p-3.5 sm:p-5 rounded-xl flex flex-col justify-between transition-colors group relative">
                    <div className="space-y-2 sm:space-y-3">
                        <div className="inline-flex items-center justify-center p-2 sm:p-2.5 bg-cyan-950/30 border border-cyan-800/30 rounded-xl text-cyan-400">
                            <Users size={20} className="sm:w-6 sm:h-6" />
                        </div>
                        <div>
                            <h2 className="text-xs sm:text-sm font-black text-white tracking-widest uppercase">QUICK MATCH</h2>
                            <p className="text-[9px] sm:text-[10px] text-stone-400 uppercase leading-relaxed mt-1 sm:mt-2 tracking-wide">
                                Join the first open queue or browse live public corridors.
                            </p>
                        </div>
                    </div>

                    <div className="mt-3 sm:mt-5 flex flex-row gap-2">
                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                onQuickJoin();
                            }}
                            disabled={isConnecting}
                            className="flex-1 py-2.5 min-h-[44px] bg-cyan-950/50 hover:bg-cyan-900/70 border border-cyan-700 hover:border-cyan-400 text-cyan-300 hover:text-white font-black text-[11px] sm:text-xs tracking-wider rounded-xl transition-all cursor-pointer active:scale-98 disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                            {isConnecting ? <RefreshCw size={14} className="animate-spin" /> : null}
                            <span>QUICK JOIN</span>
                        </button>
                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                handleOpenBrowser();
                            }}
                            disabled={isConnecting}
                            className="flex-1 py-2.5 min-h-[44px] bg-stone-900/80 hover:bg-cyan-950/30 border border-stone-800 hover:border-cyan-700 text-stone-300 hover:text-cyan-300 font-black text-[11px] sm:text-xs tracking-wider rounded-xl transition-all cursor-pointer active:scale-98 disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                            <span>ROOMS</span>
                        </button>
                    </div>
                </div>

                {/* Direct Host Card (Opens Lobby Directly With All Settings) */}
                <div className="flex-1 border border-stone-850 hover:border-cyan-500/40 bg-stone-900/20 hover:bg-cyan-950/10 p-3.5 sm:p-5 rounded-xl flex flex-col justify-between transition-colors group relative">
                    <div className="space-y-2 sm:space-y-3">
                        <div className="inline-flex items-center justify-center p-2 sm:p-2.5 bg-cyan-950/30 border border-cyan-800/30 rounded-xl text-cyan-400">
                            <Plus size={20} className="sm:w-6 sm:h-6" />
                        </div>
                        <div>
                            <h2 className="text-xs sm:text-sm font-black text-white tracking-widest uppercase">HOST LOBBY</h2>
                            <p className="text-[9px] sm:text-[10px] text-stone-400 uppercase leading-relaxed mt-1 sm:mt-2 tracking-wide">
                                Open a new bunker lobby immediately and customize all rules live inside.
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={() => {
                            audioManager.playSound('confirm');
                            onCreateRoom();
                        }}
                        disabled={isConnecting}
                        className="mt-3 sm:mt-5 w-full py-2.5 min-h-[44px] bg-cyan-500 hover:bg-cyan-400 text-black font-black text-[11px] sm:text-xs tracking-widest rounded-xl transition-all cursor-pointer active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_18px_rgba(6,182,212,0.2)]"
                    >
                        {isConnecting ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={15} className="shrink-0" />}
                        <span>HOST</span>
                    </button>
                </div>

                {/* Join Room Card */}
                <div className="flex-1 border border-stone-850 hover:border-cyan-500/40 bg-stone-900/20 hover:bg-cyan-950/10 p-3.5 sm:p-5 rounded-xl flex flex-col justify-between transition-colors group relative">
                    <div className="space-y-2 sm:space-y-3">
                        <div className="inline-flex items-center justify-center p-2 sm:p-2.5 bg-cyan-950/30 border border-cyan-800/30 rounded-xl text-cyan-400">
                            <Key size={20} className="sm:w-6 sm:h-6" />
                        </div>
                        <div>
                            <h2 className="text-xs sm:text-sm font-black text-white tracking-widest uppercase">JOIN LOBBY</h2>
                            <p className="text-[9px] sm:text-[10px] text-stone-400 uppercase leading-relaxed mt-1 sm:mt-2 tracking-wide">
                                Enter a 4-digit corridor code to connect directly.
                            </p>
                        </div>
                    </div>

                    <form onSubmit={handleJoinSubmit} className="mt-3 space-y-2">
                        <div className="relative flex items-center">
                            <span className="absolute left-3 text-cyan-600 font-bold text-sm select-none">[</span>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={4}
                                value={roomCode}
                                onChange={handleRoomCodeChange}
                                placeholder="ROOM CODE"
                                className="w-full min-h-[44px] bg-stone-950 border border-stone-800 hover:border-stone-700 focus:border-cyan-500/60 px-6 py-2 text-center text-sm font-bold tracking-[0.4em] uppercase rounded-lg outline-none transition-all placeholder-stone-700 text-cyan-400 tabular-nums"
                                required
                            />
                            <span className="absolute right-3 text-cyan-600 font-bold text-sm select-none">]</span>
                        </div>

                        <button
                            type="submit"
                            disabled={isConnecting || roomCode.length !== 4}
                            className="w-full py-2.5 min-h-[44px] bg-cyan-950/50 hover:bg-cyan-500 text-cyan-300 hover:text-black disabled:bg-stone-900 disabled:text-stone-600 disabled:border-stone-850 border border-cyan-700 hover:border-cyan-400 font-black text-[11px] sm:text-xs tracking-widest rounded-xl transition-all cursor-pointer active:scale-98"
                        >
                            JOIN DEPLOYMENT
                        </button>
                    </form>
                </div>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="mx-4 sm:mx-6 mb-4 px-4 py-2.5 bg-red-950/40 border border-red-900/60 rounded-xl text-red-400 flex items-center gap-2.5">
                    <AlertTriangle size={16} className="shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                        [PROTOCOL ERROR: {error.toUpperCase()}]
                    </span>
                </div>
            )}

            {/* Active Rooms Browser Overlay Panel */}
            {isBrowserOpen && (
                <div className="absolute inset-0 z-50 bg-stone-950 flex flex-col p-3 sm:p-5 font-mono text-stone-300 min-h-0">
                    <div className="absolute top-2 left-2 w-2 h-2 border-t border-l border-cyan-500/40" />
                    <div className="absolute top-2 right-2 w-2 h-2 border-t border-r border-cyan-500/40" />
                    <div className="absolute bottom-2 left-2 w-2 h-2 border-b border-l border-cyan-500/40" />
                    <div className="absolute bottom-2 right-2 w-2 h-2 border-b border-r border-cyan-500/40" />

                    {/* Header */}
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center border-b border-stone-850 pb-2.5 mb-2.5 gap-2 shrink-0">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <button
                                onClick={() => {
                                    audioManager.playSound('click');
                                    setIsBrowserOpen(false);
                                }}
                                className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-stone-900 border border-stone-800 hover:border-cyan-500/50 text-stone-400 hover:text-cyan-400 rounded-xl transition-colors cursor-pointer shrink-0"
                                title="Back to Multiplayer"
                                aria-label="Back to Multiplayer"
                            >
                                <ArrowLeft size={16} />
                            </button>
                            <div className="min-w-0">
                                <h2 className="text-xs sm:text-md font-black text-white tracking-wider uppercase truncate">ACTIVE NETWORKS BROWSER</h2>
                                <p className="text-[8px] sm:text-[9px] text-stone-500 tracking-wider uppercase truncate">
                                    LIVE CLUSTERS ({filteredRooms.length} FOUND)
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <div className="relative flex items-center flex-1 sm:flex-initial min-w-0">
                                <Search size={12} className="absolute left-2.5 text-stone-500 shrink-0" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Filter by name / ID..."
                                    className="bg-stone-900/80 border border-stone-800 focus:border-cyan-500/60 pl-7 pr-2.5 py-2 min-h-[44px] text-[10px] text-stone-200 uppercase rounded-xl outline-none w-full sm:w-48 tracking-wider placeholder-stone-600"
                                />
                            </div>

                            <button
                                onClick={() => {
                                    audioManager.playSound('click');
                                    fetchRooms();
                                }}
                                disabled={isLoadingRooms}
                                className="px-3 py-2 min-h-[44px] hover:bg-stone-900 border border-stone-850 hover:border-cyan-500/50 text-cyan-400 hover:text-white rounded-xl transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 text-[9px] font-bold tracking-widest uppercase shrink-0"
                            >
                                <RefreshCw size={13} className={isLoadingRooms ? 'animate-spin' : ''} />
                                <span className="hidden sm:inline">REFRESH</span>
                            </button>
                        </div>
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex gap-2 mb-3 border-b border-stone-900/60 pb-2">
                        {(['all', 'open', 'playing'] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => {
                                    audioManager.playSound('click');
                                    setRoomFilter(tab);
                                }}
                                className={`px-3.5 py-2 min-h-[40px] rounded-xl text-[8.5px] sm:text-[9.5px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center ${
                                    roomFilter === tab
                                        ? 'bg-cyan-950/40 border border-cyan-500/60 text-cyan-300'
                                        : 'bg-stone-900/30 border border-stone-850 text-stone-500 hover:text-stone-300'
                                }`}
                            >
                                {tab === 'all' ? 'ALL ROOMS' : tab === 'open' ? 'OPEN / WAITING' : 'IN MATCH'}
                            </button>
                        ))}
                    </div>

                    {/* Rooms List */}
                    <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                        {isLoadingRooms ? (
                            <div className="flex flex-col items-center justify-center h-48 space-y-2">
                                <RefreshCw size={24} className="text-cyan-500 animate-spin" />
                                <span className="text-[10px] text-stone-500 uppercase tracking-widest">Scanning Net Nodes...</span>
                            </div>
                        ) : filteredRooms.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 border border-dashed border-stone-850 rounded-xl text-stone-500 space-y-2 text-center p-4">
                                <span className="text-xs font-bold uppercase tracking-wider">// NO MATCHING CORRIDORS FOUND</span>
                                <span className="text-[9px] uppercase tracking-wide max-w-xs leading-relaxed text-stone-500">
                                    Hit HOST to open a new bunker lobby immediately.
                                </span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4">
                                {filteredRooms.map((room) => (
                                    <div
                                        key={room.id}
                                        className="border border-stone-850 hover:border-cyan-500/35 bg-stone-900/20 hover:bg-cyan-950/10 p-4 rounded-xl flex flex-col justify-between gap-3 transition-colors group"
                                    >
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-start gap-2">
                                                <span className="text-xs font-black text-stone-200 uppercase truncate pr-1">
                                                    {room.name}
                                                </span>
                                                {room.isPlaying ? (
                                                    <span className="px-2 py-0.5 bg-amber-950/50 border border-amber-900/40 rounded text-[9px] font-bold text-amber-400 uppercase tracking-wider shrink-0">
                                                        PLAYING
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-0.5 bg-cyan-950/40 border border-cyan-900/40 rounded text-[9px] font-bold text-cyan-400 uppercase tracking-wider shrink-0 tabular-nums">
                                                        {room.playerCount} / {room.maxPlayers || 4}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap gap-x-2 gap-y-1 text-[8.5px] font-mono text-stone-400 uppercase tabular-nums">
                                                <span className="border border-stone-800 px-1.5 rounded bg-stone-950 text-stone-300">ID: {room.id}</span>
                                                <span>HP: {room.settings?.hp === 9 ? 'RND' : (room.settings?.hp || 4)}</span>
                                                <span>RDS: {room.settings?.rounds || 3}</span>
                                                <span>ITEMS: {room.settings?.itemsPerShipment === 9 ? 'RND' : (room.settings?.itemsPerShipment ?? 4)}</span>
                                            </div>
                                        </div>

                                        {room.isPlaying ? (
                                            <div className="w-full py-2 border border-stone-850 bg-stone-900/40 text-amber-500/80 font-black text-[10px] tracking-widest rounded-lg flex items-center justify-center uppercase select-none">
                                                MATCH IN PROGRESS
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => {
                                                    audioManager.playSound('click');
                                                    onJoinRoom(room.id);
                                                    setIsBrowserOpen(false);
                                                }}
                                                className="w-full py-2.5 min-h-[44px] border border-cyan-800/50 group-hover:border-cyan-500/70 bg-cyan-950/25 hover:bg-cyan-500 text-cyan-300 hover:text-black font-black text-[10px] tracking-widest rounded-xl transition-all cursor-pointer flex items-center justify-center"
                                            >
                                                ESTABLISH UPLINK
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Kicked Message Overlay */}
            {error && error.toLowerCase().includes('kick') && (
                <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/92">
                    <div className="w-full max-w-[min(360px,calc(100vw-32px))] sm:max-w-md bg-stone-950 border-2 border-red-500/40 p-6 rounded-xl shadow-[0_0_50px_rgba(239,68,68,0.2)] text-center space-y-4 font-mono select-none">
                        <div className="inline-flex p-3 bg-red-950/40 border border-red-500/40 text-red-500 rounded-full">
                            <AlertTriangle size={28} />
                        </div>
                        <h2 className="text-red-500 text-lg font-black tracking-widest uppercase">DISMISSED FROM BUNKER</h2>
                        <p className="text-[11px] text-stone-400 uppercase leading-relaxed">
                            You have been expelled from the simulation corridor by the corridor host.
                        </p>
                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                clearError();
                            }}
                            className="w-full py-2.5 min-h-[44px] flex items-center justify-center bg-red-950/40 hover:bg-red-900 border border-red-800 hover:border-red-400 text-red-400 hover:text-white font-black text-xs tracking-widest rounded-xl transition-all cursor-pointer active:scale-95"
                        >
                            ACKNOWLEDGE PROTOCOL
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
