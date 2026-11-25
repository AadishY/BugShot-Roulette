import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    Mail,
    Send,
    Smile,
    UserPlus,
    Users,
    Check,
    CheckCheck,
    X,
    Radio,
    Pin,
    Clock,
    Sparkles,
    ShieldAlert,
    Search,
    Trash2,
    UserCheck,
    Bell,
    Inbox,
    AlertCircle,
    ArrowLeft,
    Share2,
    RefreshCw,
    Lock,
    ExternalLink,
    MessageSquare,
    Swords,
    Skull,
    AlertTriangle,
    Loader2
} from 'lucide-react';
import {
    UserProfile,
    getUsersByUsernames,
    getCachedUserSync,
    getPlayerId
} from '../../utils/firebaseService';
import { DEFAULT_FALLBACK_AVATAR } from '../../utils/dicebear';
import {
    ChatMessage,
    FriendRequest,
    FriendUser,
    CustomSticker,
    BUGSHOT_STICKERS,
    getStickerById,
    subscribeToFriends,
    subscribeToFriendRequests,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriend,
    subscribeToDirectMessages,
    sendDirectMessage,
    subscribeToRecentDMContacts,
    recordRecentDMContact,
    DMContactRecord,
    subscribeToBroadcasts,
    sendBroadcastMessage,
    deleteBroadcastMessage,
    resolvePlayerAvatar,
    subscribeToNotifications,
    NotificationCounts,
    markConversationAsRead,
    FeedbackMessage,
    sendFeedback,
    subscribeToFeedbacks,
    deleteFeedback
} from '../../utils/messagingService';
import { mergeDMContacts, MergedDMContact } from '../../utils/dmContacts';
import { audioManager } from '../../utils/audioManager';
import { UserPresence, formatLastSeen, presenceClient } from '../../utils/presenceService';
import { showConfirm } from '../../utils/modalService';

interface MessagesModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentUser: UserProfile | null;
    getUserPresence?: (username: string) => UserPresence | null;
    onOpenProfile?: (profileUser: UserProfile | { username: string }) => void;
    onOpenLogin?: () => void;
    initialTargetUsername?: string | null;
    onJoinRoom?: (roomId: string) => void;
}

export const parseMessageInvite = (text: string): { roomId: string | null; cleanText: string } => {
    if (!text) return { roomId: null, cleanText: '' };
    const match = text.match(/(?:https?:\/\/[^\s]+)?(?:[?&]room=)([0-9]{4})\b[^\s]*/i);
    if (!match) return { roomId: null, cleanText: text };
    const roomId = match[1];
    const cleanText = text.replace(match[0], '').trim();
    return { roomId, cleanText };
};

export const AvatarImage: React.FC<{
    src: string;
    alt: string;
    className?: string;
    fallbackSeed?: string;
    sizeClass?: string;
}> = ({ src, alt, className = "w-full h-full object-cover", fallbackSeed, sizeClass = "w-full h-full" }) => {
    const [imgSrc, setImgSrc] = useState(src);
    const [hasError, setHasError] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        setImgSrc(src);
        setHasError(false);
        setIsLoaded(false);
    }, [src]);

    const handleError = () => {
        if (!hasError) {
            setHasError(true);
            const fallbackResolved = resolvePlayerAvatar({ username: fallbackSeed || alt });
            setImgSrc(fallbackResolved !== imgSrc ? fallbackResolved : DEFAULT_FALLBACK_AVATAR);
        } else {
            setImgSrc(DEFAULT_FALLBACK_AVATAR);
        }
    };

    return (
        <div className={`relative ${sizeClass} overflow-hidden rounded-full bg-stone-900 shrink-0`}>
            {!isLoaded && (
                <div className="absolute inset-0 bg-stone-850 animate-pulse rounded-full" />
            )}
            <img
                src={imgSrc}
                alt={alt}
                loading="lazy"
                decoding="async"
                onLoad={() => setIsLoaded(true)}
                onError={handleError}
                className={`${className} ${isLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-150`}
            />
        </div>
    );
};

interface MatchInviteCardProps {
    roomId: string;
    onJoinRoom?: (roomId: string) => void;
    onCloseModal?: () => void;
}

export const MatchInviteCard: React.FC<MatchInviteCardProps> = ({ roomId, onJoinRoom, onCloseModal }) => {
    const [status, setStatus] = useState<'checking' | 'open' | 'in_match' | 'full' | 'closed'>('checking');
    const [details, setDetails] = useState<{ playerCount?: number; maxPlayers?: number; hostName?: string } | null>(null);

    useEffect(() => {
        let mounted = true;
        const fetchStatus = async () => {
            try {
                const res = await presenceClient.checkRoomStatus(roomId);
                if (mounted) {
                    setStatus(res.status || 'closed');
                    setDetails(res);
                }
            } catch (e) {
                if (mounted) setStatus('closed');
            }
        };

        fetchStatus();
        const timer = setInterval(fetchStatus, 4000);
        return () => {
            mounted = false;
            clearInterval(timer);
        };
    }, [roomId]);

    const handleJoin = () => {
        if (status !== 'open') return;
        audioManager.playSound('confirm');
        if (onJoinRoom) {
            onJoinRoom(roomId);
        }
        if (onCloseModal) {
            onCloseModal();
        }
    };

    if (status === 'checking') {
        return (
            <div className="mt-2 p-2.5 bg-stone-950/80 border border-stone-850 rounded-xl flex items-center gap-2 max-w-sm select-none">
                <Loader2 size={13} className="animate-spin text-cyan-400 shrink-0" />
                <span className="text-[9px] text-stone-400 font-mono tracking-wider uppercase">
                    SCANNING LOBBY TUNNEL #{roomId}...
                </span>
            </div>
        );
    }

    if (status === 'open') {
        const count = details?.playerCount || 1;
        const max = details?.maxPlayers || 4;
        const host = details?.hostName || 'HOST';

        return (
            <div className="mt-2.5 p-3 rounded-xl bg-stone-950/95 border border-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.2)] flex flex-col gap-2 select-none max-w-sm text-left">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse" />
                        <span className="text-[10px] font-mono font-black text-emerald-400 tracking-wider uppercase">
                            ACTIVE MATCH INVITATION
                        </span>
                    </div>
                    <span className="px-1.5 py-0.5 bg-black/70 border border-emerald-700/60 rounded text-[9px] font-mono font-black text-emerald-300 tracking-widest">
                        #{roomId}
                    </span>
                </div>

                <div className="flex flex-col text-[9.5px] font-mono text-stone-300">
                    <div>HOST: <span className="text-white font-bold">{host}</span></div>
                    <div className="text-stone-400">NODES: <span className="text-emerald-300 font-bold">{count} / {max} IN LOBBY</span></div>
                </div>

                <button
                    type="button"
                    onClick={handleJoin}
                    className="w-full mt-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-mono font-black text-xs rounded-lg flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.4)] cursor-pointer uppercase tracking-wider transition-all"
                >
                    <Swords size={14} /> JOIN NOW
                </button>
            </div>
        );
    }

    if (status === 'in_match') {
        const host = details?.hostName || 'HOST';
        return (
            <div className="mt-2.5 p-3 rounded-xl bg-stone-950/95 border border-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.15)] flex flex-col gap-1.5 select-none max-w-sm text-left">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                        <span className="text-[10px] font-mono font-black text-amber-400 tracking-wider uppercase">
                            MATCH IN PROGRESS
                        </span>
                    </div>
                    <span className="px-1.5 py-0.5 bg-black/70 border border-amber-800/60 rounded text-[9px] font-mono font-black text-amber-400 tracking-widest">
                        #{roomId}
                    </span>
                </div>

                <p className="text-[9px] font-mono text-amber-200/80 leading-relaxed">
                    Host: <span className="text-white font-bold">{host}</span> • Combat underway. Player is already in match.
                </p>

                <div className="w-full mt-1 py-1.5 px-3 bg-stone-900 border border-amber-900/50 text-amber-500/70 font-mono font-black text-[10px] rounded-lg text-center uppercase cursor-not-allowed flex items-center justify-center gap-1.5">
                    <AlertTriangle size={12} /> PLAYER ALREADY IN MATCH
                </div>
            </div>
        );
    }

    if (status === 'full') {
        return (
            <div className="mt-2.5 p-3 rounded-xl bg-stone-950/95 border border-yellow-600/60 shadow-[0_0_15px_rgba(202,138,4,0.15)] flex flex-col gap-1.5 select-none max-w-sm text-left">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-yellow-400" />
                        <span className="text-[10px] font-mono font-black text-yellow-400 tracking-wider uppercase">
                            LOBBY FULL
                        </span>
                    </div>
                    <span className="px-1.5 py-0.5 bg-black/70 border border-yellow-800/60 rounded text-[9px] font-mono font-black text-yellow-400 tracking-widest">
                        #{roomId}
                    </span>
                </div>

                <p className="text-[9px] font-mono text-stone-400">
                    Room has reached maximum capacity (4/4 players).
                </p>

                <div className="w-full mt-1 py-1.5 px-3 bg-stone-900 border border-yellow-900/40 text-yellow-500/60 font-mono font-black text-[10px] rounded-lg text-center uppercase cursor-not-allowed flex items-center justify-center gap-1.5">
                    <Users size={12} /> LOBBY FULL (4/4)
                </div>
            </div>
        );
    }

    // Default: closed or not found
    return (
        <div className="mt-2.5 p-3 rounded-xl bg-stone-950/70 border border-stone-850 opacity-80 flex flex-col gap-1.5 select-none max-w-sm text-left">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-stone-600" />
                    <span className="text-[10px] font-mono font-black text-stone-400 tracking-wider uppercase">
                        LOBBY CLOSED
                    </span>
                </div>
                <span className="px-1.5 py-0.5 bg-black/70 border border-stone-800 rounded text-[9px] font-mono font-black text-stone-500 tracking-widest">
                    #{roomId}
                </span>
            </div>

            <p className="text-[9px] font-mono text-stone-500">
                This lobby is closed, expired, or does not exist.
            </p>

            <div className="w-full mt-1 py-1.5 px-3 bg-stone-900/60 border border-stone-850 text-stone-600 font-mono font-black text-[10px] rounded-lg text-center uppercase cursor-not-allowed flex items-center justify-center gap-1.5">
                <Skull size={12} /> LOBBY CLOSED
            </div>
        </div>
    );
};

