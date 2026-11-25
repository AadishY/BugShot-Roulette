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
            source.onended = () => {
                try { source.disconnect(); } catch {}
            };
            source.start(0);
        }
        return ctx.state === 'running';
    } catch {
        // Silently catch DOMException autoplay policy errors
        return false;
    }
}

const SOUND_FILES: Record<string, string> = {
    grab: '/sound/grab1.ogg',
    click: '/sound/grab1.ogg',
    blankshell: '/sound/blankshellshoot.wav',
    liveshell: '/sound/liveshellshoot.mp3',
    // Animation Sounds
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
    jackpotloop: '/sound/AnimationSounds/jackpotloop.mp3'
};

const MUSIC_FILES: Record<string, string> = {
    menu: '/sound/menu.mp3',
    gameplay: '/sound/gameplay.mp3',
    endscreen: '/sound/endscreen.mp3'
};

// Tiny core sounds warmed up on user unlock; item/rare sounds decode lazily on demand
const CRITICAL_SFX_URLS = Array.from(
    new Set([SOUND_FILES.grab, SOUND_FILES.blankshell, SOUND_FILES.liveshell])
);

const DIMMING_SFX_KEYS = new Set([
    'dropping', 'checkhandcuffs', 'handcuffed', 'adrenaline',
    'beer', 'cig', 'glass', 'inverter', 'big_inverter',
    'phone', 'saw', 'choke', 'remote', 'contract', 'luckycharm',
    'flashbang', 'crusher', 'totem', 'mirror', 'slotmachine'
]);

const BOOST_MAP: Record<string, number> = {
    liveshell: 1.5,
    blankshell: 1.5,
    grab: 1.5,
    click: 0.8
};

interface ActiveSFXNode {
    source: AudioBufferSourceNode;
    gain: GainNode;
    dimMusic: boolean;
    cleanup: () => void;
}

const isMobileBrowser = () =>
    typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

export class AudioManager {
    private music: Record<string, HTMLAudioElement> = {};
    private currentMusic: string | null = null;
    public musicVolume: number = 0.5;
    public sfxVolume: number = 0.7;
    private initialized: boolean = false;
    private initializationPromise: Promise<void> | null = null;
    private activeDimmingCount: number = 0;
    private pendingMusic: string | null = null;
    public isInitialized: boolean = false;

    // Web Audio decoded AudioBuffer LRU cache (keyed by URL so aliases like grab/click share 1 buffer)
    private audioBuffers: Map<string, AudioBuffer> = new Map();
    private decodePromises: Map<string, Promise<AudioBuffer | null>> = new Map();
    private activeSfxNodes: Set<ActiveSFXNode> = new Set();
    private activeFallbackSounds: Set<HTMLAudioElement> = new Set();
    private criticalReadyUrls: Set<string> = new Set();
    private sfxEpoch: number = 0;

    private musicCrossfadeTimer: ReturnType<typeof setInterval> | null = null;

    // Jackpot state (prefers Web Audio buffer nodes for gapless loop, falls back to HTMLAudio)
    private jackpotNode: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
    private jackpotIntroAudio: HTMLAudioElement | null = null;
    private jackpotLoopAudio: HTMLAudioElement | null = null;
    private isJackpotActive: boolean = false;

    private getMaxCachedBuffers(): number {
        return isMobileBrowser() ? 14 : 28;
    }

    private getMaxConcurrentSFX(): number {
        return isMobileBrowser() ? 8 : 14;
    }

