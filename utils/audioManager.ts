import { GameSettings } from '../types';

let globalAudioCtx: AudioContext | null = null;

/**
 * Safely retrieve or create the Web Audio API AudioContext singleton.
 * Guards against DOMException when running in iframes or sandboxed webviews.
 */
export function getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!globalAudioCtx) {
        try {
            const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            if (AudioContextClass) {
                globalAudioCtx = new AudioContextClass();
            }
        } catch {
            // Silently catch creation errors in restricted environments (e.g. iframes without user gesture)
        }
    }
    return globalAudioCtx;
}

/**
 * Safely resume the AudioContext upon user gesture.
 * Guards against DOMException: "The AudioContext was not allowed to start".
 * Guarantees Web Audio API unlock on mobile Safari and Android Chrome by playing a 1-sample silent buffer.
 */
export async function resumeAudioContext(): Promise<boolean> {
    const ctx = getAudioContext();
    if (!ctx) return false;
    try {
        if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') {
            await ctx.resume();
        }
        // Force iOS Safari & Chrome mobile to release audio lock by playing a 1-sample silent buffer
        if (ctx.state === 'running' || ctx.state === 'suspended') {
            const buffer = ctx.createBuffer(1, 1, 22050);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.start(0);
        }
        return ctx.state === 'running';
    } catch {
        // Silently catch DOMException autoplay policy errors
        return false;
    }
}

export class AudioManager {
    private sounds: { [key: string]: HTMLAudioElement } = {};
    private music: { [key: string]: HTMLAudioElement } = {};
    private currentMusic: string | null = null;
    public musicVolume: number = 0.5;
    public sfxVolume: number = 0.7;
    private initialized: boolean = false;
    private initializationPromise: Promise<void> | null = null;
    private activeDimmingCount: number = 0;
    private loadPromises: Promise<void>[] = [];
    private pendingMusic: string | null = null;
    public isInitialized: boolean = false;
    private activeClonedSounds: Set<HTMLAudioElement> = new Set();
    private musicCrossfadeTimer: any = null;

    constructor() {
        this.loadAssets();
    }

    private loadAssets() {
        if (typeof window === 'undefined') return;

        const soundFiles = {
            grab: '/sound/grab1.ogg',
            click: '/sound/grab1.ogg',
            blankshell: '/sound/blankshellshoot.wav',
            liveshell: '/sound/liveshellshoot.mp3',
            // New Animation Sounds
            standing: '/sound/AnimationSounds/Standing.mp3',
            dropping: '/sound/AnimationSounds/droping.mp3',
            checkhandcuffs: '/sound/AnimationSounds/checkhandcuffs.mp3',
            handcuffed: '/sound/AnimationSounds/handcuffed.mp3',
            adrenaline: '/sound/AnimationSounds/adrenaline.mp3',
            beer: '/sound/AnimationSounds/beer.mp3',
            cig: '/sound/AnimationSounds/cig.mp3',
            glass: '/sound/AnimationSounds/glass.mp3',
            inverter: '/sound/AnimationSounds/inverter.mp3',
            big_inverter: '/sound/AnimationSounds/BigInverter.mp3',
            phone: '/sound/AnimationSounds/phone.mp3',
            saw: '/sound/AnimationSounds/saw.mp3',
            choke: '/sound/AnimationSounds/Choke.mp3',
            remote: '/sound/AnimationSounds/remote.mp3',
            contract: '/sound/AnimationSounds/BloodContract.mp3',
            luckycharm: '/sound/AnimationSounds/luckcharm.mp3',
            flashbang: '/sound/AnimationSounds/flashbang.mp3',
            crusher: '/sound/crusher.mp3',
            totem: '/sound/AnimationSounds/Totem.mp3',
            mirror: '/sound/AnimationSounds/mirror.mp3',
            cards: '/sound/AnimationSounds/cards.mp3',
            slotmachine: '/sound/AnimationSounds/slotmachine.mp3',
            jackpot: '/sound/AnimationSounds/jackpot.mp3',
            jackpotloop: '/sound/AnimationSounds/jackpotloop.mp3',
        };
        const musicFiles = {
            menu: '/sound/menu.mp3',
            gameplay: '/sound/gameplay.mp3',
            endscreen: '/sound/endscreen.mp3'
        };

        const loadAudio = (audio: HTMLAudioElement) => new Promise<void>((resolve) => {
            const onDone = () => {
                audio.removeEventListener('canplaythrough', onDone);
                audio.removeEventListener('error', onDone);
                resolve();
            };
            audio.addEventListener('canplaythrough', onDone, { once: true });
            audio.addEventListener('error', onDone, { once: true });
            audio.preload = 'auto';
            try {
                audio.load();
            } catch (e) {
                resolve();
            }
        });

        for (const [key, path] of Object.entries(soundFiles)) {
            const audio = new Audio(path);
            audio.preload = 'auto'; // Important for mobile
            this.sounds[key] = audio;
            this.loadPromises.push(loadAudio(audio));
        }

        for (const [key, path] of Object.entries(musicFiles)) {
            const audio = new Audio(path);
            audio.preload = 'auto';
            audio.loop = (key !== 'endscreen');
            this.music[key] = audio;
            this.loadPromises.push(loadAudio(audio));
        }
    }

