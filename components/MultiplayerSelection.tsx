import React, { useState, useEffect, useMemo } from 'react';
import { Users, Plus, Key, ArrowLeft, Swords, AlertTriangle, RefreshCw, Search, Shield, Lock, Globe, X, Sliders, Dices } from 'lucide-react';
import { audioManager } from '../utils/audioManager';

const TACTICAL_PREFIXES = ['VIPER', 'GHOST', 'SHADOW', 'BLACKOUT', 'OMEGA', 'NIGHTFALL', 'DEADLOCK', 'CYBER', 'VOID', 'PHANTOM', 'IRON'];
const TACTICAL_SUFFIXES = ['BUNKER', 'SECTOR', 'OUTPOST', 'CORRIDOR', 'VAULT', 'SANCTUARY', 'REDOUBT', 'HQ', 'CITADEL'];

const generateRandomBunkerName = () => {
    const pre = TACTICAL_PREFIXES[Math.floor(Math.random() * TACTICAL_PREFIXES.length)];
    const suf = TACTICAL_SUFFIXES[Math.floor(Math.random() * TACTICAL_SUFFIXES.length)];
    const num = Math.floor(Math.random() * 90 + 10);
    return `${pre} ${suf} #${num}`;
};

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

    // Room Creation Dialog State
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [customRoomName, setCustomRoomName] = useState(`${playerName}'s Bunker`);
    const [isPrivateRoom, setIsPrivateRoom] = useState(false);
    const [maxPlayers, setMaxPlayers] = useState<2 | 3 | 4>(4);
    const [startingHp, setStartingHp] = useState<number>(4);
    const [itemsPerShipment, setItemsPerShipment] = useState<number>(4);
    const [roundsToWin, setRoundsToWin] = useState<number>(3);

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
        // Clear errors when this screen mounts
        clearError();
    }, [clearError]);

    // Keyboard support: Escape exits dialogs or returns to main menu
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isCreateDialogOpen) {
                    audioManager.playSound('click');
                    setIsCreateDialogOpen(false);
                } else if (isBrowserOpen) {
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
    }, [isCreateDialogOpen, isBrowserOpen, error, onBack, clearError]);

    const handleJoinSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (roomCode.length === 4) {
            audioManager.playSound('click');
            onJoinRoom(roomCode);
        }
    };

    const handleRoomCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Only allow numbers and max 4 digits
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

    const handleConfirmCreate = () => {
        audioManager.playSound('click');
        const settings = {
            name: customRoomName.trim() || `${playerName}'s Bunker`,
            roomName: customRoomName.trim() || `${playerName}'s Bunker`,
            isPrivate: isPrivateRoom,
            maxPlayers,
            rounds: roundsToWin,
            hp: startingHp,
            itemsPerShipment,
            isAdvanced: false
        };
        try {
            localStorage.setItem('aadish_roulette_last_lobby_settings', JSON.stringify(settings));
        } catch (e) {
            console.error("Failed to save room settings:", e);
        }
        setIsCreateDialogOpen(false);
        onCreateRoom();
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
            className="flex flex-col w-full max-w-[min(96vw,960px)] max-h-[94dvh] lg:h-[600px] shrink-0 bg-stone-950/90 backdrop-blur-md border-2 border-cyan-500/20 rounded-xl overflow-hidden shadow-[0_0_60px_rgba(6,182,212,0.15)] animate-in zoom-in-95 duration-500 font-mono text-stone-300 relative"
        >
            {/* Header */}
            <div className="p-2.5 sm:p-4 border-b border-stone-850 bg-stone-900/20 flex justify-between items-center relative shrink-0 gap-2">
                {/* Visual Accent Ticks */}
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
                            <Swords size={16} className="text-cyan-400 animate-pulse sm:w-5 sm:h-5 shrink-0" />
                            <span className="truncate">MULTIPLAYER</span>
                        </h1>
                        <p className="text-[8.5px] sm:text-[10px] text-stone-500 tracking-wider uppercase mt-0.5 truncate">
                            AGENT: <span className="text-cyan-500 font-bold">{playerName}</span>
                        </p>
                    </div>
                </div>
                <div className="px-2 py-1 bg-cyan-950/20 border border-cyan-900/30 rounded text-cyan-400 text-[8.5px] sm:text-[10px] font-bold uppercase tracking-wider shrink-0">
                    v2.5.0
                </div>
            </div>

            {/* Content Options */}
            <div className={`flex-1 p-2.5 sm:p-5 flex flex-col md:flex-row gap-2.5 sm:gap-4 justify-start ${isMobile ? 'overflow-y-auto' : 'md:justify-center md:overflow-hidden'} items-stretch custom-scrollbar min-h-0`}>
                
                {/* Quick Join Card */}
                <div className="flex-1 border border-stone-850 hover:border-cyan-500/35 bg-stone-900/10 hover:bg-cyan-950/5 p-3.5 sm:p-5 rounded-xl flex flex-col justify-between transition-all duration-300 group relative">
                    <div className="space-y-2 sm:space-y-3">
                        <div className="inline-flex items-center justify-center p-2 sm:p-2.5 bg-cyan-950/30 border border-cyan-800/30 rounded-xl text-cyan-400 group-hover:scale-105 transition-transform duration-300">
                            <Users size={20} className="sm:w-6 sm:h-6" />
                        </div>
                        <div>
                            <h2 className="text-xs sm:text-sm font-black text-white tracking-widest uppercase">QUICK MATCH</h2>
                            <p className="text-[9px] sm:text-[10px] text-stone-500 uppercase leading-relaxed mt-1 sm:mt-2 tracking-wide">
                                Join the first available queue or auto-create a new corridor.
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
                            className="flex-1 py-2.5 min-h-[44px] bg-cyan-955/45 hover:bg-cyan-900/70 border border-cyan-800 hover:border-cyan-400 text-cyan-400 hover:text-white font-black text-[11px] sm:text-xs tracking-wider rounded-xl transition-all cursor-pointer active:scale-98 disabled:opacity-50 flex items-center justify-center gap-1.5"
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
                            className="flex-1 py-2.5 min-h-[44px] bg-stone-900/60 hover:bg-cyan-950/20 border border-stone-850 hover:border-cyan-800 text-stone-400 hover:text-cyan-400 font-black text-[11px] sm:text-xs tracking-wider rounded-xl transition-all cursor-pointer active:scale-98 disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                            <span>ROOMS</span>
                        </button>
                    </div>
                </div>

                {/* Create Room Card */}
                <div className="flex-1 border border-stone-850 hover:border-cyan-500/35 bg-stone-900/10 hover:bg-cyan-955/5 p-3.5 sm:p-5 rounded-xl flex flex-col justify-between transition-all duration-300 group relative">
                    <div className="space-y-2 sm:space-y-3">
                        <div className="inline-flex items-center justify-center p-2 sm:p-2.5 bg-cyan-950/30 border border-cyan-800/30 rounded-xl text-cyan-400 group-hover:scale-105 transition-transform duration-300">
                            <Plus size={20} className="sm:w-6 sm:h-6" />
                        </div>
                        <div>
                            <h2 className="text-xs sm:text-sm font-black text-white tracking-widest uppercase">HOST STAGE</h2>
                            <p className="text-[9px] sm:text-[10px] text-stone-500 uppercase leading-relaxed mt-1 sm:mt-2 tracking-wide">
                                Host a custom bunker (2–4P), starting HP, and shipment rations.
                            </p>
                        </div>
                    </div>
                    
                    <button
                        onClick={() => {
                            audioManager.playSound('click');
                            setIsCreateDialogOpen(true);
                        }}
                        disabled={isConnecting}
                        className="mt-3 sm:mt-5 w-full py-2.5 min-h-[44px] bg-cyan-955/45 hover:bg-cyan-900/70 border border-cyan-800 hover:border-cyan-400 text-cyan-400 hover:text-white font-black text-[11px] sm:text-xs tracking-widest rounded-xl transition-all cursor-pointer active:scale-98 disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                    >
                        {isConnecting ? <RefreshCw size={14} className="animate-spin" /> : <Sliders size={14} className="shrink-0" />}
                        <span>CONFIGURE & HOST</span>
                    </button>
                </div>

                {/* Join Room Card */}
                <div className="flex-1 border border-stone-850 hover:border-cyan-500/35 bg-stone-900/10 hover:bg-cyan-955/5 p-3.5 sm:p-5 rounded-xl flex flex-col justify-between transition-all duration-300 group relative">
                    <div className="space-y-2 sm:space-y-3">
                        <div className="inline-flex items-center justify-center p-2 sm:p-2.5 bg-cyan-950/30 border border-cyan-800/30 rounded-xl text-cyan-400 group-hover:scale-105 transition-transform duration-300">
                            <Key size={20} className="sm:w-6 sm:h-6" />
                        </div>
                        <div>
                            <h2 className="text-xs sm:text-sm font-black text-white tracking-widest uppercase">JOIN LOBBY</h2>
                            <p className="text-[9px] sm:text-[10px] text-stone-500 uppercase leading-relaxed mt-1 sm:mt-2 tracking-wide">
                                Enter a 4-digit corridor code to join directly.
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
                                className="w-full min-h-[44px] bg-stone-950 border border-stone-800 hover:border-stone-700 focus:border-cyan-500/60 px-6 py-2 text-center text-sm font-bold tracking-[0.4em] uppercase rounded-lg outline-none transition-all placeholder-stone-700 text-cyan-400"
                                required
                            />
                            <span className="absolute right-3 text-cyan-600 font-bold text-sm select-none">]</span>
                        </div>
                        
                        <button
                            type="submit"
                            disabled={isConnecting || roomCode.length !== 4}
                            className="w-full py-2.5 min-h-[44px] bg-cyan-500 text-black disabled:bg-stone-900 disabled:text-stone-600 disabled:border-stone-850 border border-cyan-400 font-black text-[11px] sm:text-xs tracking-widest rounded-xl transition-all cursor-pointer active:scale-98 shadow-[0_0_20px_rgba(6,182,212,0.15)] disabled:shadow-none"
                        >
                            JOIN DEPLOYMENT
                        </button>
                    </form>
                </div>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="mx-6 mb-5 px-4 py-3 bg-red-950/30 border border-red-900/50 rounded-xl text-red-500 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <AlertTriangle size={16} className="animate-pulse shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                        [PROTOCOL ERROR: {error.toUpperCase()}]
                    </span>
                </div>
            )}

            {/* Room Creation Customization Dialog */}
            {isCreateDialogOpen && (
                <div className="absolute inset-0 z-50 bg-stone-950/95 backdrop-blur-md flex flex-col p-3 sm:p-5 font-mono text-stone-300 animate-in fade-in zoom-in-95 duration-200 min-h-0">
                    {/* Visual Border Accents */}
                    <div className="absolute top-2 left-2 w-2 h-2 border-t border-l border-cyan-500/40" />
                    <div className="absolute top-2 right-2 w-2 h-2 border-t border-r border-cyan-500/40" />
                    <div className="absolute bottom-2 left-2 w-2 h-2 border-b border-l border-cyan-500/40" />
                    <div className="absolute bottom-2 right-2 w-2 h-2 border-b border-r border-cyan-500/40" />

                    {/* Dialog Header */}
                    <div className="flex justify-between items-center border-b border-stone-850 pb-2.5 mb-2.5 shrink-0">
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="p-1.5 bg-cyan-950/30 border border-cyan-800/40 rounded-lg text-cyan-400 shrink-0">
                                <Sliders size={15} />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-xs sm:text-base font-black text-white tracking-widest uppercase truncate">CREATE CUSTOM BUNKER</h2>
                                <p className="text-[8px] sm:text-[9px] text-stone-500 tracking-wider uppercase truncate">Set deployment parameters</p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                setIsCreateDialogOpen(false);
                            }}
                            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-stone-900 border border-stone-800 text-stone-400 hover:text-white rounded-xl transition-colors cursor-pointer shrink-0"
                            title="Close"
                            aria-label="Close"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {/* Form Controls */}
                    <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
                        {/* Room Name Input */}
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block">Bunker Codename</label>
                            <div className="flex gap-2 items-center">
                                <input
                                    type="text"
                                    maxLength={24}
                                    value={customRoomName}
                                    onChange={(e) => setCustomRoomName(e.target.value)}
                                    placeholder="Enter bunker codename..."
                                    className="flex-1 min-h-[44px] bg-stone-900/80 border border-stone-800 focus:border-cyan-500/60 rounded-xl px-3 py-2 text-xs font-bold text-white placeholder-stone-600 outline-none uppercase tracking-wide"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        audioManager.playSound('click');
                                        setCustomRoomName(generateRandomBunkerName());
                                    }}
                                    className="px-3.5 py-2.5 min-h-[44px] bg-stone-900 hover:bg-stone-850 border border-stone-800 hover:border-cyan-500/50 text-stone-400 hover:text-cyan-400 rounded-xl flex items-center gap-1.5 transition-all text-[9px] font-bold uppercase tracking-wider shrink-0 cursor-pointer active:scale-95"
                                    title="Generate Tactical Codename"
                                    aria-label="Generate Tactical Codename"
                                >
                                    <Dices size={14} className="text-cyan-400" />
                                    <span>RANDOM</span>
                                </button>
                            </div>
                        </div>

                        {/* Privacy & Max Players row */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Privacy Toggle */}
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block">Corridor Visibility</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            audioManager.playSound('click');
                                            setIsPrivateRoom(false);
                                        }}
                                        className={`py-2.5 px-3 min-h-[44px] rounded-xl border text-[9px] font-black tracking-widest uppercase flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                            !isPrivateRoom
                                                ? 'bg-cyan-950/40 border-cyan-500 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                                                : 'bg-stone-900/50 border-stone-850 text-stone-500 hover:text-stone-300'
                                        }`}
                                    >
                                        <Globe size={12} />
                                        <span>PUBLIC</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            audioManager.playSound('click');
                                            setIsPrivateRoom(true);
                                        }}
                                        className={`py-2.5 px-3 min-h-[44px] rounded-xl border text-[9px] font-black tracking-widest uppercase flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                            isPrivateRoom
                                                ? 'bg-amber-955/40 border-amber-500 text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                                                : 'bg-stone-900/50 border-stone-850 text-stone-500 hover:text-stone-300'
                                        }`}
                                    >
                                        <Lock size={12} />
                                        <span>PRIVATE</span>
                                    </button>
                                </div>
                            </div>

                            {/* Max Players */}
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-bold text-stone-400 uppercase tracking-wider block">Agent Capacity</label>
                                <div className="grid grid-cols-3 gap-1.5">
                                    {([2, 3, 4] as const).map((count) => (
                                        <button
                                            key={count}
                                            type="button"
                                            onClick={() => {
                                                audioManager.playSound('click');
                                                setMaxPlayers(count);
                                            }}
                                            className={`py-2.5 min-h-[44px] rounded-xl border text-[9px] font-black tracking-widest uppercase transition-all cursor-pointer ${
                                                maxPlayers === count
                                                    ? 'bg-cyan-950/40 border-cyan-500 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                                                    : 'bg-stone-900/50 border-stone-850 text-stone-500 hover:text-stone-300'
                                            }`}
                                        >
                                            {count}P {count === 2 ? 'DUEL' : count === 3 ? 'TRIAD' : 'SQUAD'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Starting HP Slider */}
                        <div className="p-3 bg-stone-900/30 border border-stone-800 rounded-xl space-y-2">
                            <div className="flex justify-between items-center text-[9px] uppercase font-bold text-stone-400">
                                <span>Starting Vitality</span>
                                <div className="flex items-center gap-2">
                                    <div className="flex gap-1 items-center">
                                        {startingHp === 9 ? (
                                            <span className="text-[7.5px] text-cyan-300 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-700 animate-pulse font-mono font-bold">2-6 HP (RANDOM)</span>
                                        ) : (
                                            Array.from({ length: startingHp }).map((_, i) => (
                                                <span key={i} className="w-2 h-3 bg-cyan-400 rounded-xs inline-block shadow-[0_0_6px_rgba(6,182,212,0.6)]" />
                                            ))
                                        )}
                                    </div>
                                    <span className="text-cyan-400 font-mono font-black text-xs">{startingHp === 9 ? 'RANDOM' : `${startingHp} HP`}</span>
                                </div>
                            </div>
                            <input
                                type="range"
                                min="2"
                                max="9"
                                value={startingHp}
                                onChange={(e) => setStartingHp(parseInt(e.target.value))}
                                className="w-full accent-cyan-500 cursor-pointer h-2 bg-stone-900 rounded-lg appearance-none min-h-[44px] py-3.5"
                                style={{ touchAction: 'pan-x' }}
                            />
                            <div className="flex justify-between text-[7.5px] text-stone-500 font-mono font-bold">
                                <span>2 HP (Hardcore)</span>
                                <span>4 HP (Standard)</span>
                                <span>9 (Random 2-6)</span>
                            </div>
                        </div>

                        {/* Shipment Items Slider */}
                        <div className="p-3 bg-stone-900/30 border border-stone-800 rounded-xl space-y-2">
                            <div className="flex justify-between items-center text-[9px] uppercase font-bold text-stone-400">
                                <span>Items per Shipment</span>
                                <div className="flex items-center gap-1.5">
                                    {itemsPerShipment === 9 ? (
                                        <span className="text-[7.5px] text-cyan-300 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-700 animate-pulse font-mono font-bold">1-5 ITEMS (RANDOM)</span>
                                    ) : (
                                        <span className="text-cyan-400 font-mono font-black text-xs">{itemsPerShipment} ITEMS</span>
                                    )}
                                </div>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="9"
                                value={itemsPerShipment}
                                onChange={(e) => setItemsPerShipment(parseInt(e.target.value))}
                                className="w-full accent-cyan-500 cursor-pointer h-2 bg-stone-900 rounded-lg appearance-none min-h-[44px] py-3.5"
                                style={{ touchAction: 'pan-x' }}
                            />
                            <div className="flex justify-between text-[7.5px] text-stone-500 font-mono font-bold">
                                <span>0 (No Items)</span>
                                <span>4 (Standard)</span>
                                <span>9 (Random 1-5)</span>
                            </div>
                        </div>

                        {/* Rounds to Win */}
                        <div className="p-3 bg-stone-900/20 border border-stone-850 rounded-xl space-y-1.5">
                            <div className="flex justify-between items-center text-[9px] uppercase font-bold text-stone-400">
                                <span>Rounds to Win Match</span>
                                <span className="text-cyan-400 font-mono font-black">{roundsToWin} {roundsToWin === 1 ? 'ROUND' : 'ROUNDS'}</span>
                            </div>
                            <input
                                type="range"
                                min="1"
                                max="7"
                                step="2"
                                value={roundsToWin}
                                onChange={(e) => setRoundsToWin(parseInt(e.target.value))}
                                className="w-full accent-cyan-500 cursor-pointer h-2 bg-stone-900 rounded-lg appearance-none min-h-[44px] py-3.5"
                                style={{ touchAction: 'pan-x' }}
                            />
                            <div className="flex justify-between text-[7.5px] text-stone-600 font-mono">
                                <span>Best of 1</span>
                                <span>Best of 3</span>
                                <span>Best of 7</span>
                            </div>
                        </div>
                    </div>

                    {/* Dialog Actions */}
                    <div className="pt-3 border-t border-stone-850 flex gap-2.5">
                        <button
                            type="button"
                            onClick={() => {
                                audioManager.playSound('click');
                                setIsCreateDialogOpen(false);
                            }}
                            className="flex-1 py-3 min-h-[44px] bg-stone-900 hover:bg-stone-850 border border-stone-800 text-stone-400 hover:text-white font-black text-xs tracking-widest uppercase rounded-xl transition-all cursor-pointer flex items-center justify-center"
                        >
                            CANCEL
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmCreate}
                            disabled={isConnecting}
                            className="flex-[2] py-3 min-h-[44px] bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xs tracking-widest uppercase rounded-xl transition-all cursor-pointer shadow-[0_0_20px_rgba(6,182,212,0.3)] disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isConnecting ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                            <span>DEPLOY BUNKER</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Active Rooms Browser Overlay Panel */}
            {isBrowserOpen && (
                <div className="absolute inset-0 z-50 bg-stone-950 flex flex-col p-3 sm:p-5 font-mono text-stone-300 animate-in fade-in duration-200 min-h-0">
                    {/* Visual Border Accents */}
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
                                title="Back to Protocol Selection"
                                aria-label="Back to Protocol Selection"
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
                            {/* Search Filter Input */}
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
                                className={`px-3.5 py-2 min-h-[44px] rounded-xl text-[8.5px] sm:text-[9.5px] font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center ${
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
                                <span className="text-[10px] text-stone-500 uppercase tracking-widest animate-pulse">Scanning Net Nodes...</span>
                            </div>
                        ) : filteredRooms.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 border border-dashed border-stone-850 rounded-xl text-stone-600 space-y-2 text-center p-4">
                                <span className="text-xs font-bold uppercase tracking-wider">// NO MATCHING CORRIDORS FOUND</span>
                                <span className="text-[9px] uppercase tracking-wide max-w-xs leading-relaxed text-stone-500">
                                    Establish a new lobby corridor to allow other agents to scan and link to your simulation instance.
                                </span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4">
                                {filteredRooms.map((room) => (
                                    <div 
                                        key={room.id}
                                        className="border border-stone-850 hover:border-cyan-500/30 bg-stone-900/10 hover:bg-cyan-950/5 p-4 rounded-xl flex flex-col justify-between gap-3 transition-all duration-300 group"
                                    >
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-start gap-2">
                                                <span className="text-xs font-black text-stone-200 uppercase truncate pr-1">
                                                    {room.name}
                                                </span>
                                                {room.isPlaying ? (
                                                    <span className="px-2 py-0.5 bg-amber-955/40 border border-amber-900/30 rounded text-[9px] font-bold text-amber-500 uppercase tracking-wider shrink-0 animate-pulse">
                                                        PLAYING
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-0.5 bg-cyan-950/40 border border-cyan-900/30 rounded text-[9px] font-bold text-cyan-400 uppercase tracking-wider shrink-0">
                                                        {room.playerCount} / {room.maxPlayers || 4} CONNECTED
                                                    </span>
                                                )}
                                            </div>
                                            
                                            <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-[8.5px] font-mono text-stone-500 uppercase">
                                                <span className="border border-stone-850 px-1 rounded bg-stone-950 text-stone-400">ID: {room.id}</span>
                                                <span>•</span>
                                                <span>HP: {room.settings?.hp === 9 ? 'RANDOM' : (room.settings?.hp || 4)}</span>
                                                <span>•</span>
                                                <span>ROUNDS: {room.settings?.rounds || 3}</span>
                                                <span>•</span>
                                                <span>ITEMS: {room.settings?.itemsPerShipment === 9 ? 'RANDOM' : (room.settings?.itemsPerShipment || 4)}</span>
                                            </div>
                                        </div>

                                        {room.isPlaying ? (
                                            <div className="w-full py-2 border border-stone-850 bg-stone-900/40 text-amber-500/70 font-black text-[10px] tracking-widest rounded-lg flex items-center justify-center gap-1.5 uppercase select-none">
                                                <span>MATCH IN PROGRESS</span>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => {
                                                    audioManager.playSound('click');
                                                    onJoinRoom(room.id);
                                                    setIsBrowserOpen(false);
                                                }}
                                                className="w-full py-2.5 min-h-[44px] border border-cyan-800/40 group-hover:border-cyan-500/60 bg-cyan-950/20 group-hover:bg-cyan-950/50 hover:bg-cyan-900 text-cyan-400 group-hover:text-cyan-300 hover:text-white font-black text-[10px] tracking-widest rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                            >
                                                <span>ESTABLISH UPLINK</span>
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Proper Kicking Message Overlay */}
            {error && error.toLowerCase().includes('kick') && (
                <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="w-full max-w-[min(360px,calc(100vw-32px))] sm:max-w-md bg-stone-950 border-2 border-red-500/30 p-6 rounded-xl shadow-[0_0_50px_rgba(239,68,68,0.2)] text-center space-y-4 font-mono select-none">
                        <div className="inline-flex p-3 bg-red-950/40 border border-red-500/40 text-red-500 rounded-full animate-bounce">
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
