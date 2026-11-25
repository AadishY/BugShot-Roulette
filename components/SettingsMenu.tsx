import React, { useState, useEffect, useMemo } from 'react';
import { GameSettings } from '../types';
import { X, Monitor, Scaling, Eye, RotateCcw, LogOut, Volume2, VolumeX, Sun, Sparkles, Smartphone, Laptop } from 'lucide-react';
import { audioManager } from '../utils/audioManager';
import { isMobileOrNarrowScreen, getGraphicsPreset, GraphicsPresetTier } from '../constants';

interface SettingsMenuProps {
    settings: GameSettings;
    onUpdateSettings: (newSettings: GameSettings) => void;
    onClose: () => void;
    onResetDefaults: () => void;
    onExitToMenu?: () => void;
    showExitToMenu?: boolean;
    isMultiplayer?: boolean;
}

// Custom Slider Component with 40px+ touch target ergonomics, keyboard accessibility, and pointer capture
const CustomSlider: React.FC<{
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (val: number) => void;
    ariaLabel?: string;
}> = ({ min, max, step, value, onChange, ariaLabel }) => {
    const trackRef = React.useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = React.useState(false);

    const updateValue = (clientX: number) => {
        if (!trackRef.current) return;
        const rect = trackRef.current.getBoundingClientRect();
        const percent = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        const rawValue = min + percent * (max - min);
        // Stick to step
        const steppedValue = Math.round(rawValue / step) * step;
        const clampedValue = Math.min(max, Math.max(min, steppedValue));
        onChange(clampedValue);
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
        updateValue(e.clientX);
        const target = e.currentTarget;
        target.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging) return;
        updateValue(e.clientX);
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging) return;
        setIsDragging(false);
        const target = e.currentTarget;
        try {
            target.releasePointerCapture(e.pointerId);
        } catch (err) {}
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            const next = Math.min(max, value + step);
            onChange(Number(next.toFixed(2)));
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            const prev = Math.max(min, value - step);
            onChange(Number(prev.toFixed(2)));
        } else if (e.key === 'Home') {
            e.preventDefault();
            onChange(min);
        } else if (e.key === 'End') {
            e.preventDefault();
            onChange(max);
        }
    };

    // Calculate percent for visual rendering
    const percent = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

    return (
        <div
            className="relative w-full h-12 min-h-[44px] flex items-center touch-none select-none cursor-pointer py-2 group focus:outline-none"
            ref={trackRef}
            tabIndex={0}
            role="slider"
            aria-label={ariaLabel}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={value}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleKeyDown}
            style={{ touchAction: 'none' }}
        >
            {/* Track Background */}
            <div className="absolute w-full h-3 bg-stone-850 rounded-full overflow-hidden border border-stone-800 shadow-inner group-focus:border-red-500/50">
                {/* Fill */}
                <div
                    className="h-full bg-gradient-to-r from-red-700 via-red-600 to-red-500 rounded-full transition-all duration-75"
                    style={{ width: `${percent}%` }}
                />
            </div>

            {/* Thumb - Ergonomic Touch Target (28px touch circle with 48px hit area) */}
            <div
                className={`absolute w-7 h-7 min-w-[28px] min-h-[28px] bg-red-600 rounded-full border-2 border-stone-100 cursor-grab active:cursor-grabbing shadow-[0_2px_10px_rgba(0,0,0,0.8)] z-10 transition-transform ${
                    isDragging ? 'scale-125 ring-4 ring-red-500/40' : 'group-hover:scale-110'
                }`}
                style={{ left: `calc(${percent}% - 14px)` }}
            />
        </div>
    );
};

