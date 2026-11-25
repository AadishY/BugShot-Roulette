import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    X,
    Pencil,
    Shield,
    User,
    Mail,
    Key,
    Lock,
    Trash2,
    Clock,
    Trophy,
    Crosshair,
    Award,
    AlertTriangle,
    Check,
    CheckCircle2,
    Dices,
    LogOut,
    Sparkles,
    Flame,
    History,
    Skull,
    UserPlus,
    UserMinus,
    MessageSquare,
    Copy,
    Swords,
    ChevronRight,
    Target,
    Activity,
    Zap,
    Users
} from 'lucide-react';
import {
    UserProfile,
    LeaderboardEntry,
    updateUserAvatar,
    updateUserDisplayName,
    sendPasswordReset,
    updateUserEmail,
    deleteUserAccount,
    getPlayerId
} from '../../utils/firebaseService';
import {
    DICEBEAR_STYLES,
    DicebearStyle,
    getDicebearUrl,
    parseDicebearUrl
} from '../../utils/dicebear';
import { audioManager } from '../../utils/audioManager';
import { presenceClient, formatLastSeen, UserPresence } from '../../utils/presenceService';
import { sendFriendRequest, subscribeToFriends, removeFriend, resolvePlayerAvatar } from '../../utils/messagingService';
import { showConfirm } from '../../utils/modalService';
import { computeDetailedStats } from '../../utils/statsAnalytics';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    profile: UserProfile | LeaderboardEntry | null;
    isOwnProfile?: boolean;
    currentUser?: UserProfile | null;
    onProfileUpdated?: (updated: UserProfile) => void;
    onLogout?: () => void;
    getUserPresence?: (username: string) => UserPresence | null;
    onOpenMessages?: (targetUsername: string) => void;
    onRequireLogin?: () => void;
}

// Unified avatar config & URL helpers backed by resolvePlayerAvatar
const getProfileAvatarConfig = (prof: any): { style: DicebearStyle; seed: string } => {
    const parsedFromUrl = parseDicebearUrl(prof?.avatarUrl);
    const style: DicebearStyle = (prof?.avatarStyle as DicebearStyle) || parsedFromUrl?.style || 'thumbs';
    const seed: string = prof?.avatarSeed || parsedFromUrl?.seed || prof?.username || 'operator';
    return { style, seed };
};

const getEffectiveAvatarUrl = (prof: any) => {
    return resolvePlayerAvatar(prof);
};

// Multi-page curated and randomized avatar catalog generator supporting style filters & active selection
const generatePresetPages = (
    seedOffset = 'init',
    filter: 'all' | DicebearStyle = 'all',
    currentSelected?: { style: DicebearStyle; seed: string }
) => {
    const styles: DicebearStyle[] = filter === 'all'
        ? ['thumbs', 'moods', 'bottts-neutral', 'critters', 'avataaars-neutral']
        : [filter];

    const namePool = [
        'Viper', 'Ghost', 'Spectre', 'Cyber', 'Neon', 'Echo', 'Raven', 'Titan',
        'Blaze', 'Frost', 'Zenith', 'Rogue', 'Apex', 'Phantom', 'Volt', 'Nova',
        'Smiley', 'Lucky', 'Shadow', 'Oracle', 'Pulse', 'Aura', 'Zero', 'Matrix',
        'Circuit', 'Spark', 'Vector', 'Pixel', 'Sonic', 'Cosmo', 'Alpha', 'Omega',
        'Glitch', 'Chaser', 'Fury', 'Havoc', 'Storm', 'Hydra', 'Vortex', 'Quark',
        'Axiom', 'Nexus', 'Drift', 'Blitz', 'Strike', 'Siren', 'Breeze', 'Talon',
        'Bandit', 'Scout', 'Hunter', 'Reaper', 'Cyberpunk', 'Rebel', 'Gizmo', 'Rust',
        'Echo2', 'Cinder', 'Obsidian', 'Titanium', 'Krypton', 'Vapor', 'Cipher', 'NeonX'
    ];

    const allItems: { style: DicebearStyle; seed: string }[] = [];

    // Prepend user's currently selected avatar if it matches the current filter
    if (currentSelected && (filter === 'all' || currentSelected.style === filter)) {
        allItems.push({ style: currentSelected.style, seed: currentSelected.seed });
    }

    const offsetSuffix = seedOffset && seedOffset !== 'init' ? `_${seedOffset}` : '';
    for (let i = 0; i < namePool.length; i++) {
        const st = filter === 'all' ? styles[i % styles.length] : filter;
        const seed = `${namePool[i]}${offsetSuffix}`;
        if (currentSelected && currentSelected.style === st && currentSelected.seed.toLowerCase() === seed.toLowerCase()) {
            continue;
        }
        allItems.push({ style: st, seed });
    }

    // When a specific style is selected, show ALL avatars of that style in one scrollable page
    if (filter !== 'all') {
        return [allItems];
    }

    const pageSize = 16;
    const pages: { style: DicebearStyle; seed: string }[][] = [];
    for (let i = 0; i < allItems.length; i += pageSize) {
        pages.push(allItems.slice(i, i + pageSize));
    }
    return pages.length > 0 ? pages : [[]];
};

