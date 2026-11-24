import React, { useState, useRef, useEffect } from 'react';
import { Send, Terminal, Smile } from 'lucide-react';
import { ChatMessage } from '../types';
import { audioManager } from '../utils/audioManager';
import { LinkPreviewCard } from './ui/LinkPreviewCard';
import { MatchInviteCard, parseMessageInvite } from './ui/MessagesModal';
import { TACTICAL_STICKERS } from '../constants';

interface ChatBoxProps {
    messages: ChatMessage[];
    onSendMessage: (text: string) => void;
    playerName?: string;
    stickers?: string[] | readonly string[];
    onJoinRoom?: (roomId: string) => void;
}

export const ChatBox: React.FC<ChatBoxProps> = ({
    messages,
    onSendMessage,
    playerName: _playerName,
    stickers = TACTICAL_STICKERS,
    onJoinRoom
}) => {
    const [inputText, setInputText] = useState('');
    const [showStickerPicker, setShowStickerPicker] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const shouldAutoScrollRef = useRef(true);

    const handleScroll = () => {
        if (!scrollRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        shouldAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 120;
    };

    useEffect(() => {
        if (scrollRef.current && shouldAutoScrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    useEffect(() => {
        if (!showStickerPicker) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setShowStickerPicker(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showStickerPicker]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (inputText.trim()) {
            audioManager.playSound('click');
            onSendMessage(inputText.trim());
            setInputText('');
            setShowStickerPicker(false);
        }
    };

    return (
        <div className="flex flex-col h-full w-full bg-stone-950 font-mono text-stone-300 md:border-l border-stone-900/30 overflow-hidden relative">
            {/* Header */}
            <div className="p-3 sm:p-5 border-b border-stone-900/40 bg-stone-900/10 flex justify-between items-center relative select-none shrink-0">
                <span className="text-[9px] sm:text-[10px] font-black tracking-[0.25em] text-stone-550 uppercase flex items-center gap-1.5">
                    <Terminal size={10} className="text-cyan-500 animate-pulse sm:w-[12px] sm:h-[12px]" />
                    ChatBox
                </span>
                <span className="text-[7px] sm:text-[8px] font-bold text-stone-600 tracking-widest bg-stone-950/60 border border-stone-900/50 px-1.5 py-0.5 rounded uppercase">
                    Live
                </span>
            </div>

            {/* Message Stream */}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 sm:p-7 space-y-3.5 scrollbar-thin scrollbar-thumb-stone-900 scrollbar-track-transparent custom-scrollbar"
            >
                <div className="text-[8px] sm:text-[9px] text-stone-600 font-bold tracking-[0.3em] uppercase text-center border-b border-stone-900/20 pb-2 mb-3.5 select-none">
                    [ CHAT AREA ]
                </div>
                {messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-center select-none opacity-20 py-20">
                        <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-[0.4em] text-stone-550">
                            — SECURED FEED ENGAGED —
                        </span>
                    </div>
                ) : (
                    (messages || [])
                        .filter(m => m && (m.sender === 'SYSTEM' 
                            ? ((m.text || '').includes('joined') || (m.text || '').includes('entered') || (m.text || '').includes('left') || (m.text || '').includes('reconnected') || (m.text || '').includes('expelled') || (m.text || '').includes('muted') || (m.text || '').includes('restored')) 
                            : !(m.text || '').startsWith('SYSTEM:'))) // Lobby displays stickers inline in the feed list
                        .map((msg, i) => {
                        const isSystem = msg.sender === 'SYSTEM';
                        return (
                            <div 
                                key={i} 
                                className={`text-[10px] sm:text-xs leading-relaxed animate-in fade-in slide-in-from-left-1 duration-200 ${
                                    isSystem 
                                        ? 'py-1.5 border-y border-stone-900/20 my-1.5 bg-stone-950/40 px-2 rounded-lg italic text-amber-500/80 font-medium' 
                                        : 'group py-1.5 px-2.5 my-0.5 rounded-lg hover:bg-stone-900/20 transition-all border border-transparent hover:border-stone-900/30'
                                    }`}
                            >
                                {!isSystem ? (
                                    <>
                                        <span 
                                            style={{ color: msg.color }} 
                                            className="font-black mr-2 uppercase tracking-wide transition-opacity opacity-90 group-hover:opacity-100 select-none"
                                        >
                                            {msg.sender}:
                                        </span>
                                        {msg.text.startsWith('[STICKER]:') ? (
                                            <div className="my-2 p-1.5 bg-stone-900/10 border border-stone-900/20 rounded-lg w-[90px] h-[90px] sm:w-[130px] sm:h-[130px] select-none">
                                                <img 
                                                    src={`/sticker/${msg.text.split(':')[1]}`} 
                                                    alt="Sticker" 
                                                    className="w-full h-full object-contain rounded-md animate-in zoom-in-95 duration-200" 
                                                    loading="lazy"
                                                    onError={(e) => {
                                                        e.currentTarget.style.display = 'none';
                                                    }}
                                                />
                                            </div>
                                        ) : (() => {
                                            const { roomId, cleanText } = parseMessageInvite(msg.text);
                                            if (roomId) {
                                                return (
                                                    <div className="flex flex-col">
                                                        {cleanText && (
                                                            <span className="text-stone-300 font-medium select-text break-all">
                                                                {cleanText}
                                                            </span>
                                                        )}
                                                        <MatchInviteCard roomId={roomId} onJoinRoom={onJoinRoom} />
                                                    </div>
                                                );
                                            }
                                            return (
                                                <span className="text-stone-300 font-medium select-text break-all">
                                                    {msg.text}
                                                </span>
                                            );
                                        })()}
                                        {(() => {
                                            const { roomId } = parseMessageInvite(msg.text);
                                            if (roomId) return null;
                                            const url = msg.text.match(/https?:\/\/[^\s]+/)?.[0];
                                            return url ? <LinkPreviewCard url={url} /> : null;
                                        })()}
                                    </>
                                ) : (
                                    <span className="tracking-wider select-text flex items-center gap-1.5">
                                        <span className="w-1 h-1 bg-amber-500 rounded-full animate-ping shrink-0" />
                                        {msg.text}
                                    </span>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Input Form */}
            <form 
                onSubmit={handleSubmit} 
                className="p-2 sm:p-3.5 border-t border-stone-900/50 bg-stone-950/90 flex items-center gap-2 relative keyboard-aware-bottom shrink-0"
                style={{
                    paddingBottom: 'max(calc(env(safe-area-inset-bottom, 0px) + env(keyboard-inset-height, 0px)), 10px)'
                }}
            >
                {/* Sticker Picker Button */}
                <button
                    type="button"
                    onClick={() => {
                        audioManager.playSound('click');
                        setShowStickerPicker(!showStickerPicker);
                    }}
                    className={`w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border transition-all active:scale-95 cursor-pointer shrink-0 shadow-md ${
                        showStickerPicker 
                            ? 'bg-stone-900 border-cyan-500/50 text-cyan-400' 
                            : 'bg-stone-900/60 border-stone-900/40 text-stone-400 hover:text-cyan-400 hover:border-cyan-500/30'
                    }`}
                    title="Select Sticker"
                    aria-label="Select Sticker"
                >
                    <Smile size={18} className="shrink-0" />
                </button>

                {/* Text Typing Area */}
                <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="ENTER LOG ENCODING..."
                    maxLength={100}
                    className="flex-grow w-0 min-w-0 min-h-[44px] bg-stone-950 border border-stone-900/70 hover:border-stone-850 focus:border-cyan-500/50 focus:bg-stone-950/90 rounded-xl px-3 sm:px-3.5 py-2 text-xs font-bold tracking-wider outline-none transition-all text-stone-200 placeholder-stone-700 shadow-inner"
                />

                {/* Send Button */}
                <button
                    type="submit"
                    className="w-11 h-11 min-w-[44px] min-h-[44px] bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-800 hover:border-cyan-500/50 text-cyan-400 hover:text-white rounded-xl transition-all active:scale-95 cursor-pointer flex items-center justify-center shadow-md shrink-0"
                    title="Send Message"
                    aria-label="Send Message"
                >
                    <Send size={16} className="shrink-0" />
                </button>

                {/* Sticker Picker Overlay */}
                {showStickerPicker && (
                    <>
                        <div 
                            className="fixed inset-0 z-40 cursor-default" 
                            onClick={() => setShowStickerPicker(false)} 
                        />
                        <div className="absolute bottom-16 sm:bottom-20 left-2 right-2 sm:right-auto z-50 p-2.5 sm:p-3 bg-stone-950/95 border border-stone-900 rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.15)] flex flex-col gap-1.5 w-auto sm:w-64 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <span className="text-[8px] font-black text-stone-500 tracking-[0.2em] border-b border-stone-900/60 pb-1 uppercase select-none block">
                                Tactical Stickers
                            </span>
                            <div className="grid grid-cols-4 gap-2 overflow-y-auto max-h-52 custom-scrollbar pr-0.5">
                                {stickers.map((stk) => {
                                    const isGif = stk.endsWith('.gif');
                                    return (
                                        <button
                                            key={stk}
                                            type="button"
                                            onClick={() => {
                                                audioManager.playSound('click');
                                                onSendMessage('[STICKER]:' + stk);
                                                setShowStickerPicker(false);
                                            }}
                                            className="relative w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg border border-stone-850 bg-stone-950 hover:bg-stone-900 hover:border-cyan-500/60 p-1 active:scale-95 transition-all cursor-pointer"
                                            title={stk}
                                            aria-label={stk}
                                        >
                                            <img 
                                                src={`/sticker/${stk}`} 
                                                alt={stk} 
                                                className="w-full h-full object-contain rounded" 
                                                loading="lazy"
                                                onError={(e) => {
                                                    e.currentTarget.style.display = 'none';
                                                }}
                                            />
                                            {isGif && (
                                                <span className="absolute bottom-0.5 right-0.5 text-[6px] font-black bg-cyan-950/90 text-cyan-400 border border-cyan-800/60 px-1 rounded uppercase tracking-tighter">
                                                    GIF
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}
            </form>
        </div>
    );
};
