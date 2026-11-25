import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChangelogModal } from './ChangelogModal';
import { AnnouncementModal } from './AnnouncementModal';
import { LeaderboardModal } from '../LeaderboardModal';
import {
    Settings as SettingsIcon,
    HelpCircle,
    Trophy,
    ShieldAlert,
    Lock,
    User,
    Mail,
    Terminal,
    BookOpen,
    Crown,
    Skull,
    X,
    Crosshair,
    Swords,
    Bell,
    RotateCw,
    AlertTriangle,
    Key,
    Eye,
    EyeOff,
    MessageSquare,
    Download,
    ChevronDown,
    ChevronUp,
    Users
} from 'lucide-react';
import { SplitSetupModal } from '../SplitSetupModal';
import type { LocalSplitConfig } from '../../types';
import { audioManager } from '../../utils/audioManager';
import {
    UserProfile,
    LeaderboardEntry,
    loginUserWithFirebase,
    registerUserWithFirebase,
    sendPasswordReset,
    getLeaderboard,
    getCurrentUserProfile,
    findUserByUsernameOrEmail,
    logoutUserFromFirebase,
    getPlayerId,
    updateUserLastSeen,
    isLegacyUpstashUser
} from '../../utils/firebaseService';
import { ProfileModal } from './ProfileModal';
import { MigrationModal } from './MigrationModal';
import { AdminDashboardModal } from './AdminDashboardModal';
import { MessagesModal } from './MessagesModal';
import { subscribeToNotifications, NotificationCounts, subscribeToFriends, FriendUser, resolvePlayerAvatar } from '../../utils/messagingService';
import { presenceClient, UserPresence } from '../../utils/presenceService';
import { getDicebearUrl } from '../../utils/dicebear';
import { GAME_VERSION, ANNOUNCEMENT_VERSION } from '../../constants';
import { setUserActiveStats, clearActiveStatsSession, emptyStats } from '../../utils/statsManager';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { showAlert } from '../../utils/modalService';

const AUTH_QUOTES = [
    "The odds are equal, the consequences are not.",
    "A deal signed in shadow binds the soul.",
    "The cylinder spins, but destiny has already chosen.",
    "In the game of fate, there are no spectators.",
    "Your luck is a borrowed resource; the dealer is calling in the debt.",
    "Fear the blank, respect the live.",
    "Every chamber is a question. What is your answer?",
    "A loaded chamber has no room for regret.",
    "The shotgun is a neutral judge; the dealer is not.",
    "Bargain with flesh, pay in blood.",
    "The dealer knows your name. The machine knows your future."
];

// Module-level throttle for lastSeen Firestore updates across menu remounts
const LAST_SEEN_THROTTLE_MS = 45000;
const lastSeenSentAt = new Map<string, number>();

const readIsLowPerfSetting = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        const raw = localStorage.getItem('aadish_roulette_settings');
        if (raw) {
            const s = JSON.parse(raw);
            if (s?.ultraPerformance || s?.graphicsMode === 'potato' || s?.graphicsMode === 'low') {
                return true;
            }
        }
    } catch {}
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return true;
    }
    return false;
};

interface IntroScreenProps {
    playerName: string;
    inputName: string;
    setInputName: (name: string) => void;
    onStartGame: (hardMode?: boolean) => void;
    onOpenSettings: () => void;
    onOpenGuide: () => void;
    onOpenScoreboard: () => void;
    onStartMultiplayer: (name: string, roomId?: string) => void;
    onStartLocalSplit?: (config: LocalSplitConfig) => void;
}

interface BindSoulOverlayProps {
    isBindingSoul: boolean;
    isMobile: boolean;
    isTouchDevice: boolean;
    reduceEffects: boolean;
    onBindSoul: () => void;
}

const BindSoulOverlay: React.FC<BindSoulOverlayProps> = React.memo(({
    isBindingSoul,
    isMobile,
    isTouchDevice,
    reduceEffects,
    onBindSoul
}) => (
    <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden pointer-events-auto bg-black font-mono cursor-pointer animate-in fade-in duration-700 select-none"
        onClick={onBindSoul}
        role="button"
        tabIndex={0}
        aria-label="Bind soul to enter BugShot Roulette"
    >
        {/* Subtle dark ambient red glow - gate continuous pulse on low-perf/touch */}
        <div
            className={`absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(220,38,38,${isBindingSoul ? '0.22' : '0.07'})_0%,transparent_70%)] ${
                isBindingSoul || reduceEffects ? 'animate-none' : 'animate-pulse'
            } transition-all duration-200 pointer-events-none`}
        />

        <div className={`text-center relative z-10 p-4 max-w-xl mx-auto flex flex-col items-center transition-transform duration-200 ${isBindingSoul ? 'scale-[1.02]' : 'scale-100'}`}>
            <h1 className={`text-6xl sm:text-8xl md:text-9xl font-black text-stone-100 mb-8 sm:mb-10 tracking-tighter leading-none ${
                reduceEffects ? '' : 'drop-shadow-[0_0_25px_rgba(255,255,255,0.2)]'
            }`}>
                <span className="block animate-in slide-in-from-top duration-700">BUGSHOT</span>
                <span className="block text-red-650 animate-[text-pop_0.5s_ease-out] relative">
                    ROULETTE
                    {!isMobile && !reduceEffects && (
                        <span className="absolute -inset-1 text-red-400 opacity-20 blur-sm animate-glitch pointer-events-none">ROULETTE</span>
                    )}
                </span>
            </h1>

            <div className="text-stone-400 text-xs sm:text-sm md:text-base tracking-[0.45em] sm:tracking-[0.55em] font-bold uppercase transition-all duration-300 group hover:text-stone-100 flex flex-col items-center gap-3">
                <div className={`mb-1 transition-all duration-150 ${
                    isBindingSoul
                        ? `text-red-500 scale-105 font-black ${reduceEffects ? '' : 'drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]'}`
                        : (reduceEffects ? 'text-stone-300' : 'animate-pulse')
                }`}>
                    {isBindingSoul
                        ? '[ CONTRACT SEALED ]'
                        : `[ ${isTouchDevice ? 'TAP TO BIND SOUL' : 'CLICK TO BIND SOUL'} ]`
                    }
                </div>
                <div className="text-[8.5px] sm:text-[10px] text-stone-600 group-hover:text-red-900/80 tracking-[0.3em] font-mono transition-colors">
                    BY ENTERING, YOU WAIVE ALL RIGHTS TO PHYSICAL CONTINUITY
                </div>
                {!isTouchDevice && !isBindingSoul && (
                    <div className="text-[7.5px] text-stone-600 tracking-[0.25em] font-mono uppercase mt-1">
                        PRESS SPACE OR CLICK TO INITIATE
                    </div>
                )}
            </div>
        </div>

        {/* Subtle scanline overlay (desktop high/balanced only) */}
        {!isMobile && !reduceEffects && <div className="scan-line !opacity-15 pointer-events-none" />}
    </div>
));
BindSoulOverlay.displayName = 'BindSoulOverlay';

interface DesktopCommsPanelProps {
    currentUser: UserProfile | null;
    isOnline: boolean;
    reduceEffects: boolean;
    notificationCounts: NotificationCounts;
    friends: FriendUser[];
    onOpenMessages: (targetUsername: string | null) => void;
    onRequireLogin: () => void;
    onOfflineToast: (msg: string) => void;
}

