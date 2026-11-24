import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
    AlertTriangle, 
    ShieldAlert, 
    Info, 
    Trash2, 
    LogOut, 
    Download, 
    X, 
    Check, 
    Terminal, 
    Shield
} from 'lucide-react';
import { modalService, ModalRequest } from '../../utils/modalService';
import { audioManager } from '../../utils/audioManager';

export const ConfirmModalHost: React.FC = () => {
    const [request, setRequest] = useState<ModalRequest | null>(null);

    useEffect(() => {
        const unsubscribe = modalService.subscribe((req) => {
            setRequest(req);
            if (req) {
                try {
                    audioManager.playSound('click');
                } catch (e) {
                    // Audio context might be restricted before interaction
                }
            }
        });
        return unsubscribe;
    }, []);

    // Keyboard support: Escape = Cancel, Enter = Confirm
    useEffect(() => {
        if (!request) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                audioManager.playSound('click');
                modalService.respond(false);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                audioManager.playSound('click');
                modalService.respond(true);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [request]);

    if (!request || typeof document === 'undefined') return null;

    const isDanger = request.isDanger ?? (request.type === 'danger');
    const isAlert = request.type === 'alert';

    const handleConfirm = () => {
        audioManager.playSound('click');
        modalService.respond(true);
    };

    const handleCancel = () => {
        audioManager.playSound('click');
        modalService.respond(false);
    };

    // Pick icon based on requested icon or modal context
    const renderIcon = () => {
        const iconType = request.icon;
        if (iconType === 'trash') {
            return <Trash2 className="w-5 h-5 text-red-400" />;
        }
        if (iconType === 'logout') {
            return <LogOut className="w-5 h-5 text-red-400" />;
        }
        if (iconType === 'download') {
            return <Download className="w-5 h-5 text-cyan-400" />;
        }
        if (iconType === 'shield') {
            return <Shield className="w-5 h-5 text-amber-400" />;
        }
        if (iconType === 'info' || isAlert) {
            return <Info className="w-5 h-5 text-cyan-400" />;
        }
        if (isDanger) {
            return <ShieldAlert className="w-5 h-5 text-red-400 animate-pulse" />;
        }
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
    };

    const confirmLabel = request.confirmText || (isAlert ? 'ACKNOWLEDGE' : (isDanger ? 'CONFIRM' : 'PROCEED'));
    const cancelLabel = request.cancelText || 'CANCEL';
    const titleText = request.title || (isDanger ? 'SECURITY PROTOCOL' : (isAlert ? 'TERMINAL NOTICE' : 'CONFIRM ACTION'));

    return createPortal(
        <div 
            className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 select-none animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            style={{
                paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
                paddingLeft: 'max(env(safe-area-inset-left, 0px), 12px)',
                paddingRight: 'max(env(safe-area-inset-right, 0px), 12px)'
            }}
        >
            {/* Backdrop with dark blur */}
            <div 
                className="fixed inset-0 bg-black/85 backdrop-blur-md transition-opacity" 
                onClick={handleCancel}
            />

            {/* Inbuilt Tactical Modal Box */}
            <div className="relative w-full max-w-md bg-stone-950 border border-stone-800 rounded-2xl shadow-[0_0_60px_rgba(0,0,0,0.95)] overflow-hidden font-mono z-10 transition-all scale-100 animate-in zoom-in-95 duration-200">
                {/* Decorative Top Accent Glow Bar */}
                <div 
                    className={`h-1 w-full ${
                        isDanger 
                            ? 'bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_15px_rgba(239,68,68,0.8)]' 
                            : 'bg-gradient-to-r from-transparent via-cyan-500 to-transparent shadow-[0_0_15px_rgba(6,182,212,0.8)]'
                    }`} 
                />

                {/* Tactical Corner Brackets */}
                <div className="absolute top-2 left-2 w-2.5 h-2.5 border-t border-l border-stone-700/60 pointer-events-none" />
                <div className="absolute top-2 right-2 w-2.5 h-2.5 border-t border-r border-stone-700/60 pointer-events-none" />
                <div className="absolute bottom-2 left-2 w-2.5 h-2.5 border-b border-l border-stone-700/60 pointer-events-none" />
                <div className="absolute bottom-2 right-2 w-2.5 h-2.5 border-b border-r border-stone-700/60 pointer-events-none" />

                {/* Content Container */}
                <div className="p-5 sm:p-6 space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div 
                                className={`p-2.5 rounded-xl border shrink-0 ${
                                    isDanger 
                                        ? 'bg-red-955/40 border-red-800/80 shadow-[0_0_20px_rgba(220,38,38,0.25)]' 
                                        : 'bg-cyan-955/40 border-cyan-800/80 shadow-[0_0_20px_rgba(6,182,212,0.2)]'
                                }`}
                            >
                                {renderIcon()}
                            </div>
                            <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] uppercase font-black tracking-widest text-stone-500">
                                    <Terminal size={11} className="text-stone-500" />
                                    <span>BUGSHOT // PROTOCOL</span>
                                </div>
                                <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-white leading-snug">
                                    {titleText}
                                </h3>
                            </div>
                        </div>

                        {/* Dismiss X */}
                        <button
                            onClick={handleCancel}
                            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-500 hover:text-stone-300 hover:bg-stone-900 rounded-xl transition-colors cursor-pointer shrink-0"
                            title="Close"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Message Body */}
                    <div className="bg-stone-900/40 border border-stone-850/80 rounded-xl p-3.5 sm:p-4">
                        <p className="text-xs sm:text-sm text-stone-200 leading-relaxed font-sans sm:font-mono whitespace-pre-wrap select-text break-words">
                            {request.message}
                        </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-end gap-2.5 pt-2">
                        {!isAlert && (
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="px-4 py-2.5 min-h-[44px] flex items-center justify-center bg-stone-900/80 hover:bg-stone-800 border border-stone-750 hover:border-stone-600 text-stone-300 hover:text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
                            >
                                {cancelLabel}
                            </button>
                        )}
                        <button
                            type="button"
                            autoFocus
                            onClick={handleConfirm}
                            className={`px-5 py-2.5 min-h-[44px] rounded-xl text-xs font-black uppercase tracking-widest transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 ${
                                isDanger
                                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_25px_rgba(220,38,38,0.45)] border border-red-500'
                                    : 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-[0_0_25px_rgba(6,182,212,0.35)] border border-cyan-300'
                            }`}
                        >
                            <Check size={14} className="stroke-[3]" />
                            {confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