    private touchBufferLRU(url: string, buffer: AudioBuffer) {
        if (this.audioBuffers.has(url)) {
            this.audioBuffers.delete(url);
        }
        this.audioBuffers.set(url, buffer);

        const limit = this.getMaxCachedBuffers();
        while (this.audioBuffers.size > limit) {
            const oldestKey = this.audioBuffers.keys().next().value as string | undefined;
            if (!oldestKey) break;
            // Never evict core UI/shotgun buffers while trimming
            if (CRITICAL_SFX_URLS.includes(oldestKey) && this.audioBuffers.size > CRITICAL_SFX_URLS.length) {
                const kept = this.audioBuffers.get(oldestKey)!;
                this.audioBuffers.delete(oldestKey);
                this.audioBuffers.set(oldestKey, kept);
                continue;
            }
            this.audioBuffers.delete(oldestKey);
        }
    }

    private async getOrDecodeBuffer(url: string): Promise<AudioBuffer | null> {
        const cached = this.audioBuffers.get(url);
        if (cached) {
            this.touchBufferLRU(url, cached);
            return cached;
        }

        const existingPromise = this.decodePromises.get(url);
        if (existingPromise) {
            return existingPromise;
        }

        const ctx = getAudioContext();
        if (!ctx) return null;

        const promise = (async (): Promise<AudioBuffer | null> => {
            try {
                const response = await fetch(url);
                if (!response.ok) return null;
                let arrayBuffer: ArrayBuffer | null = await response.arrayBuffer();
                const decoded = await ctx.decodeAudioData(arrayBuffer);
                arrayBuffer = null; // Help GC release raw compressed bytes immediately
                this.touchBufferLRU(url, decoded);
                this.criticalReadyUrls.add(url);
                return decoded;
            } catch {
                return null;
            } finally {
                this.decodePromises.delete(url);
            }
        })();

        this.decodePromises.set(url, promise);
        return promise;
    }

    private getOrCreateMusicTrack(key: string): HTMLAudioElement | null {
        if (typeof window === 'undefined') return null;
        if (this.music[key]) return this.music[key];

        const path = MUSIC_FILES[key];
        if (!path) return null;

        const audio = new Audio(path);
        audio.preload = 'auto';
        audio.loop = key !== 'endscreen';
        this.music[key] = audio;
        return audio;
    }

    private releaseMusicTrack(key: string) {
        const track = this.music[key];
        if (!track) return;
        try {
            track.pause();
            track.currentTime = 0;
            track.src = '';
            track.load();
        } catch {}
        delete this.music[key];
    }

    private clearMusicFadeTimer() {
        if (this.musicCrossfadeTimer !== null) {
            clearInterval(this.musicCrossfadeTimer);
            this.musicCrossfadeTimer = null;
        }
    }