const DesktopCommsPanel: React.FC<DesktopCommsPanelProps> = React.memo(({
    currentUser,
    isOnline,
    reduceEffects,
    notificationCounts,
    friends,
    onOpenMessages,
    onRequireLogin,
    onOfflineToast
}) => {
    const [isFriendsExpanded, setIsFriendsExpanded] = useState(false);
    const [, setFriendsPresenceTick] = useState(0);
    const lastSigRef = useRef('');

    // Subscribe to presence ONLY to detect status changes among the user's own friends
    useEffect(() => {
        if (!currentUser || !isOnline || friends.length === 0) {
            lastSigRef.current = '';
            return;
        }
        const computeSignature = () =>
            friends
                .map((f) => `${f.username}:${presenceClient.getPresence(f.username)?.status || 'offline'}`)
                .join('|');

        lastSigRef.current = computeSignature();
        const unsubscribe = presenceClient.subscribe(() => {
            const nextSig = computeSignature();
            if (nextSig !== lastSigRef.current) {
                lastSigRef.current = nextSig;
                setFriendsPresenceTick((t) => t + 1);
            }
        });
        return unsubscribe;
    }, [currentUser?.username, isOnline, friends]);

    const onlineFriends = useMemo(() => {
        if (!currentUser || !friends.length) return [];
        return friends.filter((f) => {
            const p = presenceClient.getPresence(f.username);
            return p && p.status && p.status !== 'offline';
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser, friends, lastSigRef.current]);

    const blurXl = '';

    return (
        <div className="absolute top-4 left-4 sm:top-6 sm:left-6 z-[60] hidden sm:flex flex-col items-start gap-2.5 pointer-events-auto">
            <button
                onClick={() => {
                    audioManager.playSound('click');
                    if (!isOnline) {
                        onOfflineToast('OFFLINE PROTOCOL: Encrypted comms require an active internet connection.');
                        return;
                    }
                    if (!currentUser) {
                        onRequireLogin();
                        return;
                    }
                    onOpenMessages(null);
                }}
                className={`group/msg flex items-center gap-2.5 bg-stone-950/90 hover:bg-stone-900/95 border border-stone-800 hover:border-cyan-500/60 py-2 px-3.5 rounded-2xl ${blurXl} hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer text-left shadow-[0_8px_30px_rgba(0,0,0,0.6)] ${
                    !isOnline ? 'opacity-50 grayscale' : ''
                }`}
                title={!isOnline ? "Offline - Internet required for comms" : "Direct Messages & Encrypted Comms"}
            >
                <div className="relative">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center p-0.5 transition-all ${
                        notificationCounts.total > 0
                            ? 'bg-red-955/60 ring-2 ring-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]'
                            : 'bg-cyan-955/30 ring-1 ring-cyan-700/40 group-hover/msg:ring-cyan-400 group-hover/msg:bg-cyan-955/60 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                    }`}>
                        <Mail className={`w-4 h-4 transition-transform ${
                            notificationCounts.total > 0
                                ? 'text-red-400 group-hover/msg:scale-110'
                                : 'text-cyan-400 group-hover/msg:scale-110'
                        }`} />
                    </div>
                    {notificationCounts.total > 0 ? (
                        <span className={`absolute -top-1.5 -right-1.5 px-1.5 py-0.2 bg-red-600 border border-red-300 text-white text-[9px] font-black rounded-full shadow-[0_0_12px_rgba(220,38,38,0.9)] ${reduceEffects ? '' : 'animate-pulse'} flex items-center justify-center min-w-[18px]`}>
                            {notificationCounts.total > 9 ? '9+' : notificationCounts.total}
                        </span>
                    ) : !isOnline ? (
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-stone-950 shadow-sm" />
                    ) : (
                        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-cyan-400 border-2 border-stone-950 shadow-sm ${reduceEffects ? '' : 'animate-pulse'}`} />
                    )}
                </div>
                <div className="flex flex-col">
                    <span className={`text-[12px] font-mono font-bold tracking-wider leading-tight transition-colors ${
                        notificationCounts.total > 0 ? 'text-red-300 group-hover/msg:text-white' : 'text-stone-200 group-hover/msg:text-cyan-300'
                    }`}>
                        Messages {!isOnline && <span className="text-[7.5px] text-red-400 uppercase font-mono tracking-widest">[OFF]</span>}
                    </span>
                    {notificationCounts.total > 0 && isOnline && (
                        <span className="text-[8px] font-mono font-bold text-red-400 tracking-wider">
                            {notificationCounts.unreadDMs > 0 && `${notificationCounts.unreadDMs} New DM`}
                            {notificationCounts.unreadDMs > 0 && notificationCounts.pendingRequests > 0 && ' • '}
                            {notificationCounts.pendingRequests > 0 && `${notificationCounts.pendingRequests} Request`}
                        </span>
                    )}
                </div>
            </button>

            {currentUser && isOnline && (
                <div className={`w-56 bg-stone-950/90 hover:bg-stone-900/90 border border-stone-800 rounded-2xl p-2.5 ${blurXl} shadow-[0_8px_30px_rgba(0,0,0,0.6)] transition-all animate-in fade-in duration-200`}>
                    <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-stone-850 px-1">
                        <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${onlineFriends.length > 0 ? `bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] ${reduceEffects ? '' : 'animate-pulse'}` : 'bg-stone-500'}`} />
                            <span className="text-[9px] font-mono font-bold tracking-wider text-stone-300 uppercase">
                                ONLINE FRIENDS
                            </span>
                        </div>
                        <span className="text-[9px] font-mono font-black text-cyan-400 bg-cyan-955/40 px-1.5 py-0.2 rounded border border-cyan-800/40">
                            {onlineFriends.length}
                        </span>
                    </div>

                    {onlineFriends.length === 0 ? (
                        <div className="py-1.5 px-1 text-center">
                            <p className="text-[8.5px] font-mono text-stone-500 uppercase tracking-wider">
                                {friends.length === 0 ? 'NO FRIENDS ADDED' : 'NO FRIENDS ONLINE'}
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1 max-h-56 overflow-y-auto pr-0.5 custom-scrollbar">
                            {(isFriendsExpanded ? onlineFriends : onlineFriends.slice(0, 4)).map((friend) => {
                                const presence = presenceClient.getPresence(friend.username);
                                const status = presence?.status || 'online';
                                const isMatch = status === 'in_match';
                                const isLobby = status === 'in_lobby';
                                const statusLabel = isMatch ? 'In Match' : isLobby ? 'In Lobby' : 'Online';
                                const dotColor = isMatch
                                    ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]'
                                    : isLobby
                                    ? 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.6)]'
                                    : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]';
                                const statusTextColor = isMatch ? 'text-amber-400' : isLobby ? 'text-cyan-400' : 'text-emerald-400';

                                return (
                                    <button
                                        key={friend.username}
                                        onClick={() => {
                                            audioManager.playSound('click');
                                            onOpenMessages(friend.username);
                                        }}
                                        className="group/f flex items-center gap-2 p-1.5 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-all text-left cursor-pointer w-full"
                                        title={`Direct message @${friend.displayName || friend.username} (${statusLabel})`}
                                    >
                                        <div className="relative shrink-0">
                                            <img
                                                src={resolvePlayerAvatar(friend)}
                                                alt={friend.displayName || friend.username}
                                                loading="lazy"
                                                decoding="async"
                                                className="w-6 h-6 rounded-full object-cover bg-stone-900 border border-white/10"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).src = '/image/favicon/android-chrome-192x192.png';
                                                }}
                                            />
                                            <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-stone-950 ${dotColor}`} />
                                        </div>
                                        <div className="flex flex-col min-w-0 flex-1">
                                            <span className="text-[10px] font-mono font-bold text-stone-200 group-hover/f:text-white truncate">
                                                {friend.displayName || friend.username}
                                            </span>
                                            <span className={`text-[7.5px] font-mono font-medium ${statusTextColor} tracking-wide truncate`}>
                                                {statusLabel}
                                            </span>
                                        </div>
                                        <MessageSquare className="w-3 h-3 text-stone-500 group-hover/f:text-cyan-400 opacity-0 group-hover/f:opacity-100 transition-opacity shrink-0 mr-0.5" />
                                    </button>
                                );
                            })}

                            {onlineFriends.length > 4 && (
                                <button
                                    onClick={() => {
                                        audioManager.playSound('click');
                                        setIsFriendsExpanded((prev) => !prev);
                                    }}
                                    className="flex items-center justify-center gap-1 py-1 px-2 mt-0.5 rounded-lg bg-white/5 hover:bg-white/10 text-[8px] font-mono font-bold text-stone-400 hover:text-white transition-all cursor-pointer border border-white/5"
                                >
                                    <span>{isFriendsExpanded ? 'COLLAPSE' : `+${onlineFriends.length - 4} MORE`}</span>
                                    {isFriendsExpanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});
DesktopCommsPanel.displayName = 'DesktopCommsPanel';

interface DesktopProfileBadgeProps {
    currentUser: UserProfile | null;
    isDeveloper: boolean;
    reduceEffects: boolean;
    onOpenAdmin: () => void;
    onOpenProfile: () => void;
    onOpenLogin: () => void;
}

const DesktopProfileBadge: React.FC<DesktopProfileBadgeProps> = React.memo(({
    currentUser,
    isDeveloper,
    reduceEffects,
    onOpenAdmin,
    onOpenProfile,
    onOpenLogin
}) => {
    const blurXl = '';
    const blurMd = '';

    return (
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-[60] hidden sm:flex items-center gap-2.5">
            {currentUser ? (
                <div className="flex items-center gap-2">
                    {isDeveloper && (
                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                onOpenAdmin();
                            }}
                            className={`group/admin flex items-center gap-2.5 bg-gradient-to-r from-red-955/95 via-stone-900 to-red-955/95 hover:from-red-900 hover:to-red-950 border border-red-600/80 hover:border-red-400 p-1.5 pl-3 pr-3.5 rounded-2xl ${blurXl} shadow-[0_0_22px_rgba(220,38,38,0.45)] hover:shadow-[0_0_35px_rgba(220,38,38,0.7)] hover:scale-[1.03] active:scale-[0.98] transition-all cursor-pointer text-left`}
                            title="Developer System Admin Control Center"
                        >
                            <div className="relative">
                                <div className="w-8 h-8 rounded-full bg-red-955 border border-red-600/70 flex items-center justify-center text-red-400 group-hover/admin:text-white transition-colors">
                                    <ShieldAlert size={16} className="group-hover/admin:rotate-12 transition-transform duration-300" />
                                </div>
                                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                                    {!reduceEffects && (
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                    )}
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                                </span>
                            </div>
                            <div className="flex flex-col text-left">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] text-red-200 font-mono font-black uppercase tracking-wider leading-none">
                                        ADMIN
                                    </span>
                                    <span className="px-1 py-0.2 bg-red-650 text-white text-[6.5px] font-black tracking-widest rounded uppercase">
                                        ROOT
                                    </span>
                                </div>
                                <span className="text-[7.5px] text-red-400 font-mono tracking-wider font-semibold mt-0.5">
                                    DEV CONSOLE
                                </span>
                            </div>
                        </button>
                    )}
                    <button
                        onClick={() => {
                            audioManager.playSound('click');
                            onOpenProfile();
                        }}
                        className={`group/profile flex items-center gap-3 bg-stone-950/95 hover:bg-stone-900 border border-stone-800 hover:border-stone-700 p-1.5 pl-2.5 pr-4 rounded-2xl ${blurXl} shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer text-left`}
                        title="View and Edit Profile"
                    >
                        <div className="relative">
                            <div className="w-9 h-9 rounded-full overflow-hidden bg-stone-900 ring-1 ring-stone-700 p-0.5">
                                <img
                                    src={resolvePlayerAvatar(currentUser)}
                                    alt={currentUser.username}
                                    loading="lazy"
                                    decoding="async"
                                    className="w-full h-full object-cover rounded-full group-hover/profile:scale-105 transition-transform"
                                />
                            </div>
                            <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-stone-950 shadow-sm ${
                                isLegacyUpstashUser(currentUser) ? `bg-amber-400 ${reduceEffects ? '' : 'animate-ping'}` : 'bg-emerald-500'
                            }`} />
                        </div>
                        <div className="flex flex-col text-left">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-stone-200 font-mono font-bold uppercase tracking-wider leading-none">
                                    {currentUser.displayName || currentUser.username}
                                </span>
                                {isLegacyUpstashUser(currentUser) ? (
                                    <span className={`px-1.5 py-0.2 bg-amber-955 border border-amber-600 text-amber-300 text-[6.5px] font-black rounded uppercase ${reduceEffects ? '' : 'animate-pulse'}`}>
                                        LINK GMAIL
                                    </span>
                                ) : currentUser.isDeveloper ? (
                                    <span className="px-1.5 py-0.2 bg-red-955 border border-red-800 text-red-400 text-[7px] font-bold tracking-widest rounded uppercase">
                                        DEV
                                    </span>
                                ) : (
                                    <span className="px-1 py-0.2 bg-stone-900 border border-stone-800 text-stone-400 text-[6.5px] font-bold rounded uppercase">
                                        PLAYER
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[8.5px] text-stone-400 font-bold uppercase tracking-wider leading-none font-mono">
                                    {getPlayerId(currentUser)}
                                </span>
                            </div>
                        </div>
                    </button>
                </div>
            ) : (
                <button
                    onClick={() => {
                        audioManager.playSound('click');
                        onOpenLogin();
                    }}
                    className={`group/signin px-4 py-2 sm:px-5 sm:py-2.5 bg-gradient-to-r from-red-955/80 to-stone-950/90 border border-red-700/50 text-red-400 hover:text-white hover:border-red-500 font-mono font-black text-[9px] sm:text-[10px] tracking-[0.2em] rounded-xl ${blurMd} transition-all shadow-[0_0_25px_rgba(220,38,38,0.15)] hover:shadow-[0_0_40px_rgba(220,38,38,0.3)] hover:scale-105 active:scale-95 uppercase flex items-center gap-2 cursor-pointer small-btn`}
                >
                    <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2">
                        {!reduceEffects && (
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                        )}
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 sm:h-2 sm:w-2 bg-red-650" />
                    </span>
                    Sign In / Register
                </button>
            )}
        </div>
    );
});
DesktopProfileBadge.displayName = 'DesktopProfileBadge';

interface MobileStatusRowProps {
    currentUser: UserProfile | null;
    isOnline: boolean;
    isDeveloper: boolean;
    reduceEffects: boolean;
    notificationCounts: NotificationCounts;
    onOpenMessages: () => void;
    onOpenProfileOrMigration: () => void;
    onOpenLogin: () => void;
    onOpenAdmin: () => void;
    onOfflineToast: (msg: string) => void;
}

const MobileStatusRow: React.FC<MobileStatusRowProps> = React.memo(({
    currentUser,
    isOnline,
    isDeveloper,
    reduceEffects,
    notificationCounts,
    onOpenMessages,
    onOpenProfileOrMigration,
    onOpenLogin,
    onOpenAdmin,
    onOfflineToast
}) => (
    <div className="sm:hidden mb-3 flex justify-center items-center gap-2 shrink-0 flex-wrap">
        <button
            onClick={() => {
                audioManager.playSound('click');
                if (!isOnline) {
                    onOfflineToast('OFFLINE PROTOCOL: Encrypted comms require an active internet connection.');
                    return;
                }
                if (!currentUser) {
                    onOpenLogin();
                    return;
                }
                onOpenMessages();
            }}
            className={`flex items-center gap-2 bg-stone-950/90 border min-h-[44px] py-1.5 px-3 rounded-xl shadow-md cursor-pointer transition-all text-left touch-manipulation active:scale-95 ${
                !isOnline
                    ? 'border-stone-850 opacity-50 grayscale'
                    : notificationCounts.total > 0
                    ? 'border-red-600/80 bg-red-955/20'
                    : 'border-stone-800 hover:border-cyan-800/60'
            }`}
            title={!isOnline ? "Offline - Internet required for comms" : "Direct Messages & Encrypted Comms"}
        >
            <div className="relative">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    notificationCounts.total > 0
                        ? 'bg-red-955/60 ring-1 ring-red-500'
                        : 'bg-cyan-955/40 ring-1 ring-cyan-700/50'
                }`}>
                    <Mail className={`w-3.5 h-3.5 ${notificationCounts.total > 0 ? 'text-red-400' : 'text-cyan-400'}`} />
                </div>
                {notificationCounts.total > 0 ? (
                    <span className={`absolute -top-1.5 -right-1.5 px-1 py-0.2 bg-red-600 border border-red-300 text-white text-[8px] font-black rounded-full ${reduceEffects ? '' : 'animate-pulse'} min-w-[16px] text-center`}>
                        {notificationCounts.total > 9 ? '9+' : notificationCounts.total}
                    </span>
                ) : (
                    <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-cyan-400 border border-stone-950" />
                )}
            </div>
            <span className={`text-[11px] font-mono font-bold tracking-wider leading-none ${
                notificationCounts.total > 0 ? 'text-red-300' : 'text-stone-200'
            }`}>
                Messages{notificationCounts.total > 0 ? ` (${notificationCounts.total})` : ''}
            </span>
        </button>

        {currentUser ? (
            <button
                onClick={() => {
                    audioManager.playSound('click');
                    onOpenProfileOrMigration();
                }}
                className="flex items-center gap-2 bg-stone-950/90 border border-stone-800 min-h-[44px] p-1.5 pl-2 pr-3 rounded-xl shadow-md cursor-pointer hover:border-stone-700 transition-all text-left touch-manipulation active:scale-95"
            >
                <div className="relative">
                    <img
                        src={resolvePlayerAvatar(currentUser)}
                        alt={currentUser.username}
                        loading="lazy"
                        decoding="async"
                        className="w-6 h-6 rounded-full bg-stone-900 border border-stone-750 object-cover shrink-0"
                    />
                    <span className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-stone-950 ${
                        isLegacyUpstashUser(currentUser) ? 'bg-amber-400' : 'bg-emerald-500'
                    }`} />
                </div>
                <div className="flex flex-col text-left">
                    <div className="flex items-center gap-1">
                        <span className="text-[10px] text-stone-200 font-mono font-bold uppercase tracking-wider leading-none truncate max-w-[90px]">
                            {currentUser.displayName || currentUser.username}
                        </span>
                        {isLegacyUpstashUser(currentUser) ? (
                            <span className="px-1 py-0.2 bg-amber-955 border border-amber-600 text-amber-300 text-[5.5px] font-black rounded uppercase">LINK</span>
                        ) : currentUser.isDeveloper ? (
                            <span className="px-1 py-0.2 bg-red-955 border border-red-800 text-red-400 text-[6px] font-bold rounded uppercase">DEV</span>
                        ) : null}
                    </div>
                    <span className="text-[7px] text-stone-500 font-bold uppercase tracking-widest leading-none mt-0.5 font-mono">
                        {getPlayerId(currentUser)}
                    </span>
                </div>
            </button>
        ) : (
            <button
                onClick={() => {
                    audioManager.playSound('click');
                    onOpenLogin();
                }}
                className="group/signin px-3.5 py-2 min-h-[44px] bg-gradient-to-r from-red-955/80 to-stone-950 border border-red-700/60 text-red-400 hover:text-white font-mono font-black text-[9px] tracking-[0.2em] rounded-xl transition-all shadow-md active:scale-95 uppercase flex items-center gap-2 cursor-pointer touch-manipulation"
            >
                <span className="relative flex h-1.5 w-1.5">
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-650" />
                </span>
                Sign In / Register
            </button>
        )}

        {isDeveloper && (
            <button
                onClick={() => {
                    audioManager.playSound('click');
                    onOpenAdmin();
                }}
                className="flex items-center gap-1.5 bg-gradient-to-r from-red-955 via-stone-900 to-red-955 border border-red-600/80 hover:border-red-400 min-h-[44px] py-1.5 px-3 rounded-xl shadow-md cursor-pointer text-left active:scale-95 transition-all touch-manipulation"
                title="Admin Console"
            >
                <ShieldAlert size={14} className="text-red-400 shrink-0" />
                <span className="text-[10px] text-red-200 font-mono font-black uppercase tracking-wider">
                    ADMIN
                </span>
            </button>
        )}
    </div>
));
MobileStatusRow.displayName = 'MobileStatusRow';