    private clearMusicFadeTimer() {
        if (this.musicCrossfadeTimer) {
            clearInterval(this.musicCrossfadeTimer);
            this.musicCrossfadeTimer = null;
        }
    }

    private getTargetMusicVolume(): number {
        let scale = 1.0;
        if (this.isJackpotActive) {
            scale = 0.05; // Lower it even more, almost mute (5%)
        } else if (this.activeDimmingCount > 0) {
            scale = 0.35; // Dim music to 35% of its set volume
        }
        return Math.max(0, Math.min(1.0, this.musicVolume * scale));
    }

    private applyMusicVolume(immediate: boolean = false) {
        if (!this.currentMusic || !this.music[this.currentMusic]) return;
        const targetVol = this.getTargetMusicVolume();
        const track = this.music[this.currentMusic];

        if (immediate || Math.abs(track.volume - targetVol) < 0.02) {
            track.volume = targetVol;
            return;
        }

        // Smooth volume adjustment when dimming / un-dimming
        this.clearMusicFadeTimer();
        const startVol = track.volume;
        const diff = targetVol - startVol;
        const steps = 8;
        let step = 0;

        this.musicCrossfadeTimer = setInterval(() => {
            step++;
            if (step >= steps || !this.currentMusic || !this.music[this.currentMusic]) {
                if (this.currentMusic && this.music[this.currentMusic]) {
                    this.music[this.currentMusic].volume = targetVol;
                }
                this.clearMusicFadeTimer();
                return;
            }
            const progress = step / steps;
            track.volume = Math.max(0, Math.min(1.0, startVol + diff * progress));
        }, 16);
    }

    public getAudioLoadingProgress(): number {
        if (typeof window === 'undefined') return 100;
        const allAudio = [
            ...Object.values(this.sounds),
            ...Object.values(this.music)
        ];
        if (allAudio.length === 0) return 100;
        let loadedCount = 0;
        allAudio.forEach(audio => {
            if (audio.readyState >= 2 || audio.error) {
                loadedCount++;
            }
        });
        return Math.round((loadedCount / allAudio.length) * 100);
    }