    private getTargetMusicVolume(): number {
        let scale = 1.0;
        if (this.isJackpotActive) {
            scale = 0.05;
        } else if (this.activeDimmingCount > 0) {
            scale = 0.35;
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
        if (this.isInitialized) return 100;
        if (CRITICAL_SFX_URLS.length === 0) return 100;

        let ready = 0;
        for (const url of CRITICAL_SFX_URLS) {
            if (this.audioBuffers.has(url) || this.criticalReadyUrls.has(url)) {
                ready++;
            }
        }
        // Always report at least 35% once manager is live so boot/loading progress stays responsive
        const pct = Math.round((ready / CRITICAL_SFX_URLS.length) * 100);
        return Math.max(35, pct);
    }

    /**
     * Optional targeted preload for specific SFX keys (e.g. entering gameplay).
     * Deduplicates by URL and runs lazily without holding raw ArrayBuffers.
     */
    public async preloadSFX(keys?: string[]): Promise<void> {
        const ctx = getAudioContext();
        if (!ctx) return;

        const targetUrls = keys && keys.length > 0
            ? Array.from(new Set(keys.map(k => SOUND_FILES[k]).filter(Boolean)))
            : CRITICAL_SFX_URLS;

        await Promise.allSettled(targetUrls.map((url) => this.getOrDecodeBuffer(url)));
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
                const resumed = await resumeAudioContext().catch(() => false);
                const ctx = getAudioContext();

                // Warm up menu music track lazily only when initializing
                const menuTrack = this.getOrCreateMusicTrack('menu');
                if (menuTrack) {
                    menuTrack.volume = 0;
                    menuTrack.muted = true;
                    try {
                        await menuTrack.play();
                    } catch {
                        // Ignore autoplay prevention
                    }
                    menuTrack.pause();
                    menuTrack.currentTime = 0;
                    menuTrack.muted = false;
                }

                // Decode only tiny core SFX buffers on unlock; item SFX decode lazily when used
                if (ctx) {
                    await Promise.allSettled(
                        CRITICAL_SFX_URLS.map((url) => this.getOrDecodeBuffer(url))
                    );
                }

                if (resumed || (ctx && ctx.state === 'running') || (menuTrack && menuTrack.readyState >= 1)) {
                    this.isInitialized = true;
                    this.initialized = true;
                } else {
                    // Mark initialized after user gesture attempt so subsequent plays aren't permanently gated
                    this.isInitialized = true;
                    this.initialized = true;
                }

                if (this.currentMusic && this.music[this.currentMusic]) {
                    const music = this.music[this.currentMusic];
                    this.applyMusicVolume(true);
                    music.play().catch(() => {});
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

    private playWithBuffer(
        ctx: AudioContext,
        buffer: AudioBuffer,
        volume: number,
        playbackRate: number | undefined,
        shouldDimMusic: boolean
    ) {
        // Enforce concurrency cap by evicting oldest active node to avoid audio distortion/node bloat
        const maxNodes = this.getMaxConcurrentSFX();
        if (this.activeSfxNodes.size >= maxNodes) {
            const oldest = this.activeSfxNodes.values().next().value as ActiveSFXNode | undefined;
            if (oldest) oldest.cleanup();
        }

        const source = ctx.createBufferSource();
        const gain = ctx.createGain();

        source.buffer = buffer;
        if (playbackRate && playbackRate > 0) {
            source.playbackRate.value = playbackRate;
        }
        gain.gain.value = Math.max(0, Math.min(1.5, volume));

        source.connect(gain);
        gain.connect(ctx.destination);

        if (shouldDimMusic) {
            this.activeDimmingCount++;
            this.applyMusicVolume();
        }

        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            this.activeSfxNodes.delete(entry);
            try { source.onended = null; } catch {}
            try { source.stop(); } catch {}
            try { source.disconnect(); } catch {}
            try { gain.disconnect(); } catch {}

            if (shouldDimMusic) {
                this.activeDimmingCount = Math.max(0, this.activeDimmingCount - 1);
                this.applyMusicVolume();
            }
        };

        const entry: ActiveSFXNode = { source, gain, dimMusic: shouldDimMusic, cleanup };
        this.activeSfxNodes.add(entry);
        source.onended = cleanup;

        try {
            source.start(0);
        } catch {
            cleanup();
        }
    }

    private playFallbackHTMLAudio(url: string, volume: number, playbackRate: number | undefined, shouldDimMusic: boolean) {
        // Cap HTMLAudio fallback pool
        if (this.activeFallbackSounds.size >= 4) {
            const oldest = this.activeFallbackSounds.values().next().value as HTMLAudioElement | undefined;
            if (oldest) {
                this.activeFallbackSounds.delete(oldest);
                try {
                    oldest.onended = null;
                    oldest.onerror = null;
                    oldest.pause();
                    oldest.src = '';
                    oldest.load();
                } catch {}
            }
        }

        const sound = new Audio(url);
        sound.preload = 'auto';
        sound.volume = Math.max(0, Math.min(1.0, volume));
        if (playbackRate && playbackRate > 0) {
            sound.preservesPitch = false;
            sound.playbackRate = playbackRate;
        }

        if (shouldDimMusic) {
            this.activeDimmingCount++;
            this.applyMusicVolume();
        }

        this.activeFallbackSounds.add(sound);

        const cleanupSound = () => {
            if (!this.activeFallbackSounds.has(sound)) return;
            this.activeFallbackSounds.delete(sound);
            try {
                sound.onended = null;
                sound.onerror = null;
                sound.pause();
                sound.src = '';
                sound.load();
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
            playPromise.catch((error) => {
                cleanupSound();
                if (error && error.name !== 'NotAllowedError' && error.name !== 'AbortError') {
                    console.warn(`SFX error (${url}):`, error);
                }
            });
        }
    }

    public playSound(key: string, options?: { volume?: number; playbackRate?: number; dimMusic?: boolean }) {
        const url = SOUND_FILES[key];
        if (!url) return;

        const boost = BOOST_MAP[key] ?? 1.0;
        const shouldDimMusic = options?.dimMusic ?? DIMMING_SFX_KEYS.has(key);

        let finalVolume = this.sfxVolume * boost;
        if (options?.volume !== undefined) finalVolume *= options.volume;
        finalVolume = Math.max(0, Math.min(1.0, finalVolume));

        const ctx = getAudioContext();
        if (ctx) {
            if (ctx.state === 'suspended') {
                ctx.resume().catch(() => {});
            }

            const cached = this.audioBuffers.get(url);
            if (cached) {
                this.touchBufferLRU(url, cached);
                this.playWithBuffer(ctx, cached, finalVolume, options?.playbackRate, shouldDimMusic);
                return;
            }

            const epochAtStart = this.sfxEpoch;
            this.getOrDecodeBuffer(url).then((decoded) => {
                if (epochAtStart !== this.sfxEpoch) return; // Teardown occurred while decoding
                if (decoded && getAudioContext()) {
                    this.playWithBuffer(getAudioContext()!, decoded, finalVolume, options?.playbackRate, shouldDimMusic);
                } else {
                    this.playFallbackHTMLAudio(url, finalVolume, options?.playbackRate, shouldDimMusic);
                }
            });
            return;
        }

        this.playFallbackHTMLAudio(url, finalVolume, options?.playbackRate, shouldDimMusic);
    }

    public stopAllSFX() {
        this.sfxEpoch++;
        this.clearMusicFadeTimer();

        Array.from(this.activeSfxNodes).forEach((entry) => {
            entry.cleanup();
        });
        this.activeSfxNodes.clear();

        Array.from(this.activeFallbackSounds).forEach((sound) => {
            try {
                sound.onended = null;
                sound.onerror = null;
                sound.pause();
                sound.currentTime = 0;
                sound.src = '';
                sound.load();
            } catch {}
        });
        this.activeFallbackSounds.clear();

        this.activeDimmingCount = 0;
        this.stopJackpotMusic();
        this.applyMusicVolume(false);
    }

    /**
     * Release non-critical decoded SFX AudioBuffers from RAM (e.g. on game exit / mode switch).
     */
    public releaseUnusedSFX(keepKeys: string[] = []) {
        const keepUrls = new Set([
            ...CRITICAL_SFX_URLS,
            ...keepKeys.map((k) => SOUND_FILES[k]).filter(Boolean)
        ]);
        for (const url of Array.from(this.audioBuffers.keys())) {
            if (!keepUrls.has(url)) {
                this.audioBuffers.delete(url);
            }
        }
    }

    public playMusic(key: string, transitionDurationMs: number = 350) {
        if (this.currentMusic === key) {
            const track = this.getOrCreateMusicTrack(key);
            if (track && this.isInitialized) {
                if (track.paused) {
                    track.currentTime = 0;
                    track.play().catch(() => {});
                }
                this.applyMusicVolume(false);
            }
            return;
        }

        const oldKey = this.currentMusic;
        const oldTrack = oldKey ? this.music[oldKey] : null;
        this.currentMusic = key;
        const newTrack = this.getOrCreateMusicTrack(key);

        if (!this.isInitialized) {
            this.pendingMusic = key;
            return;
        }

        this.clearMusicFadeTimer();

        if (newTrack) {
            const targetVol = this.getTargetMusicVolume();
            newTrack.currentTime = 0;

            if (oldTrack && !oldTrack.paused && transitionDurationMs > 50) {
                const oldStartVol = oldTrack.volume;
                newTrack.volume = 0;
                const playPromise = newTrack.play();
                if (playPromise !== undefined) {
                    playPromise.catch((error) => {
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
                            if (oldKey === 'endscreen') {
                                this.releaseMusicTrack(oldKey);
                            }
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
                    if (oldKey === 'endscreen') {
                        this.releaseMusicTrack(oldKey);
                    }
                }
                newTrack.volume = targetVol;
                const playPromise = newTrack.play();
                if (playPromise !== undefined) {
                    playPromise.catch((error) => {
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

        if (this.jackpotNode) {
            this.jackpotNode.gain.gain.value = Math.max(0, Math.min(1.0, this.sfxVolume));
        }
        if (this.jackpotIntroAudio) {
            this.jackpotIntroAudio.volume = this.sfxVolume;
        }
        if (this.jackpotLoopAudio) {
            this.jackpotLoopAudio.volume = this.sfxVolume;
        }
    }

    public stopMusic(fadeDurationMs: number = 250) {
        if (!this.currentMusic || !this.music[this.currentMusic]) return;
        const stoppingKey = this.currentMusic;
        const track = this.music[stoppingKey];
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

    private clearJackpotNodes() {
        if (this.jackpotNode) {
            try { this.jackpotNode.source.onended = null; } catch {}
            try { this.jackpotNode.source.stop(); } catch {}
            try { this.jackpotNode.source.disconnect(); } catch {}
            try { this.jackpotNode.gain.disconnect(); } catch {}
            this.jackpotNode = null;
        }
        if (this.jackpotIntroAudio) {
            try {
                this.jackpotIntroAudio.onended = null;
                this.jackpotIntroAudio.pause();
                this.jackpotIntroAudio.src = '';
                this.jackpotIntroAudio.load();
            } catch {}
            this.jackpotIntroAudio = null;
        }
        if (this.jackpotLoopAudio) {
            try {
                this.jackpotLoopAudio.pause();
                this.jackpotLoopAudio.src = '';
                this.jackpotLoopAudio.load();
            } catch {}
            this.jackpotLoopAudio = null;
        }
    }

    public playJackpotIntro(options?: { dimMusic?: boolean }) {
        this.stopJackpotMusic();

        const url = SOUND_FILES['jackpot'];
        if (!url) return;

        const shouldDimMusic = options?.dimMusic ?? true;
        if (shouldDimMusic) {
            this.isJackpotActive = true;
            this.applyMusicVolume();
        }

        const ctx = getAudioContext();
        const epochAtStart = this.sfxEpoch;
        if (ctx) {
            this.getOrDecodeBuffer(url).then((buffer) => {
                if (epochAtStart !== this.sfxEpoch || !this.isJackpotActive) return;
                if (buffer && getAudioContext()) {
                    const c = getAudioContext()!;
                    const source = c.createBufferSource();
                    const gain = c.createGain();
                    source.buffer = buffer;
                    gain.gain.value = Math.max(0, Math.min(1.0, this.sfxVolume));
                    source.connect(gain);
                    gain.connect(c.destination);
                    this.jackpotNode = { source, gain };
                    source.onended = () => {
                        if (this.jackpotNode?.source === source) {
                            this.clearJackpotNodes();
                            this.playJackpotLoop({ dimMusic: shouldDimMusic });
                        }
                    };
                    source.start(0);
                    return;
                }
                this.playJackpotIntroHTMLFallback(url, shouldDimMusic);
            });
            return;
        }

        this.playJackpotIntroHTMLFallback(url, shouldDimMusic);
    }

    private playJackpotIntroHTMLFallback(url: string, shouldDimMusic: boolean) {
        const audio = new Audio(url);
        audio.volume = this.sfxVolume;
        audio.onended = () => {
            this.playJackpotLoop({ dimMusic: shouldDimMusic });
        };
        this.jackpotIntroAudio = audio;
        audio.play().catch((e) => {
            if (e && e.name !== 'NotAllowedError' && e.name !== 'AbortError') {
                console.warn('Jackpot intro blocked', e);
            }
        });
    }

    public playJackpotLoop(options?: { dimMusic?: boolean }) {
        this.clearJackpotNodes();

        const url = SOUND_FILES['jackpotloop'];
        if (!url) {
            this.isJackpotActive = false;
            this.applyMusicVolume();
            return;
        }

        const shouldDimMusic = options?.dimMusic ?? true;
        this.isJackpotActive = shouldDimMusic;
        this.applyMusicVolume();

        const ctx = getAudioContext();
        const epochAtStart = this.sfxEpoch;
        if (ctx) {
            this.getOrDecodeBuffer(url).then((buffer) => {
                if (epochAtStart !== this.sfxEpoch) return;
                if (buffer && getAudioContext()) {
                    const c = getAudioContext()!;
                    const source = c.createBufferSource();
                    const gain = c.createGain();
                    source.buffer = buffer;
                    source.loop = true;
                    gain.gain.value = Math.max(0, Math.min(1.0, this.sfxVolume));
                    source.connect(gain);
                    gain.connect(c.destination);
                    this.jackpotNode = { source, gain };
                    source.start(0);
                    return;
                }
                this.playJackpotLoopHTMLFallback(url);
            });
            return;
        }

        this.playJackpotLoopHTMLFallback(url);
    }

    private playJackpotLoopHTMLFallback(url: string) {
        const audio = new Audio(url);
        audio.loop = true;
        audio.volume = this.sfxVolume;
        this.jackpotLoopAudio = audio;
        audio.play().catch((e) => {
            if (e && e.name !== 'NotAllowedError' && e.name !== 'AbortError') {
                console.warn('Jackpot loop blocked', e);
            }
        });
    }

    public stopJackpotMusic() {
        this.clearJackpotNodes();
        this.isJackpotActive = false;
        this.applyMusicVolume();
    }

    public dispose() {
        this.stopAllSFX();
        this.stopMusic(0);
        Object.keys(this.music).forEach((k) => this.releaseMusicTrack(k));
        this.audioBuffers.clear();
        this.decodePromises.clear();
    }
}

export const audioManager = new AudioManager();

let isAudioUnlockSetup = false;
let hasCompletedAudioUnlock = false;

// Global unlock listener for pointers, touch, and keys to automatically unlock Web Audio & HTMLAudio on user gesture
export function setupMobileAudioUnlock() {
    if (typeof window === 'undefined' || isAudioUnlockSetup || hasCompletedAudioUnlock) return;
    isAudioUnlockSetup = true;
    const unlockEvents = ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click', 'keydown'] as const;
    const onUserInteraction = async () => {
        try {
            await resumeAudioContext();
            await audioManager.initialize();
        } catch {
            // Safe silent fallback
        } finally {
            if (audioManager.isInitialized && (!globalAudioCtx || globalAudioCtx.state === 'running')) {
                hasCompletedAudioUnlock = true;
                unlockEvents.forEach((evt) => {
                    window.removeEventListener(evt, onUserInteraction, true);
                    document.removeEventListener(evt, onUserInteraction, true);
                });
                isAudioUnlockSetup = false;
            }
        }
    };
    unlockEvents.forEach((evt) => {
        window.addEventListener(evt, onUserInteraction, { capture: true, passive: true });
        document.addEventListener(evt, onUserInteraction, { capture: true, passive: true });
    });
}

if (typeof window !== 'undefined') {
    setupMobileAudioUnlock();
}
