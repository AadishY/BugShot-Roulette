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
    confirm: '/sound/grab1.ogg',
    insert: '/sound/grab1.ogg',
    rack: '/sound/grab1.ogg',
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
    liveshell: 1.35,
    blankshell: 1.25,
    grab: 1.2,
    rack: 1.15,
    insert: 1.05,
    confirm: 0.9,
    click: 0.72
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
    private masterCompressor: DynamicsCompressorNode | null = null;
    private noiseBuffer: AudioBuffer | null = null;

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
        gain.gain.value = Math.max(0, Math.min(1.4, volume));

        source.connect(gain);
        gain.connect(this.getMasterOutput(ctx));

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

    private getMasterOutput(ctx: AudioContext): AudioNode {
        if (!this.masterCompressor || this.masterCompressor.context !== ctx) {
            try {
                const comp = ctx.createDynamicsCompressor();
                comp.threshold.setValueAtTime(-10, ctx.currentTime);
                comp.knee.setValueAtTime(14, ctx.currentTime);
                comp.ratio.setValueAtTime(6, ctx.currentTime);
                comp.attack.setValueAtTime(0.003, ctx.currentTime);
                comp.release.setValueAtTime(0.14, ctx.currentTime);
                comp.connect(ctx.destination);
                this.masterCompressor = comp;
            } catch {
                return ctx.destination;
            }
        }
        return this.masterCompressor;
    }

    private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
        if (!this.noiseBuffer || this.noiseBuffer.sampleRate !== ctx.sampleRate) {
            const len = Math.floor(ctx.sampleRate * 0.28);
            const buf = ctx.createBuffer(1, len, ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < len; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            this.noiseBuffer = buf;
        }
        return this.noiseBuffer;
    }

    /**
     * Synthesize crisp, zero-latency mechanical SFX for keys without dedicated MP3s
     * ('insert' shell load, 'rack' pump-action slide, 'confirm' tactical lock).
     */
    private playSynthesizedSFX(ctx: AudioContext, key: 'insert' | 'rack' | 'confirm', volume: number): boolean {
        try {
            const now = ctx.currentTime;
            const out = this.getMasterOutput(ctx);
            const vol = Math.max(0.01, Math.min(1.1, volume));

            if (key === 'insert') {
                // Metallic shotgun shell click + hollow chamber thud
                const osc = ctx.createOscillator();
                const oscGain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(320, now);
                osc.frequency.exponentialRampToValueAtTime(115, now + 0.065);
                oscGain.gain.setValueAtTime(vol * 0.5, now);
                oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                osc.connect(oscGain);
                oscGain.connect(out);
                osc.start(now);
                osc.stop(now + 0.085);

                const click = ctx.createBufferSource();
                click.buffer = this.getNoiseBuffer(ctx);
                const bp = ctx.createBiquadFilter();
                bp.type = 'bandpass';
                bp.frequency.setValueAtTime(2400, now);
                bp.Q.setValueAtTime(2.5, now);
                const nGain = ctx.createGain();
                nGain.gain.setValueAtTime(vol * 0.35, now);
                nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
                click.connect(bp);
                bp.connect(nGain);
                nGain.connect(out);
                click.start(now);
                click.stop(now + 0.05);
                return true;
            }

            if (key === 'rack') {
                // Two-stage pump-action shotgun chuk-chuk slide
                const triggerClack = (offset: number, freq: number, band: number) => {
                    const t = now + offset;
                    const src = ctx.createBufferSource();
                    src.buffer = this.getNoiseBuffer(ctx);
                    const bp = ctx.createBiquadFilter();
                    bp.type = 'bandpass';
                    bp.frequency.setValueAtTime(band, t);
                    bp.Q.setValueAtTime(1.8, t);
                    const g = ctx.createGain();
                    g.gain.setValueAtTime(vol * 0.55, t);
                    g.gain.exponentialRampToValueAtTime(0.001, t + 0.095);
                    src.connect(bp);
                    bp.connect(g);
                    g.connect(out);
                    src.start(t);
                    src.stop(t + 0.1);

                    const body = ctx.createOscillator();
                    const bg = ctx.createGain();
                    body.type = 'sawtooth';
                    body.frequency.setValueAtTime(freq, t);
                    body.frequency.exponentialRampToValueAtTime(freq * 0.45, t + 0.07);
                    bg.gain.setValueAtTime(vol * 0.22, t);
                    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
                    body.connect(bg);
                    bg.connect(out);
                    body.start(t);
                    body.stop(t + 0.08);
                };
                triggerClack(0, 260, 1750);
                triggerClack(0.13, 340, 2250);
                return true;
            }

            if (key === 'confirm') {
                // Clean tactical lock confirmation tone
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(520, now);
                osc.frequency.exponentialRampToValueAtTime(780, now + 0.075);
                g.gain.setValueAtTime(vol * 0.28, now);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
                osc.connect(g);
                g.connect(out);
                osc.start(now);
                osc.stop(now + 0.115);
                return true;
            }
        } catch {
            // Fall through to file buffer fallback
        }
        return false;
    }

    public playSound(key: string, options?: { volume?: number; playbackRate?: number; dimMusic?: boolean }) {
        const url = SOUND_FILES[key];
        if (!url) return;

        const boost = BOOST_MAP[key] ?? 1.0;
        const shouldDimMusic = options?.dimMusic ?? DIMMING_SFX_KEYS.has(key);

        let finalVolume = this.sfxVolume * boost;
        if (options?.volume !== undefined) finalVolume *= options.volume;
        if (finalVolume <= 0.001) return; // Fast-path skip when SFX is muted

        const webAudioVolume = Math.max(0, Math.min(1.35, finalVolume));
        const htmlAudioVolume = Math.max(0, Math.min(1.0, finalVolume));

        // Subtle pitch micro-variation for repeated UI clicks so rapid tapping feels tactile
        const effectivePlaybackRate = options?.playbackRate ?? (
            key === 'click'
                ? 0.96 + Math.random() * 0.08
                : key === 'confirm'
                    ? 1.18
                    : undefined
        );

        const ctx = getAudioContext();
        if (ctx) {
            if (ctx.state === 'suspended') {
                ctx.resume().catch(() => {});
            }

            if ((key === 'insert' || key === 'rack' || key === 'confirm') && ctx.state === 'running') {
                if (this.playSynthesizedSFX(ctx, key, webAudioVolume)) {
                    return;
                }
            }

            const cached = this.audioBuffers.get(url);
            if (cached) {
                this.touchBufferLRU(url, cached);
                this.playWithBuffer(ctx, cached, webAudioVolume, effectivePlaybackRate, shouldDimMusic);
                return;
            }

            const epochAtStart = this.sfxEpoch;
            this.getOrDecodeBuffer(url).then((decoded) => {
                if (epochAtStart !== this.sfxEpoch) return; // Teardown occurred while decoding
                if (decoded && getAudioContext()) {
                    this.playWithBuffer(getAudioContext()!, decoded, webAudioVolume, effectivePlaybackRate, shouldDimMusic);
                } else {
                    this.playFallbackHTMLAudio(url, htmlAudioVolume, effectivePlaybackRate, shouldDimMusic);
                }
            });
            return;
        }

        this.playFallbackHTMLAudio(url, htmlAudioVolume, effectivePlaybackRate, shouldDimMusic);
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