    // Call this on the first user interaction (e.g., clicking "ENTER" or anywhere on splash screen)
    public async initialize() {
        if (this.isInitialized) {
            return;
        }

        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = (async () => {
            try {
                // Safely resume Web Audio AudioContext upon user gesture
                await resumeAudioContext().catch(() => {});

                await Promise.allSettled(this.loadPromises);

                const allAudio = [
                    ...Object.values(this.sounds),
                    ...Object.values(this.music)
                ];

                const results = await Promise.allSettled(allAudio.map(async (s) => {
                    s.volume = 0;
                    s.muted = true;
                    try {
                        await s.play();
                    } catch {
                        // Ignore autoplay prevention errors, we only want playback unlocking if possible.
                    }
                    s.pause();
                    s.currentTime = 0;
                    s.muted = false;
                }));

                const anySuccess = results.some(r => r.status === 'fulfilled');
                if (anySuccess || allAudio.length === 0) {
                    this.isInitialized = true;
                    this.initialized = true;
                }

                if (this.currentMusic && this.music[this.currentMusic]) {
                    const music = this.music[this.currentMusic];
                    this.applyMusicVolume();
                    music.play().catch(() => { });
                } else if (this.pendingMusic) {
                    const queued = this.pendingMusic;
                    this.pendingMusic = null;
                    this.playMusic(queued);
                }
            } catch (e) {
                console.warn('Audio initialization notice:', e);
            } finally {
                this.initializationPromise = null;
            }
        })();

        return this.initializationPromise;
    }