export const SettingsMenu: React.FC<SettingsMenuProps> = ({ settings, onUpdateSettings, onClose, onResetDefaults, onExitToMenu, showExitToMenu, isMultiplayer }) => {
    const isMobileDevice = useMemo(() => isMobileOrNarrowScreen(), []);
    const currentGraphicsMode: GraphicsPresetTier = getGraphicsPreset(settings);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                audioManager.playSound('click');
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleChange = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
        const updated: GameSettings = { ...settings, [key]: value };
        if (key === 'graphicsMode') {
            audioManager.playSound('click');
            const mode = value as string;
            updated.ultraPerformance = mode === 'potato';
            updated.balancedPerformance = mode === 'balanced' || mode === 'low';
        } else if (key === 'orientationMode') {
            audioManager.playSound('click');
        }
        onUpdateSettings(updated);
    };

    return (
        <div
            className="fixed inset-0 z-[250] flex flex-col items-center justify-center bg-black/65 backdrop-blur-xl p-2 sm:p-4 overflow-y-auto custom-scrollbar"
            role="dialog"
            aria-modal="true"
            aria-label="Game Settings"
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    onClose();
                }
            }}
            style={{
                paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
                paddingLeft: 'max(env(safe-area-inset-left, 0px), 8px)',
                paddingRight: 'max(env(safe-area-inset-right, 0px), 8px)'
            }}
        >
            <div
                className="w-full max-w-[min(96vw,calc(100vw-16px))] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[95dvh] sm:max-h-[92vh] bg-stone-950/75 backdrop-blur-2xl border border-stone-700/60 shadow-[0_30px_90px_rgba(0,0,0,0.95)] relative flex flex-col overflow-hidden rounded-2xl ring-1 ring-white/10 my-auto overscroll-contain"
            >
                {/* Decorative */}
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-stone-500/20 to-transparent" />

                {/* Header */}
                <div className="p-2.5 sm:p-4 border-b border-stone-800/50 flex justify-between items-center bg-stone-950/20 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-stone-900/60 rounded-xl border border-stone-800 flex items-center justify-center text-stone-400">
                            <Monitor size={18} />
                        </div>
                        <div>
                            <h2 className="text-sm sm:text-base font-black text-white tracking-[0.2em] uppercase leading-tight">SETTINGS</h2>
                            <p className="text-[8px] sm:text-[9px] text-stone-500 font-bold tracking-[0.3em] uppercase">Display, Audio &amp; Controls</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-stone-500 hover:text-white hover:bg-white/5 rounded-full transition-all active:scale-95 cursor-pointer touch-manipulation"
                        title="Close Settings"
                        aria-label="Close Settings"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-2.5 sm:p-5 space-y-3 sm:space-y-5 custom-scrollbar overscroll-contain">

                    {/* Visuals Group */}
                    <div className="space-y-3 sm:space-y-4">
                        <div className="flex items-center gap-2">
                            <h3 className="text-stone-500 font-extrabold tracking-[0.2em] uppercase text-[9px] sm:text-[10px]">Graphics</h3>
                            <div className="h-[1px] flex-1 bg-stone-800/30" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 sm:gap-y-4">
                            {/* Pixelation */}
                            <div className="space-y-1">
                                <div className="flex justify-between items-end">
                                    <span className="text-stone-300 font-bold tracking-widest text-[9px] sm:text-[10px] uppercase">Resolution</span>
                                    <span className="text-white font-black text-[10px] tabular-nums bg-stone-900 px-1.5 py-0.5 rounded border border-white/5">{settings.pixelScale.toFixed(1)}x</span>
                                </div>
                                <CustomSlider
                                    min={1} max={6} step={0.5}
                                    value={settings.pixelScale}
                                    onChange={(val) => handleChange('pixelScale', val)}
                                />
                            </div>

                            {/* Brightness */}
                            <div className="space-y-1">
                                <div className="flex justify-between items-end">
                                    <span className="text-stone-300 font-bold tracking-widest text-[9px] sm:text-[10px] uppercase">Brightness</span>
                                    <span className="text-white font-black text-[10px] tabular-nums bg-stone-900 px-1.5 py-0.5 rounded border border-white/5">{(settings.brightness * 100).toFixed(0)}%</span>
                                </div>
                                <CustomSlider
                                    min={0.1} max={2.0} step={0.1}
                                    value={settings.brightness}
                                    onChange={(val) => handleChange('brightness', val)}
                                />
                            </div>

                            {/* HUD Scale */}
                            <div className="space-y-1">
                                <div className="flex justify-between items-end">
                                    <span className="text-stone-300 font-bold tracking-widest text-[9px] sm:text-[10px] uppercase">HUD Scale</span>
                                    <span className="text-white font-black text-[10px] tabular-nums bg-stone-900 px-1.5 py-0.5 rounded border border-white/5">{settings.uiScale.toFixed(2)}x</span>
                                </div>
                                <CustomSlider
                                    min={0.0} max={1.4} step={0.1}
                                    value={settings.uiScale}
                                    onChange={(val) => handleChange('uiScale', val)}
                                />
                            </div>

                            {/* FOV */}
                            <div className="space-y-1">
                                <div className="flex justify-between items-end">
                                    <span className="text-stone-300 font-bold tracking-widest text-[9px] sm:text-[10px] uppercase">Field of View</span>
                                    <span className="text-white font-black text-[10px] tabular-nums bg-stone-900 px-1.5 py-0.5 rounded border border-white/5">{settings.fov || 85}°</span>
                                </div>
                                <CustomSlider
                                    min={60} max={110} step={1}
                                    value={settings.fov || 85}
                                    onChange={(val) => handleChange('fov', val)}
                                />
                            </div>
                        </div>

                        {/* Screen Orientation Preference (Mobile / Compact Devices) */}
                        <div className="p-2.5 sm:p-3 bg-stone-950/65 border border-stone-700/70 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            <div className="min-w-0">
                                <span className="text-stone-300 font-bold tracking-widest text-[9px] sm:text-[10px] uppercase block">Screen Orientation</span>
                                <span className="text-[8px] sm:text-[9px] text-stone-500 font-bold tracking-wider block mt-0.5 leading-snug">
                                    Choose Landscape (Auto) or Force Vertical mode with portrait-calibrated UI &amp; camera framing.
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => handleChange('orientationMode', 'auto')}
                                    className={`px-3 py-2 min-h-[40px] rounded-lg border text-[9px] font-black tracking-widest uppercase transition-all cursor-pointer touch-manipulation ${
                                        settings.orientationMode !== 'vertical'
                                            ? 'bg-emerald-950/50 border-emerald-500/80 text-emerald-300'
                                            : 'bg-stone-900/60 border-stone-800 text-stone-400 hover:text-stone-200'
                                    }`}
                                >
                                    Landscape
                                </button>
                                <button
                                    type="button"
                                    data-testid="toggle-force-vertical-setting"
                                    onClick={() => handleChange('orientationMode', 'vertical')}
                                    className={`px-3 py-2 min-h-[40px] rounded-lg border text-[9px] font-black tracking-widest uppercase transition-all cursor-pointer touch-manipulation ${
                                        settings.orientationMode === 'vertical'
                                            ? 'bg-amber-950/50 border-amber-500/80 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                                            : 'bg-stone-900/60 border-stone-800 text-stone-400 hover:text-stone-200'
                                    }`}
                                >
                                    Force Vertical
                                </button>
                            </div>
                        </div>

                        {/* Graphics Quality Profile Selector */}
                        <div className="p-2.5 sm:p-3 bg-stone-950/65 border border-stone-700/70 rounded-xl space-y-2.5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                    <span className="text-stone-300 font-bold tracking-widest text-[9px] sm:text-[10px] uppercase block">Graphics Quality Profile</span>
                                    <div className="h-[1px] w-8 sm:w-16 bg-gradient-to-r from-stone-700/60 to-transparent" />
                                </div>
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-stone-900 border border-stone-800 text-[8px] font-mono">
                                    {isMobileDevice ? (
                                        <>
                                            <Smartphone size={10} className="text-cyan-400" />
                                            <span className="text-stone-400">HARDWARE: <strong className="text-orange-400">MOBILE</strong> (DEFAULT: LOW)</span>
                                        </>
                                    ) : (
                                        <>
                                            <Laptop size={10} className="text-cyan-400" />
                                            <span className="text-stone-400">HARDWARE: <strong className="text-green-400">DESKTOP</strong> (DEFAULT: BALANCED)</span>
                                        </>
                                    )}
                                </div>
                            </div>
                            <span className="text-[8px] sm:text-[9px] text-stone-500 font-bold uppercase tracking-wider block -mt-1">Select performance layout optimized for your device hardware.</span>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2.5">
                                {/* HIGH */}
                                <button
                                    type="button"
                                    title="ACESFilmic tone mapping, warm/cool rim lighting, crisp shadows, volumetric dust & muzzle glow, smooth reflections"
                                    onClick={() => handleChange('graphicsMode', 'high')}
                                    className={`flex flex-col items-center justify-center min-h-[46px] gap-1 py-2.5 px-2 text-[8px] sm:text-[9.5px] font-black tracking-widest uppercase transition-all rounded-xl border active:scale-95 cursor-pointer touch-manipulation ${currentGraphicsMode === 'high' ? 'bg-sky-950/50 text-sky-300 border-sky-500/80 shadow-[0_0_16px_rgba(56,189,248,0.25)]' : 'bg-stone-900/40 text-stone-400 border-stone-800/60 hover:bg-stone-900/80 hover:text-stone-300'}`}
                                >
                                    <span className="text-base leading-none">🌟</span>
                                    <span>HIGH</span>
                                    <span className="text-[7px] font-semibold opacity-75 normal-case tracking-normal">Cinematic PBR + Glow</span>
                                </button>
                                {/* BALANCED */}
                                <button
                                    type="button"
                                    title="Rich 60fps default with sharp key/fill balance, smooth PCF shadows, and specular metal/wood response"
                                    onClick={() => handleChange('graphicsMode', 'balanced')}
                                    className={`flex flex-col items-center justify-center min-h-[46px] gap-1 py-2.5 px-2 text-[8px] sm:text-[9.5px] font-black tracking-widest uppercase transition-all rounded-xl border active:scale-95 cursor-pointer touch-manipulation ${currentGraphicsMode === 'balanced' ? 'bg-green-950/50 text-green-300 border-green-500/80 shadow-[0_0_16px_rgba(74,222,128,0.25)]' : 'bg-stone-900/40 text-stone-400 border-stone-800/60 hover:bg-stone-900/80 hover:text-stone-300'}`}
                                >
                                    <span className="text-base leading-none">⚖️</span>
                                    <span className="flex items-center gap-1">BALANCED {!isMobileDevice && <span className="text-[6px] text-green-400 bg-green-950/50 px-1 py-0.2 rounded border border-green-800/60">PC</span>}</span>
                                    <span className="text-[7px] font-semibold opacity-75 normal-case tracking-normal">60 FPS + Specular</span>
                                </button>
                                {/* LOW */}
                                <button
                                    type="button"
                                    title="Atmospheric bunker fog, subtle contrast & readable shadows/highlights tuned for fast Android GPU performance"
                                    onClick={() => handleChange('graphicsMode', 'low')}
                                    className={`flex flex-col items-center justify-center min-h-[46px] gap-1 py-2.5 px-2 text-[8px] sm:text-[9.5px] font-black tracking-widest uppercase transition-all rounded-xl border active:scale-95 cursor-pointer touch-manipulation ${currentGraphicsMode === 'low' ? 'bg-orange-950/50 text-orange-300 border-orange-500/80 shadow-[0_0_16px_rgba(249,115,22,0.25)]' : 'bg-stone-900/40 text-stone-400 border-stone-800/60 hover:bg-stone-900/80 hover:text-stone-300'}`}
                                >
                                    <span className="text-base leading-none">⚡</span>
                                    <span className="flex items-center gap-1">LOW {isMobileDevice && <span className="text-[6px] text-orange-400 bg-orange-950/50 px-1 py-0.2 rounded border border-orange-800/60">PHONE</span>}</span>
                                    <span className="text-[7px] font-semibold opacity-75 normal-case tracking-normal">Atmospheric + Fast</span>
                                </button>
                                {/* POTATO */}
                                <button
                                    type="button"
                                    title="Ultra-fast barebones playable mode with minimal draw overhead, crisp readability, and zero shader stalls"
                                    onClick={() => handleChange('graphicsMode', 'potato')}
                                    className={`flex flex-col items-center justify-center min-h-[46px] gap-1 py-2.5 px-2 text-[8px] sm:text-[9.5px] font-black tracking-widest uppercase transition-all rounded-xl border active:scale-95 cursor-pointer touch-manipulation ${currentGraphicsMode === 'potato' ? 'bg-red-955/40 text-red-300 border-red-500/80 shadow-[0_0_16px_rgba(239,68,68,0.25)]' : 'bg-stone-900/40 text-stone-400 border-stone-800/60 hover:bg-stone-900/80 hover:text-stone-300'}`}
                                >
                                    <span className="text-base leading-none">🥔</span>
                                    <span>POTATO</span>
                                    <span className="text-[7px] font-semibold opacity-75 normal-case tracking-normal">Barebones / Max FPS</span>
                                </button>
                            </div>
                            <p className="text-[7.5px] sm:text-[8px] text-stone-500 uppercase tracking-widest leading-relaxed">
                                {currentGraphicsMode === 'high' && "🌟 High: ACESFilmic tone mapping, warm/cool rim separation, crisp shadows, volumetric dust & muzzle glow, smooth reflections with FPS protection."}
                                {currentGraphicsMode === 'balanced' && "⚖️ Balanced: Rich 60fps default with sharp key/fill balance, smooth PCF shadows, and specular metal/wood response."}
                                {currentGraphicsMode === 'low' && "⚡ Low: Atmospheric lighting, bunker fog, subtle contrast & readable highlights tuned for fast Android GPUs."}
                                {currentGraphicsMode === 'potato' && "🥔 Potato: Ultra-fast barebones playable mode with minimal draw overhead, crisp readability, and zero shader stalls."}
                            </p>
                        </div>


                    </div>

                    {/* Audio Group */}
                    <div className="space-y-3 sm:space-y-4">
                        <div className="flex items-center gap-2">
                            <h3 className="text-stone-500 font-extrabold tracking-[0.2em] uppercase text-[9px] sm:text-[10px]">Sound</h3>
                            <div className="h-[1px] flex-1 bg-stone-800/30" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 sm:gap-y-4">
                            {/* Music Volume */}
                            <div className="space-y-1">
                                <div className="flex justify-between items-end">
                                    <span className="text-stone-300 font-bold tracking-widest text-[9px] sm:text-[10px] uppercase">Music</span>
                                    <span className="text-white font-black text-[10px] tabular-nums bg-stone-900 px-1.5 py-0.5 rounded border border-white/5">{Math.round((settings.musicVolume ?? 0.5) * 100)}%</span>
                                </div>
                                <CustomSlider
                                    min={0} max={1} step={0.1}
                                    value={settings.musicVolume ?? 0.5}
                                    onChange={(val) => handleChange('musicVolume', val)}
                                />
                            </div>

                            {/* SFX Volume */}
                            <div className="space-y-1">
                                <div className="flex justify-between items-end">
                                    <span className="text-stone-300 font-bold tracking-widest text-[9px] sm:text-[10px] uppercase">Effects</span>
                                    <span className="text-white font-black text-[10px] tabular-nums bg-stone-900 px-1.5 py-0.5 rounded border border-white/5">{Math.round((settings.sfxVolume ?? 0.7) * 100)}%</span>
                                </div>
                                <CustomSlider
                                    min={0} max={1} step={0.1}
                                    value={settings.sfxVolume ?? 0.7}
                                    onChange={(val) => handleChange('sfxVolume', val)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Experimental Group */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <h3 className="text-amber-400 font-extrabold tracking-[0.2em] uppercase text-[9px] sm:text-[10px]">Experimental</h3>
                            <div className="h-[1px] flex-1 bg-amber-900/30" />
                        </div>

                        <div className="p-2.5 sm:p-3 bg-amber-950/15 border border-amber-800/35 rounded-xl space-y-2.5">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <span className="text-stone-200 font-bold tracking-widest text-[9px] sm:text-[10px] uppercase block">
                                        Direct 3D Gun &amp; Table Aiming
                                    </span>
                                    <span className="text-[8px] sm:text-[9px] text-stone-400 font-bold tracking-wider block mt-0.5 leading-relaxed">
                                        Hides Grab &amp; Shoot HUD buttons and in-game click hint banners for a clean 3D table view.
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    data-testid="toggle-experimental-direct-aim"
                                    onClick={() => {
                                        audioManager.playSound('click');
                                        handleChange('experimentalDirectAim', !settings.experimentalDirectAim);
                                    }}
                                    className={`px-3.5 py-2 min-h-[44px] text-[9px] sm:text-[10px] font-black tracking-widest uppercase transition-all rounded-lg border active:scale-95 cursor-pointer flex items-center justify-center shrink-0 touch-manipulation ${
                                        settings.experimentalDirectAim
                                            ? 'bg-amber-600 hover:bg-amber-500 text-stone-950 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.35)]'
                                            : 'bg-transparent hover:bg-stone-900 text-stone-400 border-stone-800'
                                    }`}
                                >
                                    {settings.experimentalDirectAim ? 'Enabled' : 'Disabled'}
                                </button>
                            </div>

                            {/* Direct 3D Aiming Controls Guide (kept in Settings instead of on-screen HUD text) */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-2 pt-2 border-t border-amber-900/30">
                                <div className="bg-black/45 border border-amber-900/35 rounded-lg px-2.5 py-2">
                                    <span className="text-[8px] font-black uppercase tracking-widest text-amber-400 block">1. Grab Shotgun</span>
                                    <span className="text-[8.5px] sm:text-[9px] text-stone-300 font-semibold leading-snug block mt-0.5">
                                        Click or tap the 3D shotgun on the table to pick it up.
                                    </span>
                                </div>
                                <div className="bg-black/45 border border-red-900/35 rounded-lg px-2.5 py-2">
                                    <span className="text-[8px] font-black uppercase tracking-widest text-red-400 block">2. Shoot Opponent</span>
                                    <span className="text-[8.5px] sm:text-[9px] text-stone-300 font-semibold leading-snug block mt-0.5">
                                        Click or tap the opponent across (or side seats in 3P/4P).
                                    </span>
                                </div>
                                <div className="bg-black/45 border border-cyan-900/35 rounded-lg px-2.5 py-2">
                                    <span className="text-[8px] font-black uppercase tracking-widest text-cyan-400 block">3. Shoot Yourself</span>
                                    <span className="text-[8.5px] sm:text-[9px] text-stone-300 font-semibold leading-snug block mt-0.5">
                                        Click or tap the bottom / near edge of the table for self.
                                    </span>
                                </div>
                            </div>
                            <p className="text-[7.5px] sm:text-[8px] text-stone-500 font-mono uppercase tracking-wider leading-relaxed">
                                Tip: On desktop, hovering aims the barrel before you click. Prompt text stays hidden during matches.
                            </p>
                        </div>
                    </div>

                    {/* Debug Group */}
                    {(!isMultiplayer || (() => {
                        const loggedInUser = localStorage.getItem('aadish_roulette_logged_in_user');
                        let isDev = false;
                        if (loggedInUser) {
                            try {
                                const u = JSON.parse(loggedInUser);
                                isDev = Boolean(u.isDeveloper || u.role === 'developer' || u.username?.toLowerCase() === 'aadish');
                            } catch(e) {}
                        }
                        return isDev;
                    })()) && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <h3 className="text-red-500 font-extrabold tracking-[0.2em] uppercase text-[9px] sm:text-[10px]">Developer</h3>
                                <div className="h-[1px] flex-1 bg-red-950/30" />
                            </div>

                            <div className="flex items-center justify-between p-2.5 sm:p-3 bg-red-950/10 border border-red-900/30 rounded-xl">
                                <div>
                                    <span className="text-stone-300 font-bold tracking-widest text-[9px] sm:text-[10px] uppercase block">Debug Overlay</span>
                                    <span className="text-[8px] sm:text-[9px] text-stone-500 font-bold uppercase tracking-wider block mt-0.5">Enables cheats, item management, and chamber editor</span>
                                    {(() => {
                                        const loggedInUser = localStorage.getItem('aadish_roulette_logged_in_user');
                                        let isDev = false;
                                        if (loggedInUser) {
                                            try {
                                                const u = JSON.parse(loggedInUser);
                                                isDev = Boolean(u.isDeveloper || u.role === 'developer' || u.username?.toLowerCase() === 'aadish');
                                            } catch(e) {}
                                        }
                                        return isDev ? (
                                            <span className="text-[8px] text-green-500 font-extrabold uppercase tracking-wider block mt-1">
                                                ✓ DEVELOPER: STATS WILL BE SAVED
                                            </span>
                                        ) : (
                                            <span className="text-[8px] text-red-500 font-extrabold uppercase tracking-wider block mt-1 animate-pulse">
                                                ⚠ WARNING: STATS WILL NOT BE SAVED IN THIS MATCH
                                            </span>
                                        );
                                    })()}
                                </div>
                                <button
                                    onClick={() => {
                                        audioManager.playSound('click');
                                        handleChange('debugMode', !settings.debugMode);
                                    }}
                                    className={`px-3.5 py-2 min-h-[44px] text-[9px] sm:text-[10px] font-black tracking-widest uppercase transition-all rounded-lg border active:scale-95 cursor-pointer flex items-center justify-center ${settings.debugMode ? 'bg-red-600 hover:bg-red-500 text-white border-red-500' : 'bg-transparent hover:bg-stone-900 text-stone-400 border-stone-800'}`}
                                >
                                    {settings.debugMode ? 'Enabled' : 'Disabled'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-2 sm:p-3.5 border-t border-stone-800/60 bg-stone-950/70 backdrop-blur-xl flex flex-row items-center gap-2 sm:gap-3 shrink-0 w-full">
                    {showExitToMenu && !isMultiplayer && onExitToMenu && (
                        <button 
                            type="button"
                            onClick={() => { audioManager.playSound('click'); onExitToMenu(); }} 
                            className="flex-[0.8] min-w-[65px] h-10 min-h-[40px] border border-red-900/50 bg-red-955/20 text-red-400 hover:text-red-300 hover:bg-red-950/40 hover:border-red-600/50 px-2 sm:px-3 font-black tracking-[0.1em] flex items-center justify-center gap-1.5 transition-all rounded-xl text-[9px] sm:text-[10px] uppercase cursor-pointer active:scale-95 touch-manipulation"
                            title="Exit to Main Menu"
                        >
                            <LogOut size={13} className="shrink-0" />
                            <span>Exit</span>
                        </button>
                    )}
                    <button 
                        type="button"
                        onClick={() => { audioManager.playSound('click'); onResetDefaults(); }} 
                        className="flex-1 min-w-[90px] sm:min-w-[130px] h-10 min-h-[40px] border border-stone-700/70 bg-stone-900/60 text-stone-300 hover:text-white hover:bg-stone-850/80 px-2 sm:px-3 font-black tracking-[0.1em] flex items-center justify-center gap-1.5 transition-all rounded-xl text-[8.5px] sm:text-[10px] uppercase cursor-pointer active:scale-95 touch-manipulation"
                        title="Reset settings to defaults"
                    >
                        <RotateCcw size={13} className="shrink-0" />
                        <span className="truncate">Reset Defaults</span>
                    </button>
                    <button 
                        type="button"
                        onClick={() => { audioManager.playSound('click'); onClose(); }} 
                        className="flex-[1.4] min-w-[110px] sm:min-w-[150px] h-10 min-h-[40px] bg-white hover:bg-stone-200 text-black font-black px-3 sm:px-4 transition-all tracking-[0.15em] sm:tracking-[0.2em] rounded-xl text-[9.5px] sm:text-xs uppercase shadow-xl cursor-pointer active:scale-95 flex items-center justify-center touch-manipulation"
                        title="Close settings"
                    >
                        <span className="truncate">Return to Game</span>
                    </button>
                </div>
            </div>
        </div>
    );
};