export const IntroScreen: React.FC<IntroScreenProps> = React.memo(({
    inputName,
    setInputName,
    onStartGame,
    onOpenSettings,
    onOpenGuide,
    onOpenScoreboard,
    onStartMultiplayer,
    onStartLocalSplit
}) => {
    const nameInputRef = useRef<HTMLInputElement>(null);
    const isOnline = useOnlineStatus();
    const [scale, setScale] = useState(1);
    const [showHardModeWarning, setShowHardModeWarning] = useState(false);
    const [showSplitSetup, setShowSplitSetup] = useState(false);
    const [hasBoundSoul, setHasBoundSoul] = useState(false);
    const [isBindingSoul, setIsBindingSoul] = useState(false);
    const [isTouchDevice, setIsTouchDevice] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [isLowPerfSetting, setIsLowPerfSetting] = useState(() => readIsLowPerfSetting());

    // Dialog & UI state
    const [showChangelog, setShowChangelog] = useState(false);
    const [showAnnouncement, setShowAnnouncement] = useState(false);
    const [pendingChangelog, setPendingChangelog] = useState(false);
    const [showLoginModal, setShowLoginModal] = useState(false);
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [loginTab, setLoginTab] = useState<'signin' | 'register'>('signin');
    const [loginUsername, setLoginUsername] = useState('');
    const [loginEmail, setLoginEmail] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loginError, setLoginError] = useState('');
    const [loginSuccess, setLoginSuccess] = useState('');
    const [isLoadingAuth, setIsLoadingAuth] = useState(false);

    const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => getCurrentUserProfile());
    const loggedInUser = currentUser ? { username: currentUser.username } : null;

    // Profile & Migration Modal States
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [selectedPublicProfile, setSelectedPublicProfile] = useState<LeaderboardEntry | UserProfile | null>(null);
    const openedProfileFromLeaderboardRef = useRef(false);
    const [showMigrationModal, setShowMigrationModal] = useState(false);
    const [legacyUserToMigrate, setLegacyUserToMigrate] = useState<UserProfile | null>(null);

    // Leaderboard & Detailed Profile states
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);
    const [selectedMPMatch, setSelectedMPMatch] = useState<any>(null);
    const [showResetSpamModal, setShowResetSpamModal] = useState(false);
    const [spamNoticeTarget, setSpamNoticeTarget] = useState('');
    const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
    const [forgotPasswordInput, setForgotPasswordInput] = useState('');
    const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
    const [forgotPasswordError, setForgotPasswordError] = useState('');
    const [messagesToast, setMessagesToast] = useState<string | null>(null);
    const [showMessagesModal, setShowMessagesModal] = useState(false);
    const [messagesTargetUser, setMessagesTargetUser] = useState<string | null>(null);
    const [showAdminModal, setShowAdminModal] = useState(false);
    const [notificationCounts, setNotificationCounts] = useState<NotificationCounts>({
        unreadDMs: 0,
        pendingRequests: 0,
        total: 0,
        unreadBySender: {}
    });
    const [friends, setFriends] = useState<FriendUser[]>([]);

    // PWA Install State
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isStandalone, setIsStandalone] = useState(false);

    // Login Quote Randomizer State
    const [loginQuote, setLoginQuote] = useState(AUTH_QUOTES[0]);

    const reduceEffects = isTouchDevice || isMobile || isLowPerfSetting;
    const isDeveloper = Boolean(
        currentUser?.isDeveloper ||
        currentUser?.role === 'developer' ||
        currentUser?.username?.toLowerCase() === 'aadish'
    );

    // Sync low-perf settings dynamically when user changes graphics mode in Settings without polling
    useEffect(() => {
        const refreshPerfSetting = () => {
            setIsLowPerfSetting(readIsLowPerfSetting());
        };
        const onStorage = (e: StorageEvent) => {
            if (!e.key || e.key === 'aadish_roulette_settings') refreshPerfSetting();
        };
        window.addEventListener('storage', onStorage);
        window.addEventListener('focus', refreshPerfSetting);

        const rootChild = document.getElementById('root')?.firstElementChild;
        let observer: MutationObserver | null = null;
        if (rootChild) {
            observer = new MutationObserver(refreshPerfSetting);
            observer.observe(rootChild, { attributes: true, attributeFilter: ['class'] });
        }

        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('focus', refreshPerfSetting);
            if (observer) observer.disconnect();
        };
    }, []);

    // Listen for external profile/avatar updates (from ProfileModal / firebaseService)
    useEffect(() => {
        const onProfileEvent = (e: Event) => {
            const detail = (e as CustomEvent<any>).detail;
            if (!detail || !currentUser?.username) return;
            const updatedProfile: UserProfile | null = detail.profile || (detail.username ? detail : null);
            if (updatedProfile?.username?.toLowerCase() === currentUser.username.toLowerCase()) {
                setCurrentUser((prev) => (prev ? { ...prev, ...updatedProfile } : updatedProfile));
            }
        };
        window.addEventListener('bugshot_profile_updated', onProfileEvent);
        return () => window.removeEventListener('bugshot_profile_updated', onProfileEvent);
    }, [currentUser?.username]);

    // Auto-dismiss messages toast cleanly
    useEffect(() => {
        if (!messagesToast) return;
        const timer = setTimeout(() => setMessagesToast(null), 3500);
        return () => clearTimeout(timer);
    }, [messagesToast]);

    // Identify user on presence socket after soul is bound (no global re-render subscription at IntroScreen root)
    useEffect(() => {
        if (hasBoundSoul && currentUser) {
            presenceClient.identify(currentUser, 'online');
        }
    }, [hasBoundSoul, currentUser?.username, currentUser?.avatarUrl, currentUser?.avatarStyle, currentUser?.displayName]);

    const getUserPresence = useCallback((username: string): UserPresence | null => {
        return presenceClient.getPresence(username);
    }, []);

    const adminAPI = useMemo(() => ({
        fetchOverview: () => presenceClient.fetchAdminOverview(),
        broadcast: (title: string, text: string) => presenceClient.sendAdminBroadcast(title, text),
        clearBroadcast: () => presenceClient.clearAdminBroadcast(),
        dm: (targetUsername: string, text: string) => presenceClient.sendAdminDM(targetUsername, text),
        kickPlayer: (roomId: string, targetPlayerId?: string, targetUsername?: string) =>
            presenceClient.kickPlayer(roomId, targetPlayerId, targetUsername),
        mutePlayer: (targetUsername: string, durationMs?: number) =>
            presenceClient.mutePlayer(targetUsername, durationMs),
        unmutePlayer: (targetUsername: string) => presenceClient.unmutePlayer(targetUsername)
    }), []);

    // Defer Firestore notification & friend subscriptions until soul is bound
    useEffect(() => {
        if (!hasBoundSoul || !currentUser?.username) {
            setNotificationCounts({ unreadDMs: 0, pendingRequests: 0, total: 0, unreadBySender: {} });
            return;
        }
        const unsubscribe = subscribeToNotifications(currentUser.username, (counts) => {
            setNotificationCounts(counts);
        });
        return () => unsubscribe();
    }, [hasBoundSoul, currentUser?.username]);

    useEffect(() => {
        if (!hasBoundSoul || !currentUser?.username) {
            setFriends([]);
            return;
        }
        const unsubscribe = subscribeToFriends(currentUser.username, (loadedFriends) => {
            setFriends(loadedFriends);
        });
        return () => unsubscribe();
    }, [hasBoundSoul, currentUser?.username]);

    useEffect(() => {
        if (showLoginModal) {
            setLoginQuote(AUTH_QUOTES[Math.floor(Math.random() * AUTH_QUOTES.length)]);
        }
    }, [showLoginModal]);

    // Stable ref-backed Escape key dismiss handler (registered once)
    const escapeStateRef = useRef({
        selectedMPMatch: null as any,
        showResetSpamModal: false,
        showForgotPasswordModal: false,
        selectedPublicProfile: null as any,
        showProfileModal: false,
        showMigrationModal: false,
        showLeaderboard: false,
        showLoginModal: false,
        showChangelog: false,
        showAnnouncement: false,
        showMessagesModal: false,
        showAdminModal: false,
        showHardModeWarning: false,
        showSplitSetup: false
    });
    escapeStateRef.current = {
        selectedMPMatch,
        showResetSpamModal,
        showForgotPasswordModal,
        selectedPublicProfile,
        showProfileModal,
        showMigrationModal,
        showLeaderboard,
        showLoginModal,
        showChangelog,
        showAnnouncement,
        showMessagesModal,
        showAdminModal,
        showHardModeWarning,
        showSplitSetup
    };

    // Pause background WebGL shell animation whenever any full-screen menu modal is open
    const hasAnyMenuModalOpen = Boolean(
        showSplitSetup ||
        showHardModeWarning ||
        showLoginModal ||
        showLeaderboard ||
        showChangelog ||
        showAnnouncement ||
        showMessagesModal ||
        showProfileModal ||
        showAdminModal ||
        showMigrationModal ||
        showForgotPasswordModal ||
        showResetSpamModal ||
        selectedPublicProfile ||
        selectedMPMatch
    );

    useEffect(() => {
        window.dispatchEvent(new CustomEvent('bugshot_menu_modal_state', { detail: { open: hasAnyMenuModalOpen } }));
        return () => {
            window.dispatchEvent(new CustomEvent('bugshot_menu_modal_state', { detail: { open: false } }));
        };
    }, [hasAnyMenuModalOpen]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            const s = escapeStateRef.current;
            if (s.selectedMPMatch) setSelectedMPMatch(null);
            else if (s.showSplitSetup) setShowSplitSetup(false);
            else if (s.showResetSpamModal) setShowResetSpamModal(false);
            else if (s.showForgotPasswordModal) setShowForgotPasswordModal(false);
            else if (s.selectedPublicProfile) {
                setSelectedPublicProfile(null);
                if (openedProfileFromLeaderboardRef.current) {
                    setShowLeaderboard(true);
                    openedProfileFromLeaderboardRef.current = false;
                }
            }
            else if (s.showProfileModal) setShowProfileModal(false);
            else if (s.showMigrationModal) setShowMigrationModal(false);
            else if (s.showLeaderboard) setShowLeaderboard(false);
            else if (s.showLoginModal) setShowLoginModal(false);
            else if (s.showChangelog) setShowChangelog(false);
            else if (s.showAnnouncement) setShowAnnouncement(false);
            else if (s.showMessagesModal) setShowMessagesModal(false);
            else if (s.showAdminModal) setShowAdminModal(false);
            else if (s.showHardModeWarning) setShowHardModeWarning(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Auto-populate name & throttled last-seen tracking
    useEffect(() => {
        if (!currentUser) return;
        const username = currentUser.username;
        if (!inputName) {
            setInputName((currentUser.displayName || username).toUpperCase());
        }
        if (!hasBoundSoul || !isOnline) return;

        const clean = username.trim().toLowerCase();
        const sendThrottledLastSeen = () => {
            if (!isOnline) return;
            const now = Date.now();
            const last = lastSeenSentAt.get(clean) || 0;
            if (now - last >= LAST_SEEN_THROTTLE_MS) {
                lastSeenSentAt.set(clean, now);
                updateUserLastSeen(username);
            }
        };

        sendThrottledLastSeen();
        const interval = setInterval(sendThrottledLastSeen, 60000);

        const handleUnload = () => {
            if (isOnline) {
                lastSeenSentAt.set(clean, Date.now());
                updateUserLastSeen(username);
            }
        };
        window.addEventListener('beforeunload', handleUnload);

        return () => {
            clearInterval(interval);
            window.removeEventListener('beforeunload', handleUnload);
        };
    }, [currentUser?.username, currentUser?.displayName, hasBoundSoul, isOnline]);

    // Announcement & Changelog check with proper timeout cleanup
    useEffect(() => {
        if (!hasBoundSoul) return;

        const lastSeenChangelog = localStorage.getItem('aadish_roulette_changelog_seen');
        const lastSeenAnnouncement = localStorage.getItem('aadish_roulette_announcement_seen');
        let timerId: ReturnType<typeof setTimeout> | null = null;

        if (lastSeenAnnouncement !== ANNOUNCEMENT_VERSION) {
            timerId = setTimeout(() => {
                setShowAnnouncement(true);
                try { localStorage.setItem('aadish_roulette_announcement_seen', ANNOUNCEMENT_VERSION); } catch {}
                if (lastSeenChangelog !== GAME_VERSION) {
                    setPendingChangelog(true);
                }
            }, 700);
        } else if (lastSeenChangelog !== GAME_VERSION) {
            timerId = setTimeout(() => {
                setShowChangelog(true);
                try { localStorage.setItem('aadish_roulette_changelog_seen', GAME_VERSION); } catch {}
            }, 900);
        }

        return () => {
            if (timerId !== null) clearTimeout(timerId);
        };
    }, [hasBoundSoul]);

    // Device detection, RAF-throttled viewport scaling & PWA install listeners
    useEffect(() => {
        const isS = window.matchMedia('(display-mode: standalone)').matches ||
            (window.navigator as any).standalone ||
            document.referrer.includes('android-app://');
        setIsStandalone(!!isS);

        const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const hasTouch = isMobileUA || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        setIsTouchDevice(Boolean(hasTouch));
        setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream);
        setIsMobile(isMobileUA);

        let resizeRafId: number | null = null;
        const computeScale = () => {
            resizeRafId = null;
            const h = window.innerHeight;
            const w = window.innerWidth;
            let nextScale = 1;
            if (h < 560) {
                nextScale = Math.max(0.58, Math.min(0.92, (h - 16) / 565));
            } else if (w < 500) {
                const hScale = Math.min(1.0, Math.max(0.82, (h - 20) / 680));
                const wScale = Math.min(1.0, Math.max(0.82, (w - 16) / 380));
                nextScale = Math.min(hScale, wScale);
            } else if (w >= 1024) {
                nextScale = Math.max(0.82, Math.min(1.18, h / 840));
            } else {
                nextScale = Math.max(0.75, Math.min(1.05, Math.min(h / 680, w / 520)));
            }
            setScale((prev) => (Math.abs(prev - nextScale) > 0.005 ? nextScale : prev));
        };

        const handleResize = () => {
            if (resizeRafId !== null) return;
            resizeRafId = requestAnimationFrame(computeScale);
        };

        window.addEventListener('resize', handleResize);
        computeScale();

        if ((window as any).deferredPWAPrompt) {
            setDeferredPrompt((window as any).deferredPWAPrompt);
        }

        const beforeInstallPromptHandler = (e: any) => {
            if (!e || !e.preventDefault) return;
            e.preventDefault();
            setDeferredPrompt(e);
            (window as any).deferredPWAPrompt = e;
        };

        const globalPwaHandler = (e: any) => {
            if (e.detail) {
                setDeferredPrompt(e.detail);
                (window as any).deferredPWAPrompt = e.detail;
            }
        };

        const appInstalledHandler = () => {
            setIsStandalone(true);
            setDeferredPrompt(null);
            (window as any).deferredPWAPrompt = null;
        };

        window.addEventListener('beforeinstallprompt', beforeInstallPromptHandler as any);
        window.addEventListener('pwa-prompt-available' as any, globalPwaHandler);
        window.addEventListener('appinstalled', appInstalledHandler);
        window.addEventListener('pwa-appinstalled' as any, appInstalledHandler);

        return () => {
            if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('beforeinstallprompt', beforeInstallPromptHandler as any);
            window.removeEventListener('pwa-prompt-available' as any, globalPwaHandler);
            window.removeEventListener('appinstalled', appInstalledHandler);
            window.removeEventListener('pwa-appinstalled' as any, appInstalledHandler);
        };
    }, []);

    // Enforce Gmail linking & cloud upgrade for legacy Upstash users
    useEffect(() => {
        if (!hasBoundSoul || !currentUser) return;

        if (isLegacyUpstashUser(currentUser)) {
            let isMounted = true;
            (async () => {
                const cleanU = currentUser.username?.trim().toLowerCase();
                if (cleanU) {
                    try {
                        const remote = await findUserByUsernameOrEmail(cleanU);
                        if (remote && !isLegacyUpstashUser(remote)) {
                            if (isMounted) {
                                setCurrentUser(remote);
                                setInputName((remote.displayName || remote.username).toUpperCase());
                                try {
                                    localStorage.setItem('aadish_roulette_logged_in_user', JSON.stringify(remote));
                                } catch {}
                            }
                            return;
                        }

                        if (remote && isMounted) {
                            setLegacyUserToMigrate({
                                ...currentUser,
                                ...remote,
                                legacyPasswordHash: remote.legacyPasswordHash || currentUser.legacyPasswordHash || (cleanU === 'aadish' ? 'Aadish20m' : undefined)
                            });
                            setShowMigrationModal(true);
                            return;
                        }
                    } catch (err) {
                        console.warn("Failed checking remote user migration state:", err);
                    }
                }

                if (isMounted) {
                    setLegacyUserToMigrate({
                        ...currentUser,
                        legacyPasswordHash: currentUser.legacyPasswordHash || (cleanU === 'aadish' ? 'Aadish20m' : undefined)
                    });
                    setShowMigrationModal(true);
                }
            })();

            return () => {
                isMounted = false;
            };
        }
    }, [hasBoundSoul, currentUser?.username]);

    const loadLeaderboardData = useCallback(async () => {
        if (isLoadingLeaderboard) return;
        setIsLoadingLeaderboard(true);
        try {
            const data = await getLeaderboard();
            setLeaderboard(data);
        } catch (e) {
            console.error("Failed to load leaderboard:", e);
        } finally {
            setIsLoadingLeaderboard(false);
        }
    }, [isLoadingLeaderboard]);

    const handleSendForgotPassword = async () => {
        const clean = forgotPasswordInput.trim().toLowerCase();
        if (!clean) {
            setForgotPasswordError('PLEASE ENTER YOUR USERNAME OR GMAIL');
            return;
        }
        setForgotPasswordLoading(true);
        setForgotPasswordError('');
        try {
            let targetEmail = clean;
            if (!clean.includes('@')) {
                const user = await findUserByUsernameOrEmail(clean);
                if (!user || !user.email) {
                    setForgotPasswordError('CODENAME NOT FOUND OR NO GMAIL LINKED');
                    setForgotPasswordLoading(false);
                    return;
                }
                targetEmail = user.email;
            }

            const res = await sendPasswordReset(targetEmail);
            if (res.success) {
                setSpamNoticeTarget(targetEmail);
                setShowForgotPasswordModal(false);
                setForgotPasswordInput('');
                setShowResetSpamModal(true);
            } else {
                setForgotPasswordError(res.error || 'FAILED TO DISPATCH RESET LINK');
            }
        } catch (e: any) {
            setForgotPasswordError(e.message || 'PASSWORD RESET FAILED');
        } finally {
            setForgotPasswordLoading(false);
        }
    };

    const handleInstallClick = useCallback(async () => {
        audioManager.playSound('click');
        const promptEvent = deferredPrompt || (window as any).deferredPWAPrompt;

        if (promptEvent && typeof promptEvent.prompt === 'function') {
            try {
                await promptEvent.prompt();
                const result = await promptEvent.userChoice;
                if (result?.outcome === 'accepted') {
                    setDeferredPrompt(null);
                    setIsStandalone(true);
                    (window as any).deferredPWAPrompt = null;
                }
            } catch (err) {
                console.warn('PWA install prompt failed:', err);
            }
            return;
        }

        if (isIOS) {
            showAlert({
                title: "INSTALL ON iOS",
                message: "1. Tap the Share button (square icon with arrow ⎋)\n2. Scroll down and tap 'Add to Home Screen'\n3. Launch BugShot Roulette from your home screen!",
                icon: "download",
                confirmText: "GOT IT"
            });
        } else {
            showAlert({
                title: "INSTALL BUGSHOT (PWA)",
                message: "📱 Android Chrome: Tap Browser Menu (⋮) ➔ 'Install app' or 'Add to Home screen'\n\n💻 PC / Mac (Chrome/Edge): Click the Install icon in the browser address bar (top right) or Menu (⋮) ➔ 'Install BugShot Roulette'\n\n🍏 iOS: Tap Share ➔ 'Add to Home Screen'",
                icon: "download",
                confirmText: "UNDERSTOOD"
            });
        }
    }, [deferredPrompt, isIOS]);

    const handleLogout = useCallback(async () => {
        audioManager.playSound('click');
        try {
            await logoutUserFromFirebase();
        } catch {}
        clearActiveStatsSession();
        setCurrentUser(null);
        setShowProfileModal(false);
        setInputName('');
        window.location.reload();
    }, [setInputName]);

    const syncStatsToAccount = async (username: string, remoteStats: any) => {
        const stats = remoteStats || emptyStats();
        setUserActiveStats(username, stats);
        return stats;
    };

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError('');
        setLoginSuccess('');
        setIsLoadingAuth(true);
        audioManager.playSound('click');

        const u = loginUsername.trim().toLowerCase();
        const p = loginPassword.trim();
        const mail = loginEmail.trim().toLowerCase();

        if (loginTab === 'signin') {
            if (!u || !p) {
                setLoginError('USERNAME / GMAIL AND PASSWORD REQUIRED');
                setIsLoadingAuth(false);
                return;
            }

            try {
                const res = await loginUserWithFirebase(u, p);
                if (res.success) {
                    if (res.needsMigration && res.user) {
                        setShowLoginModal(false);
                        setLegacyUserToMigrate({
                            ...res.user,
                            legacyPasswordHash: res.user.legacyPasswordHash || p
                        });
                        setShowMigrationModal(true);
                        setIsLoadingAuth(false);
                        return;
                    }
                    if (res.user) {
                        setLoginSuccess('IDENTITY VERIFIED');
                        await syncStatsToAccount(res.user.username, res.user.stats);
                        setCurrentUser(res.user);
                        setInputName((res.user.displayName || res.user.username).toUpperCase());
                        setTimeout(() => {
                            setShowLoginModal(false);
                            setLoginPassword('');
                            setLoginUsername('');
                            setLoginEmail('');
                            setLoginSuccess('');
                        }, 900);
                    }
                } else {
                    setLoginError(res.error || 'ACCESS DENIED');
                }
            } catch (err: any) {
                setLoginError(err.message || 'LINK FAULT');
            } finally {
                setIsLoadingAuth(false);
            }
        } else {
            if (!u || !p || !mail) {
                setLoginError('USERNAME, GMAIL AND PASSWORD REQUIRED');
                setIsLoadingAuth(false);
                return;
            }
            if (u.length < 3 || u.length > 18) {
                setLoginError('USERNAME MUST BE 3-18 CHARACTERS');
                setIsLoadingAuth(false);
                return;
            }
            if (!mail.endsWith('@gmail.com') && !mail.endsWith('@googlemail.com')) {
                setLoginError('REGISTRATION REQUIRES A VALID GMAIL (@GMAIL.COM)');
                setIsLoadingAuth(false);
                return;
            }
            if (p.length < 6) {
                setLoginError('PASSWORD MUST BE AT LEAST 6 CHARACTERS');
                setIsLoadingAuth(false);
                return;
            }

            try {
                const res = await registerUserWithFirebase(u, mail, p);
                if (res.success && res.user) {
                    setLoginSuccess('ACCOUNT CREATED & SYNCED');
                    await syncStatsToAccount(res.user.username, res.user.stats);
                    setCurrentUser(res.user);
                    setInputName((res.user.displayName || res.user.username).toUpperCase());
                    try {
                        localStorage.setItem('aadish_roulette_name', res.user.username);
                    } catch {}
                    setTimeout(() => {
                        setShowLoginModal(false);
                        setLoginPassword('');
                        setLoginUsername('');
                        setLoginEmail('');
                        setLoginSuccess('');
                    }, 1000);
                } else {
                    setLoginError(res.error || 'REGISTRATION FAILED');
                }
            } catch (err: any) {
                setLoginError(err.message || 'REGISTRATION FAULT');
            } finally {
                setIsLoadingAuth(false);
            }
        }
    };

    const handleBindSoul = useCallback(async () => {
        if (isBindingSoul || hasBoundSoul) return;
        setIsBindingSoul(true);

        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try {
                navigator.vibrate([35, 55, 40]);
            } catch {}
        }

        try {
            await audioManager.initialize();
            audioManager.playSound('click');
            audioManager.playMusic('menu');
        } catch {}

        setTimeout(() => {
            setHasBoundSoul(true);
        }, 150);
    }, [isBindingSoul, hasBoundSoul]);

    useEffect(() => {
        if (hasBoundSoul) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space' || e.code === 'Enter') {
                e.preventDefault();
                handleBindSoul();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [hasBoundSoul, handleBindSoul]);

    const handleOpenMessagesFromPanel = useCallback((target: string | null) => {
        setMessagesTargetUser(target);
        setShowMessagesModal(true);
    }, []);

    const handleOpenLogin = useCallback(() => setShowLoginModal(true), []);
    const handleOpenAdmin = useCallback(() => setShowAdminModal(true), []);
    const handleOpenProfile = useCallback(() => setShowProfileModal(true), []);
    const handleOpenProfileOrMigration = useCallback(() => {
        if (currentUser && isLegacyUpstashUser(currentUser)) {
            setLegacyUserToMigrate(currentUser);
            setShowMigrationModal(true);
            return;
        }
        setShowProfileModal(true);
    }, [currentUser]);
    const handleOpenMobileMessages = useCallback(() => {
        setMessagesTargetUser(null);
        setShowMessagesModal(true);
    }, []);

    if (!hasBoundSoul) {
        return (
            <BindSoulOverlay
                isBindingSoul={isBindingSoul}
                isMobile={isMobile}
                isTouchDevice={isTouchDevice}
                reduceEffects={reduceEffects}
                onBindSoul={handleBindSoul}
            />
        );
    }

    // Avoid expensive full-screen backdrop-blur compositing over the live WebGL ShellBackground canvas
    const blurMd = '';
    const blurXl = '';
    const blur2xl = '';
    const blur3xl = '';

    return (
        <div
            className="absolute inset-0 z-50 flex flex-col items-center justify-start sm:justify-center overflow-y-auto sm:overflow-hidden custom-scrollbar pointer-events-auto bg-black/55 p-2 sm:p-4 select-none"
            style={{
                paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
                paddingLeft: 'max(env(safe-area-inset-left, 0px), 8px)',
                paddingRight: 'max(env(safe-area-inset-right, 0px), 8px)'
            }}
        >
            {/* Top Left Messages & Online Friends Section (Desktop) */}
            {!isMobile && (
                <DesktopCommsPanel
                    currentUser={currentUser}
                    isOnline={isOnline}
                    reduceEffects={reduceEffects}
                    notificationCounts={notificationCounts}
                    friends={friends}
                    onOpenMessages={handleOpenMessagesFromPanel}
                    onRequireLogin={handleOpenLogin}
                    onOfflineToast={setMessagesToast}
                />
            )}

            {/* Messages Notification Toast */}
            {messagesToast && (
                <div className="fixed top-20 left-4 sm:left-6 z-[120] max-w-sm p-3 bg-stone-950/95 border border-cyan-800/80 text-cyan-300 text-[10px] font-mono rounded-xl shadow-[0_0_30px_rgba(6,182,212,0.25)] animate-in fade-in slide-in-from-top-2 duration-200 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>{messagesToast}</span>
                </div>
            )}

            {/* Top Right User Profile Badge Section (Desktop) */}
            {!isMobile && (
                <DesktopProfileBadge
                    currentUser={currentUser}
                    isDeveloper={isDeveloper}
                    reduceEffects={reduceEffects}
                    onOpenAdmin={handleOpenAdmin}
                    onOpenProfile={handleOpenProfile}
                    onOpenLogin={handleOpenLogin}
                />
            )}

            {/* Bottom Right Floating Control Buttons (Changelog) */}
            <div
                className="absolute z-[60] flex items-center gap-2"
                style={{
                    bottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
                    right: 'max(env(safe-area-inset-right, 0px), 16px)'
                }}
            >
                <button
                    onClick={() => {
                        audioManager.playSound('click');
                        setShowChangelog(true);
                    }}
                    className={`w-11 h-11 min-w-[44px] min-h-[44px] p-2.5 sm:p-3 bg-gradient-to-br from-stone-900/95 to-stone-950/95 border border-stone-700/50 text-stone-300 hover:text-amber-400 hover:border-amber-600/50 rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.8)] ${blurMd} transition-all hover:scale-110 active:scale-95 flex items-center justify-center cursor-pointer hover:shadow-[0_0_30px_rgba(245,158,11,0.15)] touch-manipulation`}
                    title="System Changelog & Version History"
                    aria-label="System Changelog & Version History"
                >
                    <BookOpen size={18} className="transition-transform duration-300" />
                </button>
            </div>

            {/* Bottom Left Announcement Panel Button (Hidden on mobile) */}
            <div
                className="absolute z-[60] hidden sm:block"
                style={{
                    bottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
                    left: 'max(env(safe-area-inset-left, 0px), 16px)'
                }}
            >
                <button
                    onClick={() => {
                        audioManager.playSound('click');
                        setShowAnnouncement(true);
                    }}
                    className={`group/an p-3.5 sm:p-4 bg-gradient-to-br from-stone-900/95 to-stone-950/95 border border-stone-700/50 text-stone-400 hover:text-cyan-300 hover:border-cyan-600/50 rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.8)] ${blurMd} transition-all hover:scale-110 active:scale-95 flex items-center justify-center cursor-pointer hover:shadow-[0_0_30px_rgba(45,212,191,0.15)] small-btn`}
                    title="View Announcement"
                >
                    <Bell size={20} className="group-hover/an:rotate-[-8deg] transition-transform duration-300" />
                </button>
            </div>

            {/* Hard Mode Confirmation Modal (Clean & Minimal) */}
            {showHardModeWarning && (
                <div
                    className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/85 overflow-y-auto"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Hard Mode Confirmation"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            audioManager.playSound('click');
                            setShowHardModeWarning(false);
                        }
                    }}
                >
                    <div className="relative bg-stone-950 border border-red-600/70 max-w-md w-full rounded-2xl p-5 sm:p-6 shadow-[0_0_50px_rgba(220,38,38,0.28)] font-mono text-left">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-red-950/80 border border-red-600/60 flex items-center justify-center text-red-500 shrink-0">
                                    <Skull size={18} />
                                </div>
                                <div>
                                    <h2 className="text-base sm:text-lg font-black text-white tracking-[0.14em] uppercase leading-tight">
                                        HARD MODE
                                    </h2>
                                    <p className="text-[10px] text-red-400 font-bold tracking-wider uppercase">
                                        2× Score • High Lethality
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    audioManager.playSound('click');
                                    setShowHardModeWarning(false);
                                }}
                                className="text-stone-400 hover:text-white hover:bg-stone-900 w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer shrink-0"
                                aria-label="Close Hard Mode confirmation"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <p className="text-xs text-stone-300 leading-relaxed mb-4">
                            Face a ruthless Dealer who counts shells, chains items, and punishes every mistake.
                        </p>

                        <ul className="space-y-1.5 mb-5 text-[11px] text-stone-300">
                            <li className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                                <span>Smarter AI &amp; aggressive item combos</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                                <span>3-round showdown with higher damage stakes</span>
                            </li>
                            <li className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                                <span>Separate Hard Mode win tracking &amp; 2× score</span>
                            </li>
                        </ul>

                        <div className="flex items-center gap-2.5">
                            <button
                                type="button"
                                onClick={() => {
                                    audioManager.playSound('click');
                                    setShowHardModeWarning(false);
                                }}
                                className="px-4 py-2.5 min-h-[42px] bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-300 hover:text-white font-bold tracking-[0.14em] text-[11px] uppercase cursor-pointer rounded-xl transition-colors active:scale-95 whitespace-nowrap"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    audioManager.playSound('confirm');
                                    setShowHardModeWarning(false);
                                    onStartGame(true);
                                }}
                                className="flex-1 py-2.5 px-4 min-h-[42px] bg-red-700 hover:bg-red-600 text-white font-black text-xs tracking-[0.16em] border border-red-400/70 transition-all hover:shadow-[0_0_24px_rgba(220,38,38,0.45)] active:scale-[0.98] cursor-pointer rounded-xl uppercase flex items-center justify-center gap-2 whitespace-nowrap"
                            >
                                <Skull size={14} className="shrink-0" />
                                <span>Accept &amp; Play</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Login / Register Modal */}
            {showLoginModal && (
                <div
                    className={`fixed inset-0 z-[110] flex items-start sm:items-center justify-center bg-black/92 ${blur2xl} p-2 sm:p-4 md:p-6 animate-in fade-in duration-300 overflow-y-auto overscroll-contain keyboard-aware-bottom`}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Account Authorization"
                    onClick={(e) => {
                        if (e.target === e.currentTarget && !isLoadingAuth) {
                            setShowLoginModal(false);
                        }
                    }}
                    style={{
                        paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
                        paddingBottom: 'calc(max(env(safe-area-inset-bottom, 0px), 8px) + env(keyboard-inset-height, 0px))',
                        paddingLeft: 'max(env(safe-area-inset-left, 0px), 8px)',
                        paddingRight: 'max(env(safe-area-inset-right, 0px), 8px)'
                    }}
                >
                    {!reduceEffects && (
                        <>
                            <div className="absolute w-[500px] h-[500px] bg-red-955/20 rounded-full blur-[140px] pointer-events-none -translate-x-1/3 -translate-y-1/3" />
                            <div className="absolute w-[450px] h-[450px] bg-red-900/15 rounded-full blur-[120px] pointer-events-none translate-x-1/3 translate-y-1/3" />
                        </>
                    )}

                    <div
                        className={`relative w-full max-w-4xl max-h-[92dvh] sm:max-h-[90vh] bg-stone-950/95 border-2 border-red-500/30 rounded-2xl shadow-[0_0_100px_rgba(0,0,0,0.98),0_0_50px_rgba(239,68,68,0.2)] font-mono text-stone-300 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden my-auto ${blur3xl}`}
                    >
                        {!isMobile && !reduceEffects && (
                            <div className="absolute inset-0 pointer-events-none opacity-25 mix-blend-overlay bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,6px_100%]" />
                        )}

                        <div className="absolute top-3 left-3 w-3 h-3 border-t-2 border-l-2 border-red-500/50 pointer-events-none" />
                        <div className="absolute top-3 right-3 w-3 h-3 border-t-2 border-r-2 border-red-500/50 pointer-events-none" />
                        <div className="absolute bottom-3 left-3 w-3 h-3 border-b-2 border-l-2 border-red-500/50 pointer-events-none" />
                        <div className="absolute bottom-3 right-3 w-3 h-3 border-b-2 border-r-2 border-red-500/50 pointer-events-none" />

                        <button
                            type="button"
                            onClick={() => {
                                audioManager.playSound('click');
                                setShowLoginModal(false);
                                setLoginError('');
                                setLoginSuccess('');
                                setLoginPassword('');
                                setLoginUsername('');
                                setLoginEmail('');
                                setShowPassword(false);
                            }}
                            className="absolute top-3 right-3 sm:top-4 sm:right-4 text-stone-400 hover:text-red-400 bg-stone-900/90 hover:bg-red-955/40 border border-stone-800 hover:border-red-500/60 w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl z-50 cursor-pointer flex items-center justify-center shadow-lg hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] transition-all touch-manipulation active:scale-90"
                            title="Close Portal"
                            aria-label="Close Portal"
                        >
                            <X size={16} />
                        </button>

                        {/* LEFT PANEL */}
                        <div className="hidden md:flex md:w-5/12 flex-col justify-between p-7 bg-gradient-to-b from-stone-900/70 to-stone-950/90 border-r border-stone-850/80 relative">
                            <div>
                                <div className="flex items-center gap-2 text-stone-500 text-[9px] uppercase tracking-[0.35em] mb-2 font-black">
                                    <Terminal size={13} className={`text-red-500 ${reduceEffects ? '' : 'animate-pulse'}`} />
                                    <span>CON_SECURITY_HUB</span>
                                </div>
                                <h2 className="text-xl font-black text-white tracking-wider uppercase mb-1">
                                    BUGSHOT PROTOCOL
                                </h2>
                                <div className="text-[10px] text-red-500/90 tracking-widest font-bold uppercase mb-5">
                                    VERIFIED CLOUD MAINFRAME
                                </div>

                                <div className="space-y-3 text-[10px] text-stone-400 leading-relaxed border-l-2 border-red-600/40 pl-3">
                                    <p>
                                        Enroll your codename to permanently synchronize combat statistics, global leaderboard standings, and verified match history.
                                    </p>
                                    <div className="space-y-1.5 pt-1 text-[9px] font-mono text-stone-300">
                                        <div className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                            <span>FIREBASE FIRESTORE REALTIME SYNC</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                            <span>GMAIL AUTHENTICATION & RECOVERY</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                            <span>GLOBAL MULTIPLAYER DUEL ACCESS</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                            <span>CUSTOM DICEBEAR AVATAR SUITE</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6 p-3 bg-stone-950 border border-stone-800 rounded-xl relative">
                                <span className="text-[8px] text-stone-600 uppercase tracking-widest block mb-1">
                                    [ TRANSMISSION READOUT ]
                                </span>
                                <p className="text-red-400/90 italic text-[10px] tracking-wide leading-relaxed font-serif">
                                    "{loginQuote}"
                                </p>
                            </div>
                        </div>

                        {/* RIGHT PANEL */}
                        <div className="w-full md:w-7/12 p-4 sm:p-7 flex flex-col justify-center overflow-y-auto">
                            <div className="md:hidden text-center mb-3 pr-8">
                                <div className="text-[8px] text-stone-500 tracking-[0.3em] uppercase mb-1 flex items-center justify-center gap-1.5">
                                    <Terminal size={10} className="text-red-500" />
                                    <span>CON_SECURITY_PORTAL</span>
                                </div>
                                <h3 className="text-base font-black text-stone-100 tracking-wider uppercase">
                                    AGENT AUTHENTICATION
                                </h3>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mb-3 sm:mb-4 bg-stone-900/80 border border-stone-800 p-1 sm:p-1.5 rounded-xl">
                                <button
                                    type="button"
                                    onClick={() => {
                                        audioManager.playSound('click');
                                        setLoginTab('signin');
                                        setLoginError('');
                                        setLoginSuccess('');
                                    }}
                                    className={`min-h-[44px] py-2 sm:py-2 text-xs font-black tracking-widest uppercase transition-all duration-300 cursor-pointer rounded-lg border flex items-center justify-center touch-manipulation active:scale-[0.98] ${
                                        loginTab === 'signin'
                                            ? 'text-green-400 bg-green-950/40 border-green-600/70 shadow-[0_0_20px_rgba(34,197,94,0.2)]'
                                            : 'text-stone-400 border-transparent hover:text-stone-200 hover:bg-stone-900/60'
                                    }`}
                                >
                                    [ SIGN_IN ]
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        audioManager.playSound('click');
                                        setLoginTab('register');
                                        setLoginError('');
                                        setLoginSuccess('');
                                    }}
                                    className={`min-h-[44px] py-2 sm:py-2 text-xs font-black tracking-widest uppercase transition-all duration-300 cursor-pointer rounded-lg border flex items-center justify-center touch-manipulation active:scale-[0.98] ${
                                        loginTab === 'register'
                                            ? 'text-red-400 bg-red-955/40 border-red-600/70 shadow-[0_0_20px_rgba(220,38,38,0.2)]'
                                            : 'text-stone-400 border-transparent hover:text-stone-200 hover:bg-stone-900/60'
                                    }`}
                                >
                                    [ REGISTER ]
                                </button>
                            </div>

                            <form onSubmit={handleLoginSubmit} autoComplete="on" className="space-y-3 sm:space-y-4">
                                <div>
                                    <div className="flex justify-between items-center mb-1.5 px-1">
                                        <span className="text-[9px] sm:text-[10px] text-stone-400 font-bold tracking-widest uppercase flex items-center gap-1.5">
                                            <User size={12} className="text-red-500" />
                                            {loginTab === 'signin' ? 'Username or Gmail' : 'Desired Codename'}
                                        </span>
                                        <span className="text-[8px] sm:text-[9px] text-stone-550 font-mono tracking-widest uppercase">
                                            {loginTab === 'signin' ? 'REGISTERED AGENT' : 'REQ: 3-18 CHARS'}
                                        </span>
                                    </div>
                                    <div className="relative flex items-center group/input">
                                        <span className="absolute left-3 text-stone-600 group-focus-within/input:text-red-500 transition-colors font-bold text-sm pointer-events-none">[</span>
                                        <input
                                            type="text"
                                            name="username"
                                            autoComplete={loginTab === 'signin' ? 'username email' : 'username'}
                                            inputMode="text"
                                            autoCapitalize="none"
                                            autoCorrect="off"
                                            spellCheck={false}
                                            enterKeyHint="next"
                                            value={loginUsername}
                                            onChange={(e) => setLoginUsername(e.target.value)}
                                            placeholder={loginTab === 'signin' ? "ENTER USERNAME OR GMAIL" : "DESIRED CODENAME"}
                                            maxLength={loginTab === 'signin' ? 50 : 18}
                                            className="w-full bg-stone-950 border-2 border-stone-800 hover:border-stone-700 focus:border-red-500/70 px-4 sm:px-5 py-3 sm:py-3 text-base sm:text-sm font-mono font-bold text-stone-100 outline-none transition-all tracking-wider uppercase rounded-xl placeholder-stone-700 focus:shadow-[0_0_25px_rgba(220,38,38,0.12)] touch-manipulation"
                                            required
                                        />
                                        <span className="absolute right-3 text-stone-600 group-focus-within/input:text-red-500 transition-colors font-bold text-sm pointer-events-none">]</span>
                                    </div>
                                </div>

                                {loginTab === 'register' && (
                                    <div>
                                        <div className="flex justify-between items-center mb-1.5 px-1">
                                            <span className="text-[9px] sm:text-[10px] text-stone-400 font-bold tracking-widest uppercase flex items-center gap-1.5">
                                                <Mail size={12} className="text-red-500" />
                                                Gmail / Email Address
                                            </span>
                                            <span className="text-[8px] sm:text-[9px] text-stone-550 font-mono tracking-widest uppercase">REQ: VALID GMAIL</span>
                                        </div>
                                        <div className="relative flex items-center group/input">
                                            <span className="absolute left-3 text-stone-600 group-focus-within/input:text-red-500 transition-colors font-bold text-sm pointer-events-none">[</span>
                                            <input
                                                type="email"
                                                name="email"
                                                autoComplete="email"
                                                inputMode="email"
                                                autoCapitalize="none"
                                                autoCorrect="off"
                                                spellCheck={false}
                                                enterKeyHint="next"
                                                value={loginEmail}
                                                onChange={(e) => setLoginEmail(e.target.value)}
                                                placeholder="OPERATOR@GMAIL.COM"
                                                className="w-full bg-stone-950 border-2 border-stone-800 hover:border-stone-700 focus:border-red-500/70 px-4 sm:px-5 py-3 sm:py-3 text-base sm:text-sm font-mono font-bold text-stone-100 outline-none transition-all tracking-wider uppercase rounded-xl placeholder-stone-700 focus:shadow-[0_0_25px_rgba(220,38,38,0.12)] touch-manipulation"
                                                required
                                            />
                                            <span className="absolute right-3 text-stone-600 group-focus-within/input:text-red-500 transition-colors font-bold text-sm pointer-events-none">]</span>
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <div className="flex justify-between items-center mb-1.5 px-1">
                                        <span className="text-[9px] sm:text-[10px] text-stone-400 font-bold tracking-widest uppercase flex items-center gap-1.5">
                                            <Lock size={12} className="text-red-500" />
                                            Password
                                        </span>
                                        {loginTab === 'signin' ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    audioManager.playSound('click');
                                                    setForgotPasswordInput(loginUsername.trim());
                                                    setForgotPasswordError('');
                                                    setShowForgotPasswordModal(true);
                                                }}
                                                className="min-h-[44px] px-2 -mr-1 text-[9px] sm:text-[9.5px] text-amber-400 hover:text-amber-300 active:text-amber-200 font-mono font-bold tracking-wider uppercase transition-colors cursor-pointer flex items-center gap-1.5 touch-manipulation"
                                            >
                                                <Key size={12} className="text-amber-400 shrink-0" />
                                                <span>Forgot Password?</span>
                                            </button>
                                        ) : (
                                            <span className="text-[8px] sm:text-[9px] text-stone-550 font-mono tracking-widest uppercase">REQ: MIN 6 CHARS</span>
                                        )}
                                    </div>
                                    <div className="relative flex items-center group/input">
                                        <span className="absolute left-3 text-stone-600 group-focus-within/input:text-red-500 transition-colors font-bold text-sm pointer-events-none">[</span>
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            name="password"
                                            autoComplete={loginTab === 'signin' ? 'current-password' : 'new-password'}
                                            inputMode="text"
                                            autoCapitalize="none"
                                            autoCorrect="off"
                                            spellCheck={false}
                                            enterKeyHint="go"
                                            value={loginPassword}
                                            onChange={(e) => setLoginPassword(e.target.value)}
                                            placeholder="••••••••••••••"
                                            minLength={loginTab === 'signin' ? 1 : 6}
                                            maxLength={40}
                                            className="w-full bg-stone-950 border-2 border-stone-800 hover:border-stone-700 focus:border-red-500/70 pl-5 sm:pl-6 pr-12 py-3 sm:py-3 text-base sm:text-sm font-mono font-bold text-stone-100 outline-none transition-all tracking-wider rounded-xl placeholder-stone-700 focus:shadow-[0_0_25px_rgba(220,38,38,0.12)] touch-manipulation"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-2 w-11 h-11 min-w-[44px] min-h-[44px] text-stone-500 hover:text-stone-300 focus:text-red-400 transition-colors cursor-pointer touch-manipulation flex items-center justify-center"
                                            title={showPassword ? "Hide password" : "Show password"}
                                            aria-label={showPassword ? "Hide password" : "Show password"}
                                        >
                                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>

                                {loginError && (
                                    <div className="text-[8.5px] sm:text-[9.5px] text-red-400 font-bold tracking-wider uppercase border border-red-900/50 bg-red-955/30 p-2.5 rounded-xl animate-[shake_0.5s_ease-in-out] flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0" />
                                        <span>[CRITICAL FAULT: {loginError}]</span>
                                    </div>
                                )}

                                {loginSuccess && (
                                    <div className="text-[8.5px] sm:text-[9.5px] text-green-400 font-bold tracking-wider uppercase border border-green-900/50 bg-green-955/30 p-2.5 rounded-xl flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full shrink-0" />
                                        <span>[SYNC COMPLETE: {loginSuccess}]</span>
                                    </div>
                                )}

                                <div className="pt-1 space-y-2">
                                    <button
                                        type="submit"
                                        disabled={isLoadingAuth}
                                        className="w-full min-h-[48px] py-3.5 sm:py-3.5 bg-gradient-to-r from-red-950 via-red-900 to-red-950 hover:from-red-900 hover:to-red-800 text-red-300 hover:text-white font-black text-xs sm:text-xs tracking-[0.25em] sm:tracking-[0.3em] border-2 border-red-800/80 hover:border-red-500 transition-all rounded-xl cursor-pointer shadow-lg active:scale-[0.98] disabled:opacity-50 uppercase flex items-center justify-center gap-2 hover:shadow-[0_0_35px_rgba(220,38,38,0.4)] touch-manipulation"
                                    >
                                        {isLoadingAuth && <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />}
                                        <span>
                                            {isLoadingAuth
                                                ? 'CONNECTING TO FIREBASE CLOUD...'
                                                : (loginTab === 'signin' ? 'EXECUTE AUTHENTICATION' : 'ENROLL CLOUD ACCOUNT')
                                            }
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            audioManager.playSound('click');
                                            setShowLoginModal(false);
                                            setLoginError('');
                                            setLoginSuccess('');
                                            setLoginPassword('');
                                            setLoginUsername('');
                                            setLoginEmail('');
                                            setShowPassword(false);
                                        }}
                                        className="w-full min-h-[44px] py-2 text-stone-500 hover:text-stone-300 font-bold text-[9px] sm:text-[9px] tracking-[0.25em] sm:tracking-[0.3em] uppercase transition-colors cursor-pointer text-center flex items-center justify-center touch-manipulation active:opacity-70"
                                    >
                                        — SHUTDOWN PORTAL —
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Forgot Password Modal */}
            {showForgotPasswordModal && (
                <div
                    className={`fixed inset-0 z-[220] flex items-start sm:items-center justify-center p-3 sm:p-5 bg-black/92 ${blur2xl} animate-in fade-in duration-200 font-mono overflow-y-auto overscroll-contain keyboard-aware-bottom`}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Password Recovery"
                    onClick={(e) => {
                        if (e.target === e.currentTarget && !forgotPasswordLoading) {
                            audioManager.playSound('click');
                            setShowForgotPasswordModal(false);
                        }
                    }}
                    style={{
                        paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
                        paddingBottom: 'calc(max(env(safe-area-inset-bottom, 0px), 12px) + env(keyboard-inset-height, 0px))',
                        paddingLeft: 'max(env(safe-area-inset-left, 0px), 12px)',
                        paddingRight: 'max(env(safe-area-inset-right, 0px), 12px)'
                    }}
                >
                    <div className="relative w-full max-w-md max-h-[92dvh] sm:max-h-[90vh] bg-stone-950 border-2 border-amber-600/50 rounded-2xl shadow-[0_0_80px_rgba(0,0,0,0.95),0_0_40px_rgba(245,158,11,0.2)] p-4 sm:p-6 space-y-3.5 sm:space-y-4 text-stone-300 overflow-y-auto my-auto">
                        <div className="flex items-center justify-between pb-3 border-b border-stone-850 pr-8 sm:pr-0">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-amber-955/60 border border-amber-600/60 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                                    <Key size={18} />
                                </div>
                                <div>
                                    <h3 className="text-sm sm:text-base font-black text-white tracking-wider uppercase">PASSWORD RECOVERY</h3>
                                    <span className="text-[8.5px] text-amber-400/80 font-bold tracking-wider block">DISPATCH SECURE RESET LINK TO GMAIL</span>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    audioManager.playSound('click');
                                    setShowForgotPasswordModal(false);
                                    setForgotPasswordError('');
                                }}
                                className="absolute top-4 right-4 sm:relative sm:top-auto sm:right-auto w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl text-stone-400 hover:text-white hover:bg-stone-850 border border-stone-800 transition-all cursor-pointer flex items-center justify-center touch-manipulation active:scale-95"
                                title="Close"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <p className="text-[10px] text-stone-400 leading-relaxed">
                            Enter your registered <strong className="text-stone-200">Codename (Username)</strong> or <strong className="text-stone-200">Gmail address</strong>. We will dispatch an automated recovery link via Firebase Auth.
                        </p>

                        <div className="space-y-1.5">
                            <div className="flex justify-between items-center px-1">
                                <span className="text-[9px] text-stone-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                    <Mail size={12} className="text-amber-400" />
                                    Username or Gmail
                                </span>
                                <span className="text-[8px] text-stone-500 font-mono">CLOUD VERIFIED</span>
                            </div>
                            <div className="relative flex items-center">
                                <input
                                    type="text"
                                    inputMode="text"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    enterKeyHint="send"
                                    value={forgotPasswordInput}
                                    onChange={(e) => setForgotPasswordInput(e.target.value)}
                                    placeholder="ENTER USERNAME OR GMAIL"
                                    className="w-full bg-stone-900/90 border-2 border-stone-800 focus:border-amber-500/70 px-4 py-3 sm:py-2.5 text-base sm:text-xs font-mono font-bold text-stone-100 outline-none transition-all tracking-wider uppercase rounded-xl placeholder-stone-600 focus:shadow-[0_0_20px_rgba(245,158,11,0.15)] touch-manipulation"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleSendForgotPassword();
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        {forgotPasswordError && (
                            <div className="text-[9px] sm:text-[9.5px] text-red-400 font-bold tracking-wider uppercase border border-red-900/50 bg-red-955/30 p-2.5 rounded-xl flex items-center gap-2 animate-[shake_0.5s_ease-in-out]">
                                <AlertTriangle size={14} className="shrink-0 text-red-400" />
                                <span>[FAULT: {forgotPasswordError}]</span>
                            </div>
                        )}

                        <div className="p-2.5 bg-amber-955/20 border border-amber-800/40 rounded-xl text-[8.5px] sm:text-[9px] text-amber-300/80 leading-relaxed flex items-center gap-2">
                            <AlertTriangle size={15} className="shrink-0 text-amber-400" />
                            <span>Note: The recovery email may land in your <strong>Spam/Junk</strong> folder. Please check it after dispatch!</span>
                        </div>

                        <div className="pt-1 sm:pt-2 space-y-2">
                            <button
                                type="button"
                                onClick={handleSendForgotPassword}
                                disabled={forgotPasswordLoading}
                                className="w-full min-h-[48px] py-3 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-stone-950 font-black text-[11px] sm:text-[10px] tracking-[0.25em] uppercase rounded-xl transition-all shadow-[0_0_25px_rgba(245,158,11,0.3)] hover:shadow-[0_0_35px_rgba(245,158,11,0.5)] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 touch-manipulation active:scale-[0.98]"
                            >
                                {forgotPasswordLoading && <div className="w-4 h-4 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />}
                                <span>{forgotPasswordLoading ? 'DISPATCHING RECOVERY LINK...' : 'DISPATCH RECOVERY LINK'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    audioManager.playSound('click');
                                    setShowForgotPasswordModal(false);
                                    setForgotPasswordError('');
                                }}
                                className="w-full min-h-[44px] py-2 text-stone-500 hover:text-stone-300 text-[9px] font-bold tracking-widest uppercase transition-colors cursor-pointer text-center flex items-center justify-center touch-manipulation active:opacity-70"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showChangelog && (
                <ChangelogModal
                    isOpen={showChangelog}
                    onClose={() => setShowChangelog(false)}
                />
            )}

            {showAnnouncement && (
                <AnnouncementModal
                    isOpen={showAnnouncement}
                    onClose={() => {
                        setShowAnnouncement(false);
                        if (pendingChangelog) {
                            setShowChangelog(true);
                            setPendingChangelog(false);
                        }
                    }}
                />
            )}

            {showLeaderboard && (
                <LeaderboardModal
                    isOpen={showLeaderboard}
                    onClose={() => setShowLeaderboard(false)}
                    leaderboard={leaderboard}
                    isLoading={isLoadingLeaderboard}
                    onRefresh={loadLeaderboardData}
                    currentUser={currentUser}
                    getUserPresence={getUserPresence}
                    onSelectProfile={(entry) => {
                        openedProfileFromLeaderboardRef.current = true;
                        setShowLeaderboard(false);
                        setSelectedPublicProfile(entry);
                    }}
                />
            )}

            {/* Menu Center Frame Area */}
            <div
                className="relative z-10 text-center max-w-md w-full p-3 sm:p-5 flex flex-col justify-center origin-center transition-transform duration-200 my-auto animate-in fade-in-50"
                style={{ transform: `scale(${scale})` }}
            >
                <div className="mb-2 sm:mb-3 relative select-none">
                    <h1 className={`text-4xl sm:text-5xl md:text-6xl font-black mb-0 text-white tracking-tighter leading-[0.88] ${
                        reduceEffects ? '' : 'drop-shadow-[0_0_35px_rgba(255,255,255,0.2)]'
                    }`}>
                        BUGSHOT<br />
                        <span className="text-red-650 tracking-[-0.04em] relative inline-block">
                            ROULETTE
                            {reduceEffects ? (
                                <span className="absolute -inset-4 bg-[radial-gradient(ellipse_at_center,rgba(220,38,38,0.28)_0%,transparent_70%)] -z-10 pointer-events-none" />
                            ) : (
                                <span className="absolute -inset-2 blur-3xl bg-red-600/35 -z-10 pointer-events-none" />
                            )}
                        </span>
                    </h1>
                </div>

                {/* Mobile-only User Profile & Messages Badge Row */}
                <MobileStatusRow
                    currentUser={currentUser}
                    isOnline={isOnline}
                    isDeveloper={isDeveloper}
                    reduceEffects={reduceEffects}
                    notificationCounts={notificationCounts}
                    onOpenMessages={handleOpenMobileMessages}
                    onOpenProfileOrMigration={handleOpenProfileOrMigration}
                    onOpenLogin={handleOpenLogin}
                    onOpenAdmin={handleOpenAdmin}
                    onOfflineToast={setMessagesToast}
                />

                <div className="flex flex-col gap-2 sm:gap-2.5 max-w-sm mx-auto w-full">
                    {/* Offline Status Protocol Banner */}
                    {!isOnline && (
                        <div className={`mb-1 px-3 py-1.5 bg-red-955/60 border border-red-700/80 rounded-xl flex items-center justify-between text-[8px] sm:text-[9px] font-mono tracking-widest text-red-300 uppercase shadow-[0_0_20px_rgba(220,38,38,0.3)] ${reduceEffects ? '' : 'animate-pulse'}`}>
                            <div className="flex items-center gap-1.5 sm:gap-2">
                                <span className={`w-1.5 h-1.5 rounded-full bg-red-500 ${reduceEffects ? '' : 'animate-ping'} shrink-0`} />
                                <span className="font-black text-red-200">OFFLINE MODE ENGAGED</span>
                            </div>
                            <span className="text-[7.5px] sm:text-[8px] text-stone-300 font-bold">SOLO & HARD MODE READY</span>
                        </div>
                    )}

                    {/* Identity Section */}
                    <div className="text-center mb-0.5">
                        <p className="text-[10px] sm:text-[11px] text-stone-300 font-black tracking-[0.35em] uppercase mb-1.5 flex items-center justify-center gap-2">
                            <span className={`w-1.5 h-1.5 bg-red-500 rounded-full ${reduceEffects ? '' : 'animate-ping'} shrink-0`} />
                            <span>A Web Game By Aadish</span>
                        </p>
                        <div className="relative group max-w-[280px] mx-auto w-full">
                            <div className="relative flex items-center">
                                <span className="absolute left-3 text-stone-600 group-focus-within:text-red-500 transition-colors font-bold text-sm pointer-events-none">[</span>
                                <input
                                    ref={nameInputRef}
                                    type="text"
                                    value={inputName}
                                    onChange={(e) => setInputName(e.target.value)}
                                    placeholder="IDENTITY"
                                    maxLength={12}
                                    className={`w-full bg-stone-950/90 border-2 border-stone-800 hover:border-stone-700 focus:border-red-600/70 focus:bg-stone-900/50 py-2.5 px-6 sm:py-3 text-base sm:text-sm font-black text-white outline-none transition-all duration-300 tracking-[0.2em] sm:tracking-[0.25em] uppercase text-center placeholder-stone-700 ${blurXl} rounded-xl shadow-inner touch-manipulation`}
                                />
                                <span className="absolute right-3 text-stone-600 group-focus-within:text-red-500 transition-colors font-bold text-sm pointer-events-none">]</span>
                            </div>
                            <div className="absolute inset-x-4 -bottom-0.5 h-[2px] bg-gradient-to-r from-transparent via-red-500/60 to-transparent scale-x-0 group-focus-within:scale-x-100 transition-transform duration-500" />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                        {/* Row 1: Start Game (2/3) + Hard Mode (1/3) */}
                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                if (currentUser && isLegacyUpstashUser(currentUser)) {
                                    setLegacyUserToMigrate(currentUser);
                                    setShowMigrationModal(true);
                                    return;
                                }
                                onStartGame(false);
                            }}
                            disabled={!inputName.trim()}
                            className="col-span-2 min-h-[48px] px-3 py-3 sm:py-3.5 bg-gradient-to-b from-white to-stone-200 hover:from-white hover:to-white text-stone-950 font-black text-xs sm:text-sm active:scale-[0.98] transition-all duration-200 disabled:opacity-25 disabled:grayscale tracking-[0.18em] rounded-xl shadow-[0_4px_25px_rgba(255,255,255,0.15)] hover:shadow-[0_0_30px_rgba(255,255,255,0.35)] hover:scale-[1.015] relative overflow-hidden group/btn uppercase leading-none cursor-pointer border-2 border-white/90 touch-manipulation flex items-center justify-center whitespace-nowrap"
                        >
                            {!reduceEffects && (
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/10 to-transparent -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700" />
                            )}
                            <span className="flex items-center justify-center gap-2 relative z-10">
                                <Crosshair size={14} className="text-stone-950 group-hover/btn:rotate-90 transition-transform duration-300 shrink-0" />
                                <span>START GAME</span>
                            </span>
                        </button>

                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                if (currentUser && isLegacyUpstashUser(currentUser)) {
                                    setLegacyUserToMigrate(currentUser);
                                    setShowMigrationModal(true);
                                    return;
                                }
                                setShowHardModeWarning(true);
                            }}
                            disabled={!inputName.trim()}
                            className="col-span-1 min-h-[48px] px-2.5 py-3 sm:py-3.5 bg-gradient-to-b from-red-950/90 to-stone-950 border-2 border-red-800 hover:border-red-500 text-red-400 font-black text-[10px] sm:text-xs hover:text-white hover:bg-red-950 hover:shadow-[0_0_28px_rgba(220,38,38,0.45)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-25 flex items-center justify-center gap-1.5 group rounded-xl shadow-[0_4px_20px_rgba(220,38,38,0.18)] uppercase tracking-[0.12em] leading-none cursor-pointer touch-manipulation whitespace-nowrap"
                            title="Hard Mode Protocol"
                        >
                            <Skull size={13} className={`text-red-500 group-hover:text-red-300 transition-colors ${reduceEffects ? '' : 'animate-pulse'} shrink-0`} />
                            <span>HARD MODE</span>
                        </button>

                        {/* Row 2: Multiplayer (2/3) + Split Multiplayer (1/3) */}
                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                if (!isOnline) {
                                    setMessagesToast('OFFLINE PROTOCOL: Internet connection required for multiplayer.');
                                    return;
                                }
                                if (currentUser && isLegacyUpstashUser(currentUser)) {
                                    setLegacyUserToMigrate(currentUser);
                                    setShowMigrationModal(true);
                                    return;
                                }
                                if (!loggedInUser) {
                                    setLoginError('');
                                    setLoginSuccess('');
                                    setShowLoginModal(true);
                                    return;
                                }
                                onStartMultiplayer(inputName.trim());
                            }}
                            disabled={!inputName.trim() || !isOnline}
                            className={`col-span-2 min-h-[48px] px-3 py-3 sm:py-3.5 border-2 font-black text-xs sm:text-sm flex items-center justify-center gap-2 group rounded-xl uppercase tracking-[0.16em] leading-none cursor-pointer relative transition-all duration-200 touch-manipulation whitespace-nowrap ${
                                !isOnline
                                    ? 'bg-stone-950/40 border-stone-850 text-stone-600 opacity-40 cursor-not-allowed shadow-none'
                                    : 'bg-stone-950/90 border-cyan-500/70 text-cyan-400 hover:text-white hover:border-cyan-400 hover:bg-cyan-950/40 hover:shadow-[0_0_30px_rgba(6,182,212,0.45)] hover:scale-[1.015] active:scale-[0.98] disabled:opacity-25 shadow-[0_4px_25px_rgba(6,182,212,0.15)]'
                            }`}
                            title={!isOnline ? 'Offline Protocol: Network connection required' : 'Enter Online Multiplayer Bunker'}
                        >
                            <Swords size={14} className={!isOnline ? 'text-stone-600' : 'text-cyan-400 group-hover:rotate-12 transition-transform duration-300 shrink-0'} />
                            <span>MULTIPLAYER</span>
                            {!isOnline ? (
                                <span className="text-[7px] bg-red-950/90 text-red-400 px-1 py-0.5 rounded border border-red-900 font-black tracking-widest uppercase ml-0.5">OFF</span>
                            ) : !loggedInUser ? (
                                <Lock size={10} className="absolute top-1.5 right-2 text-red-400" />
                            ) : null}
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                audioManager.playSound('click');
                                setShowSplitSetup(true);
                            }}
                            className="col-span-1 min-h-[48px] px-2.5 py-3 sm:py-3.5 border-2 bg-stone-950/90 border-amber-500/70 text-amber-400 hover:text-white hover:border-amber-400 hover:bg-amber-950/40 hover:shadow-[0_0_28px_rgba(245,158,11,0.4)] hover:scale-[1.02] active:scale-[0.98] font-black text-[10px] sm:text-xs flex items-center justify-center gap-1.5 group rounded-xl uppercase tracking-[0.12em] leading-none cursor-pointer relative transition-all duration-200 touch-manipulation shadow-[0_4px_20px_rgba(245,158,11,0.15)] whitespace-nowrap"
                            title="Split Multiplayer (2 Players on 1 Device)"
                        >
                            <Users size={13} className="text-amber-400 group-hover:scale-110 transition-transform duration-300 shrink-0" />
                            <span>SPLIT MP</span>
                        </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-1">
                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                onOpenGuide();
                            }}
                            className="px-2 py-2.5 min-h-[46px] bg-stone-900/60 hover:bg-stone-850/80 border border-stone-800 hover:border-cyan-500/60 text-stone-400 hover:text-cyan-300 active:scale-95 hover:scale-[1.02] transition-all duration-200 uppercase rounded-xl cursor-pointer flex flex-col items-center justify-center gap-1 font-mono font-bold text-[9px] sm:text-[10px] tracking-[0.2em] touch-manipulation shadow-md group"
                        >
                            <HelpCircle size={15} className="text-stone-500 group-hover:text-cyan-400 transition-colors" />
                            <span>Guide</span>
                        </button>
                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                if (!isOnline) {
                                    setMessagesToast('OFFLINE PROTOCOL: Cloud operative statistics are unavailable offline.');
                                    return;
                                }
                                if (currentUser && isLegacyUpstashUser(currentUser)) {
                                    setLegacyUserToMigrate(currentUser);
                                    setShowMigrationModal(true);
                                    return;
                                }
                                if (!loggedInUser) {
                                    setShowLoginModal(true);
                                    return;
                                }
                                onOpenScoreboard();
                            }}
                            disabled={!isOnline}
                            className={`px-2 py-2.5 min-h-[46px] border uppercase rounded-xl transition-all duration-200 relative flex flex-col items-center justify-center gap-1 font-mono font-bold text-[9px] sm:text-[10px] tracking-[0.2em] touch-manipulation shadow-md group ${
                                !isOnline
                                    ? 'bg-stone-950/40 border-stone-850 text-stone-600 opacity-40 cursor-not-allowed'
                                    : 'bg-stone-900/60 hover:bg-stone-850/80 border-stone-800 hover:border-amber-500/60 text-stone-400 hover:text-amber-300 active:scale-95 hover:scale-[1.02] cursor-pointer'
                            }`}
                            title={!isOnline ? 'Offline Protocol: Network connection required' : 'Operative Stats'}
                        >
                            <Trophy size={15} className={!isOnline ? 'text-stone-600' : 'text-stone-500 group-hover:text-amber-400 transition-colors'} />
                            <span>Stats</span>
                            {!isOnline ? (
                                <span className="absolute top-1 right-1 text-[6px] text-stone-500 font-bold">OFF</span>
                            ) : !loggedInUser ? (
                                <Lock size={8} className="absolute top-1.5 right-1.5 text-red-500/70" />
                            ) : null}
                        </button>
                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                onOpenSettings();
                            }}
                            className="px-2 py-2.5 min-h-[46px] bg-stone-900/60 hover:bg-stone-850/80 border border-stone-800 hover:border-stone-600 text-stone-400 hover:text-white active:scale-95 hover:scale-[1.02] transition-all duration-200 uppercase rounded-xl cursor-pointer flex flex-col items-center justify-center gap-1 font-mono font-bold text-[9px] sm:text-[10px] tracking-[0.2em] touch-manipulation shadow-md group"
                        >
                            <SettingsIcon size={15} className="text-stone-500 group-hover:text-stone-300 transition-colors" />
                            <span>Config</span>
                        </button>
                    </div>

                    <div className="mt-1">
                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                if (!isOnline) {
                                    setMessagesToast('OFFLINE PROTOCOL: Internet connection required to access Leaderboard.');
                                    return;
                                }
                                loadLeaderboardData();
                                setShowLeaderboard(true);
                            }}
                            disabled={!isOnline}
                            className={`w-full min-h-[46px] py-2.5 sm:py-3.5 border-2 font-mono font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 tracking-[0.25em] rounded-xl transition-all duration-200 uppercase touch-manipulation ${
                                !isOnline
                                    ? 'bg-black/50 border-stone-850 text-stone-600 opacity-40 cursor-not-allowed'
                                    : 'bg-stone-950/90 hover:bg-stone-900 border-amber-800/70 hover:border-amber-500 text-amber-400 hover:text-amber-200 cursor-pointer shadow-[0_4px_25px_rgba(245,158,11,0.15)] hover:shadow-[0_0_30px_rgba(245,158,11,0.35)] hover:scale-[1.01] active:scale-[0.98]'
                            }`}
                            title={!isOnline ? 'Offline Protocol: Network connection required' : 'Global Leaderboard'}
                        >
                            <Crown size={15} className={!isOnline ? 'text-stone-600' : 'text-amber-400 shrink-0'} />
                            <span>{isOnline ? 'L E A D E R B O A R D' : 'LEADERBOARD [OFFLINE]'}</span>
                        </button>
                    </div>
                </div>

                {/* Multiplayer Match Summary Popup */}
                {selectedMPMatch && typeof document !== 'undefined' ? createPortal(
                    <>
                        <div className={`fixed inset-0 z-[120] cursor-default bg-black/80 ${blurMd}`} onClick={() => setSelectedMPMatch(null)} />
                        <div className="fixed inset-0 z-[130] flex items-center justify-center p-2 sm:p-6 pointer-events-none">
                            <div
                                className="w-full max-w-[min(96vw,1100px)] max-h-[92dvh] sm:rounded-2xl overflow-y-auto bg-stone-950 border border-cyan-900/40 px-2 sm:px-4 py-4 rounded-xl shadow-[0_0_40px_rgba(6,182,212,0.12)] font-mono text-stone-300 pointer-events-auto custom-scrollbar"
                                style={{
                                    paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
                                    paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
                                    paddingLeft: 'max(env(safe-area-inset-left, 0px), 8px)',
                                    paddingRight: 'max(env(safe-area-inset-right, 0px), 8px)'
                                }}
                            >
                                <div className="sticky top-0 z-20 bg-stone-950/95 px-3 sm:px-4 py-2 sm:py-3 border-b border-stone-900">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Swords className="text-cyan-400" size={16} />
                                            <div>
                                                <div className="font-black text-sm uppercase tracking-wider text-white">MULTIPLAYER SUMMARY</div>
                                                <div className="text-[10px] text-stone-500">{selectedMPMatch?.timestamp ? new Date(selectedMPMatch.timestamp).toLocaleString() : 'UNKNOWN'}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-cyan-400 font-bold">SCORE: {selectedMPMatch?.totalScore?.toLocaleString() || 0}</div>
                                            <button onClick={() => setSelectedMPMatch(null)} className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-400 hover:text-white hover:bg-stone-850 rounded-xl transition-all cursor-pointer" title="Close" aria-label="Close">
                                                <X size={18} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-3 sm:p-4 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 72px)' }}>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-3">
                                            <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black">Deployed Agents</div>
                                            <div className="space-y-2">
                                                {selectedMPMatch?.mpPlayers?.map((player: any, idx: number) => {
                                                    const pName = player.displayName || player.username || player.name || 'Unknown Agent';
                                                    const pId = player.playerId || getPlayerId({ username: pName });
                                                    const isDev = pName.toLowerCase() === 'aadish' || Boolean(player.isDeveloper);
                                                    const avatarUrl = player.avatarUrl || (isDev
                                                        ? 'https://avatars.githubusercontent.com/u/101470733'
                                                        : getDicebearUrl(player.avatarStyle || 'thumbs', pName));

                                                    return (
                                                        <div key={idx} className="flex items-center justify-between p-2 bg-stone-900/30 border border-stone-850 rounded-xl">
                                                            <div className="flex items-center gap-2.5 min-w-0">
                                                                <div className="w-8 h-8 rounded-full overflow-hidden bg-stone-900 border border-stone-750 shrink-0">
                                                                    <img src={avatarUrl} alt={pName} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                                                                </div>
                                                                <div className="flex flex-col text-left min-w-0">
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        <span className="font-bold text-stone-200 text-xs truncate">{pName}</span>
                                                                        {player.isHost && <span className="text-[6.5px] bg-red-955 border border-red-800 text-red-400 px-1 py-0.2 rounded font-bold uppercase shrink-0">HOST</span>}
                                                                        {player.isMe && <span className="text-[6.5px] bg-cyan-950 border border-cyan-800 text-cyan-400 px-1 py-0.2 rounded font-bold uppercase shrink-0">YOU</span>}
                                                                    </div>
                                                                    <span className="text-[7.5px] text-stone-500 font-mono tracking-wider">{pId}</span>
                                                                </div>
                                                            </div>
                                                            <div className={`font-black uppercase text-[10.5px] font-mono shrink-0 ml-2 ${player.result === 'WIN' ? 'text-green-400' : player.result === 'LOSS' ? 'text-red-450' : 'text-stone-500'}`}>
                                                                {player.result}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black mb-2">Performance Report</div>
                                            <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
                                                <div className="p-3 bg-stone-950 border border-stone-900/50 rounded flex justify-between items-center">
                                                    <div className="text-stone-500 text-[12px]">RDS SURVIVED</div>
                                                    <div className="text-stone-200 font-bold">{selectedMPMatch?.roundsSurvived}</div>
                                                </div>
                                                <div className="p-3 bg-stone-950 border border-stone-900/50 rounded flex justify-between items-center">
                                                    <div className="text-stone-500 text-[12px]">PRECISION</div>
                                                    <div className="text-stone-200 font-bold">{selectedMPMatch?.shotsFired > 0 ? Math.round((selectedMPMatch.shotsHit / selectedMPMatch.shotsFired) * 100) : 0}%</div>
                                                </div>
                                                <div className="p-3 bg-stone-950 border border-stone-900/50 rounded flex justify-between items-center">
                                                    <div className="text-stone-500 text-[12px]">DMG DEALT</div>
                                                    <div className="text-stone-200 font-bold">{selectedMPMatch?.damageDealt}</div>
                                                </div>
                                                <div className="p-3 bg-stone-950 border border-stone-900/50 rounded flex justify-between items-center">
                                                    <div className="text-stone-500 text-[12px]">DMG TAKEN</div>
                                                    <div className="text-stone-200 font-bold">{selectedMPMatch?.damageTaken}</div>
                                                </div>
                                                <div className="p-3 bg-stone-950 border border-stone-900/50 rounded flex justify-between items-center md:col-span-2">
                                                    <div className="text-stone-500 text-[12px]">SELF SHOTS</div>
                                                    <div className={`${selectedMPMatch?.selfShots > 0 ? 'text-red-400' : 'text-stone-400'} font-bold`}>{selectedMPMatch?.selfShots}</div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="text-[10px] text-stone-500 uppercase tracking-widest font-black">Items Deployed</div>
                                            <div className="grid grid-cols-1 gap-2">
                                                {selectedMPMatch?.itemsDeployed?.map((it: any, i: number) => (
                                                    <div key={i} className="flex items-center gap-3 p-2 bg-stone-900/10 border border-stone-900/30 rounded-lg">
                                                        <div className="w-10 h-10 bg-stone-800/40 rounded flex items-center justify-center text-white font-bold">{it.icon || ''}</div>
                                                        <div className="flex-1">
                                                            <div className="font-bold text-stone-200">{it.name}</div>
                                                            <div className="text-stone-500 text-[12px]">x{it.count || 1}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="px-3 sm:px-4 pb-4 pt-2">
                                    <button onClick={() => setSelectedMPMatch(null)} className="w-full py-2 bg-cyan-950/20 border border-cyan-850 hover:bg-cyan-900/20 text-cyan-400 font-bold text-[12px] tracking-wider uppercase rounded-lg transition-all cursor-pointer">
                                        DISMISS LOG
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>,
                    document.body
                ) : null}

                <div className="mt-2 sm:mt-3 flex flex-col items-center gap-1.5 select-none">
                    {!isStandalone ? (
                        <button
                            onClick={handleInstallClick}
                            className={`group flex items-center gap-1.5 px-3 py-1 sm:px-3.5 sm:py-1 rounded-full bg-cyan-955/30 hover:bg-cyan-900/40 border border-cyan-700/40 hover:border-cyan-400/80 text-cyan-300 hover:text-white text-[8px] sm:text-[9px] font-mono font-bold tracking-[0.15em] uppercase ${blurMd} shadow-[0_0_15px_rgba(6,182,212,0.12)] hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all active:scale-95 cursor-pointer`}
                            title="Install BugShot Roulette as a native App (PWA)"
                        >
                            <Download size={10} className="text-cyan-400 group-hover:scale-110 transition-transform shrink-0" />
                            <span>INSTALL APP</span>
                        </button>
                    ) : (
                        <div className="flex items-center gap-1.5 text-emerald-400/80 text-[7.5px] sm:text-[8px] font-mono font-bold tracking-[0.2em] uppercase">
                            <span className={`w-1.5 h-1.5 rounded-full bg-emerald-400 ${reduceEffects ? '' : 'animate-pulse'}`} />
                            <span>PWA ACTIVE</span>
                        </div>
                    )}
                    <div className="flex items-center gap-2 text-stone-500 hover:text-stone-400 text-[7.5px] sm:text-[8px] font-mono font-bold tracking-[0.2em] uppercase transition-colors">
                        <span>VER {GAME_VERSION}</span>
                    </div>
                </div>
            </div>

            {showProfileModal && (
                <ProfileModal
                    isOpen={showProfileModal}
                    onClose={() => setShowProfileModal(false)}
                    profile={currentUser}
                    currentUser={currentUser}
                    isOwnProfile={true}
                    getUserPresence={getUserPresence}
                    onProfileUpdated={(updated) => {
                        setCurrentUser(updated);
                        setInputName((updated.displayName || updated.username).toUpperCase());
                    }}
                    onLogout={handleLogout}
                    onOpenMessages={(target) => {
                        setMessagesTargetUser(target);
                        setShowMessagesModal(true);
                    }}
                    onRequireLogin={() => setShowLoginModal(true)}
                />
            )}

            {selectedPublicProfile && (
                <ProfileModal
                    isOpen={Boolean(selectedPublicProfile)}
                    onClose={() => {
                        setSelectedPublicProfile(null);
                        if (openedProfileFromLeaderboardRef.current) {
                            setShowLeaderboard(true);
                            openedProfileFromLeaderboardRef.current = false;
                        }
                    }}
                    profile={selectedPublicProfile}
                    currentUser={currentUser}
                    isOwnProfile={currentUser?.username?.toLowerCase() === selectedPublicProfile.username?.toLowerCase()}
                    getUserPresence={getUserPresence}
                    onProfileUpdated={(updated) => {
                        if (currentUser?.username?.toLowerCase() === updated.username?.toLowerCase()) {
                            setCurrentUser(updated);
                            setInputName((updated.displayName || updated.username).toUpperCase());
                        }
                    }}
                    onOpenMessages={(target) => {
                        setSelectedPublicProfile(null);
                        setMessagesTargetUser(target);
                        setShowMessagesModal(true);
                    }}
                    onRequireLogin={() => {
                        setSelectedPublicProfile(null);
                        setShowLoginModal(true);
                    }}
                />
            )}

            {showMigrationModal && (
                <MigrationModal
                    isOpen={showMigrationModal}
                    legacyUser={legacyUserToMigrate}
                    onClose={() => {
                        if (currentUser && isLegacyUpstashUser(currentUser)) {
                            handleLogout();
                        } else {
                            setShowMigrationModal(false);
                            setLegacyUserToMigrate(null);
                        }
                    }}
                    onMigrationSuccess={(migratedUser) => {
                        setShowMigrationModal(false);
                        setLegacyUserToMigrate(null);
                        setCurrentUser(migratedUser);
                        setInputName((migratedUser.displayName || migratedUser.username).toUpperCase());
                        audioManager.playSound('click');
                    }}
                />
            )}

            {showResetSpamModal && (
                <div
                    className={`fixed inset-0 z-[230] flex items-center justify-center p-4 bg-black/90 ${blurMd} animate-in fade-in duration-150`}
                    style={{
                        paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)',
                        paddingBottom: 'calc(max(env(safe-area-inset-bottom, 0px), 16px) + env(keyboard-inset-height, 0px))',
                        paddingLeft: 'max(env(safe-area-inset-left, 0px), 16px)',
                        paddingRight: 'max(env(safe-area-inset-right, 0px), 16px)'
                    }}
                >
                    <div className="max-w-md w-full bg-stone-950 border border-stone-800 rounded-2xl p-6 shadow-2xl font-mono text-center space-y-4">
                        <div className="w-12 h-12 rounded-full bg-amber-955 border border-amber-600 flex items-center justify-center mx-auto text-amber-400">
                            <Mail className="w-6 h-6" />
                        </div>
                        <h3 className="text-sm sm:text-base font-black text-white tracking-wider uppercase">
                            Password Reset Email Sent!
                        </h3>
                        <p className="text-[10px] text-stone-300 leading-relaxed">
                            We dispatched your recovery link to <span className="text-amber-400 font-bold">{spamNoticeTarget}</span>.
                        </p>
                        <div className="p-3 bg-amber-955/30 border border-amber-700/40 rounded-xl text-left space-y-1">
                            <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[9px] uppercase">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>Check Your Spam / Junk Folder</span>
                            </div>
                            <p className="text-[8.5px] text-stone-400 leading-normal">
                                Automated security reset emails are often sorted into your <strong>Spam</strong>, <strong>Junk</strong>, or <strong>Promotions</strong> folder by Gmail. If you don't see it in your inbox within 1 minute, please check your Spam folder!
                            </p>
                        </div>
                        <button
                            onClick={() => setShowResetSpamModal(false)}
                            className="w-full min-h-[44px] py-2.5 bg-stone-800 hover:bg-stone-700 active:bg-stone-600 text-white font-bold text-[10px] sm:text-xs rounded-xl uppercase tracking-wider transition-all cursor-pointer touch-manipulation active:scale-[0.98]"
                        >
                            Understood, Got It
                        </button>
                    </div>
                </div>
            )}

            {isDeveloper && showAdminModal && (
                <AdminDashboardModal
                    isOpen={showAdminModal}
                    onClose={() => setShowAdminModal(false)}
                    adminAPI={adminAPI}
                    currentUsername={currentUser?.username || ''}
                    isDeveloper={isDeveloper}
                />
            )}

            {showMessagesModal && (
                <MessagesModal
                    isOpen={showMessagesModal}
                    onClose={() => {
                        setShowMessagesModal(false);
                        setMessagesTargetUser(null);
                    }}
                    currentUser={currentUser}
                    getUserPresence={getUserPresence}
                    initialTargetUsername={messagesTargetUser}
                    onOpenProfile={(targetUser) => {
                        openedProfileFromLeaderboardRef.current = false;
                        setShowMessagesModal(false);
                        setSelectedPublicProfile(targetUser as any);
                    }}
                    onOpenLogin={() => {
                        setShowMessagesModal(false);
                        setShowLoginModal(true);
                    }}
                    onJoinRoom={(roomId) => {
                        setShowMessagesModal(false);
                        setMessagesTargetUser(null);
                        const name = currentUser?.username || inputName?.trim() || 'Player';
                        onStartMultiplayer(name, roomId);
                    }}
                />
            )}
            {showSplitSetup && (
                <SplitSetupModal
                    defaultPlayer1Name={inputName.trim() || currentUser?.displayName || currentUser?.username || 'PLAYER 1'}
                    onClose={() => setShowSplitSetup(false)}
                    onStart={(config) => {
                        setShowSplitSetup(false);
                        onStartLocalSplit?.(config);
                    }}
                />
            )}
        </div>
    );
});
IntroScreen.displayName = 'IntroScreen';
