import React, { useState, useEffect } from 'react';
import { Mail, Lock, AlertTriangle, ShieldCheck, X, CheckCircle2 } from 'lucide-react';
import { UserProfile, completeLegacyMigration } from '../../utils/firebaseService';

interface MigrationModalProps {
    isOpen: boolean;
    legacyUser: UserProfile | null;
    onClose: () => void;
    onMigrationSuccess: (user: UserProfile) => void;
}

export const MigrationModal: React.FC<MigrationModalProps> = ({
    isOpen,
    legacyUser,
    onClose,
    onMigrationSuccess
}) => {
    const hasExistingPassword = Boolean(legacyUser?.legacyPasswordHash);
    const [email, setEmail] = useState('');
    const [forceSetPassword, setForceSetPassword] = useState(!hasExistingPassword);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (legacyUser) {
            setForceSetPassword(!legacyUser.legacyPasswordHash);
            setError(null);
        }
    }, [legacyUser?.username, legacyUser?.legacyPasswordHash]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !loading) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, loading, onClose]);

    if (!isOpen || !legacyUser) return null;

    const handleMigration = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
            setError('Please enter a valid Gmail address.');
            return;
        }
        if (!cleanEmail.endsWith('@gmail.com') && !cleanEmail.endsWith('@googlemail.com')) {
            setError('Please enter a valid Gmail address (@gmail.com).');
            return;
        }

        let passwordToSet: string | undefined = legacyUser.legacyPasswordHash;

        // If user didn't have an Upstash password, or needs to set a new password
        if (forceSetPassword || !hasExistingPassword) {
            if (!newPassword || newPassword.length < 6) {
                setError('Account password must be at least 6 characters.');
                return;
            }
            if (newPassword !== confirmPassword) {
                setError('Passwords do not match.');
                return;
            }
            passwordToSet = newPassword;
        }

        setLoading(true);
        try {
            const res = await completeLegacyMigration(
                legacyUser.username,
                cleanEmail,
                passwordToSet
            );

            if (res.success && res.user) {
                onMigrationSuccess(res.user);
            } else {
                // If old password failed (e.g. fewer than 6 chars required by Firebase), allow setting password
                if (res.error && res.error.toLowerCase().includes('password')) {
                    setForceSetPassword(true);
                }
                setError(res.error || 'Migration failed. Please try again.');
            }
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred during migration.');
        } finally {
            setLoading(false);
        }
    };

    const wins = legacyUser.stats?.wins || 0;
    const totalRounds = legacyUser.stats?.totalRounds || 0;

    return (
        <div 
            className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn"
            role="dialog"
            aria-modal="true"
            aria-label="Account Security Migration"
            style={{
                paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
                paddingLeft: 'max(env(safe-area-inset-left, 0px), 12px)',
                paddingRight: 'max(env(safe-area-inset-right, 0px), 12px)'
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget && !loading) {
                    onClose();
                }
            }}
        >
            <div className="relative w-full max-w-md bg-stone-950 border border-emerald-500/40 rounded-2xl shadow-2xl shadow-emerald-950/40 p-6 md:p-7 text-white font-mono">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    disabled={loading}
                    className="absolute top-2.5 right-2.5 w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-400 hover:text-white rounded-xl transition-colors cursor-pointer"
                    title="Cancel & Log Out"
                >
                    <X size={20} />
                </button>

                {/* Header Icon & Title */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 flex items-center justify-center text-xl shadow-inner">
                        <ShieldCheck className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black tracking-tight text-white uppercase">
                            Cloud Account Upgrade
                        </h2>
                        <p className="text-[10px] text-emerald-400 font-mono uppercase tracking-wider">
                            Firebase Mainframe Migration
                        </p>
                    </div>
                </div>

                {/* Legacy Stats Summary Card */}
                <div className="bg-stone-900/90 border border-stone-800 rounded-xl p-3.5 mb-4 text-xs">
                    <p className="text-stone-300 mb-1.5 font-bold">
                        Welcome back, <span className="text-emerald-400">@{legacyUser.username}</span>!
                    </p>
                    <p className="text-[11px] text-stone-400 leading-relaxed font-sans">
                        BugShot Roulette has upgraded to high-speed Firebase Cloud. All of your historical records
                        (<span className="text-white font-semibold">{wins} Wins</span>,{' '}
                        <span className="text-white font-semibold">{totalRounds} Rounds Played</span>)
                        have been preserved! Link your Gmail below to activate your account.
                    </p>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-950/80 border border-red-500/50 rounded-xl text-red-200 text-xs flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleMigration} className="space-y-3.5">
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-300 mb-1 flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Gmail / Email Address</span>
                            <span className="text-emerald-400">*</span>
                        </label>
                        <input
                            type="email"
                            required
                            placeholder="yourname@gmail.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            disabled={loading}
                            className="w-full px-3.5 py-2.5 min-h-[44px] bg-stone-900 border border-stone-750 rounded-xl text-white placeholder-stone-500 text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                        />
                        <p className="text-[10px] text-stone-500 mt-1 font-sans">
                            Required for cloud synchronization, security verification, and recovery.
                        </p>
                    </div>

                    {/* If user already has Upstash password, retain old password and only ask for Gmail */}
                    {hasExistingPassword && !forceSetPassword ? (
                        <div className="p-2.5 bg-emerald-955/20 border border-emerald-600/40 rounded-xl text-[10.5px] text-emerald-300 flex items-center gap-2 font-mono">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span>Old password verified & retained. No new password required.</span>
                        </div>
                    ) : (
                        <div className="space-y-2.5 pt-1 animate-fadeIn">
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-300 mb-1 flex items-center gap-1.5">
                                    <Lock className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>Account Password</span>
                                    <span className="text-emerald-400">*</span>
                                </label>
                                <input
                                    type="password"
                                    required
                                    placeholder="At least 6 characters"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    disabled={loading}
                                    className="w-full px-3.5 py-2.5 min-h-[44px] bg-stone-900 border border-stone-750 rounded-xl text-white placeholder-stone-500 text-xs focus:outline-none focus:border-emerald-500 transition-all font-mono"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wider text-stone-300 mb-1 flex items-center gap-1.5">
                                    <Lock className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>Confirm Password</span>
                                    <span className="text-emerald-400">*</span>
                                </label>
                                <input
                                    type="password"
                                    required
                                    placeholder="Re-enter password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    disabled={loading}
                                    className="w-full px-3.5 py-2.5 min-h-[44px] bg-stone-900 border border-stone-750 rounded-xl text-white placeholder-stone-500 text-xs focus:outline-none focus:border-emerald-500 transition-all font-mono"
                                />
                            </div>
                        </div>
                    )}

                    <div className="p-2.5 bg-amber-955/20 border border-amber-800/40 rounded-xl text-[10px] text-amber-300/90 leading-tight font-sans">
                        ⚠️ Linking your Gmail is mandatory to continue using this account. Canceling will log you out to guest mode.
                    </div>

                    <div className="pt-2 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="flex-1 py-2.5 px-3 min-h-[44px] bg-stone-900 hover:bg-stone-850 border border-stone-800 hover:border-red-800/60 text-stone-300 hover:text-red-300 font-bold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center"
                        >
                            Cancel (Log Out)
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 py-2.5 px-3 min-h-[44px] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-emerald-950/50 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider"
                        >
                            {loading ? (
                                <>
                                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>Migrating...</span>
                                </>
                            ) : (
                                <span>Complete Upgrade</span>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