export const ProfileModal: React.FC<ProfileModalProps> = ({
    isOpen,
    onClose,
    profile,
    isOwnProfile = false,
    currentUser,
    onProfileUpdated,
    onLogout,
    getUserPresence,
    onOpenMessages,
    onRequireLogin
}) => {
    const [, setPresenceTick] = useState(0);
    const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'SECURITY'>('OVERVIEW');
    const [isEditingAvatar, setIsEditingAvatar] = useState(false);
    
    // Avatar editor state
    const isDev = profile?.username?.toLowerCase() === 'aadish' || Boolean(profile?.isDeveloper);
    const { style: initialStyle, seed: initialSeed } = getProfileAvatarConfig(profile);
    const initialAvatarUrl = getEffectiveAvatarUrl(profile);

    const [selectedStyle, setSelectedStyle] = useState<DicebearStyle>(initialStyle);
    const [avatarSeed, setAvatarSeed] = useState<string>(initialSeed);
    const [customSeedInput, setCustomSeedInput] = useState<string>(initialSeed);
    const [avatarFilterStyle, setAvatarFilterStyle] = useState<'all' | DicebearStyle>('all');
    const [previewAvatarUrl, setPreviewAvatarUrl] = useState<string>(initialAvatarUrl);
    const [presetPages, setPresetPages] = useState<{ style: DicebearStyle; seed: string }[][]>(() => 
        generatePresetPages('init', 'all', { style: initialStyle, seed: initialSeed })
    );
    const [avatarPage, setAvatarPage] = useState<number>(0);
    const [isSavingAvatar, setIsSavingAvatar] = useState(false);

    // Display Name Edit state
    const [displayNameInput, setDisplayNameInput] = useState(profile?.displayName || profile?.username || '');
    const [isSavingName, setIsSavingName] = useState(false);
    const [nameSuccess, setNameSuccess] = useState(false);

    // Security & Reset Email State
    const [isSendingReset, setIsSendingReset] = useState(false);
    const [resetFeedback, setResetFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
    const [showSpamNoticeModal, setShowSpamNoticeModal] = useState(false);
    const [sentEmailTarget, setSentEmailTarget] = useState('');

    // Email Address Change State
    const [newEmailInput, setNewEmailInput] = useState('');
    const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);
    const [emailFeedback, setEmailFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
    const [showReauthModal, setShowReauthModal] = useState(false);
    const [reauthPasswordInput, setReauthPasswordInput] = useState('');
    const [reauthError, setReauthError] = useState('');
    const [showEmailVerificationModal, setShowEmailVerificationModal] = useState(false);
    const [verificationTargetEmail, setVerificationTargetEmail] = useState('');

    // Double-confirmation account deletion
    const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
    const [deleteInputText, setDeleteInputText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    // Social actions state
    const [friendRequestStatus, setFriendRequestStatus] = useState<'idle' | 'sent'>('idle');
    const [isAlreadyFriend, setIsAlreadyFriend] = useState(false);
    const [isRemovingFriend, setIsRemovingFriend] = useState(false);
    const [messageToast, setMessageToast] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState(false);

    // Detailed Match Popup Modal State
    const [selectedMatchDetail, setSelectedMatchDetail] = useState<any | null>(null);

    const isMountedRef = useRef(true);
    const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const loginPromptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const nameSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearAllTimers = useCallback(() => {
        if (copiedTimeoutRef.current) {
            clearTimeout(copiedTimeoutRef.current);
            copiedTimeoutRef.current = null;
        }
        if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current);
            toastTimeoutRef.current = null;
        }
        if (loginPromptTimeoutRef.current) {
            clearTimeout(loginPromptTimeoutRef.current);
            loginPromptTimeoutRef.current = null;
        }
        if (nameSuccessTimeoutRef.current) {
            clearTimeout(nameSuccessTimeoutRef.current);
            nameSuccessTimeoutRef.current = null;
        }
    }, []);

    const showToastMessage = useCallback((msg: string, durationMs = 3500) => {
        if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current);
        }
        setMessageToast(msg);
        toastTimeoutRef.current = setTimeout(() => {
            toastTimeoutRef.current = null;
            if (isMountedRef.current) {
                setMessageToast(null);
            }
        }, durationMs);
    }, []);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            clearAllTimers();
        };
    }, [clearAllTimers]);

    useEffect(() => {
        if (!isOpen) {
            clearAllTimers();
            setCopiedId(false);
            setNameSuccess(false);
            setMessageToast(null);
            setDeleteStep(0);
            setDeleteInputText('');
            setDeleteError('');
            setShowSpamNoticeModal(false);
            setShowReauthModal(false);
            setShowEmailVerificationModal(false);
            setSelectedMatchDetail(null);
        }
    }, [isOpen, clearAllTimers]);

    useEffect(() => {
        if (profile) {
            setDisplayNameInput(profile.displayName || profile.username);
            const { style: curStyle, seed: curSeed } = getProfileAvatarConfig(profile);
            const currentUrl = getEffectiveAvatarUrl(profile);

            setSelectedStyle(curStyle);
            setAvatarSeed(curSeed);
            setCustomSeedInput(curSeed);
            setAvatarFilterStyle('all');
            setPreviewAvatarUrl(currentUrl);
            setPresetPages(generatePresetPages('init', 'all', { style: curStyle, seed: curSeed }));
            setAvatarPage(0);
            setActiveTab('OVERVIEW');
            setIsEditingAvatar(false);
            setDeleteStep(0);
            setSelectedMatchDetail(null);
            setMessageToast(null);
            setNewEmailInput('');
            setEmailFeedback(null);
            setShowReauthModal(false);
            setReauthPasswordInput('');
            setReauthError('');
            setShowEmailVerificationModal(false);

            try {
                const stored = JSON.parse(localStorage.getItem('aadish_roulette_friend_requests') || '[]');
                if (stored.includes(profile.username)) {
                    setFriendRequestStatus('sent');
                } else {
                    setFriendRequestStatus('idle');
                }
            } catch (e) {
                setFriendRequestStatus('idle');
            }
        }
    }, [profile]);

    // Check if profile is already mutual friend
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (deleteStep === 2) {
                    setDeleteStep(0);
                    setDeleteInputText('');
                    setDeleteError('');
                } else if (deleteStep === 1) {
                    setDeleteStep(0);
                } else if (selectedMatchDetail) {
                    setSelectedMatchDetail(null);
                } else if (showSpamNoticeModal) {
                    setShowSpamNoticeModal(false);
                } else if (showReauthModal) {
                    setShowReauthModal(false);
                } else if (showEmailVerificationModal) {
                    setShowEmailVerificationModal(false);
                } else if (isEditingAvatar) {
                    setIsEditingAvatar(false);
                } else {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, deleteStep, selectedMatchDetail, showSpamNoticeModal, showReauthModal, showEmailVerificationModal, isEditingAvatar, onClose]);

    useEffect(() => {
        if (!currentUser?.username || !profile?.username || isOwnProfile) {
            setIsAlreadyFriend(false);
            return;
        }
        const cleanTarget = profile.username.toLowerCase().trim();
        if (Array.isArray((currentUser as any).friends)) {
            setIsAlreadyFriend((currentUser as any).friends.some((f: string) => f.toLowerCase() === cleanTarget));
        }
        const unsub = subscribeToFriends(currentUser.username, (friendList) => {
            setIsAlreadyFriend(friendList.some(f => f.username.toLowerCase() === cleanTarget));
        });
        return () => unsub();
    }, [currentUser?.username, profile?.username, isOwnProfile]);

    useEffect(() => {
        const unsubscribe = presenceClient.subscribe(() => {
            setPresenceTick(t => t + 1);
        });
        return unsubscribe;
    }, []);

    const profileAny = (profile || {}) as any;
    const wins = profileAny.wins ?? profile?.stats?.wins ?? 0;
    const losses = profileAny.losses ?? profile?.stats?.losses ?? 0;
    const stats = profile?.stats || {
        wins,
        losses,
        totalRounds: 0,
        shotsFired: 0,
        shotsHit: 0,
        selfShots: 0,
        damageDealt: 0,
        itemsUsed: 0,
        highestRound: 0,
        matchHistory: []
    };

    const hardModeWins = profileAny.hardModeWins ?? ((stats.matchHistory || []) as any[]).filter((m: any) => m.result === 'WIN' && m.isHardMode).length;
    const detailedStats = computeDetailedStats(stats, {
        wins,
        losses,
        hardModeWins,
        totalTimePlayed: profileAny.totalTimePlayed
    });
    const playerId = profile ? (profile.playerId || getPlayerId(profile)) : '';

    // Real, accurate online/offline calculation using live presence & last seen telemetry
    const getOnlineInfo = () => {
        let isSelf = Boolean(isOwnProfile);
        try {
            if (!isSelf && profile?.username && typeof window !== 'undefined') {
                const stored = localStorage.getItem('aadish_roulette_logged_in_user');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (parsed?.username && parsed.username.toLowerCase() === profile.username.toLowerCase()) {
                        isSelf = true;
                    }
                }
            }
        } catch (e) {}

        const livePresence = getUserPresence && profile?.username
            ? getUserPresence(profile.username)
            : (profile?.username ? presenceClient.getPresence(profile.username) : null);

        if (livePresence) {
            if (livePresence.status === 'in_match') {
                return { isOnline: true, status: 'in_match' as const, text: 'In Combat' };
            }
            if (livePresence.status === 'in_lobby') {
                return { isOnline: true, status: 'in_lobby' as const, text: 'In Room Lobby' };
            }
            if (livePresence.status === 'online') {
                return { isOnline: true, status: 'online' as const, text: 'Online' };
            }
            if (isSelf) {
                return { isOnline: true, status: 'online' as const, text: 'Online' };
            }
            const lastSeenTime = livePresence.lastSeen || (profile as any)?.lastSeenAt || (profile as any)?.lastLoginAt;
            return {
                isOnline: false,
                status: 'offline' as const,
                text: lastSeenTime ? `Offline (${formatLastSeen(lastSeenTime)})` : 'Offline'
            };
        }

        if (isSelf) {
            return { isOnline: true, status: 'online' as const, text: 'Online' };
        }

        const lastLogin = (profile as any)?.lastSeenAt || (profile as any)?.lastLoginAt;
        return {
            isOnline: false,
            status: 'offline' as const,
            text: lastLogin ? `Offline (${formatLastSeen(lastLogin)})` : 'Offline'
        };
    };

    const onlineInfo = getOnlineInfo();

    const formatPlayTime = (seconds?: number): string => {
        const secs = seconds || (stats.totalRounds || 0) * 90;
        const hours = Math.floor(secs / 3600);
        const mins = Math.floor((secs % 3600) / 60);
        if (hours > 0) return `${hours}h ${mins}m`;
        return `${mins}m`;
    };

    const handleCopyPlayerId = () => {
        audioManager.playSound('click');
        navigator.clipboard?.writeText(playerId);
        setCopiedId(true);
        if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
        copiedTimeoutRef.current = setTimeout(() => {
            copiedTimeoutRef.current = null;
            if (isMountedRef.current) setCopiedId(false);
        }, 2000);
    };

    const handleSendFriendRequest = async () => {
        if (!currentUser) {
            audioManager.playSound('click');
            showToastMessage('LOGIN REQUIRED // Sign in to dispatch friend transmissions.');
            if (loginPromptTimeoutRef.current) clearTimeout(loginPromptTimeoutRef.current);
            loginPromptTimeoutRef.current = setTimeout(() => {
                loginPromptTimeoutRef.current = null;
                if (isMountedRef.current && onRequireLogin) onRequireLogin();
            }, 1200);
            return;
        }

        audioManager.playSound('confirm');
        try {
            const targetTag = playerId || getPlayerId(profile);
            const res = await sendFriendRequest(currentUser, targetTag);
            if (!isMountedRef.current) return;
            if (res.success) {
                setFriendRequestStatus('sent');
                showToastMessage(`Friend transmission dispatched to ${targetTag}!`);
            } else {
                showToastMessage(res.error || 'Failed to dispatch friend request.');
            }
        } catch (e: any) {
            if (!isMountedRef.current) return;
            showToastMessage(e.message || 'Error dispatching friend transmission.');
        }
    };

    const handleRemoveFriend = async () => {
        if (!currentUser || !profile) return;
        const targetName = profile.displayName || profile.username;
        const confirmed = await showConfirm({
            title: "REMOVE FRIEND",
            message: `Are you sure you want to remove ${targetName} as a friend?`,
            confirmText: "REMOVE",
            cancelText: "CANCEL",
            isDanger: true,
            icon: "warning"
        });
        if (!confirmed || !isMountedRef.current) return;

        audioManager.playSound('click');
        setIsRemovingFriend(true);
        try {
            const res = await removeFriend(currentUser.username, profile.username);
            if (!isMountedRef.current) return;
            if (res.success) {
                setIsAlreadyFriend(false);
                setFriendRequestStatus('idle');
                showToastMessage(`Removed ${targetName} from your friends.`, 3000);
            } else {
                showToastMessage(res.error || 'Failed to remove friend.', 3000);
            }
        } catch (e: any) {
            if (!isMountedRef.current) return;
            showToastMessage(e.message || 'Error removing friend.', 3000);
        } finally {
            if (isMountedRef.current) setIsRemovingFriend(false);
        }
    };

    const handleSendMessage = () => {
        audioManager.playSound('click');
        if (!currentUser) {
            showToastMessage('LOGIN REQUIRED // Sign in to transmit messages.');
            if (loginPromptTimeoutRef.current) clearTimeout(loginPromptTimeoutRef.current);
            loginPromptTimeoutRef.current = setTimeout(() => {
                loginPromptTimeoutRef.current = null;
                if (isMountedRef.current && onRequireLogin) onRequireLogin();
            }, 1200);
            return;
        }

        if (onOpenMessages) {
            onClose();
            onOpenMessages(profile.username);
        } else {
            showToastMessage(`Direct messaging channel with ${profile.displayName || profile.username} activated.`);
        }
    };

    const handleAvatarFilterChange = (newFilter: 'all' | DicebearStyle) => {
        audioManager.playSound('click');
        setAvatarFilterStyle(newFilter);
        setAvatarPage(0);
        setPresetPages(generatePresetPages('init', newFilter, { style: selectedStyle, seed: avatarSeed }));
    };

    const handleRandomizeAvatars = () => {
        audioManager.playSound('click');
        const rnd = Math.random().toString(36).substring(2, 8);
        setPresetPages(generatePresetPages(rnd, avatarFilterStyle, { style: selectedStyle, seed: avatarSeed }));
        setAvatarPage(0);
    };

    const handleSelectAvatarPreset = (style: DicebearStyle, seed: string) => {
        audioManager.playSound('click');
        setSelectedStyle(style);
        setAvatarSeed(seed);
        setCustomSeedInput(seed);
        setPreviewAvatarUrl(getDicebearUrl(style, seed));
    };

    const handleApplyCustomSeed = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const clean = customSeedInput.trim() || 'operator';
        audioManager.playSound('click');
        setAvatarSeed(clean);
        setPreviewAvatarUrl(getDicebearUrl(selectedStyle, clean));
    };

    const handleCancelAvatarEdit = () => {
        audioManager.playSound('click');
        const { style: originalStyle, seed: originalSeed } = getProfileAvatarConfig(profile);
        setSelectedStyle(originalStyle);
        setAvatarSeed(originalSeed);
        setCustomSeedInput(originalSeed);
        setPreviewAvatarUrl(getEffectiveAvatarUrl(profile));
        setIsEditingAvatar(false);
    };

    const handleSaveAvatar = async () => {
        if (!profile?.username) return;
        audioManager.playSound('confirm');
        setIsSavingAvatar(true);
        try {
            const finalSeed = customSeedInput.trim() || avatarSeed || profile.username || 'operator';
            setAvatarSeed(finalSeed);
            const updated = await updateUserAvatar(profile.username, selectedStyle, finalSeed);
            if (!isMountedRef.current) return;
            if (updated) {
                setPreviewAvatarUrl(resolvePlayerAvatar(updated));
                if (onProfileUpdated) {
                    onProfileUpdated(updated);
                }
                showToastMessage('Avatar saved & synced across leaderboard and chat!', 3000);
            }
            setIsEditingAvatar(false);
        } catch (err) {
            console.error("Save avatar error:", err);
        } finally {
            if (isMountedRef.current) setIsSavingAvatar(false);
        }
    };

    const handleSaveDisplayName = async () => {
        audioManager.playSound('click');
        setIsSavingName(true);
        setNameSuccess(false);
        try {
            const updated = await updateUserDisplayName(profile.username, displayNameInput);
            if (!isMountedRef.current) return;
            if (updated && onProfileUpdated) {
                onProfileUpdated(updated);
                setNameSuccess(true);
                if (nameSuccessTimeoutRef.current) clearTimeout(nameSuccessTimeoutRef.current);
                nameSuccessTimeoutRef.current = setTimeout(() => {
                    nameSuccessTimeoutRef.current = null;
                    if (isMountedRef.current) setNameSuccess(false);
                }, 2500);
            }
        } catch (e) {
            console.error(e);
        } finally {
            if (isMountedRef.current) setIsSavingName(false);
        }
    };

    const handleSendPasswordReset = async () => {
        const emailOrUser = (profile as any).email || profile?.username;
        if (!emailOrUser) {
            setResetFeedback({ type: 'error', msg: 'No Gmail address linked to this profile.' });
            return;
        }
        audioManager.playSound('confirm');
        setIsSendingReset(true);
        setResetFeedback(null);
        try {
            const res = await sendPasswordReset(emailOrUser);
            if (res.success) {
                const target = res.email || (profile as any).email || emailOrUser;
                setSentEmailTarget(target);
                setShowSpamNoticeModal(true);
                setResetFeedback({ type: 'success', msg: `Reset link dispatched to ${target}!` });
            } else {
                setResetFeedback({ type: 'error', msg: res.error || 'Failed to send reset link.' });
            }
        } catch (e: any) {
            setResetFeedback({ type: 'error', msg: e.message || 'Error sending link.' });
        } finally {
            setIsSendingReset(false);
        }
    };

    const handleUpdateEmail = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const cleanNew = newEmailInput.trim().toLowerCase();
        if (!cleanNew) {
            setEmailFeedback({ type: 'error', msg: 'Please enter a new Gmail address.' });
            return;
        }
        const currentEmail = ((profile as any)?.email || '').trim().toLowerCase();
        if (cleanNew === currentEmail) {
            setEmailFeedback({ type: 'error', msg: 'New email matches your current email address.' });
            return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanNew)) {
            setEmailFeedback({ type: 'error', msg: 'Please enter a valid Gmail address format.' });
            return;
        }
        if (!cleanNew.endsWith('@gmail.com') && !cleanNew.endsWith('@googlemail.com')) {
            setEmailFeedback({ type: 'error', msg: 'Only Gmail addresses (@gmail.com) are accepted.' });
            return;
        }

        if (!profile?.username) return;

        audioManager.playSound('click');
        setIsUpdatingEmail(true);
        setEmailFeedback(null);

        try {
            const res = await updateUserEmail(profile.username, cleanNew);
            if (res.success) {
                setVerificationTargetEmail(cleanNew);
                setShowEmailVerificationModal(true);
                setEmailFeedback({
                    type: 'success',
                    msg: res.verificationEmailSent
                        ? `Verification link dispatched to ${cleanNew}! Please verify to finalize.`
                        : `Email updated successfully to ${cleanNew}!`
                });
                if (res.user && onProfileUpdated) {
                    onProfileUpdated(res.user);
                }
                setNewEmailInput('');
            } else if (res.requiresReauth) {
                // Re-authentication confirmation modal
                setReauthPasswordInput('');
                setReauthError('');
                setShowReauthModal(true);
            } else {
                setEmailFeedback({ type: 'error', msg: res.error || 'Failed to update email address.' });
            }
        } catch (err: any) {
            setEmailFeedback({ type: 'error', msg: err.message || 'Error updating email address.' });
        } finally {
            setIsUpdatingEmail(false);
        }
    };

    const handleConfirmEmailChangeWithReauth = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!reauthPasswordInput) {
            setReauthError('Current password is required for security clearance.');
            return;
        }
        if (!profile?.username) return;

        audioManager.playSound('confirm');
        setIsUpdatingEmail(true);
        setReauthError('');

        try {
            const cleanNew = newEmailInput.trim().toLowerCase();
            const res = await updateUserEmail(
                profile.username,
                cleanNew,
                reauthPasswordInput
            );

            if (res.success) {
                setShowReauthModal(false);
                setReauthPasswordInput('');
                setVerificationTargetEmail(cleanNew);
                setShowEmailVerificationModal(true);
                setEmailFeedback({
                    type: 'success',
                    msg: res.verificationEmailSent
                        ? `Verification link dispatched to ${cleanNew}! Check your inbox to finalize.`
                        : `Email updated to ${cleanNew}!`
                });
                if (res.user && onProfileUpdated) {
                    onProfileUpdated(res.user);
                }
                setNewEmailInput('');
            } else {
                if (res.requiresReauth) {
                    setReauthError(res.error || 'Incorrect current password. Re-authentication failed.');
                } else {
                    setShowReauthModal(false);
                    setEmailFeedback({ type: 'error', msg: res.error || 'Failed to update email address.' });
                }
            }
        } catch (err: any) {
            setReauthError(err.message || 'Error updating email address.');
        } finally {
            setIsUpdatingEmail(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (deleteInputText.trim().toUpperCase() !== 'DELETE') {
            setDeleteError("You must type 'DELETE' exactly to confirm.");
            return;
        }
        audioManager.playSound('click');
        setIsDeleting(true);
        setDeleteError('');
        try {
            const res = await deleteUserAccount(profile.username);
            if (res.success) {
                if (onLogout) onLogout();
                onClose();
            } else {
                setDeleteError(res.error || 'Failed to delete account.');
            }
        } catch (e: any) {
            setDeleteError(e.message || 'Error during account deletion.');
        } finally {
            setIsDeleting(false);
        }
    };

    if (!isOpen || !profile || typeof document === 'undefined') return null;

    const statusBg = onlineInfo.status === 'in_match' 
        ? 'bg-red-500' 
        : onlineInfo.status === 'in_lobby' 
        ? 'bg-amber-400' 
        : onlineInfo.isOnline 
        ? 'bg-emerald-500' 
        : 'bg-stone-500';

    const statusTextCls = onlineInfo.status === 'in_match' 
        ? 'text-red-400' 
        : onlineInfo.status === 'in_lobby' 
        ? 'text-amber-400' 
        : onlineInfo.isOnline 
        ? 'text-emerald-400' 
        : 'text-stone-500';

    // Use createPortal to mount directly to document.body, escaping any parent CSS transforms or z-index stacking traps!
    return createPortal(
        <div 
            className="fixed inset-0 z-[250] flex items-center justify-center p-1.5 sm:p-5 bg-black/92 md:bg-black/85 md:backdrop-blur-md animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-label="Agent Dossier & Profile"
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
            {/* Modal Card */}
            <div className="relative w-full max-w-[96vw] sm:max-w-xl max-h-[95dvh] md:max-h-[92dvh] flex flex-col bg-stone-950 border border-stone-800 rounded-2xl shadow-[0_25px_80px_rgba(0,0,0,0.95)] overflow-hidden font-mono text-stone-300">
                {/* Header */}
                <div className="flex items-center justify-between px-3.5 sm:px-5 py-2.5 sm:py-3.5 border-b border-stone-850 bg-stone-900/60 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="relative p-2 rounded-xl bg-stone-850 border border-stone-750 text-stone-200">
                            <User className="w-4 h-4" />
                            <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-stone-950 ${statusBg}`} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-sm sm:text-base font-black tracking-wide text-white">
                                    {profile.displayName || profile.username}'s Profile
                                </h2>
                                {isDev && (
                                    <span className="px-1.5 py-0.5 bg-red-955 border border-red-800 text-red-400 text-[8px] font-bold tracking-widest rounded uppercase">
                                        DEVELOPER
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-[9px] text-stone-400">
                                <span className="font-bold text-stone-300">{playerId}</span>
                                <span className="text-stone-600">•</span>
                                <span className={`font-bold ${statusTextCls}`}>
                                    {onlineInfo.text}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                audioManager.playSound('click');
                                onClose();
                            }}
                            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-stone-400 hover:text-white hover:bg-stone-850 border border-transparent hover:border-stone-800 transition-all cursor-pointer touch-manipulation"
                            title="Close Profile"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Toast Notification Banner */}
                {messageToast && (
                    <div className="px-4 py-2 bg-stone-900 border-b border-stone-800 text-emerald-400 text-[9px] sm:text-[10px] font-bold text-center tracking-wider animate-in fade-in duration-150 shrink-0">
                        {messageToast}
                    </div>
                )}

                {/* Modernized Cyberpunk Segmented Navigation Tabs */}
                {isOwnProfile && (
                    <div className="px-3 sm:px-5 pt-2 sm:pt-3 pb-2 border-b border-stone-850/80 bg-stone-950 shrink-0">
                        <div className="flex w-full p-1 bg-stone-900/90 border border-stone-800 rounded-xl gap-1">
                            <button
                                onClick={() => {
                                    audioManager.playSound('click');
                                    setActiveTab('OVERVIEW');
                                }}
                                className={`flex-1 justify-center px-2 sm:px-4 py-2 min-h-[44px] rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center gap-1.5 touch-manipulation ${
                                    activeTab === 'OVERVIEW'
                                        ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-md shadow-red-950/60 border border-red-500/50'
                                        : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/60 border border-transparent'
                                }`}
                            >
                                <Activity className="w-3.5 h-3.5" />
                                <span>Overview & Stats</span>
                            </button>
                            <button
                                onClick={() => {
                                    audioManager.playSound('click');
                                    setActiveTab('SECURITY');
                                }}
                                className={`flex-1 justify-center px-2 sm:px-4 py-2 min-h-[44px] rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center gap-1.5 touch-manipulation ${
                                    activeTab === 'SECURITY'
                                        ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-md shadow-red-950/60 border border-red-500/50'
                                        : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/60 border border-transparent'
                                }`}
                            >
                                <Shield className="w-3.5 h-3.5" />
                                <span>Account & Privacy</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Body Content (Scrollable) */}
                <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5 space-y-3 sm:space-y-4 custom-scrollbar">
                    {activeTab === 'OVERVIEW' ? (
                        <>
                            {/* Profile Identity Card */}
                            <div className="p-3 sm:p-4 bg-stone-900/40 border border-stone-800/80 rounded-2xl flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
                                {/* Avatar Display & Edit */}
                                <div className="relative group shrink-0">
                                    <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-2xl overflow-hidden bg-stone-900 border border-stone-750 flex items-center justify-center p-1.5 shadow-md">
                                        <img
                                            src={previewAvatarUrl}
                                            alt={profile.username}
                                            className="w-full h-full object-contain filter drop-shadow-sm rounded-xl"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src = '/image/favicon/android-chrome-192x192.png';
                                            }}
                                        />
                                    </div>
                                    {isOwnProfile && (
                                        <button
                                            onClick={() => {
                                                audioManager.playSound('click');
                                                const next = !isEditingAvatar;
                                                setIsEditingAvatar(next);
                                                if (next) {
                                                    setPresetPages(generatePresetPages('init', avatarFilterStyle, { style: selectedStyle, seed: avatarSeed }));
                                                    setAvatarPage(0);
                                                    setCustomSeedInput(avatarSeed);
                                                }
                                            }}
                                            className="absolute -bottom-2 -right-2 w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center bg-stone-800/95 hover:bg-stone-700 text-stone-200 hover:text-white rounded-xl shadow-md border border-stone-700 transition-all cursor-pointer hover:scale-105 touch-manipulation"
                                            title="Change Avatar"
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>

                                {/* Identity Info */}
                                <div className="flex-1 text-center sm:text-left space-y-1.5 min-w-0">
                                    <div className="flex flex-col sm:flex-row items-center sm:items-center gap-1.5 flex-wrap justify-center sm:justify-start">
                                        <span className="text-base sm:text-lg font-black text-white">
                                            {profile.displayName || profile.username}
                                        </span>
                                        <button
                                            onClick={handleCopyPlayerId}
                                            className="inline-flex items-center gap-1.5 text-[9.5px] text-stone-400 hover:text-stone-200 font-mono font-bold bg-stone-900 px-2.5 min-h-[44px] rounded-lg border border-stone-800 transition-colors cursor-pointer touch-manipulation"
                                            title="Click to copy Player ID"
                                        >
                                            <span>{playerId}</span>
                                            {copiedId ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                                        </button>
                                    </div>

                                    <div className="flex items-center justify-center sm:justify-start gap-3 text-[9px] text-stone-400 flex-wrap">
                                        <div className="flex items-center gap-1">
                                            <Clock className="w-3 h-3 text-stone-500" />
                                            <span>Play Time: {formatPlayTime(profile.totalTimePlayed)}</span>
                                        </div>
                                        <span className="text-stone-600">•</span>
                                        <span className={`${statusTextCls} font-bold`}>
                                            {onlineInfo.text}
                                        </span>
                                    </div>

                                    {/* Action Buttons: Next to player name (Add as Friend / Remove Friend, Send Message) on other profiles */}
                                    {!isOwnProfile && (
                                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1.5">
                                            {isAlreadyFriend ? (
                                                <button
                                                    onClick={handleRemoveFriend}
                                                    disabled={isRemovingFriend}
                                                    className="px-3 py-2 min-h-[44px] rounded-xl text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer bg-red-955/50 hover:bg-red-900/60 border border-red-800 text-red-300 hover:text-red-100 active:scale-95 disabled:opacity-50 touch-manipulation"
                                                    title="Remove from Friends"
                                                >
                                                    <UserMinus className="w-3 h-3 text-red-400" />
                                                    <span>{isRemovingFriend ? 'Removing...' : 'Remove Friend'}</span>
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={handleSendFriendRequest}
                                                    disabled={friendRequestStatus === 'sent'}
                                                    className={`px-3 py-2 min-h-[44px] rounded-xl text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer touch-manipulation ${
                                                        friendRequestStatus === 'sent'
                                                            ? 'bg-stone-900 border border-emerald-800/60 text-emerald-400'
                                                            : 'bg-stone-900 hover:bg-stone-850 border border-stone-750 text-stone-200 hover:text-white active:scale-95'
                                                    }`}
                                                >
                                                    {friendRequestStatus === 'sent' ? (
                                                        <>
                                                            <Check className="w-3 h-3 text-emerald-400" />
                                                            <span>Friend Request Sent</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <UserPlus className="w-3 h-3 text-stone-400" />
                                                            <span>Add as a Friend</span>
                                                        </>
                                                    )}
                                                </button>
                                            )}

                                            <button
                                                onClick={handleSendMessage}
                                                className="px-3 py-2 min-h-[44px] bg-stone-900 hover:bg-stone-850 border border-stone-750 text-stone-200 hover:text-white rounded-xl text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 touch-manipulation"
                                            >
                                                <MessageSquare className="w-3 h-3 text-stone-400" />
                                                <span>Send Message</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Avatar Picker Drawer with Pagination, Style Filters & Real DiceBear Presets */}
                            {isOwnProfile && isEditingAvatar && (
                                <div className="p-3 sm:p-4 bg-stone-900/80 border border-stone-800 rounded-2xl space-y-3.5 animate-in slide-in-from-top-2 duration-150 shadow-2xl">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-stone-200 flex items-center gap-1.5 font-mono">
                                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                                            Customize Avatar
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={handleRandomizeAvatars}
                                                className="px-3 py-2 min-h-[44px] bg-stone-800 hover:bg-stone-750 text-stone-200 hover:text-white font-bold text-[9px] rounded-lg border border-stone-700 uppercase flex items-center gap-1.5 cursor-pointer transition-all shadow-sm active:scale-95 touch-manipulation"
                                                title="Generate new random presets"
                                            >
                                                <Dices className="w-3.5 h-3.5 text-amber-400" />
                                                Randomize
                                            </button>
                                        </div>
                                    </div>

                                    {/* Selected Avatar Hero Preview Card */}
                                    <div className="p-3 bg-stone-950/90 rounded-xl border border-stone-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-stone-900 border-2 border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.3)] shrink-0 flex items-center justify-center p-1">
                                                <img
                                                    src={previewAvatarUrl}
                                                    alt="Current Selection"
                                                    className="w-full h-full object-contain"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).src = '/image/favicon/android-chrome-192x192.png';
                                                    }}
                                                />
                                            </div>
                                            <div className="min-w-0 text-left space-y-0.5">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="text-xs font-black text-white font-mono uppercase truncate">
                                                        {avatarSeed}
                                                    </span>
                                                    <span className="px-1.5 py-0.2 rounded bg-red-955/60 border border-red-800 text-red-300 text-[7.5px] font-black uppercase tracking-wider">
                                                        Selected
                                                    </span>
                                                </div>
                                                <span className="text-[8.5px] text-stone-400 font-mono block">
                                                    Style: <strong className="text-stone-200 uppercase">{selectedStyle}</strong>
                                                </span>
                                                <span className="text-[7.5px] text-stone-500 font-mono block truncate">
                                                    {DICEBEAR_STYLES.find(s => s.id === selectedStyle)?.description}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Custom Seed Input Field */}
                                        <form onSubmit={handleApplyCustomSeed} className="flex items-center gap-1.5 w-full sm:w-auto">
                                            <input
                                                type="text"
                                                value={customSeedInput}
                                                onChange={(e) => setCustomSeedInput(e.target.value)}
                                                placeholder="Custom seed / codename..."
                                                className="flex-1 sm:w-36 min-h-[44px] px-2.5 py-2 bg-stone-900 border border-stone-750 focus:border-red-500 text-stone-100 text-[10px] rounded-lg font-mono outline-none"
                                            />
                                            <button
                                                type="submit"
                                                className="px-3 py-2 min-h-[44px] bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-white font-black text-[8.5px] rounded-lg border border-stone-700 uppercase cursor-pointer transition-all active:scale-95 touch-manipulation"
                                            >
                                                Apply
                                            </button>
                                        </form>
                                    </div>

                                    {/* Style Category Filter Tabs */}
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => handleAvatarFilterChange('all')}
                                            className={`px-3 py-2 min-h-[44px] rounded-lg text-[8.5px] font-black uppercase tracking-wider transition-all cursor-pointer touch-manipulation ${
                                                avatarFilterStyle === 'all'
                                                    ? 'bg-red-955 border border-red-700 text-white shadow-sm'
                                                    : 'bg-stone-850 hover:bg-stone-800 text-stone-400 hover:text-stone-200 border border-stone-750'
                                            }`}
                                        >
                                            All
                                        </button>
                                        {DICEBEAR_STYLES.map(st => (
                                            <button
                                                key={st.id}
                                                type="button"
                                                onClick={() => handleAvatarFilterChange(st.id)}
                                                className={`px-3 py-2 min-h-[44px] rounded-lg text-[8.5px] font-black uppercase tracking-wider transition-all cursor-pointer touch-manipulation ${
                                                    avatarFilterStyle === st.id
                                                        ? 'bg-red-955 border border-red-700 text-white shadow-sm'
                                                        : 'bg-stone-850 hover:bg-stone-800 text-stone-400 hover:text-stone-200 border border-stone-750'
                                                }`}
                                            >
                                                {st.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Visual Grid of Avatar Icons */}
                                    <div className={`grid grid-cols-4 sm:grid-cols-8 gap-2 p-2 bg-stone-950/90 rounded-xl border border-stone-850 ${
                                        avatarFilterStyle !== 'all' ? 'max-h-[260px] overflow-y-auto overscroll-contain pr-1 custom-scrollbar' : 'min-h-[130px]'
                                    }`}>
                                        {(presetPages[avatarPage] || []).map((preset, idx) => {
                                            const url = getDicebearUrl(preset.style, preset.seed);
                                            const isSelected = selectedStyle === preset.style && avatarSeed.toLowerCase() === preset.seed.toLowerCase();
                                            return (
                                                <button
                                                    key={`${preset.style}-${preset.seed}-${idx}`}
                                                    type="button"
                                                    onClick={() => handleSelectAvatarPreset(preset.style, preset.seed)}
                                                    className={`relative p-1 min-h-[44px] min-w-[44px] rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer group touch-manipulation ${
                                                        isSelected
                                                            ? 'border-red-500 bg-red-955/50 shadow-[0_0_15px_rgba(220,38,38,0.4)] scale-105 ring-1 ring-red-500'
                                                            : 'border-stone-800/80 bg-stone-900/60 hover:border-stone-600 hover:bg-stone-850'
                                                    }`}
                                                    title={`${preset.style}: ${preset.seed}`}
                                                >
                                                    <img
                                                        src={url}
                                                        alt={preset.seed}
                                                        className="w-10 h-10 object-contain rounded-lg"
                                                        loading="lazy"
                                                        onError={(e) => {
                                                            (e.target as HTMLImageElement).src = '/image/favicon/android-chrome-192x192.png';
                                                        }}
                                                    />
                                                    {isSelected && (
                                                        <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-600 text-white flex items-center justify-center text-[8px] font-black shadow-sm">
                                                            ✓
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Pagination Controls or All Items Counter */}
                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1 border-t border-stone-800/60">
                                        {avatarFilterStyle === 'all' && presetPages.length > 1 ? (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        audioManager.playSound('click');
                                                        setAvatarPage(p => Math.max(0, p - 1));
                                                    }}
                                                    disabled={avatarPage === 0}
                                                    className="px-3 py-2 min-h-[44px] bg-stone-850 hover:bg-stone-800 disabled:opacity-30 disabled:pointer-events-none text-stone-300 font-bold text-[8.5px] rounded-lg border border-stone-750 uppercase cursor-pointer transition-all touch-manipulation"
                                                >
                                                    Previous Page
                                                </button>
                                                <span className="text-[9px] font-mono text-stone-400 font-bold px-1">
                                                    Page {avatarPage + 1} of {Math.max(1, presetPages.length)}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        audioManager.playSound('click');
                                                        setAvatarPage(p => Math.min(presetPages.length - 1, p + 1));
                                                    }}
                                                    disabled={avatarPage >= presetPages.length - 1}
                                                    className="px-3 py-2 min-h-[44px] bg-stone-850 hover:bg-stone-800 disabled:opacity-30 disabled:pointer-events-none text-stone-300 font-bold text-[8.5px] rounded-lg border border-stone-750 uppercase cursor-pointer transition-all touch-manipulation"
                                                >
                                                    Next Page
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] font-mono text-cyan-400 font-bold uppercase tracking-wider">
                                                    ALL {(presetPages[0] || []).length} AVATARS FOR {avatarFilterStyle.toUpperCase()} LOADED • CLICK TO EQUIP
                                                </span>
                                            </div>
                                        )}

                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={handleCancelAvatarEdit}
                                                className="px-3 py-2 min-h-[44px] bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-white font-bold text-[8.5px] rounded-lg border border-stone-800 uppercase cursor-pointer touch-manipulation"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleSaveAvatar}
                                                disabled={isSavingAvatar}
                                                className="px-3.5 py-2 min-h-[44px] bg-red-650 hover:bg-red-600 text-white font-bold text-[8.5px] uppercase tracking-wider rounded-lg cursor-pointer transition-all disabled:opacity-50 shadow-md flex items-center gap-1.5 touch-manipulation"
                                            >
                                                {isSavingAvatar ? 'Applying...' : 'Apply Avatar'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Full Career Stats Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono tabular-nums">
                                <div className="p-2.5 bg-emerald-950/20 border border-emerald-800/40 rounded-xl">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[8px] text-emerald-400 font-bold uppercase tracking-wider block">Wins / Rate</span>
                                        <Trophy className="w-3.5 h-3.5 text-emerald-400" />
                                    </div>
                                    <span className="text-lg font-black text-white">{detailedStats.wins}</span>
                                    <span className="text-[9px] text-emerald-400 ml-1.5 font-bold">{detailedStats.winRate}%</span>
                                </div>

                                <div className="p-2.5 bg-stone-900/60 border border-stone-800 rounded-xl">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[8px] text-stone-400 font-bold uppercase tracking-wider block">Losses / Total</span>
                                        <Skull className="w-3.5 h-3.5 text-red-400" />
                                    </div>
                                    <span className="text-lg font-black text-stone-200">{detailedStats.losses}</span>
                                    <span className="text-[9px] text-stone-500 ml-1.5 font-bold">/{detailedStats.totalMatches}M</span>
                                </div>

                                <div className="p-2.5 bg-red-950/20 border border-red-900/40 rounded-xl">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[8px] text-red-400 font-bold uppercase tracking-wider block">Hard Mode</span>
                                        <Flame className="w-3.5 h-3.5 text-amber-400" />
                                    </div>
                                    <span className="text-lg font-black text-red-300">{detailedStats.hardModeWins}W</span>
                                    <span className="text-[9px] text-stone-400 ml-1.5 font-bold">STRK {detailedStats.bestStreak}W</span>
                                </div>

                                <div className="p-2.5 bg-amber-950/20 border border-amber-800/40 rounded-xl">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[8px] text-amber-400 font-bold uppercase tracking-wider block">Rating / Rank</span>
                                        <Award className="w-3.5 h-3.5 text-amber-400" />
                                    </div>
                                    <span className="text-lg font-black text-amber-300">{detailedStats.combatRating.toLocaleString()}</span>
                                    <span className="text-[9px] text-amber-400/90 ml-1 font-bold">{detailedStats.combatRank.tier}</span>
                                </div>
                            </div>

                            {/* Full Combat Analytics Box */}
                            <div className="space-y-2.5 bg-stone-900/40 p-3 rounded-2xl border border-stone-850 font-mono tabular-nums">
                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                                        <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
                                        Full Combat Analytics
                                    </span>
                                    <span className="text-[8.5px] font-bold text-stone-400">
                                        PLAYTIME: <strong className="text-stone-200">{detailedStats.formattedPlaytime}</strong>
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[9px]">
                                    <div className="p-2 bg-stone-950 rounded-xl border border-stone-850">
                                        <span className="text-stone-500 block uppercase text-[8px]">Accuracy</span>
                                        <span className="text-cyan-300 font-black text-xs">{detailedStats.accuracy}%</span>
                                        <span className="text-stone-500 text-[8px] block">{detailedStats.shotsHit}/{detailedStats.shotsFired} SHOTS</span>
                                    </div>
                                    <div className="p-2 bg-stone-950 rounded-xl border border-stone-850">
                                        <span className="text-stone-500 block uppercase text-[8px]">Damage Dealt</span>
                                        <span className="text-orange-300 font-black text-xs">{detailedStats.damageDealt} HP</span>
                                        <span className="text-stone-500 text-[8px] block">TAKEN {detailedStats.damageTaken} ({detailedStats.damageRatio}×)</span>
                                    </div>
                                    <div className="p-2 bg-stone-950 rounded-xl border border-stone-850">
                                        <span className="text-stone-500 block uppercase text-[8px]">Items / Fav</span>
                                        <span className="text-amber-300 font-black text-xs">{detailedStats.itemsUsed} USED</span>
                                        <span className="text-stone-400 text-[8px] block truncate">{detailedStats.mostUsedItem}</span>
                                    </div>
                                    <div className="p-2 bg-stone-950 rounded-xl border border-stone-850">
                                        <span className="text-stone-500 block uppercase text-[8px]">Peak / Self</span>
                                        <span className="text-white font-black text-xs">RD {detailedStats.highestRound}</span>
                                        <span className="text-stone-500 text-[8px] block">{detailedStats.totalRounds} RDS • {detailedStats.selfShots} SELF</span>
                                    </div>
                                </div>
                            </div>

                            {/* Match History: Shown for both own & public profiles */}
                            {stats.matchHistory && stats.matchHistory.length > 0 && (
                                <div className="space-y-2">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
                                        <History className="w-3.5 h-3.5 text-stone-500" />
                                        Match History ({stats.matchHistory.length} Recorded — Click for full report)
                                    </span>

                                    <div className="space-y-1.5 max-h-56 overflow-y-auto overscroll-contain pr-1 custom-scrollbar">
                                        {stats.matchHistory.slice(0, 15).map((m: any, idx: number) => {
                                            const isWin = m.result === 'WIN';
                                            const dateStr = m.timestamp ? new Date(m.timestamp).toLocaleDateString() : 'Recorded Match';

                                            return (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    onClick={() => {
                                                        audioManager.playSound('click');
                                                        setSelectedMatchDetail(m);
                                                    }}
                                                    className="w-full p-2.5 min-h-[44px] flex items-center justify-between text-[9px] bg-stone-900/40 hover:bg-stone-850/70 border border-stone-800 hover:border-stone-700 rounded-xl cursor-pointer text-left transition-all group touch-manipulation"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className={`px-2 py-0.5 rounded font-bold text-[8px] uppercase tracking-wider ${
                                                            isWin ? 'bg-emerald-950 border border-emerald-700/60 text-emerald-400' : 'bg-red-955 border border-red-800 text-red-400'
                                                        }`}>
                                                            {m.result}
                                                        </span>
                                                        <span className="text-stone-300 font-bold">
                                                            {m.isMultiplayer ? 'MULTIPLAYER' : (m.isHardMode ? 'HARD MODE' : 'STANDARD')}
                                                        </span>
                                                        {m.roundsSurvived && (
                                                            <span className="text-stone-500">
                                                                • Round {m.roundsSurvived}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-3">
                                                        {m.damageDealt !== undefined && (
                                                            <span className="text-stone-400 font-bold">{m.damageDealt} DMG</span>
                                                        )}
                                                        <span className="text-[8px] text-stone-500">{dateStr}</span>
                                                        <ChevronRight className="w-3.5 h-3.5 text-stone-500 group-hover:text-stone-200 transition-colors" />
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        /* SECURITY & PRIVACY TAB (Own Profile Only) */
                        <div className="space-y-4">
                            {/* Display Name Edit */}
                            <div className="p-4 bg-stone-900/40 border border-stone-850 rounded-2xl space-y-2">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400 block">
                                    Display Name
                                </span>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <input
                                        type="text"
                                        value={displayNameInput}
                                        onChange={e => setDisplayNameInput(e.target.value)}
                                        className="flex-1 min-w-0 min-h-[44px] bg-stone-950 border border-stone-800 focus:border-red-600 rounded-xl px-3 py-2 text-[10px] text-stone-200 outline-none uppercase font-mono"
                                        maxLength={24}
                                    />
                                    <button
                                        onClick={handleSaveDisplayName}
                                        disabled={isSavingName}
                                        className="px-4 py-2 min-h-[44px] bg-stone-850 hover:bg-stone-800 text-stone-200 font-bold text-[9px] rounded-xl uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 touch-manipulation shrink-0"
                                    >
                                        {isSavingName ? 'Saving...' : 'Update'}
                                    </button>
                                </div>
                                {nameSuccess && (
                                    <span className="text-[8px] text-emerald-400 font-bold uppercase tracking-wider block">
                                        ✓ Display name updated!
                                    </span>
                                )}
                            </div>

                            {/* Email Address Clearance & Change */}
                            <div className="p-4 bg-stone-900/40 border border-stone-850 rounded-2xl space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="space-y-0.5 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[9px] font-bold uppercase tracking-wider text-stone-300 block">
                                                Registered Gmail Clearance
                                            </span>
                                            <span className="px-1.5 py-0.2 bg-emerald-955 border border-emerald-800 text-emerald-400 text-[7.5px] font-bold tracking-widest rounded uppercase">
                                                Active Link
                                            </span>
                                        </div>
                                        <span className="text-[8px] text-stone-500 block break-all">
                                            Current address: <strong className="text-stone-300 font-mono">{(profile as any).email || 'No email bound'}</strong>
                                        </span>
                                    </div>
                                    <div className="p-2 rounded-xl bg-stone-950 border border-stone-800 text-stone-400 shrink-0">
                                        <Mail className="w-3.5 h-3.5 text-stone-400" />
                                    </div>
                                </div>

                                <form onSubmit={handleUpdateEmail} className="space-y-2">
                                    <span className="text-[8px] text-stone-400 uppercase tracking-wider font-bold block">
                                        Transfer to New Gmail Address
                                    </span>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <div className="relative flex-1 min-w-0">
                                            <input
                                                type="email"
                                                value={newEmailInput}
                                                onChange={e => setNewEmailInput(e.target.value)}
                                                placeholder="Enter new Gmail address..."
                                                className="w-full min-h-[44px] bg-stone-950 border border-stone-800 focus:border-red-600 rounded-xl px-3 py-2 text-[10px] text-stone-200 outline-none font-mono placeholder:text-stone-600"
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={isUpdatingEmail || !newEmailInput.trim()}
                                            className="px-4 py-2 min-h-[44px] bg-stone-850 hover:bg-stone-800 text-stone-200 font-bold text-[9px] rounded-xl border border-stone-750 uppercase tracking-wider transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 touch-manipulation"
                                        >
                                            {isUpdatingEmail ? 'Updating...' : 'Update Email'}
                                        </button>
                                    </div>
                                    <span className="text-[7.5px] text-stone-500 block leading-tight">
                                        Updating your registered Gmail will dispatch a Firebase verification link. Password re-authentication may be requested.
                                    </span>
                                </form>

                                {emailFeedback && (
                                    <div className={`p-2.5 rounded-xl border text-[8.5px] font-bold uppercase tracking-wider flex items-center gap-2 ${
                                        emailFeedback.type === 'success'
                                            ? 'bg-emerald-955/40 border-emerald-800 text-emerald-400'
                                            : 'bg-red-955/40 border-red-800 text-red-400'
                                    }`}>
                                        {emailFeedback.type === 'success' ? (
                                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                                        ) : (
                                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-400" />
                                        )}
                                        <span>{emailFeedback.msg}</span>
                                    </div>
                                )}
                            </div>

                            {/* Password Reset Email Link */}
                            <div className="p-4 bg-stone-900/40 border border-stone-850 rounded-2xl space-y-2">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                    <div className="min-w-0">
                                        <span className="text-[9px] font-bold uppercase tracking-wider text-stone-300 block">
                                            Password Recovery
                                        </span>
                                        <span className="text-[8px] text-stone-500 block">
                                            Sends a secure Firebase reset email to {(profile as any).email || 'your registered Gmail'}.
                                        </span>
                                    </div>
                                    <button
                                        onClick={handleSendPasswordReset}
                                        disabled={isSendingReset}
                                        className="px-3.5 py-2 min-h-[44px] bg-stone-850 hover:bg-stone-800 text-stone-200 font-bold text-[9px] rounded-xl border border-stone-750 uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 shrink-0 touch-manipulation"
                                    >
                                        {isSendingReset ? 'Sending...' : 'Send Reset Link'}
                                    </button>
                                </div>
                                {resetFeedback && (
                                    <span className={`text-[8px] font-bold uppercase tracking-wider block ${
                                        resetFeedback.type === 'success' ? 'text-emerald-400' : 'text-red-400'
                                    }`}>
                                        {resetFeedback.msg}
                                    </span>
                                )}
                            </div>

                            {/* Session Management (Red Logout Button inside Privacy tab) */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-4 bg-stone-900/30 border border-stone-850 rounded-2xl">
                                <div>
                                    <span className="text-[9.5px] font-bold uppercase tracking-wider text-stone-300 block">
                                        Session Security
                                    </span>
                                    <span className="text-[8px] text-stone-500 block">
                                        Sign out and terminate your active session on this device.
                                    </span>
                                </div>
                                <button
                                    onClick={() => {
                                        audioManager.playSound('click');
                                        if (onLogout) onLogout();
                                        onClose();
                                    }}
                                    className="px-4 py-2 min-h-[44px] bg-red-650 hover:bg-red-600 border border-red-500 text-white rounded-xl text-[9.5px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-red-955/50 hover:scale-105 active:scale-95 shrink-0 touch-manipulation"
                                >
                                    <LogOut className="w-3.5 h-3.5" />
                                    <span>Logout</span>
                                </button>
                            </div>

                            {/* Danger Zone: Double Confirmation Account Deletion */}
                            <div className="p-4 bg-red-955/15 border border-red-900/40 rounded-2xl space-y-2">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                    <div>
                                        <span className="text-[9.5px] font-bold uppercase tracking-wider text-red-400 block">
                                            Delete Account
                                        </span>
                                        <span className="text-[8px] text-stone-500 block">
                                            Permanently erase all statistics, profile records, and scores.
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            audioManager.playSound('click');
                                            setDeleteStep(1);
                                        }}
                                        className="px-3.5 py-2 min-h-[44px] bg-red-955 hover:bg-red-900 text-red-300 hover:text-white font-bold text-[9px] rounded-xl border border-red-800 uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0 touch-manipulation"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>Delete Account</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-end px-3.5 sm:px-5 py-2 sm:py-3 border-t border-stone-850 bg-stone-950 shrink-0">
                    <button
                        onClick={() => {
                            audioManager.playSound('click');
                            onClose();
                        }}
                        className="px-4 py-2 min-h-[44px] bg-stone-900 hover:bg-stone-850 text-stone-300 hover:text-white font-bold text-[9px] rounded-xl border border-stone-800 uppercase tracking-wider transition-all cursor-pointer touch-manipulation"
                    >
                        Close
                    </button>
                </div>
            </div>

            {/* VERY DETAILED MATCH DETAILS POPUP MODAL */}
            {selectedMatchDetail && (
                <div 
                    className="fixed inset-0 z-[300] flex items-center justify-center p-2 sm:p-5 bg-black/95 md:bg-black/90 md:backdrop-blur-md animate-in fade-in duration-150 font-mono"
                    style={{
                        paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
                        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
                        paddingLeft: 'max(env(safe-area-inset-left, 0px), 12px)',
                        paddingRight: 'max(env(safe-area-inset-right, 0px), 12px)'
                    }}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setSelectedMatchDetail(null);
                    }}
                >
                    <div className="relative w-full max-w-lg bg-stone-950 border border-stone-750 rounded-2xl shadow-[0_30px_90px_rgba(0,0,0,0.98)] p-4 sm:p-5 space-y-4 max-h-[95dvh] md:max-h-[90dvh] overflow-y-auto overscroll-contain custom-scrollbar text-stone-300">
                        {/* Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-stone-850">
                            <div className="flex items-center gap-2.5">
                                <div className={`p-2 rounded-xl border ${
                                    selectedMatchDetail.result === 'WIN' 
                                        ? 'bg-emerald-950 border-emerald-700/60 text-emerald-400' 
                                        : 'bg-red-955 border-red-800 text-red-400'
                                }`}>
                                    {selectedMatchDetail.result === 'WIN' ? <Trophy size={18} /> : <Skull size={18} />}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-sm font-black uppercase tracking-wider ${
                                            selectedMatchDetail.result === 'WIN' ? 'text-emerald-400' : 'text-red-400'
                                        }`}>
                                            {selectedMatchDetail.result === 'WIN' ? 'Match Victory' : 'Match Defeat'}
                                        </span>
                                        <span className="px-2 py-0.5 bg-stone-900 border border-stone-800 rounded text-[8px] font-bold text-stone-300 uppercase">
                                            {selectedMatchDetail.isMultiplayer ? 'Multiplayer' : (selectedMatchDetail.isHardMode ? 'Hard Mode' : 'Standard')}
                                        </span>
                                    </div>
                                    <span className="text-[8.5px] text-stone-500 block">
                                        {selectedMatchDetail.timestamp ? new Date(selectedMatchDetail.timestamp).toLocaleString() : 'Match Date Logged'}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedMatchDetail(null)}
                                className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-stone-400 hover:text-white hover:bg-stone-850 border border-stone-800 cursor-pointer transition-all touch-manipulation"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* High-level performance cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                            <div className="p-2.5 bg-stone-900/60 border border-stone-850 rounded-xl">
                                <span className="text-[8px] text-stone-500 uppercase block">Total Score</span>
                                <span className="text-base font-black text-amber-400 font-mono">{selectedMatchDetail.totalScore || 0}</span>
                            </div>
                            <div className="p-2.5 bg-stone-900/60 border border-stone-850 rounded-xl">
                                <span className="text-[8px] text-stone-500 uppercase block">Rounds Survived</span>
                                <span className="text-base font-black text-stone-200 font-mono">{selectedMatchDetail.roundsSurvived || 1}</span>
                            </div>
                            <div className="p-2.5 bg-stone-900/60 border border-stone-850 rounded-xl">
                                <span className="text-[8px] text-stone-500 uppercase block">Damage Dealt</span>
                                <span className="text-base font-black text-emerald-400 font-mono">{selectedMatchDetail.damageDealt || 0} HP</span>
                            </div>
                            <div className="p-2.5 bg-stone-900/60 border border-stone-850 rounded-xl">
                                <span className="text-[8px] text-stone-500 uppercase block">Damage Taken</span>
                                <span className="text-base font-black text-red-400 font-mono">{selectedMatchDetail.damageTaken || 0} HP</span>
                            </div>
                        </div>

                        {/* Shot Accuracy & Combat stats */}
                        <div className="p-3 bg-stone-900/30 border border-stone-850 rounded-xl space-y-2">
                            <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Target size={13} className="text-stone-500" />
                                Shot Accuracy & Mechanics
                            </span>
                            <div className="grid grid-cols-3 gap-2 text-[9px] text-stone-300">
                                <div>
                                    <span className="text-stone-500 block uppercase text-[8px]">Shots Fired:</span>
                                    <span className="font-bold text-white">{selectedMatchDetail.shotsFired || 0}</span>
                                </div>
                                <div>
                                    <span className="text-stone-500 block uppercase text-[8px]">Shots Hit:</span>
                                    <span className="font-bold text-emerald-400">{selectedMatchDetail.shotsHit || 0}</span>
                                </div>
                                <div>
                                    <span className="text-stone-500 block uppercase text-[8px]">Self-Shots:</span>
                                    <span className="font-bold text-stone-300">{selectedMatchDetail.selfShots || 0}</span>
                                </div>
                            </div>
                        </div>

                        {/* Items Deployed Inventory */}
                        {selectedMatchDetail.itemsUsed && Object.keys(selectedMatchDetail.itemsUsed).length > 0 && (
                            <div className="p-3 bg-stone-900/30 border border-stone-850 rounded-xl space-y-2">
                                <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Zap size={13} className="text-stone-500" />
                                    Items Deployed During Duel
                                </span>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {Object.entries(selectedMatchDetail.itemsUsed).map(([itemName, count]: [string, any]) => (
                                        <div key={itemName} className="p-2 bg-stone-950 border border-stone-800 rounded-lg flex items-center justify-between text-[9px]">
                                            <span className="font-bold text-stone-300">{itemName}</span>
                                            <span className="px-1.5 py-0.5 bg-stone-900 text-amber-400 font-bold rounded">x{count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Multiplayer Match Players Roster */}
                        {selectedMatchDetail.isMultiplayer && (
                            <div className="p-3 bg-stone-900/30 border border-stone-850 rounded-xl space-y-2">
                                <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Users size={13} className="text-cyan-400" />
                                    Match Participants
                                </span>
                                {selectedMatchDetail.mpPlayers && selectedMatchDetail.mpPlayers.length > 0 ? (
                                    <div className="space-y-1.5">
                                        {selectedMatchDetail.mpPlayers.map((p: any, pIdx: number) => {
                                            const pName = p.name || `Player ${pIdx + 1}`;
                                            const pId = p.playerId || getPlayerId({ username: p.username || pName });
                                            const avatarUrl = resolvePlayerAvatar({
                                                username: p.username || pName,
                                                displayName: p.displayName || pName,
                                                avatarUrl: p.avatarUrl,
                                                avatarStyle: p.avatarStyle,
                                                avatarSeed: p.avatarSeed,
                                                isDeveloper: p.isDeveloper
                                            });

                                            return (
                                                <div key={pIdx} className="p-2 bg-stone-950 border border-stone-800 rounded-xl flex items-center justify-between text-[9px]">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-7 h-7 rounded-full overflow-hidden bg-stone-900 border border-stone-750 shrink-0">
                                                            <img src={avatarUrl} alt={pName} className="w-full h-full object-cover" />
                                                        </div>
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="font-bold text-stone-200">{pName}</span>
                                                            <span className="text-[7.5px] text-stone-400 font-mono tracking-wider bg-stone-900 px-1.5 py-0.5 rounded border border-stone-800">
                                                                {pId}
                                                            </span>
                                                            {p.isHost && (
                                                                <span className="px-1.5 py-0.2 bg-cyan-950 border border-cyan-800 text-cyan-400 text-[7px] font-bold rounded">
                                                                    HOST
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <span className="text-[7.5px] text-stone-500 font-mono">
                                                        Connected Player
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-[8.5px] text-stone-500 italic">2 Players Participated in this Room Duel</div>
                                )}
                            </div>
                        )}

                        <button
                            onClick={() => setSelectedMatchDetail(null)}
                            className="w-full py-2.5 min-h-[44px] bg-stone-900 hover:bg-stone-850 border border-stone-800 text-stone-300 hover:text-white font-bold text-[10px] rounded-xl uppercase tracking-wider cursor-pointer transition-all flex items-center justify-center touch-manipulation"
                        >
                            Dismiss Battle Report
                        </button>
                    </div>
                </div>
            )}

            {/* RE-AUTHENTICATION CONFIRMATION MODAL */}
            {showReauthModal && (
                <div 
                    className="fixed inset-0 z-[320] flex items-center justify-center p-3 sm:p-4 bg-black/95 md:bg-black/90 md:backdrop-blur-md animate-in fade-in duration-150 font-mono"
                    style={{
                        paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
                        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
                        paddingLeft: 'max(env(safe-area-inset-left, 0px), 12px)',
                        paddingRight: 'max(env(safe-area-inset-right, 0px), 12px)'
                    }}
                >
                    <div className="max-w-md w-full max-h-[95dvh] overflow-y-auto overscroll-contain custom-scrollbar bg-stone-950 border border-stone-750 rounded-2xl p-4 sm:p-6 shadow-2xl space-y-4 text-stone-300">
                        <div className="flex items-center gap-3 pb-3 border-b border-stone-850">
                            <div className="w-10 h-10 rounded-xl bg-red-955 border border-red-700 flex items-center justify-center text-red-400 shrink-0">
                                <Lock className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-white tracking-wider uppercase">
                                    Security Clearance Required
                                </h3>
                                <span className="text-[8.5px] text-stone-500 block">
                                    Re-authentication Confirmation
                                </span>
                            </div>
                        </div>

                        <p className="text-[9.5px] text-stone-300 leading-relaxed">
                            Transferring your registered email to <strong className="text-white font-bold">{newEmailInput.trim()}</strong> requires authorization. Please enter your current account password to confirm.
                        </p>

                        <form onSubmit={handleConfirmEmailChangeWithReauth} className="space-y-3">
                            <div className="space-y-1">
                                <label className="text-[8px] uppercase tracking-wider text-stone-400 font-bold block">
                                    Current Account Password
                                </label>
                                <input
                                    type="password"
                                    value={reauthPasswordInput}
                                    onChange={e => {
                                        setReauthPasswordInput(e.target.value);
                                        setReauthError('');
                                    }}
                                    placeholder="Enter current password..."
                                    className="w-full min-h-[44px] bg-stone-900 border border-stone-750 focus:border-red-500 rounded-xl px-3.5 py-2.5 text-xs text-stone-100 outline-none"
                                    autoFocus
                                />
                            </div>

                            {reauthError && (
                                <div className="p-2.5 rounded-xl bg-red-955/50 border border-red-800 text-[8.5px] text-red-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-red-400" />
                                    <span>{reauthError}</span>
                                </div>
                            )}

                            <div className="flex gap-2.5 justify-end pt-2 border-t border-stone-850">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowReauthModal(false);
                                        setReauthPasswordInput('');
                                        setReauthError('');
                                    }}
                                    className="px-4 py-2 min-h-[44px] bg-stone-900 hover:bg-stone-850 text-stone-400 hover:text-white font-bold text-[9px] rounded-xl border border-stone-800 uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center touch-manipulation"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isUpdatingEmail || !reauthPasswordInput}
                                    className="px-5 py-2 min-h-[44px] bg-red-650 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-[9px] rounded-xl uppercase tracking-wider transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5 touch-manipulation"
                                >
                                    {isUpdatingEmail ? 'Authorizing...' : 'Authorize & Update'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* EMAIL VERIFICATION NOTICE MODAL */}
            {showEmailVerificationModal && (
                <div 
                    className="fixed inset-0 z-[325] flex items-center justify-center p-3 sm:p-4 bg-black/95 md:bg-black/90 md:backdrop-blur-md animate-in fade-in duration-150 font-mono"
                    style={{
                        paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
                        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
                        paddingLeft: 'max(env(safe-area-inset-left, 0px), 12px)',
                        paddingRight: 'max(env(safe-area-inset-right, 0px), 12px)'
                    }}
                >
                    <div className="max-w-md w-full max-h-[95dvh] overflow-y-auto overscroll-contain custom-scrollbar bg-stone-950 border border-emerald-800/80 rounded-2xl p-4 sm:p-6 shadow-2xl text-center space-y-4 text-stone-300">
                        <div className="w-12 h-12 rounded-full bg-emerald-955 border border-emerald-600 flex items-center justify-center mx-auto text-emerald-400">
                            <Mail className="w-6 h-6" />
                        </div>
                        <h3 className="text-sm sm:text-base font-black text-white tracking-wider uppercase">
                            Verification Email Dispatched
                        </h3>
                        <p className="text-[10px] text-stone-300 leading-relaxed">
                            A security verification link has been sent to <span className="text-emerald-400 font-bold">{verificationTargetEmail}</span>.
                        </p>
                        <div className="p-3 bg-stone-900 border border-stone-800 rounded-xl text-left space-y-1.5">
                            <div className="flex items-center gap-1.5 text-stone-200 font-bold text-[9px] uppercase">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                                <span>Check Your Spam / Junk Folder</span>
                            </div>
                            <p className="text-[8.5px] text-stone-400 leading-normal">
                                Firebase automated verification emails can be routed to your <strong>Spam</strong> or <strong>Promotions</strong> folder by Gmail. Click the link inside the email to finalize binding your new address.
                            </p>
                        </div>
                        <button
                            onClick={() => setShowEmailVerificationModal(false)}
                            className="w-full py-2.5 min-h-[44px] bg-emerald-950 hover:bg-emerald-900 border border-emerald-700 text-emerald-200 hover:text-white font-bold text-[10px] rounded-xl uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center touch-manipulation"
                        >
                            Understood, Got It
                        </button>
                    </div>
                </div>
            )}

            {/* SPAM FOLDER NOTIFICATION MODAL */}
            {showSpamNoticeModal && (
                <div 
                    className="fixed inset-0 z-[320] flex items-center justify-center p-3 sm:p-4 bg-black/95 md:bg-black/90 md:backdrop-blur-md animate-in fade-in duration-150"
                    style={{
                        paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
                        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
                        paddingLeft: 'max(env(safe-area-inset-left, 0px), 12px)',
                        paddingRight: 'max(env(safe-area-inset-right, 0px), 12px)'
                    }}
                >
                    <div className="max-w-md w-full max-h-[95dvh] overflow-y-auto overscroll-contain custom-scrollbar bg-stone-950 border border-stone-800 rounded-2xl p-4 sm:p-6 shadow-2xl font-mono text-center space-y-4">
                        <div className="w-12 h-12 rounded-full bg-amber-955 border border-amber-600 flex items-center justify-center mx-auto text-amber-400">
                            <Mail className="w-6 h-6" />
                        </div>
                        <h3 className="text-sm sm:text-base font-black text-white tracking-wider uppercase">
                            Password Reset Link Sent!
                        </h3>
                        <p className="text-[10px] text-stone-300 leading-relaxed">
                            We have dispatched your password recovery link to <span className="text-amber-400 font-bold">{sentEmailTarget}</span>.
                        </p>
                        <div className="p-3 bg-amber-955/30 border border-amber-700/40 rounded-xl text-left space-y-1">
                            <div className="flex items-center gap-1.5 text-amber-400 font-bold text-[9px] uppercase">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>Check Your Spam / Junk Folder</span>
                            </div>
                            <p className="text-[8.5px] text-stone-400 leading-normal">
                                Automated Firebase security emails are frequently filtered into the <strong>Spam</strong> or <strong>Promotions</strong> folder by Gmail. If it does not appear in your inbox within 1 minute, check your Spam folder.
                            </p>
                        </div>
                        <button
                            onClick={() => setShowSpamNoticeModal(false)}
                            className="w-full py-2.5 min-h-[44px] bg-stone-800 hover:bg-stone-700 text-white font-bold text-[10px] rounded-xl uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center touch-manipulation"
                        >
                            Understood, Got It
                        </button>
                    </div>
                </div>
            )}

            {/* DELETE ACCOUNT STEP 1 */}
            {deleteStep === 1 && (
                <div 
                    className="fixed inset-0 z-[320] flex items-center justify-center p-3 sm:p-4 bg-black/95 md:bg-black/90 md:backdrop-blur-md animate-in fade-in duration-150"
                    style={{
                        paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
                        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
                        paddingLeft: 'max(env(safe-area-inset-left, 0px), 12px)',
                        paddingRight: 'max(env(safe-area-inset-right, 0px), 12px)'
                    }}
                >
                    <div className="max-w-md w-full max-h-[95dvh] overflow-y-auto overscroll-contain custom-scrollbar bg-stone-950 border border-red-800 rounded-2xl p-4 sm:p-6 shadow-2xl font-mono text-center space-y-4">
                        <div className="w-12 h-12 rounded-full bg-red-955 border border-red-700 flex items-center justify-center mx-auto text-red-400">
                            <AlertTriangle className="w-6 h-6" />
                        </div>
                        <h3 className="text-sm font-black text-red-400 tracking-wider uppercase">
                            Account Deletion Warning
                        </h3>
                        <p className="text-[10px] text-stone-300 leading-relaxed">
                            Are you sure you want to permanently erase your profile? All match histories and stats for <strong className="text-white">@{profile.username}</strong> will be permanently deleted.
                        </p>
                        <div className="flex gap-3 justify-center pt-2">
                            <button
                                onClick={() => setDeleteStep(0)}
                                className="px-4 py-2 min-h-[44px] bg-stone-900 hover:bg-stone-850 text-stone-300 font-bold text-[10px] rounded-xl uppercase tracking-wider cursor-pointer flex items-center justify-center touch-manipulation"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    audioManager.playSound('click');
                                    setDeleteStep(2);
                                }}
                                className="px-5 py-2 min-h-[44px] bg-red-700 hover:bg-red-600 text-white font-bold text-[10px] rounded-xl uppercase tracking-wider cursor-pointer shadow-md flex items-center justify-center touch-manipulation"
                            >
                                Proceed →
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* DELETE ACCOUNT STEP 2 (Prompt with highlighted text) */}
            {deleteStep === 2 && (
                <div 
                    className="fixed inset-0 z-[330] flex items-center justify-center p-3 sm:p-4 bg-black/95 md:backdrop-blur-md animate-in fade-in duration-150"
                    style={{
                        paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
                        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
                        paddingLeft: 'max(env(safe-area-inset-left, 0px), 12px)',
                        paddingRight: 'max(env(safe-area-inset-right, 0px), 12px)'
                    }}
                >
                    <div className="max-w-md w-full max-h-[95dvh] overflow-y-auto overscroll-contain custom-scrollbar bg-stone-950 border-2 border-red-700 rounded-2xl p-4 sm:p-6 shadow-2xl font-mono text-center space-y-4">
                        <div className="w-12 h-12 rounded-full bg-red-955 border border-red-600 flex items-center justify-center mx-auto text-red-400">
                            <Skull className="w-6 h-6" />
                        </div>
                        <h3 className="text-sm font-black text-red-400 tracking-wider uppercase">
                            Final Confirmation
                        </h3>
                        
                        {/* Highlighted text callout */}
                        <div className="p-3 bg-red-955/30 border border-red-800/60 rounded-xl space-y-2">
                            <p className="text-[9.5px] text-stone-300">
                                To permanently delete <span className="font-bold text-white">@{profile.username}</span>, please type:
                            </p>
                            <div className="inline-block px-3 py-1 bg-red-650/30 border border-red-500 text-red-300 font-mono font-black text-sm tracking-[0.25em] rounded-lg">
                                DELETE
                            </div>
                        </div>

                        <input
                            type="text"
                            value={deleteInputText}
                            onChange={e => setDeleteInputText(e.target.value)}
                            placeholder="Type DELETE here..."
                            className="w-full bg-stone-900 border border-red-700/80 focus:border-red-500 rounded-xl px-4 py-2.5 text-center text-sm font-black text-red-400 outline-none uppercase tracking-widest min-h-[44px]"
                            autoFocus
                        />
                        {deleteError && (
                            <span className="text-[9px] text-red-400 font-bold uppercase tracking-wider block">
                                {deleteError}
                            </span>
                        )}
                        <div className="flex gap-3 justify-center pt-2">
                            <button
                                onClick={() => {
                                    setDeleteStep(0);
                                    setDeleteInputText('');
                                    setDeleteError('');
                                }}
                                className="px-4 py-2 min-h-[44px] bg-stone-900 hover:bg-stone-850 text-stone-300 font-bold text-[10px] rounded-xl uppercase tracking-wider cursor-pointer flex items-center justify-center touch-manipulation"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                disabled={isDeleting || deleteInputText.trim().toUpperCase() !== 'DELETE'}
                                className="px-5 py-2 min-h-[44px] bg-red-700 hover:bg-red-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold text-[10px] rounded-xl uppercase tracking-wider cursor-pointer shadow-md flex items-center justify-center touch-manipulation"
                            >
                                {isDeleting ? 'Deleting...' : 'Confirm Deletion'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>,
        document.body
    );
};