export const MessagesModal: React.FC<MessagesModalProps> = ({
    isOpen,
    onClose,
    currentUser,
    getUserPresence,
    onOpenProfile,
    onOpenLogin,
    initialTargetUsername,
    onJoinRoom
}) => {
    // Top Tabs: 'CHATS' | 'REQUESTS' | 'FEEDBACK'
    const [activeTab, setActiveTab] = useState<'CHATS' | 'REQUESTS' | 'FEEDBACK'>('CHATS');
    
    // Active conversation: null (standby selection), 'global_broadcast', 'admin_feedbacks', or username of mutual friend
    const [selectedChatId, setSelectedChatId] = useState<string | null>(initialTargetUsername ? initialTargetUsername.toLowerCase() : null);

    // Friends, Persistent Recent DMs, and Requests real-time state
    const [friends, setFriends] = useState<FriendUser[]>([]);
    const [recentDMContacts, setRecentDMContacts] = useState<DMContactRecord[]>([]);
    const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
    
    // Messages state
    const [broadcasts, setBroadcasts] = useState<ChatMessage[]>([]);
    const [directMessages, setDirectMessages] = useState<ChatMessage[]>([]);

    // Player Feedback state
    const [feedbacks, setFeedbacks] = useState<FeedbackMessage[]>([]);
    const [feedbackCategory, setFeedbackCategory] = useState<'General Feedback' | 'Bug Report' | 'Feature Request' | 'Game Balance'>('General Feedback');
    const [feedbackInputText, setFeedbackInputText] = useState('');
    const [isSendingFeedback, setIsSendingFeedback] = useState(false);
    const [feedbackSubmitSuccess, setFeedbackSubmitSuccess] = useState(false);
    const [feedbackSubmitError, setFeedbackSubmitError] = useState('');

    // Unread Notifications state
    const [notificationCounts, setNotificationCounts] = useState<NotificationCounts>({
        unreadDMs: 0,
        pendingRequests: 0,
        total: 0,
        unreadBySender: {}
    });

    // Inputs & UX state
    const [messageInput, setMessageInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [showStickers, setShowStickers] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [onlyOnlineFilter, setOnlyOnlineFilter] = useState(false);

    // Friend Request Input & Feedback
    const [addFriendInput, setAddFriendInput] = useState('');
    const [isSendingRequest, setIsSendingRequest] = useState(false);
    const [requestFeedback, setRequestFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    // Developer Broadcast Creator state
    const [showBroadcastCreator, setShowBroadcastCreator] = useState(false);
    const [broadcastTitle, setBroadcastTitle] = useState('');
    const [broadcastText, setBroadcastText] = useState('');
    const [broadcastStickerId, setBroadcastStickerId] = useState<string | undefined>(undefined);
    const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);

    // Chat scroll ref & input focus ref
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const messageInputRef = useRef<HTMLInputElement>(null);
    const [resolvedProfiles, setResolvedProfiles] = useState<Record<string, UserProfile>>({});
    const [profileVersion, setProfileVersion] = useState(0);
    const isDeveloper = Boolean(currentUser?.isDeveloper || currentUser?.role === 'developer' || currentUser?.username?.toLowerCase() === 'aadish');

    // Sync avatar & presence updates immediately while MessagesModal is open
    useEffect(() => {
        if (!isOpen) return;
        const handleProfileUpdated = (e: any) => {
            const prof = e?.detail?.profile;
            if (prof?.username) {
                setResolvedProfiles(prev => ({
                    ...prev,
                    [prof.username.toLowerCase()]: prof
                }));
            }
            setProfileVersion(v => v + 1);
        };
        window.addEventListener('bugshot_profile_updated', handleProfileUpdated);
        const unsubPresence = presenceClient.subscribe(() => setProfileVersion(v => v + 1));
        return () => {
            window.removeEventListener('bugshot_profile_updated', handleProfileUpdated);
            unsubPresence();
        };
    }, [isOpen]);

    // Keyboard shortcuts: Escape to dismiss drawer / go back / close modal
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (showStickers) {
                    setShowStickers(false);
                } else if (selectedChatId && window.innerWidth < 768) {
                    setSelectedChatId(null);
                } else {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, showStickers, selectedChatId, onClose]);

    // Auto-focus message input whenever a chat contact is selected
    useEffect(() => {
        if (
            isOpen &&
            activeTab === 'CHATS' &&
            selectedChatId &&
            selectedChatId !== 'bugshot' &&
            selectedChatId !== 'system' &&
            selectedChatId !== 'global_broadcast' &&
            selectedChatId !== 'admin_feedbacks'
        ) {
            const timer = setTimeout(() => {
                messageInputRef.current?.focus();
            }, 120);
            return () => clearTimeout(timer);
        }
    }, [isOpen, activeTab, selectedChatId]);

    // Handle initial target user if opened from ProfileModal or reset on open
    useEffect(() => {
        if (isOpen) {
            if (initialTargetUsername && initialTargetUsername.toLowerCase() !== currentUser?.username?.toLowerCase()) {
                setSelectedChatId(initialTargetUsername.toLowerCase());
                setActiveTab('CHATS');
            } else {
                setSelectedChatId(null);
            }
            setShowStickers(false);
            setMessageInput('');
        }
    }, [isOpen, initialTargetUsername, currentUser?.username]);

    // 1. Subscribe to Mutual Friends
    useEffect(() => {
        if (!isOpen || !currentUser) return;
        const unsubscribe = subscribeToFriends(currentUser.username, (loadedFriends) => {
            setFriends(loadedFriends);
        });
        return () => unsubscribe();
    }, [isOpen, currentUser?.username]);

    // 1b. Subscribe to Persistent Recent DM Contacts (sent & received conversations stay in DM section)
    useEffect(() => {
        if (!isOpen || !currentUser) {
            setRecentDMContacts([]);
            return;
        }
        const unsubscribe = subscribeToRecentDMContacts(currentUser.username, (contacts) => {
            setRecentDMContacts(contacts);
        });
        return () => unsubscribe();
    }, [isOpen, currentUser?.username]);

    // 2. Subscribe to Friend Requests
    useEffect(() => {
        if (!isOpen || !currentUser) return;
        const unsubscribe = subscribeToFriendRequests(currentUser.username, (requests) => {
            setFriendRequests(requests);
        });
        return () => unsubscribe();
    }, [isOpen, currentUser?.username]);

    // 3. Subscribe to Global Broadcasts (Permanent & Immortal)
    useEffect(() => {
        if (!isOpen) return;
        const unsubscribe = subscribeToBroadcasts((loadedBroadcasts) => {
            setBroadcasts(loadedBroadcasts);
        });
        return () => unsubscribe();
    }, [isOpen]);

    // 3b. Subscribe to Unread Notifications
    useEffect(() => {
        if (!isOpen || !currentUser) return;
        const unsubscribe = subscribeToNotifications(currentUser.username, (counts) => {
            setNotificationCounts(counts);
        });
        return () => unsubscribe();
    }, [isOpen, currentUser?.username]);

    // 3c. Subscribe to Feedback Transmissions
    useEffect(() => {
        if (!isOpen) return;
        const unsubscribe = subscribeToFeedbacks((loadedFeedbacks) => {
            setFeedbacks(loadedFeedbacks);
        });
        return () => unsubscribe();
    }, [isOpen]);

    // 4. Subscribe to Direct Messages
    useEffect(() => {
        if (!isOpen || !currentUser || !selectedChatId || selectedChatId === 'global_broadcast' || selectedChatId === 'admin_feedbacks') {
            setDirectMessages([]);
            return;
        }

        const unsubscribe = subscribeToDirectMessages(
            currentUser.username,
            selectedChatId,
            (loadedDMs) => {
                setDirectMessages(loadedDMs);
            }
        );

        return () => unsubscribe();
    }, [isOpen, currentUser?.username, selectedChatId]);

    const prevChatIdRef = useRef<string | null>(null);

    const scrollToBottom = () => {
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
    };

    // Auto-scroll messages container: instant, smooth-rendered without shutter or jitter
    useEffect(() => {
        if (!isOpen || activeTab !== 'CHATS' || !selectedChatId) return;

        prevChatIdRef.current = selectedChatId;

        // Immediately set scrollTop without delay
        if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }

        // Single rAF tick to ensure painted layout is at the bottom
        const raf = requestAnimationFrame(() => {
            if (messagesContainerRef.current) {
                messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
            }
        });

        return () => cancelAnimationFrame(raf);
    }, [directMessages.length, broadcasts.length, feedbacks.length, selectedChatId, isOpen, activeTab]);

    // Check if target is currently a mutual friend or system channel
    const selectedFriend = useMemo(() => {
        if (!selectedChatId || selectedChatId === 'global_broadcast' || selectedChatId === 'admin_feedbacks') return null;
        if (selectedChatId.toLowerCase() === 'bugshot' || selectedChatId.toLowerCase() === 'system') {
            return {
                username: 'bugshot',
                displayName: 'BUGSHOT // SYSTEM',
                avatarUrl: DEFAULT_FALLBACK_AVATAR,
                playerId: 'OFFICIAL SYSTEM DISPATCH',
                isDeveloper: false
            };
        }
        const cleanSelected = selectedChatId.toLowerCase();
        const liveProfile = resolvedProfiles[cleanSelected] || getCachedUserSync(cleanSelected);
        const found = friends.find(f => f.username.toLowerCase() === cleanSelected);

        if (liveProfile) {
            return {
                username: liveProfile.username,
                displayName: liveProfile.displayName || found?.displayName || liveProfile.username,
                avatarUrl: resolvePlayerAvatar(liveProfile),
                avatarStyle: liveProfile.avatarStyle,
                avatarSeed: liveProfile.avatarSeed,
                playerId: liveProfile.playerId || found?.playerId || getPlayerId(liveProfile),
                isDeveloper: Boolean(liveProfile.isDeveloper || liveProfile.role === 'developer')
            };
        }
        if (found) {
            return {
                ...found,
                avatarUrl: resolvePlayerAvatar(found)
            };
        }

        return {
            username: selectedChatId,
            displayName: selectedChatId,
            avatarUrl: resolvePlayerAvatar({ username: selectedChatId }),
            playerId: getPlayerId({ username: selectedChatId })
        };
    }, [friends, selectedChatId, resolvedProfiles, profileVersion]);

    // Batch-resolve live Firestore profiles for all visible contacts, requests, feedback senders, and active chat
    useEffect(() => {
        if (!isOpen) return;
        const candidates = new Set<string>();
        friends.forEach(f => f.username && candidates.add(f.username.toLowerCase()));
        recentDMContacts.forEach(r => r.username && candidates.add(r.username.toLowerCase()));
        friendRequests.forEach(r => r.from && candidates.add(r.from.toLowerCase()));
        Object.keys(notificationCounts.unreadBySender || {}).forEach(s => candidates.add(s.toLowerCase()));
        if (selectedChatId && !['global_broadcast', 'admin_feedbacks', 'bugshot', 'system'].includes(selectedChatId.toLowerCase())) {
            candidates.add(selectedChatId.toLowerCase());
        }
        directMessages.forEach(m => m.sender && candidates.add(m.sender.toLowerCase()));
        feedbacks.forEach(fb => fb.sender && candidates.add(fb.sender.toLowerCase()));

        const toFetch = Array.from(candidates).filter(
            u => u && u !== 'bugshot' && u !== 'system' && u !== 'anonymous' && !resolvedProfiles[u]
        );
        if (toFetch.length === 0) return;

        let cancelled = false;
        getUsersByUsernames(toFetch, { forceRemote: true }).then((fetched) => {
            if (cancelled || !fetched || Object.keys(fetched).length === 0) return;
            setResolvedProfiles(prev => ({ ...prev, ...fetched }));
        }).catch(() => {});

        return () => {
            cancelled = true;
        };
    }, [isOpen, friends, recentDMContacts, friendRequests, notificationCounts.unreadBySender, selectedChatId, directMessages.length, feedbacks.length]);

    const getResolvedAvatar = (username?: string, fallbackObj?: any) => {
        const clean = (username || '').trim().toLowerCase();
        if (!clean) return resolvePlayerAvatar(fallbackObj);
        if (currentUser?.username?.toLowerCase() === clean) {
            return resolvePlayerAvatar(currentUser);
        }
        const liveProfile = resolvedProfiles[clean];
        if (liveProfile) {
            return resolvePlayerAvatar(liveProfile);
        }
        const friendMatch = friends.find(f => f.username.toLowerCase() === clean);
        if (friendMatch) {
            return resolvePlayerAvatar(friendMatch);
        }
        return resolvePlayerAvatar(fallbackObj || { username: clean });
    };

    // Mark messages as read only when unread incoming messages exist
    useEffect(() => {
        if (!isOpen || !currentUser || !selectedChatId || selectedChatId === 'global_broadcast' || selectedChatId === 'admin_feedbacks') return;
        const cleanMe = currentUser.username.toLowerCase();
        const hasUnreadIncoming = directMessages.some(
            m => m.recipient?.toLowerCase() === cleanMe && !m.read
        );
        if (hasUnreadIncoming) {
            markConversationAsRead(currentUser.username, selectedChatId);
        }
    }, [isOpen, currentUser?.username, selectedChatId, directMessages]);

    // Friend presence helper
    const getFriendPresence = (username: string) => {
        if (getUserPresence) {
            const pres = getUserPresence(username);
            if (pres) {
                const isOnline = pres.status !== 'offline';
                const text = pres.status === 'in_match'
                    ? 'In Combat'
                    : pres.status === 'in_lobby'
                    ? 'In Lobby'
                    : isOnline
                    ? 'Online'
                    : pres.lastSeen
                    ? `Last seen ${formatLastSeen(pres.lastSeen)}`
                    : 'Offline';
                return {
                    isOnline,
                    status: pres.status,
                    text
                };
            }
        }
        return { isOnline: false, status: 'offline', text: 'Offline' };
    };

    // Unified list of contacts: Mutual friends + All persisted DM conversations (sent & received) + Unread + Selected
    const allContacts = useMemo<MergedDMContact[]>(() => {
        const resolveContact = (uname: string, fallback?: Partial<DMContactRecord>): MergedDMContact => {
            const prof = resolvedProfiles[uname] || getCachedUserSync(uname);
            if (prof) {
                return {
                    username: prof.username,
                    displayName: prof.displayName || fallback?.displayName || prof.username,
                    avatarUrl: resolvePlayerAvatar(prof),
                    avatarStyle: prof.avatarStyle,
                    avatarSeed: prof.avatarSeed,
                    playerId: prof.playerId || getPlayerId(prof),
                    isDeveloper: Boolean(prof.isDeveloper || prof.role === 'developer')
                };
            }
            return {
                username: uname,
                displayName: fallback?.displayName || uname,
                avatarUrl: fallback?.avatarUrl || resolvePlayerAvatar({ username: uname }),
                playerId: getPlayerId({ username: uname })
            };
        };

        return mergeDMContacts({
            friends,
            recentDMs: recentDMContacts,
            unreadBySender: notificationCounts.unreadBySender,
            selectedChatId,
            currentUsername: currentUser?.username,
            resolveContact
        });
    }, [friends, recentDMContacts, notificationCounts.unreadBySender, selectedChatId, resolvedProfiles, profileVersion, currentUser?.username]);

    // Filter contacts based on search and online status
    const filteredFriends = useMemo(() => {
        return allContacts.filter(contact => {
            const matchesSearch = !searchQuery.trim() || 
                contact.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
                contact.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                contact.playerId.toLowerCase().includes(searchQuery.toLowerCase());

            if (!matchesSearch) return false;

            if (onlyOnlineFilter) {
                const presence = getFriendPresence(contact.username);
                return Boolean(presence.isOnline);
            }
            return true;
        }).sort((a, b) => {
            // Prioritize unread senders to the very top
            const aUnread = (notificationCounts.unreadBySender[a.username.toLowerCase()] || 0) > 0 ? 1 : 0;
            const bUnread = (notificationCounts.unreadBySender[b.username.toLowerCase()] || 0) > 0 ? 1 : 0;
            if (bUnread !== aUnread) return bUnread - aUnread;

            // Keep most recently messaged DM conversations at the top so active chats stay visible
            const aTime = a.lastTimestamp || 0;
            const bTime = b.lastTimestamp || 0;
            if (bTime !== aTime) return bTime - aTime;

            // Sort online contacts next
            const aOnline = getFriendPresence(a.username).isOnline ? 1 : 0;
            const bOnline = getFriendPresence(b.username).isOnline ? 1 : 0;
            return bOnline - aOnline;
        });
    }, [allContacts, searchQuery, onlyOnlineFilter, getUserPresence, notificationCounts.unreadBySender]);

    // Online count
    const onlineFriendsCount = useMemo(() => {
        return friends.filter(f => getFriendPresence(f.username).isOnline).length;
    }, [friends, getUserPresence]);

    // Handle Send Direct Message
    const handleSendMessage = async (textToSend?: string, stickerToSendId?: string) => {
        const text = textToSend !== undefined ? textToSend : messageInput;
        const stickerId = stickerToSendId;

        if (!currentUser) return;
        if (!text.trim() && !stickerId) return;

        if (!selectedChatId || selectedChatId === 'global_broadcast' || selectedChatId === 'admin_feedbacks' || selectedChatId === 'bugshot' || selectedChatId === 'system') {
            return;
        }

        setIsSending(true);
        audioManager.playSound('click');
        try {
            recordRecentDMContact(
                currentUser.username,
                selectedChatId,
                text.trim() || (stickerId ? '[Sticker]' : ''),
                Date.now(),
                currentUser.username,
                {
                    displayName: activeChatFriend?.displayName || selectedChatId,
                    avatarUrl: activeChatFriend?.avatarUrl
                }
            );
            await sendDirectMessage(currentUser, selectedChatId, text, stickerId);
            setMessageInput('');
            setShowStickers(false);
        } catch (e: any) {
            console.error("Failed sending message:", e);
        } finally {
            setIsSending(false);
        }
    };

    // Handle Delete Broadcast (Developer / Admin only)
    const handleDeleteBroadcast = async (broadcastId: string) => {
        if (!currentUser || !isDeveloper || !broadcastId) return;
        const confirmed = await showConfirm({
            title: "DELETE BROADCAST",
            message: "Delete this broadcast announcement from all terminals?",
            confirmText: "DELETE",
            cancelText: "CANCEL",
            isDanger: true,
            icon: "trash"
        });
        if (!confirmed) return;
        audioManager.playSound('click');
        try {
            await deleteBroadcastMessage(broadcastId, currentUser);
        } catch (e) {
            console.error("Failed to delete broadcast:", e);
        }
    };

    // Handle Send Broadcast (Developer/Admin Only)
    const handleSendBroadcast = async () => {
        if (!currentUser || !isDeveloper) return;
        if (!broadcastText.trim()) return;

        setIsSendingBroadcast(true);
        audioManager.playSound('confirm');
        try {
            await sendBroadcastMessage(currentUser, broadcastText, broadcastTitle, broadcastStickerId);
            // Also trigger instant on-screen transmission alert to all online operators
            try {
                await presenceClient.sendAdminBroadcast(broadcastTitle || 'SYSTEM BROADCAST', broadcastText);
            } catch (e) {}
            setBroadcastText('');
            setBroadcastTitle('');
            setBroadcastStickerId(undefined);
            setShowBroadcastCreator(false);
        } catch (e: any) {
            console.error("Broadcast failed:", e);
        } finally {
            setIsSendingBroadcast(false);
        }
    };

    // Handle Send Friend Request
    const handleDispatchFriendRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) return;
        if (!addFriendInput.trim()) return;

        setIsSendingRequest(true);
        setRequestFeedback(null);
        audioManager.playSound('click');

        try {
            const res = await sendFriendRequest(currentUser, addFriendInput);
            if (res.success) {
                setRequestFeedback({ type: 'success', msg: `Friend transmission dispatched to "${addFriendInput.trim()}"!` });
                setAddFriendInput('');
                setTimeout(() => setRequestFeedback(null), 4000);
            } else {
                setRequestFeedback({ type: 'error', msg: res.error || 'Failed to dispatch request.' });
            }
        } catch (err: any) {
            setRequestFeedback({ type: 'error', msg: err.message || 'Error sending request.' });
        } finally {
            setIsSendingRequest(false);
        }
    };

    // Handle Accept Request
    const handleAccept = async (req: FriendRequest) => {
        audioManager.playSound('confirm');
        try {
            await acceptFriendRequest(req);
            // Auto-switch to their chat
            setSelectedChatId(req.from);
            setActiveTab('CHATS');
        } catch (e) {
            console.error("Accept error:", e);
        }
    };

    // Handle Decline Request
    const handleDecline = async (reqId: string) => {
        audioManager.playSound('click');
        try {
            await declineFriendRequest(reqId);
        } catch (e) {
            console.error("Decline error:", e);
        }
    };

    // Handle Remove Friend
    const handleRemoveFriend = async (friendUsername: string) => {
        if (!currentUser) return;
        if (!friendUsername || friendUsername.toLowerCase() === 'bugshot' || friendUsername.toLowerCase() === 'system') return;
        const confirmed = await showConfirm({
            title: "REMOVE FRIEND",
            message: `Are you sure you want to remove @${friendUsername} from your friends?`,
            confirmText: "REMOVE",
            cancelText: "CANCEL",
            isDanger: true,
            icon: "warning"
        });
        if (!confirmed) return;
        audioManager.playSound('click');
        try {
            await removeFriend(currentUser.username, friendUsername);
            if (selectedChatId === friendUsername.toLowerCase()) {
                setSelectedChatId(null);
            }
        } catch (e) {
            console.error("Remove friend error:", e);
        }
    };

    // Handle Feedback Submit
    const handleSendFeedback = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!currentUser) {
            audioManager.playSound('click');
            if (onOpenLogin) onOpenLogin();
            return;
        }
        if (!feedbackInputText.trim() || isSendingFeedback) return;

        audioManager.playSound('confirm');
        setIsSendingFeedback(true);
        setFeedbackSubmitError('');
        setFeedbackSubmitSuccess(false);

        try {
            const res = await sendFeedback(currentUser, feedbackInputText.trim(), feedbackCategory);
            if (res.success) {
                setFeedbackInputText('');
                setFeedbackSubmitSuccess(true);
                audioManager.playSound('click');
                setTimeout(() => setFeedbackSubmitSuccess(false), 5000);
            } else {
                setFeedbackSubmitError(res.error || 'Failed to submit feedback.');
            }
        } catch (err: any) {
            setFeedbackSubmitError(err.message || 'Error transmitting feedback.');
        } finally {
            setIsSendingFeedback(false);
        }
    };

    // Handle Delete Feedback (Admin only)
    const handleDeleteFeedback = async (fbId: string) => {
        if (!currentUser || !isDeveloper) return;
        const confirmDelete = await showConfirm({
            title: "DELETE FEEDBACK",
            message: "Delete this player feedback transmission?",
            confirmText: "DELETE",
            cancelText: "CANCEL",
            isDanger: true,
            icon: "trash"
        });
        if (!confirmDelete) return;

        audioManager.playSound('click');
        try {
            await deleteFeedback(fbId, currentUser);
        } catch (e) {
            console.error("Failed to delete feedback:", e);
        }
    };

    if (!isOpen || typeof document === 'undefined') return null;

    return createPortal(
        <div 
            className="fixed inset-0 z-[220] flex items-center justify-center p-1 sm:p-4 bg-black/88 backdrop-blur-md animate-in fade-in duration-200 select-none"
            role="dialog"
            aria-modal="true"
            aria-label="Messages Console"
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
            {/* Main Window */}
            <div className="relative w-full max-w-[98vw] md:max-w-5xl h-[95dvh] sm:h-[92vh] max-h-[840px] bg-stone-950 border-2 border-stone-855 rounded-2xl shadow-[0_30px_100px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden font-mono text-stone-300">
                
                {/* 1. TOP BAR: Title, Active Tab Switcher, Requests Badge, Feedback Tab & Close */}
                <div className="px-3 sm:px-4 py-2 sm:py-3 bg-gradient-to-r from-stone-900 via-stone-950 to-stone-900 border-b border-stone-855 flex flex-wrap items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-cyan-955 border border-cyan-700/60 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.25)] shrink-0">
                            <Mail size={16} className="sm:w-[18px] sm:h-[18px]" />
                        </div>
                        <div>
                            <h2 className="text-xs sm:text-base font-black text-white tracking-wide truncate">
                                Messages
                            </h2>
                        </div>
                    </div>

                    {/* Navigation Tabs (Chats, Requests, Feedback) */}
                    {currentUser && (
                        <div className="flex items-center bg-stone-900/90 border border-stone-800 p-0.5 sm:p-1 rounded-xl gap-0.5 sm:gap-1 order-3 sm:order-2 w-full sm:w-auto justify-center sm:justify-start">
                            <button
                                onClick={() => {
                                    audioManager.playSound('click');
                                    setActiveTab('CHATS');
                                }}
                                className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 sm:py-2 min-h-[44px] rounded-lg text-[8.5px] sm:text-[10px] font-black tracking-wider uppercase transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer ${
                                    activeTab === 'CHATS'
                                        ? 'bg-cyan-955 text-cyan-300 border border-cyan-700/80 shadow-[0_0_12px_rgba(6,182,212,0.2)]'
                                        : 'text-stone-400 hover:text-white'
                                }`}
                            >
                                <Users size={12} className="sm:w-3 sm:h-3" />
                                <span>MESSAGES</span>
                                {notificationCounts.unreadDMs > 0 ? (
                                    <span className="px-1 py-0.2 bg-cyan-500 text-stone-950 text-[7px] sm:text-[8px] font-black rounded-full animate-pulse ml-0.5">
                                        {notificationCounts.unreadDMs}
                                    </span>
                                ) : onlineFriendsCount > 0 ? (
                                    <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 animate-pulse ml-0.5" title={`${onlineFriendsCount} friends online`} />
                                ) : null}
                            </button>

                            <button
                                onClick={() => {
                                    audioManager.playSound('click');
                                    setActiveTab('REQUESTS');
                                }}
                                className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 sm:py-2 min-h-[44px] rounded-lg text-[8.5px] sm:text-[10px] font-black tracking-wider uppercase transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer ${
                                    activeTab === 'REQUESTS'
                                        ? 'bg-red-955 text-red-300 border border-red-700/80 shadow-[0_0_12px_rgba(220,38,38,0.2)]'
                                        : 'text-stone-400 hover:text-white'
                                }`}
                            >
                                <UserPlus size={12} className="sm:w-3 sm:h-3" />
                                <span>REQUESTS</span>
                                {friendRequests.length > 0 && (
                                    <span className="px-1 py-0.2 bg-red-600 text-white text-[7px] sm:text-[8px] font-black rounded-full animate-bounce">
                                        {friendRequests.length}
                                    </span>
                                )}
                            </button>

                            <button
                                onClick={() => {
                                    audioManager.playSound('click');
                                    setActiveTab('FEEDBACK');
                                }}
                                className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 sm:py-2 min-h-[44px] rounded-lg text-[8.5px] sm:text-[10px] font-black tracking-wider uppercase transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer ${
                                    activeTab === 'FEEDBACK'
                                        ? 'bg-amber-955 text-amber-300 border border-amber-700/80 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                                        : 'text-stone-400 hover:text-white'
                                }`}
                            >
                                <MessageSquare size={12} className="sm:w-3 sm:h-3" />
                                <span>FEEDBACK</span>
                            </button>
                        </div>
                    )}

                    {/* Right Close Button */}
                    <div className="flex items-center gap-2 order-2 sm:order-3">
                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                onClose();
                            }}
                            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-400 hover:text-white bg-stone-900 hover:bg-stone-850 border border-stone-800 rounded-xl transition-all cursor-pointer"
                            title="Close Terminal"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* 2. AUTHENTICATION GUARD: Prompt if guest user */}
                {!currentUser ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
                        <div className="w-16 h-16 rounded-3xl bg-red-955/40 border-2 border-red-600/70 flex items-center justify-center text-red-400 shadow-[0_0_40px_rgba(220,38,38,0.3)]">
                            <Lock size={32} />
                        </div>
                        <div className="max-w-md space-y-2">
                            <h3 className="text-base sm:text-lg font-black text-white tracking-widest uppercase">
                                AGENT AUTHENTICATION REQUIRED
                            </h3>
                            <p className="text-[10px] sm:text-xs text-stone-400 leading-relaxed">
                                Encrypted direct messaging, custom stickers, and mutual friend transmissions require an authenticated Agent Codename.
                            </p>
                        </div>
                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                onClose();
                                if (onOpenLogin) onOpenLogin();
                            }}
                            className="px-6 py-3 bg-gradient-to-r from-red-650 to-red-750 hover:from-red-600 hover:to-red-700 text-white font-black text-xs tracking-[0.2em] rounded-xl uppercase shadow-[0_0_25px_rgba(220,38,38,0.4)] transition-all cursor-pointer hover:scale-105 active:scale-95 flex items-center gap-2"
                        >
                            <UserCheck size={14} />
                            <span>SIGN IN / REGISTER AGENT</span>
                        </button>
                    </div>
                ) : activeTab === 'REQUESTS' ? (
                    /* 3. FRIEND REQUESTS AND ADD FRIEND TAB */
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                        {/* Section A: Send Friend Request */}
                        <div className="bg-stone-900/60 border border-stone-800 p-4 sm:p-5 rounded-2xl shadow-lg space-y-3">
                            <div className="flex items-center gap-2">
                                <UserPlus className="text-cyan-400" size={16} />
                                <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                                    DISPATCH FRIEND TRANSMISSION
                                </h3>
                            </div>
                            <p className="text-[9.5px] sm:text-[10px] text-stone-400">
                                Friend requests require full Player Tag only (e.g. <span className="text-cyan-400">@operator#1000</span> or <span className="text-cyan-400">operator#1000</span>). Plain usernames are not accepted for privacy.
                            </p>

                            <form onSubmit={handleDispatchFriendRequest} className="flex gap-2">
                                <div className="relative flex-1">
                                    <input
                                        type="text"
                                        value={addFriendInput}
                                        onChange={(e) => setAddFriendInput(e.target.value)}
                                        placeholder="ENTER OPERATIVE TAG (@CODENAME#1234)"
                                        maxLength={25}
                                        className="w-full bg-stone-950 border-2 border-stone-800 focus:border-cyan-500/70 px-4 py-2.5 text-xs font-mono font-bold text-stone-100 outline-none rounded-xl tracking-wider uppercase placeholder-stone-600 transition-all"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={isSendingRequest || !addFriendInput.trim()}
                                    className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-stone-950 font-black text-xs tracking-wider uppercase rounded-xl transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1.5 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                                >
                                    {isSendingRequest ? (
                                        <RefreshCw size={13} className="animate-spin" />
                                    ) : (
                                        <Send size={13} />
                                    )}
                                    <span>SEND REQUEST</span>
                                </button>
                            </form>

                            {requestFeedback && (
                                <div className={`p-2.5 rounded-xl text-[9px] sm:text-[10px] font-bold tracking-wider uppercase flex items-center gap-2 ${
                                    requestFeedback.type === 'success' 
                                        ? 'bg-emerald-955/50 border border-emerald-600/70 text-emerald-300' 
                                        : 'bg-red-955/50 border border-red-600/70 text-red-300'
                                }`}>
                                    {requestFeedback.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
                                    <span>{requestFeedback.msg}</span>
                                </div>
                            )}
                        </div>

                        {/* Section B: Pending Friend Requests */}
                        <div className="bg-stone-900/60 border border-stone-800 p-4 sm:p-5 rounded-2xl shadow-lg space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Inbox className="text-red-400" size={16} />
                                    <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                                        INCOMING FRIEND REQUESTS ({friendRequests.length})
                                    </h3>
                                </div>
                            </div>

                            {friendRequests.length === 0 ? (
                                <div className="text-center py-8 text-stone-500 text-[10px] font-bold uppercase tracking-wider border border-dashed border-stone-850 rounded-xl">
                                    No incoming transmissions pending
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {friendRequests.map((req) => (
                                        <div
                                            key={req.id}
                                            className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-stone-950 border border-stone-800 rounded-xl gap-3"
                                        >
                                            <div className="flex items-center gap-3">
                                                <AvatarImage
                                                    src={getResolvedAvatar(req.from, { username: req.from, avatarUrl: req.fromAvatarUrl })}
                                                    alt={req.from}
                                                    fallbackSeed={req.from}
                                                    sizeClass="w-10 h-10 border border-stone-750 shrink-0"
                                                />
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-black text-white tracking-wide">
                                                            {req.fromDisplayName}
                                                        </span>
                                                        <span className="text-[8px] bg-stone-900 border border-stone-800 text-stone-400 px-1.5 py-0.2 rounded font-mono">
                                                            {req.fromPlayerId}
                                                        </span>
                                                    </div>
                                                    <span className="text-[8px] text-stone-500 font-mono">
                                                        Received: {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 self-end sm:self-center">
                                                <button
                                                    onClick={() => handleAccept(req)}
                                                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] tracking-wider uppercase rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                                                >
                                                    <Check size={12} />
                                                    <span>ACCEPT</span>
                                                </button>
                                                <button
                                                    onClick={() => handleDecline(req.id)}
                                                    className="px-3 py-1.5 bg-stone-900 hover:bg-red-955 hover:border-red-600 border border-stone-800 text-stone-400 hover:text-red-300 font-bold text-[10px] tracking-wider uppercase rounded-xl transition-all cursor-pointer"
                                                >
                                                    <X size={12} />
                                                    <span>DECLINE</span>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ) : activeTab === 'FEEDBACK' ? (
                    /* 3b. FEEDBACK TRANSMISSION TAB */
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar">
                        {/* Section A: Send Feedback Form */}
                        <div className="bg-stone-900/60 border border-stone-800 p-4 sm:p-5 rounded-2xl shadow-lg space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-amber-955 border border-amber-600/70 flex items-center justify-center text-amber-400">
                                        <MessageSquare size={16} />
                                    </div>
                                    <div>
                                        <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                                            TRANSMIT FEEDBACK // BUG REPORT
                                        </h3>
                                        <p className="text-[9px] sm:text-[10px] text-stone-400">
                                            Direct channel to developers & mainframe admins. Report issues or suggest new ideas.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Category Selector */}
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-mono text-stone-400 font-bold uppercase tracking-wider">
                                    Transmission Category:
                                </label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {(['General Feedback', 'Bug Report', 'Feature Request', 'Game Balance'] as const).map((cat) => (
                                        <button
                                            key={cat}
                                            type="button"
                                            onClick={() => {
                                                audioManager.playSound('click');
                                                setFeedbackCategory(cat);
                                            }}
                                            className={`px-3 py-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all border cursor-pointer ${
                                                feedbackCategory === cat
                                                    ? 'bg-amber-955/60 border-amber-500 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                                                    : 'bg-stone-950/80 border-stone-800 text-stone-400 hover:text-stone-200 hover:bg-stone-900'
                                            }`}
                                        >
                                            {cat}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Message Textarea */}
                            <form onSubmit={handleSendFeedback} className="space-y-3">
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between text-[9px] font-mono text-stone-400">
                                        <label className="font-bold uppercase tracking-wider">Transmission Message:</label>
                                        <span>{feedbackInputText.length}/1000</span>
                                    </div>
                                    <textarea
                                        value={feedbackInputText}
                                        onChange={(e) => setFeedbackInputText(e.target.value)}
                                        placeholder="Type your feedback, bug report, or ideas here..."
                                        rows={4}
                                        maxLength={1000}
                                        className="w-full bg-stone-950 border-2 border-stone-800 focus:border-amber-500/80 px-4 py-3 text-xs font-mono text-stone-100 outline-none rounded-xl tracking-wider placeholder-stone-600 transition-all resize-none"
                                    />
                                </div>

                                {feedbackSubmitSuccess && (
                                    <div className="p-3 bg-emerald-955/50 border border-emerald-600 text-emerald-300 text-xs rounded-xl flex items-center gap-2 animate-in fade-in">
                                        <Check size={14} className="text-emerald-400 shrink-0" />
                                        <span>Feedback dispatched successfully! Thank you for helping improve BugShot Roulette.</span>
                                    </div>
                                )}

                                {feedbackSubmitError && (
                                    <div className="p-3 bg-red-955/50 border border-red-600 text-red-300 text-xs rounded-xl flex items-center gap-2 animate-in fade-in">
                                        <AlertCircle size={14} className="text-red-400 shrink-0" />
                                        <span>{feedbackSubmitError}</span>
                                    </div>
                                )}

                                <div className="flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={isSendingFeedback || !feedbackInputText.trim()}
                                        className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black text-xs tracking-wider uppercase rounded-xl transition-all disabled:opacity-40 cursor-pointer flex items-center gap-2 shadow-[0_0_15px_rgba(245,158,11,0.3)] active:scale-95"
                                    >
                                        {isSendingFeedback ? (
                                            <RefreshCw size={13} className="animate-spin" />
                                        ) : (
                                            <Send size={13} />
                                        )}
                                        <span>SUBMIT FEEDBACK</span>
                                    </button>
                                </div>
                            </form>
                        </div>

                        {/* Section B: User's Past Submissions */}
                        <div className="bg-stone-900/60 border border-stone-800 p-4 sm:p-5 rounded-2xl shadow-lg space-y-3">
                            <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                                <Clock size={14} className="text-stone-400" />
                                <span>YOUR DISPATCHED TRANSMISSIONS</span>
                            </h3>

                            {feedbacks.filter(f => f.sender?.toLowerCase() === currentUser.username.toLowerCase()).length === 0 ? (
                                <p className="text-[10px] text-stone-500 py-2">
                                    You haven't submitted any feedback yet. Your submissions will appear here once sent.
                                </p>
                            ) : (
                                <div className="space-y-2.5">
                                    {feedbacks
                                        .filter(f => f.sender?.toLowerCase() === currentUser.username.toLowerCase())
                                        .map((item) => (
                                            <div
                                                key={item.id}
                                                className="p-3 bg-stone-950 border border-stone-850 rounded-xl space-y-1.5"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="px-2 py-0.5 text-[7.5px] font-bold rounded uppercase bg-amber-955 text-amber-300 border border-amber-800">
                                                        {item.category}
                                                    </span>
                                                    <span className="text-[8px] text-stone-500 font-mono">
                                                        {new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <p className="text-[11px] text-stone-300 font-mono whitespace-pre-wrap">
                                                    {item.text}
                                                </p>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    /* 4. MAIN CHATS & COMMS VIEW (INSTAGRAM / WHATSAPP STYLE SPLIT) */
                    <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                        
                        {/* LEFT COLUMN: Sidebar with Channels & Mutual Friends */}
                        <div className={`w-full md:w-80 border-r border-stone-855 bg-stone-950/80 flex flex-col shrink-0 overflow-hidden ${selectedChatId ? 'hidden md:flex' : 'flex'}`}>
                            {/* Search bar & Online Filter toggle */}
                            <div className="p-3 border-b border-stone-855/80 space-y-2">
                                <div className="relative flex items-center">
                                    <Search size={13} className="absolute left-3 text-stone-500" />
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="SEARCH OPERATIVES..."
                                        className="w-full bg-stone-900/90 border border-stone-800 focus:border-cyan-600/70 pl-8 pr-3 py-1.5 text-[10.5px] font-mono text-stone-200 outline-none rounded-xl tracking-wider placeholder-stone-600 uppercase"
                                    />
                                    {searchQuery && (
                                        <button onClick={() => setSearchQuery('')} className="absolute right-2.5 text-stone-500 hover:text-white">
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center justify-between text-[8.5px] font-mono font-bold tracking-wider">
                                    <button
                                        onClick={() => {
                                            audioManager.playSound('click');
                                            setOnlyOnlineFilter(!onlyOnlineFilter);
                                        }}
                                        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all cursor-pointer ${
                                            onlyOnlineFilter
                                                ? 'bg-emerald-955/50 border-emerald-600 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                                                : 'bg-stone-900/60 border-stone-800 text-stone-400 hover:text-stone-200'
                                        }`}
                                    >
                                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                        <span>ONLINE ONLY ({onlineFriendsCount})</span>
                                    </button>

                                    <span className="text-stone-500 uppercase">
                                        {friends.length} FRIENDS
                                    </span>
                                </div>
                            </div>

                            {/* Scrollable Conversation List */}
                            <div className="flex-1 overflow-y-auto divide-y divide-stone-900/60 custom-scrollbar select-none">
                                
                                {/* #0 FOR DEVELOPERS ONLY: BROADCAST CHANNEL */}
                                {isDeveloper && (
                                    <div
                                        onClick={() => {
                                            audioManager.playSound('click');
                                            setSelectedChatId('global_broadcast');
                                        }}
                                        className={`p-3 transition-all cursor-pointer flex items-center justify-between relative group ${
                                            selectedChatId === 'global_broadcast'
                                                ? 'bg-red-955/25 border-l-4 border-l-red-500 shadow-inner'
                                                : 'hover:bg-stone-900/50'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="relative">
                                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-red-650 via-stone-900 to-black border border-red-600/70 flex items-center justify-center text-red-300 shadow-[0_0_15px_rgba(220,38,38,0.3)]">
                                                    <Radio size={18} className="animate-pulse" />
                                                </div>
                                                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-600 border-2 border-stone-950 flex items-center justify-center">
                                                    <Pin size={8} className="text-white fill-white" />
                                                </span>
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-xs font-black text-red-300 tracking-wider truncate">
                                                        GLOBAL BROADCAST
                                                    </span>
                                                    <span className="px-1 py-0.2 bg-red-600 text-white text-[6.5px] font-black tracking-widest rounded uppercase">
                                                        ADMIN
                                                    </span>
                                                </div>
                                                <span className="text-[8.5px] text-stone-400 font-mono truncate">
                                                    Announcements & global alerts
                                                </span>
                                            </div>
                                        </div>
                                        <span className="text-[7.5px] font-mono text-red-400/80 font-bold shrink-0">
                                            ALL PLAYERS
                                        </span>
                                    </div>
                                )}

                                {/* #0b FOR DEVELOPERS / ADMINS: INCOMING PLAYER FEEDBACK (Displayed just after broadcast) */}
                                {isDeveloper && (
                                    <div
                                        onClick={() => {
                                            audioManager.playSound('click');
                                            setSelectedChatId('admin_feedbacks');
                                        }}
                                        className={`p-3 transition-all cursor-pointer flex items-center justify-between relative group ${
                                            selectedChatId === 'admin_feedbacks'
                                                ? 'bg-amber-955/25 border-l-4 border-l-amber-500 shadow-inner'
                                                : 'hover:bg-stone-900/50'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="relative">
                                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-600 via-stone-900 to-black border border-amber-600/70 flex items-center justify-center text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                                                    <MessageSquare size={18} className="animate-pulse" />
                                                </div>
                                                {feedbacks.length > 0 && (
                                                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 border-2 border-stone-950 flex items-center justify-center text-[8px] font-black text-stone-950">
                                                        {feedbacks.length}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-xs font-black text-amber-300 tracking-wider truncate">
                                                        PLAYER FEEDBACK
                                                    </span>
                                                    <span className="px-1 py-0.2 bg-amber-500 text-stone-950 text-[6.5px] font-black tracking-widest rounded uppercase">
                                                        ADMIN
                                                    </span>
                                                </div>
                                                <span className="text-[8.5px] text-stone-400 font-mono truncate">
                                                    {feedbacks.length > 0 ? `${feedbacks.length} player submissions` : 'Inbox clear'}
                                                </span>
                                            </div>
                                        </div>
                                        <span className="text-[7.5px] font-mono text-amber-400/80 font-bold shrink-0">
                                            FEEDBACK INBOX
                                        </span>
                                    </div>
                                )}

                                {/* #0c OFFICIAL BUGSHOT SYSTEM DISPATCH CHANNEL (FOR ALL PLAYERS) */}
                                <div
                                    onClick={() => {
                                        audioManager.playSound('click');
                                        setSelectedChatId('bugshot');
                                    }}
                                    className={`p-3 transition-all cursor-pointer flex items-center justify-between relative group ${
                                        selectedChatId === 'bugshot'
                                            ? 'bg-cyan-955/25 border-l-4 border-l-cyan-400 shadow-inner'
                                            : 'hover:bg-stone-900/50'
                                    }`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="relative shrink-0">
                                            <div className="w-10 h-10 rounded-2xl bg-stone-900 border border-cyan-600/70 overflow-hidden flex items-center justify-center p-1 shadow-[0_0_15px_rgba(6,182,212,0.25)]">
                                                <img
                                                    src="/image/favicon/android-chrome-192x192.png"
                                                    alt="BUGSHOT"
                                                    className="w-full h-full object-contain"
                                                />
                                            </div>
                                            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-cyan-500 border-2 border-stone-950 flex items-center justify-center">
                                                <ShieldAlert size={8} className="text-stone-950" />
                                            </span>
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-black text-cyan-300 tracking-wider truncate">
                                                    BUGSHOT // SYSTEM
                                                </span>
                                                <span className="px-1 py-0.2 bg-cyan-955 text-cyan-400 text-[6.5px] font-bold border border-cyan-800 rounded uppercase">
                                                    OFFICIAL
                                                </span>
                                            </div>
                                            <span className="text-[8.5px] text-stone-400 font-mono truncate">
                                                Direct system dispatches & alerts
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end shrink-0 pl-1">
                                        {notificationCounts.unreadBySender['bugshot'] > 0 ? (
                                            <span className="px-1.5 py-0.2 bg-cyan-500 text-stone-950 text-[7.5px] font-black rounded-full shadow-[0_0_8px_rgba(6,182,212,0.6)] animate-pulse">
                                                {notificationCounts.unreadBySender['bugshot']}
                                            </span>
                                        ) : (
                                            <span className="text-[7.5px] font-mono text-cyan-500/80 font-bold">
                                                SECURE
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* SECTION HEADER: DIRECT MESSAGES */}
                                <div className="px-3 py-1.5 bg-stone-950 text-[8px] font-mono text-stone-500 uppercase tracking-widest font-black border-y border-stone-900">
                                    DIRECT MESSAGES ({filteredFriends.length})
                                </div>

                                {filteredFriends.length === 0 ? (
                                    <div className="p-6 text-center text-stone-500 space-y-2">
                                        <p className="text-[9.5px] font-bold uppercase tracking-wider">
                                            {onlyOnlineFilter ? 'No operatives currently online' : 'No direct messages yet'}
                                        </p>
                                        <p className="text-[8.5px] text-stone-600">
                                            Message any player or add friends using the REQUESTS tab above — conversations stay saved here.
                                        </p>
                                    </div>
                                ) : (
                                    filteredFriends.map((friend) => {
                                        const presence = getFriendPresence(friend.username);
                                        const isSelected = selectedChatId?.toLowerCase() === friend.username.toLowerCase();
                                        const lastPreview = friend.lastMessage
                                            ? `${friend.lastSender === currentUser.username.toLowerCase() ? 'You: ' : ''}${friend.lastMessage}`
                                            : friend.playerId;
                                        
                                        const statusBg = presence.status === 'in_match' 
                                            ? 'bg-red-500 animate-pulse' 
                                            : presence.status === 'in_lobby' 
                                            ? 'bg-amber-400' 
                                            : presence.isOnline 
                                            ? 'bg-emerald-500' 
                                            : 'bg-stone-600';

                                        const statusLabel = presence.status === 'in_match'
                                            ? 'IN COMBAT'
                                            : presence.status === 'in_lobby'
                                            ? 'IN LOBBY'
                                            : presence.isOnline
                                            ? 'ONLINE'
                                            : 'OFFLINE';

                                        return (
                                            <div
                                                key={friend.username}
                                                onClick={() => {
                                                    audioManager.playSound('click');
                                                    setSelectedChatId(friend.username);
                                                }}
                                                className={`p-2.5 transition-all cursor-pointer flex items-center justify-between group ${
                                                    isSelected
                                                        ? 'bg-cyan-955/25 border-l-4 border-l-cyan-400 shadow-inner'
                                                        : 'hover:bg-stone-900/40'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <div className="relative shrink-0">
                                                        <AvatarImage
                                                            src={getResolvedAvatar(friend.username, friend)}
                                                            alt={friend.username}
                                                            fallbackSeed={friend.avatarSeed || friend.username}
                                                            sizeClass="w-9 h-9 border border-stone-750"
                                                        />
                                                        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-stone-950 ${statusBg}`} />
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-xs font-bold text-stone-200 tracking-wide truncate group-hover:text-white">
                                                                {friend.displayName}
                                                            </span>
                                                            {friend.isDeveloper && (
                                                                <span className="px-1 py-0.2 bg-red-955 border border-red-800 text-red-400 text-[6px] font-bold rounded">
                                                                    DEV
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="text-[8.5px] text-stone-400 font-mono tracking-normal truncate max-w-[165px]">
                                                            {lastPreview}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col items-end shrink-0 pl-1 gap-1">
                                                    <span className={`text-[7.5px] font-mono font-bold tracking-wider uppercase ${
                                                        presence.status === 'in_match' ? 'text-red-400' :
                                                        presence.status === 'in_lobby' ? 'text-amber-400' :
                                                        presence.isOnline ? 'text-emerald-400' : 'text-stone-600'
                                                    }`}>
                                                        {statusLabel}
                                                    </span>
                                                    {notificationCounts.unreadBySender[friend.username.toLowerCase()] > 0 && (
                                                        <span className="px-1.5 py-0.2 bg-cyan-500 text-stone-950 text-[7.5px] font-black rounded-full shadow-[0_0_8px_rgba(6,182,212,0.6)] animate-pulse">
                                                            {notificationCounts.unreadBySender[friend.username.toLowerCase()]}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Chat Area (Instagram / WhatsApp styled messages) */}
                        <div className={`flex-1 ${!selectedChatId ? 'hidden md:flex' : 'flex'} flex-col bg-stone-950 overflow-hidden relative`}>
                            {!selectedChatId ? (
                                <div className="flex-1 hidden md:flex flex-col items-center justify-center p-8 text-center space-y-4 bg-gradient-to-b from-stone-950 via-stone-900/40 to-stone-950 select-none">
                                    <div className="relative">
                                        <div className="w-16 h-16 rounded-2xl bg-stone-900/90 border border-stone-800 flex items-center justify-center text-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.15)]">
                                            <Radio size={28} className="text-cyan-400 animate-pulse" />
                                        </div>
                                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-stone-950 animate-ping" />
                                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-stone-950" />
                                    </div>
                                    <div className="space-y-1.5 max-w-sm">
                                        <h3 className="text-sm font-black text-white uppercase tracking-widest">
                                            TRANSMISSION STANDBY
                                        </h3>
                                        <p className="text-[11px] text-stone-400 font-mono leading-relaxed">
                                            {isDeveloper
                                                ? 'Select a contact, review player feedback transmissions, or broadcast an announcement.'
                                                : 'Select a contact from your operative list to start messaging, or submit feedback to the developers above.'}
                                        </p>
                                    </div>
                                    {isDeveloper && (
                                        <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    audioManager.playSound('click');
                                                    setSelectedChatId('global_broadcast');
                                                }}
                                                className="px-4 py-2 bg-gradient-to-r from-red-955 to-stone-900 hover:from-red-900 hover:to-stone-850 border border-red-700/80 text-red-200 text-xs font-black rounded-xl uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 shadow-[0_0_15px_rgba(220,38,38,0.2)]"
                                            >
                                                <Radio size={14} className="text-red-400" />
                                                <span>OPEN BROADCAST</span>
                                            </button>
                                            <button
                                                onClick={() => {
                                                    audioManager.playSound('click');
                                                    setSelectedChatId('admin_feedbacks');
                                                }}
                                                className="px-4 py-2 bg-gradient-to-r from-amber-955 to-stone-900 hover:from-amber-900 hover:to-stone-850 border border-amber-700/80 text-amber-200 text-xs font-black rounded-xl uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                                            >
                                                <MessageSquare size={14} className="text-amber-400" />
                                                <span>OPEN FEEDBACKS ({feedbacks.length})</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {/* CHAT HEADER */}
                                    <div className="px-4 py-3 bg-stone-900/60 border-b border-stone-855 flex items-center justify-between shrink-0">
                                        <div className="flex items-center gap-2.5">
                                            {/* Mobile Back Button */}
                                            <button
                                                onClick={() => {
                                                    audioManager.playSound('click');
                                                    setSelectedChatId(null);
                                                }}
                                                className="md:hidden p-1.5 -ml-1 text-stone-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                                                title="Back to Channel List"
                                            >
                                                <ArrowLeft size={16} />
                                            </button>

                                            {selectedChatId === 'admin_feedbacks' ? (
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-xl bg-amber-955 border border-amber-600 flex items-center justify-center text-amber-400 shrink-0">
                                                        <MessageSquare size={16} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <h3 className="text-xs sm:text-sm font-black text-white tracking-wider uppercase">
                                                                PLAYER FEEDBACK INBOX
                                                            </h3>
                                                            <span className="px-1.5 py-0.2 bg-amber-500 text-stone-950 text-[7px] font-black rounded uppercase">
                                                                ADMIN
                                                            </span>
                                                        </div>
                                                        <span className="text-[8px] sm:text-[8.5px] text-stone-400 font-mono">
                                                            {feedbacks.length} player transmissions received
                                                        </span>
                                                    </div>
                                                </div>
                                            ) : selectedChatId === 'global_broadcast' ? (
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-xl bg-red-955 border border-red-600 flex items-center justify-center text-red-400 shrink-0">
                                                        <Radio size={16} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <h3 className="text-xs sm:text-sm font-black text-white tracking-wider uppercase">
                                                                BUGSHOT // MAINFRAME BROADCAST
                                                            </h3>
                                                            <span className="px-1.5 py-0.2 bg-red-650 text-white text-[7px] font-black rounded uppercase">
                                                                ADMIN
                                                            </span>
                                                        </div>
                                                        <span className="text-[8px] sm:text-[8.5px] text-stone-400 font-mono">
                                                            Announcements & combat alerts
                                                        </span>
                                                    </div>
                                                </div>
                                            ) : selectedChatId === 'bugshot' || selectedChatId === 'system' ? (
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-xl bg-stone-900 border border-cyan-500/60 overflow-hidden flex items-center justify-center p-0.5 shrink-0 shadow-[0_0_12px_rgba(6,182,212,0.3)]">
                                                        <img
                                                            src="/image/favicon/android-chrome-192x192.png"
                                                            alt="BUGSHOT"
                                                            className="w-full h-full object-contain"
                                                        />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <h3 className="text-xs sm:text-sm font-black text-cyan-300 tracking-wider uppercase">
                                                                BUGSHOT // SYSTEM DISPATCH
                                                            </h3>
                                                            <span className="px-1.5 py-0.2 bg-cyan-955 border border-cyan-800 text-cyan-300 text-[7px] font-black rounded uppercase">
                                                                OFFICIAL
                                                            </span>
                                                        </div>
                                                        <span className="text-[8px] sm:text-[8.5px] text-stone-400 font-mono">
                                                            One-way encrypted transmissions from game system
                                                        </span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2.5">
                                                    <div className="relative shrink-0">
                                                        <AvatarImage
                                                            src={getResolvedAvatar(selectedFriend?.username, selectedFriend)}
                                                            alt={selectedFriend?.username || 'contact'}
                                                            fallbackSeed={(selectedFriend as any)?.avatarSeed || selectedFriend?.username}
                                                            sizeClass="w-8 h-8 border border-stone-750"
                                                        />
                                                        <span className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-stone-950 ${
                                                            getFriendPresence(selectedFriend?.username || '').isOnline ? 'bg-emerald-500' : 'bg-stone-600'
                                                        }`} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <h3 className="text-xs sm:text-sm font-black text-white tracking-wider uppercase">
                                                                {selectedFriend?.displayName || selectedFriend?.username}
                                                            </h3>
                                                            <span className="text-[8px] text-stone-400 font-mono font-bold">
                                                                {selectedFriend?.playerId}
                                                            </span>
                                                        </div>
                                                        <span className="text-[8px] text-stone-400 font-mono">
                                                            {getFriendPresence(selectedFriend?.username || '').text}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Header Actions */}
                                        <div className="flex items-center gap-2">
                                            {selectedChatId === 'admin_feedbacks' ? (
                                                <div className="flex items-center gap-1.5 text-[9px] text-amber-400 font-mono font-bold">
                                                    <span>{feedbacks.length} TRANSMISSIONS</span>
                                                </div>
                                            ) : selectedChatId === 'global_broadcast' ? (
                                                isDeveloper && (
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            onClick={async () => {
                                                                audioManager.playSound('click');
                                                                await presenceClient.clearAdminBroadcast();
                                                            }}
                                                            className="px-2 py-1 bg-stone-900 hover:bg-stone-850 border border-stone-750 text-stone-400 hover:text-white text-[8.5px] font-bold rounded-lg uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1"
                                                            title="Clear active on-screen alert banner from all player screens"
                                                        >
                                                            <X size={11} />
                                                            <span className="hidden sm:inline">DISMISS BANNER</span>
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                audioManager.playSound('click');
                                                                setShowBroadcastCreator(!showBroadcastCreator);
                                                            }}
                                                            className="px-2.5 py-1 bg-red-955 hover:bg-red-900 border border-red-700 text-red-200 text-[9px] font-bold rounded-lg uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
                                                        >
                                                            <Radio size={11} />
                                                            <span>DISPATCH</span>
                                                        </button>
                                                    </div>
                                                )
                                            ) : selectedChatId === 'bugshot' || selectedChatId === 'system' ? (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="px-2.5 py-1 bg-cyan-955/60 border border-cyan-800/80 text-cyan-300 text-[8.5px] font-mono font-bold rounded-lg uppercase tracking-wider flex items-center gap-1">
                                                        <Lock size={10} className="text-cyan-400" />
                                                        <span>ONE-WAY CHANNEL</span>
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5">
                                                    {onOpenProfile && (
                                                        <button
                                                            onClick={() => {
                                                                audioManager.playSound('click');
                                                                onOpenProfile({ username: selectedFriend?.username || '' });
                                                            }}
                                                            className="px-2.5 py-1 bg-stone-900 hover:bg-stone-850 border border-stone-750 text-stone-300 hover:text-white text-[9px] font-bold rounded-lg uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1"
                                                            title="View Profile"
                                                        >
                                                            <ExternalLink size={11} />
                                                            <span className="hidden sm:inline">PROFILE</span>
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleRemoveFriend(selectedFriend?.username || '')}
                                                        className="p-1.5 text-stone-500 hover:text-red-400 hover:bg-stone-900 rounded-lg transition-colors cursor-pointer"
                                                        title="Remove Friend"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* DEVELOPER BROADCAST CREATOR DRAWER */}
                                    {selectedChatId === 'global_broadcast' && showBroadcastCreator && isDeveloper && (
                                        <div className="p-3 bg-stone-900 border-b border-red-700/60 animate-in slide-in-from-top-2 duration-150 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-black text-red-400 uppercase tracking-widest flex items-center gap-1.5">
                                                    <ShieldAlert size={12} />
                                                    NEW GLOBAL BROADCAST (STORED FOREVER)
                                                </span>
                                                <button onClick={() => setShowBroadcastCreator(false)} className="text-stone-400 hover:text-white">
                                                    <X size={13} />
                                                </button>
                                            </div>
                                            <div className="space-y-2">
                                                <input
                                                    type="text"
                                                    value={broadcastTitle}
                                                    onChange={(e) => setBroadcastTitle(e.target.value)}
                                                    placeholder="BROADCAST TITLE (OPTIONAL)"
                                                    className="w-full bg-stone-950 border border-stone-800 focus:border-red-500 px-3 py-1.5 text-xs text-stone-200 outline-none rounded-lg uppercase font-mono"
                                                />
                                                <textarea
                                                    value={broadcastText}
                                                    onChange={(e) => setBroadcastText(e.target.value)}
                                                    placeholder="BROADCAST MESSAGE BODY..."
                                                    rows={2}
                                                    className="w-full bg-stone-950 border border-stone-800 focus:border-red-500 p-2 text-xs text-stone-200 outline-none rounded-lg font-mono"
                                                />
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        {broadcastStickerId && (
                                                            <span className="text-[9px] bg-red-955 text-red-300 px-2 py-0.5 rounded border border-red-700">
                                                                Attached: {BUGSHOT_STICKERS.find(s => s.id === broadcastStickerId)?.name}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={handleSendBroadcast}
                                                        disabled={isSendingBroadcast || !broadcastText.trim()}
                                                        className="px-4 py-1.5 bg-red-650 hover:bg-red-600 text-white font-black text-[10px] tracking-widest rounded-lg uppercase transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
                                                    >
                                                        {isSendingBroadcast ? <RefreshCw size={11} className="animate-spin" /> : <Radio size={11} />}
                                                        <span>TRANSMIT ALL PLAYERS</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* CHAT MESSAGES SCROLL AREA */}
                                    <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3.5 custom-scrollbar">
                                        {selectedChatId === 'admin_feedbacks' ? (
                                            /* Admin Feedback Stream */
                                            feedbacks.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center py-20 text-center space-y-2 text-stone-500">
                                                    <div className="w-12 h-12 rounded-2xl bg-stone-900 border border-amber-800/40 flex items-center justify-center text-amber-400">
                                                        <MessageSquare size={20} />
                                                    </div>
                                                    <p className="text-xs font-black text-white uppercase tracking-wider">
                                                        NO FEEDBACK TRANSMISSIONS
                                                    </p>
                                                    <p className="text-[10px] text-stone-500 max-w-xs">
                                                        All player bug reports and suggestions have been cleared or none have been submitted yet.
                                                    </p>
                                                </div>
                                            ) : (
                                                feedbacks.map((fb) => (
                                                    <div
                                                        key={fb.id}
                                                        className="w-full bg-gradient-to-r from-stone-950 via-stone-900/90 to-stone-950 border border-amber-900/40 rounded-2xl p-3 sm:p-4 shadow-[0_0_20px_rgba(245,158,11,0.08)] space-y-2 relative overflow-hidden"
                                                    >
                                                        <div className="absolute top-0 left-0 bottom-0 w-1 bg-gradient-to-b from-amber-500 to-amber-700" />
                                                        <div className="flex items-center justify-between border-b border-stone-855 pb-2">
                                                            <div className="flex items-center gap-2">
                                                                <AvatarImage
                                                                    src={getResolvedAvatar(fb.sender, { username: fb.sender, avatarUrl: fb.senderAvatarUrl })}
                                                                    alt={fb.sender}
                                                                    fallbackSeed={fb.sender}
                                                                    sizeClass="w-7 h-7 border border-stone-750"
                                                                />
                                                                <div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[11px] font-black text-white tracking-wider">
                                                                            {fb.senderDisplayName || fb.sender}
                                                                        </span>
                                                                        <span className={`px-1.5 py-0.2 text-[7px] font-bold rounded uppercase ${
                                                                            fb.category === 'Bug Report' ? 'bg-red-955 text-red-400 border border-red-800' :
                                                                            fb.category === 'Feature Request' ? 'bg-cyan-955 text-cyan-400 border border-cyan-800' :
                                                                            fb.category === 'Game Balance' ? 'bg-purple-955 text-purple-400 border border-purple-800' :
                                                                            'bg-amber-955 text-amber-300 border border-amber-800'
                                                                        }`}>
                                                                            {fb.category}
                                                                        </span>
                                                                    </div>
                                                                    <span className="text-[8px] text-stone-500 font-mono">
                                                                        {fb.senderPlayerId}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[8px] text-stone-500 font-mono">
                                                                    {new Date(fb.createdAt).toLocaleDateString()} {new Date(fb.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                                {isDeveloper && (
                                                                    <button
                                                                        onClick={() => handleDeleteFeedback(fb.id)}
                                                                        className="p-1 text-stone-500 hover:text-red-400 hover:bg-stone-900 rounded transition-colors cursor-pointer"
                                                                        title="Delete Feedback"
                                                                    >
                                                                        <Trash2 size={12} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>

                                                        <p className="text-[11px] sm:text-xs text-stone-200 leading-relaxed font-mono whitespace-pre-wrap">
                                                            {fb.text}
                                                        </p>

                                                        <div className="flex items-center justify-end pt-1">
                                                            <button
                                                                onClick={() => {
                                                                    audioManager.playSound('click');
                                                                    setSelectedChatId(fb.sender.toLowerCase());
                                                                }}
                                                                className="px-2.5 py-1 bg-stone-900 hover:bg-stone-850 border border-stone-750 text-stone-300 hover:text-white text-[8.5px] font-bold rounded-lg uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer"
                                                            >
                                                                <Mail size={10} />
                                                                <span>Direct Message @{fb.sender}</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))
                                            )
                                        ) : selectedChatId === 'global_broadcast' ? (
                                            /* Broadcast Messages Stream */
                                            broadcasts.map((msg) => {
                                                const sticker = getStickerById(msg.stickerId);
                                                return (
                                                    <div
                                                        key={msg.id}
                                                        className="w-full bg-gradient-to-r from-stone-950 via-stone-900/90 to-stone-950 border border-red-900/60 rounded-2xl p-3 sm:p-4 shadow-[0_0_20px_rgba(220,38,38,0.12)] space-y-2 relative overflow-hidden"
                                                    >
                                                        <div className="absolute top-0 left-0 bottom-0 w-1 bg-gradient-to-b from-red-650 to-amber-600" />
                                                        <div className="flex items-center justify-between border-b border-stone-855 pb-2">
                                                            <div className="flex items-center gap-2">
                                                                <AvatarImage
                                                                    src={getResolvedAvatar(msg.sender, { username: msg.sender, avatarUrl: msg.senderAvatarUrl, isDeveloper: true })}
                                                                    alt={msg.sender}
                                                                    fallbackSeed={msg.sender}
                                                                    sizeClass="w-6 h-6 border border-stone-750"
                                                                />
                                                                <span className="text-[11px] font-black text-red-300 tracking-wider uppercase">
                                                                    {msg.senderDisplayName}
                                                                </span>
                                                                <span className="px-1 py-0.2 bg-red-955 text-red-400 text-[6.5px] font-bold rounded">
                                                                    BROADCAST
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[8px] text-stone-500 font-mono">
                                                                    {new Date(msg.createdAt).toLocaleDateString()} {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                                {isDeveloper && (
                                                                    <button
                                                                        onClick={() => handleDeleteBroadcast(msg.id)}
                                                                        className="p-1 text-stone-500 hover:text-red-400 hover:bg-stone-900 rounded transition-colors cursor-pointer"
                                                                        title="Delete this broadcast (Admin)"
                                                                    >
                                                                        <Trash2 size={12} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {msg.title && (
                                                            <h4 className="text-xs font-black text-white tracking-wide uppercase">
                                                                {msg.title}
                                                            </h4>
                                                        )}

                                                        {(() => {
                                                            const { roomId, cleanText } = parseMessageInvite(msg.text);
                                                            return (
                                                                <>
                                                                    {cleanText && (
                                                                        <p className="text-[11px] sm:text-xs text-stone-300 leading-relaxed font-mono whitespace-pre-wrap">
                                                                            {cleanText}
                                                                        </p>
                                                                    )}
                                                                    {roomId && (
                                                                        <MatchInviteCard
                                                                            roomId={roomId}
                                                                            onJoinRoom={onJoinRoom}
                                                                            onCloseModal={onClose}
                                                                        />
                                                                    )}
                                                                </>
                                                            );
                                                        })()}

                                                        {sticker && (
                                                            <div className="mt-2 p-2 rounded-xl bg-stone-950/70 border border-red-900/50 inline-block shadow-md">
                                                                <img
                                                                    src={sticker.url}
                                                                    alt={sticker.name}
                                                                    className="w-24 h-24 sm:w-28 sm:h-28 object-contain rounded-lg drop-shadow-md"
                                                                    loading="lazy"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        ) : (
                                    /* Direct Messages Stream (WhatsApp / Instagram Bubbles) */
                                    directMessages.length === 0 ? (
                                        selectedChatId === 'bugshot' || selectedChatId === 'system' ? (
                                            <div className="flex flex-col items-center justify-center py-16 text-center space-y-2 text-stone-500">
                                                <div className="w-12 h-12 rounded-2xl bg-stone-900 border border-cyan-900/60 flex items-center justify-center text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                                                    <ShieldAlert size={20} />
                                                </div>
                                                <p className="text-xs font-black text-cyan-300 uppercase tracking-wider">
                                                    SYSTEM TRANSMISSIONS SECURE
                                                </p>
                                                <p className="text-[9.5px] text-stone-500 max-w-xs font-mono">
                                                    No direct transmissions from BUGSHOT mainframe yet. System dispatches will appear here.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-16 text-center space-y-2 text-stone-500">
                                                <div className="w-12 h-12 rounded-2xl bg-stone-900 border border-stone-855 flex items-center justify-center text-stone-400">
                                                    <Mail size={20} />
                                                </div>
                                                <p className="text-xs font-black text-stone-400 uppercase tracking-wider">
                                                    DIRECT CHANNEL READY
                                                </p>
                                                <p className="text-[9.5px] text-stone-500 max-w-xs">
                                                    Send a direct transmission or tactical sticker to @{selectedFriend?.displayName || selectedFriend?.username} below!
                                                </p>
                                            </div>
                                        )
                                    ) : (
                                        directMessages.map((msg) => {
                                            const isMe = msg.sender.toLowerCase() === currentUser?.username.toLowerCase();
                                            const isSystem = msg.sender.toLowerCase() === 'bugshot' || msg.sender.toLowerCase() === 'system';
                                            const sticker = getStickerById(msg.stickerId);

                                            return (
                                                <div
                                                    key={msg.id}
                                                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`}
                                                >
                                                    {isSystem && (
                                                        <div className="flex items-center gap-1.5 ml-1 mb-0.5">
                                                            <AvatarImage
                                                                src="/image/favicon/android-chrome-192x192.png"
                                                                alt="BUGSHOT"
                                                                sizeClass="w-4 h-4 border border-cyan-700/60 p-0.5 bg-stone-950"
                                                            />
                                                            <span className="text-[9px] font-black text-cyan-300 uppercase tracking-wider font-mono">
                                                                BUGSHOT
                                                            </span>
                                                            <span className="px-1 py-0.2 bg-cyan-955 text-cyan-400 text-[6.5px] font-bold border border-cyan-800 rounded uppercase">
                                                                SYSTEM
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div className={`flex items-end gap-1.5 sm:gap-2 max-w-[88%] sm:max-w-[75%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                                        {!isMe && !isSystem && (
                                                            <AvatarImage
                                                                src={getResolvedAvatar(msg.sender, selectedFriend || { username: msg.sender, avatarUrl: msg.senderAvatarUrl })}
                                                                alt={msg.sender}
                                                                fallbackSeed={(selectedFriend as any)?.avatarSeed || msg.sender}
                                                                sizeClass="w-6 h-6 sm:w-7 sm:h-7 mb-1 shrink-0 ring-1 ring-stone-800 border border-stone-750"
                                                            />
                                                        )}
                                                        <div
                                                            className={`p-3 rounded-2xl shadow-md transition-colors ${
                                                                isMe
                                                                    ? 'bg-gradient-to-br from-cyan-955 via-stone-900 to-stone-950 border border-cyan-700/60 text-stone-100 rounded-br-xs'
                                                                    : isSystem
                                                                    ? 'bg-gradient-to-br from-stone-950 via-stone-900/90 to-cyan-955/20 border border-cyan-700/70 text-stone-100 rounded-bl-xs shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                                                                    : 'bg-stone-900/90 border border-stone-800 text-stone-200 rounded-bl-xs'
                                                            }`}
                                                        >
                                                        {(() => {
                                                            const { roomId, cleanText } = parseMessageInvite(msg.text);
                                                            return (
                                                                <>
                                                                    {cleanText && (
                                                                        <p className="text-xs font-mono leading-relaxed whitespace-pre-wrap">
                                                                            {cleanText}
                                                                        </p>
                                                                    )}
                                                                    {roomId && (
                                                                        <MatchInviteCard
                                                                            roomId={roomId}
                                                                            onJoinRoom={onJoinRoom}
                                                                            onCloseModal={onClose}
                                                                        />
                                                                    )}
                                                                </>
                                                            );
                                                        })()}

                                                        {/* Custom Bugshot Sticker Render */}
                                                        {sticker && (
                                                            <div className="mt-1.5 p-1.5 rounded-xl bg-stone-950/60 border border-stone-800/80 inline-block shadow-md">
                                                                <img
                                                                    src={sticker.url}
                                                                    alt={sticker.name}
                                                                    className="w-24 h-24 sm:w-28 sm:h-28 object-contain rounded-lg animate-in zoom-in-95 duration-200"
                                                                    loading="lazy"
                                                                />
                                                            </div>
                                                        )}

                                                        {/* Message Footer: Timestamp and Read Receipts */}
                                                        <div className="flex items-center justify-end gap-1.5 mt-1 pt-0.5 text-[7.5px] font-mono text-stone-400">
                                                            <span>
                                                                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                            {isMe && (
                                                                <CheckCheck size={11} className="text-cyan-400" />
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                        })
                                    )
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* STICKER PICKER DRAWER */}
                            {showStickers && selectedChatId !== 'global_broadcast' && selectedChatId !== 'admin_feedbacks' && selectedChatId !== 'bugshot' && selectedChatId !== 'system' && (
                                <div className="p-3 bg-stone-900 border-t border-stone-800 animate-in slide-in-from-bottom-2 duration-150 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[9.5px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1.5 font-mono">
                                            <Sparkles size={12} className="text-cyan-400" />
                                            BUGSHOT CUSTOM STICKERS ({BUGSHOT_STICKERS.length} TACTICAL ASSETS)
                                        </span>
                                        <button onClick={() => setShowStickers(false)} className="text-stone-400 hover:text-white cursor-pointer">
                                            <X size={12} />
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5 max-h-56 overflow-y-auto custom-scrollbar p-1">
                                        {BUGSHOT_STICKERS.map((stk) => (
                                            <button
                                                key={stk.id}
                                                type="button"
                                                onClick={() => handleSendMessage('', stk.id)}
                                                className="p-1.5 rounded-xl border border-stone-800 bg-stone-950/80 hover:bg-stone-900 hover:border-cyan-500/80 hover:scale-105 active:scale-95 transition-all text-center flex flex-col items-center justify-between cursor-pointer group shadow-sm relative overflow-hidden"
                                                title={stk.name}
                                            >
                                                {stk.badge && (
                                                    <span className="absolute top-1 right-1 text-[6.5px] bg-black/80 text-cyan-400 font-mono px-1 py-0.2 rounded font-black border border-cyan-800/40">
                                                        {stk.badge}
                                                    </span>
                                                )}
                                                <div className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center p-0.5">
                                                    <img
                                                        src={stk.url}
                                                        alt={stk.name}
                                                        className="max-w-full max-h-full object-contain transition-transform group-hover:scale-110 drop-shadow-md"
                                                        loading="lazy"
                                                    />
                                                </div>
                                                <span className="text-[7.5px] font-mono font-bold text-stone-300 group-hover:text-cyan-300 tracking-wider mt-0.5 truncate max-w-full">
                                                    {stk.name}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* CHAT INPUT BAR (One-Way locked for BUGSHOT system channel) */}
                            {selectedChatId === 'bugshot' || selectedChatId === 'system' ? (
                                <div className="p-3.5 bg-stone-900/90 border-t border-cyan-900/60 flex items-center justify-center gap-2 text-center select-none shrink-0">
                                    <Lock size={14} className="text-cyan-400" />
                                    <span className="text-[10px] font-mono text-cyan-300 font-bold uppercase tracking-wider">
                                        ONE-WAY SYSTEM TRANSMISSION • REPLIES DISABLED
                                    </span>
                                </div>
                            ) : selectedChatId !== 'global_broadcast' && selectedChatId !== 'admin_feedbacks' ? (
                                <div 
                                    className="p-2 sm:p-3 bg-stone-900/90 border-t border-stone-855 flex items-center gap-1.5 sm:gap-2 shrink-0"
                                    style={{
                                        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 10px)'
                                    }}
                                >
                                    {/* Sticker Button */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            audioManager.playSound('click');
                                            setShowStickers(!showStickers);
                                        }}
                                        className={`w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border transition-all cursor-pointer ${
                                            showStickers
                                                ? 'bg-cyan-955 border-cyan-500 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                                                : 'bg-stone-950 border-stone-800 text-stone-400 hover:text-white'
                                        }`}
                                        title="Bugshot Custom Stickers"
                                    >
                                        <Sparkles size={18} />
                                    </button>

                                    {/* Message Text Input */}
                                    <input
                                        ref={messageInputRef}
                                        type="text"
                                        value={messageInput}
                                        onChange={(e) => setMessageInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSendMessage();
                                            }
                                        }}
                                        placeholder={`Message @${selectedFriend?.displayName || selectedFriend?.username}...`}
                                        className="flex-1 bg-stone-950 border border-stone-800 focus:border-cyan-500/80 px-3 sm:px-4 py-2 sm:py-2.5 min-h-[44px] text-xs font-mono text-stone-100 outline-none rounded-xl tracking-wider placeholder-stone-600 transition-all"
                                    />

                                    {/* Send Button */}
                                    <button
                                        type="button"
                                        onClick={() => handleSendMessage()}
                                        disabled={isSending || !messageInput.trim()}
                                        className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center bg-cyan-600 hover:bg-cyan-500 text-stone-950 rounded-xl transition-all disabled:opacity-40 cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.3)] active:scale-95"
                                        title="Transmit Message"
                                    >
                                        {isSending ? (
                                            <RefreshCw size={16} className="animate-spin" />
                                        ) : (
                                            <Send size={16} />
                                        )}
                                    </button>
                                </div>
                            ) : selectedChatId === 'admin_feedbacks' ? (
                                <div className="p-3 bg-stone-950 border-t border-stone-900 text-center text-[9px] font-mono text-stone-500 uppercase tracking-wider">
                                    ADMIN FEEDBACK CONSOLE • CLICK 'DIRECT MESSAGE' ON ANY TRANSMISSION TO REPLY TO OPERATIVE
                                </div>
                            ) : (
                                <div className="p-3 bg-stone-950 border-t border-stone-900 text-center text-[9px] font-mono text-stone-500 uppercase tracking-wider">
                                    GLOBAL BROADCAST CHANNEL • MANAGED BY BUGSHOT MAINFRAME
                                </div>
                            )}
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};