    public playSound(key: string, options?: { volume?: number, playbackRate?: number, dimMusic?: boolean }) {
        // If not initialized, we shouldn't crash, but we might not hear it yet depending on browser.
        // Better: Try to play.
        const original = this.sounds[key];
        if (!original) return;

        // Clone for polyphony (multiple overlapping sounds)
        // Optimization: For mobile, limit concurrent sounds if needed, but modern devices handle 5-10 fine.
        const sound = original.cloneNode() as HTMLAudioElement;
        sound.preload = 'auto';
        sound.muted = false;
        if (sound.readyState < 2) {
            try {
                sound.load();
            } catch (e) {
                // Some browsers may reject load on cloned objects.
            }
        }
        sound.currentTime = 0;

        // BOOST specific sounds
        const boostMap: { [key: string]: number } = {
            'liveshell': 1.5,
            'blankshell': 1.5,
            'grab': 1.5,
            'click': 0.8 // Slightly quieter
        };
        const boost = boostMap[key] || 1.0;

        // Check if this sound should dim the background music
        const shouldDimByKey = [
            'dropping', 'checkhandcuffs', 'handcuffed', 'adrenaline', 
            'beer', 'cig', 'glass', 'inverter', 'big_inverter', 
            'phone', 'saw', 'choke', 'remote', 'contract', 'luckycharm', 'flashbang', 'crusher', 'totem', 'mirror',
            'slotmachine'
        ].includes(key);

        const shouldDimMusic = options?.dimMusic ?? shouldDimByKey;

        if (shouldDimMusic) {
            this.activeDimmingCount++;
            this.applyMusicVolume();
        }

        let finalVolume = this.sfxVolume * boost;
        if (options?.volume) finalVolume *= options.volume;
        sound.volume = Math.min(1.0, finalVolume);

        if (options?.playbackRate) {
            sound.preservesPitch = false;
            sound.playbackRate = options.playbackRate;
        }

        this.activeClonedSounds.add(sound);

        const cleanupSound = () => {
            if (!this.activeClonedSounds.has(sound)) return;
            this.activeClonedSounds.delete(sound);
            try {
                sound.onended = null;
                sound.onerror = null;
                sound.pause();
                sound.src = '';
            } catch {}
            if (shouldDimMusic) {
                this.activeDimmingCount = Math.max(0, this.activeDimmingCount - 1);
                this.applyMusicVolume();
            }
        };

        sound.onended = cleanupSound;
        sound.onerror = cleanupSound;

        const playPromise = sound.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                cleanupSound();
                // Auto-play was prevented. This happens if playSound is called before any user interaction or in restricted iframes.
                // We silently ignore NotAllowedError and AbortError to prevent console spam.
                if (error && error.name !== 'NotAllowedError' && error.name !== 'AbortError') {
                    console.warn(`SFX '${key}' error:`, error);
                }
            });
        }
    }

    public stopAllSFX() {
        this.clearMusicFadeTimer();
        this.activeClonedSounds.forEach((sound) => {
            try {
                sound.onended = null;
                sound.onerror = null;
                sound.pause();
                sound.currentTime = 0;
                sound.src = '';
            } catch (e) {
                // Ignore cleanup errors
            }
        });
        this.activeClonedSounds.clear();
        this.activeDimmingCount = 0;
        this.stopJackpotMusic();
        this.applyMusicVolume(false);
    }

    public playMusic(key: string, transitionDurationMs: number = 350) {
        if (this.currentMusic === key) {
            const track = this.music[key];
            if (track && this.isInitialized) {
                if (track.paused) {
                    track.currentTime = 0;
                    track.play().catch(() => { });
                }
                this.applyMusicVolume(false);
            }
            return;
        }

        const oldTrack = this.currentMusic ? this.music[this.currentMusic] : null;
        this.currentMusic = key;
        const newTrack = this.music[key];

        if (!this.isInitialized) {
            this.pendingMusic = key;
            return;
        }

        this.clearMusicFadeTimer();

        if (newTrack) {
            const targetVol = this.getTargetMusicVolume();
            newTrack.currentTime = 0;

            if (oldTrack && !oldTrack.paused && transitionDurationMs > 50) {
                // Smooth crossfade between old and new music tracks
                const oldStartVol = oldTrack.volume;
                newTrack.volume = 0;
                const playPromise = newTrack.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        if (error && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
                            this.pendingMusic = key;
                        } else {
                            console.warn(`Music '${key}' error:`, error);
                        }
                    });
                }

                const steps = Math.max(1, Math.round(transitionDurationMs / 25));
                let step = 0;
                this.musicCrossfadeTimer = setInterval(() => {
                    step++;
                    const progress = Math.min(1.0, step / steps);
                    if (oldTrack) {
                        oldTrack.volume = Math.max(0, oldStartVol * (1 - progress));
                    }
                    if (newTrack) {
                        newTrack.volume = Math.min(1.0, targetVol * progress);
                    }
                    if (step >= steps) {
                        this.clearMusicFadeTimer();
                        if (oldTrack) {
                            oldTrack.pause();
                            oldTrack.currentTime = 0;
                            oldTrack.volume = targetVol;
                        }
                        if (newTrack) {
                            newTrack.volume = targetVol;
                        }
                    }
                }, 25);
            } else {
                if (oldTrack) {
                    oldTrack.pause();
                    oldTrack.currentTime = 0;
                }
                newTrack.volume = targetVol;
                const playPromise = newTrack.play();
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        if (error && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
                            this.pendingMusic = key;
                        } else {
                            console.warn(`Music '${key}' error:`, error);
                        }
                    });
                }
            }
        }
    }

    public updateVolumes(settings: GameSettings) {
        this.musicVolume = settings.musicVolume ?? 0.5;
        this.sfxVolume = settings.sfxVolume ?? 0.7;
        this.applyMusicVolume();
        if (this.jackpotIntroAudio) {
            this.jackpotIntroAudio.volume = this.sfxVolume;
        }
        if (this.jackpotLoopAudio) {
            this.jackpotLoopAudio.volume = this.sfxVolume;
        }
    }

    public stopMusic(fadeDurationMs: number = 250) {
        if (!this.currentMusic || !this.music[this.currentMusic]) return;
        const track = this.music[this.currentMusic];
        this.currentMusic = null;
        this.clearMusicFadeTimer();

        if (fadeDurationMs > 50 && !track.paused) {
            const startVol = track.volume;
            const steps = Math.max(1, Math.round(fadeDurationMs / 25));
            let step = 0;
            this.musicCrossfadeTimer = setInterval(() => {
                step++;
                const progress = Math.min(1.0, step / steps);
                track.volume = Math.max(0, startVol * (1 - progress));
                if (step >= steps) {
                    this.clearMusicFadeTimer();
                    track.pause();
                    track.currentTime = 0;
                }
            }, 25);
        } else {
            track.pause();
            track.currentTime = 0;
        }
    }

    private jackpotIntroAudio: HTMLAudioElement | null = null;
    private jackpotLoopAudio: HTMLAudioElement | null = null;
    private isJackpotActive: boolean = false;

    public playJackpotIntro(options?: { dimMusic?: boolean }) {
        this.stopJackpotMusic();

        const intro = this.sounds['jackpot'];
        if (!intro) return;

        const shouldDimMusic = options?.dimMusic ?? true;
        if (shouldDimMusic) {
            this.isJackpotActive = true;
            this.applyMusicVolume();
        }

        this.jackpotIntroAudio = intro.cloneNode() as HTMLAudioElement;
        this.jackpotIntroAudio.volume = this.sfxVolume;
        this.jackpotIntroAudio.onended = () => {
            this.playJackpotLoop({ dimMusic: shouldDimMusic });
        };
        this.jackpotIntroAudio.play().catch(e => {
            if (e && e.name !== 'NotAllowedError' && e.name !== 'AbortError') {
                console.warn("Jackpot intro blocked", e);
            }
        });
    }

    public playJackpotLoop(options?: { dimMusic?: boolean }) {
        if (this.jackpotIntroAudio) {
            this.jackpotIntroAudio.onended = null;
            this.jackpotIntroAudio.pause();
            this.jackpotIntroAudio.src = '';
            this.jackpotIntroAudio = null;
        }

        if (this.jackpotLoopAudio) {
            this.jackpotLoopAudio.pause();
            this.jackpotLoopAudio.src = '';
            this.jackpotLoopAudio = null;
        }

        const loop = this.sounds['jackpotloop'];
        if (!loop) {
            this.isJackpotActive = false;
            this.applyMusicVolume();
            return;
        }

        const shouldDimMusic = options?.dimMusic ?? true;
        if (shouldDimMusic) {
            this.isJackpotActive = true;
            this.applyMusicVolume();
        } else {
            this.isJackpotActive = false;
            this.applyMusicVolume();
        }

        this.jackpotLoopAudio = loop.cloneNode() as HTMLAudioElement;
        this.jackpotLoopAudio.loop = true;
        this.jackpotLoopAudio.volume = this.sfxVolume;
        this.jackpotLoopAudio.play().catch(e => {
            if (e && e.name !== 'NotAllowedError' && e.name !== 'AbortError') {
                console.warn("Jackpot loop blocked", e);
            }
        });
    }

    public stopJackpotMusic() {
        if (this.jackpotIntroAudio) {
            this.jackpotIntroAudio.onended = null;
            this.jackpotIntroAudio.pause();
            this.jackpotIntroAudio.src = '';
            this.jackpotIntroAudio = null;
        }
        if (this.jackpotLoopAudio) {
            this.jackpotLoopAudio.pause();
            this.jackpotLoopAudio.src = '';
            this.jackpotLoopAudio = null;
        }
        this.isJackpotActive = false;
        this.applyMusicVolume();
    }
}

export const audioManager = new AudioManager();

let isAudioUnlockSetup = false;

// Global unlock listener for pointers, touch, and keys to automatically unlock Web Audio & HTMLAudio on user gesture
export function setupMobileAudioUnlock() {
    if (typeof window === 'undefined' || isAudioUnlockSetup) return;
    isAudioUnlockSetup = true;
    const unlockEvents = ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click', 'keydown'] as const;
    const onUserInteraction = async () => {
        try {
            await resumeAudioContext();
            await audioManager.initialize();
        } catch {
            // Safe silent fallback
        } finally {
            if (audioManager.isInitialized || (globalAudioCtx && globalAudioCtx.state === 'running')) {
                unlockEvents.forEach(evt => {
                    window.removeEventListener(evt, onUserInteraction, true);
                    document.removeEventListener(evt, onUserInteraction, true);
                });
                isAudioUnlockSetup = false;
            }
        }
    };
    unlockEvents.forEach(evt => {
        window.addEventListener(evt, onUserInteraction, { capture: true, passive: true });
        document.addEventListener(evt, onUserInteraction, { capture: true, passive: true });
    });
}

if (typeof window !== 'undefined') {
    setupMobileAudioUnlock();
}
