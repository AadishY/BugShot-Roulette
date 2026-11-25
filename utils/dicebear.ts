export type DicebearStyle =
    | 'thumbs'
    | 'moods'
    | 'bottts-neutral'
    | 'critters'
    | 'avataaars-neutral';

export interface AvatarConfig {
    url: string;
    style: DicebearStyle;
    seed: string;
}

export const DEV_AVATAR_URL = 'https://avatars.githubusercontent.com/u/101470733';
export const DEFAULT_FALLBACK_AVATAR = '/image/favicon/android-chrome-192x192.png';

export const DICEBEAR_STYLES: { id: DicebearStyle; label: string; description: string }[] = [
    { id: 'thumbs', label: 'Thumbs', description: 'Funky combat operative with tactical glasses' },
    { id: 'moods', label: 'Moods', description: 'Pastel expressions and emotional moods' },
    { id: 'bottts-neutral', label: 'Bottts Neutral', description: 'Mechanical robotic cyber heads' },
    { id: 'critters', label: 'Critters', description: 'Playful cyber alien creatures' },
    { id: 'avataaars-neutral', label: 'Avataaars Neutral', description: 'Tactical stylized agent operatives' }
];

export const isValidDicebearStyle = (style?: string | null): style is DicebearStyle =>
    Boolean(style && DICEBEAR_STYLES.some(s => s.id === style));

/**
 * Returns canonical, official DiceBear 10.x SVG API URL.
 * Tested and verified 200 OK across all 5 supported styles:
 * thumbs, moods, bottts-neutral, critters, avataaars-neutral.
 */
export const getDicebearUrl = (style: DicebearStyle | string, seed: string): string => {
    const cleanSeed = encodeURIComponent((seed || 'operator').trim());
    const validStyle = isValidDicebearStyle(style) ? style : 'thumbs';
    return `https://api.dicebear.com/10.x/${validStyle}/svg?seed=${cleanSeed}`;
};

export const parseDicebearUrl = (url?: string | null): { style: DicebearStyle; seed: string } | null => {
    if (!url || typeof url !== 'string') return null;
    const match = url.trim().match(/^https?:\/\/api\.dicebear\.com\/[^/]+\/([^/]+)\/svg\?([^#]+)/i);
    if (!match) return null;
    const rawStyle = decodeURIComponent(match[1]);
    const params = new URLSearchParams(match[2]);
    const rawSeed = params.get('seed');
    if (!rawSeed) return null;
    let style: DicebearStyle = 'thumbs';
    if (isValidDicebearStyle(rawStyle)) {
        style = rawStyle;
    } else if (rawStyle === 'avataaars') {
        style = 'avataaars-neutral';
    } else if (rawStyle === 'bottts') {
        style = 'bottts-neutral';
    }
    return { style, seed: rawSeed };
};

export const isUsableAvatarUrl = (url?: string | null): url is string => {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!trimmed || trimmed.includes('undefined') || trimmed.includes('null')) return false;
    if (trimmed.startsWith('data:image/svg+xml')) return false;
    return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/') || trimmed.startsWith('data:image/png');
};

/**
 * Canonical avatar resolver shared across Profile, Main Menu, Leaderboard, Messages, Presence, and ChatBox.
 */
export const resolveCanonicalAvatar = (user?: {
    username?: string;
    displayName?: string;
    avatarUrl?: string;
    avatarStyle?: DicebearStyle | string;
    avatarSeed?: string;
    isDeveloper?: boolean;
    role?: string;
} | null): string => {
    if (!user || typeof user !== 'object') return DEFAULT_FALLBACK_AVATAR;
    const clean = (typeof user.username === 'string' ? user.username : '').toLowerCase().trim();
    if (clean === 'bugshot' || clean === 'system') {
        return DEFAULT_FALLBACK_AVATAR;
    }
    const isDev = clean === 'aadish' || Boolean(user.isDeveloper || user.role === 'developer');
    if (isDev) {
        return DEV_AVATAR_URL;
    }

    const rawUrl = isUsableAvatarUrl(user.avatarUrl) ? user.avatarUrl.trim() : null;
    const parsedFromUrl = parseDicebearUrl(rawUrl);

    if (user.avatarStyle && user.avatarSeed && user.avatarSeed.trim()) {
        if (rawUrl && !parsedFromUrl && !rawUrl.includes('api.dicebear.com')) {
            return rawUrl;
        }
        return getDicebearUrl(user.avatarStyle, user.avatarSeed);
    }

    if (rawUrl) {
        if (parsedFromUrl) {
            return getDicebearUrl(parsedFromUrl.style, parsedFromUrl.seed);
        }
        return rawUrl;
    }

    const style = isValidDicebearStyle(user.avatarStyle) ? user.avatarStyle : 'thumbs';
    const seed =
        (user.avatarSeed && user.avatarSeed.trim()) ||
        (typeof user.username === 'string' && user.username.trim()) ||
        (typeof user.displayName === 'string' && user.displayName.trim()) ||
        'operator';
    return getDicebearUrl(style, seed);
};

const RANDOM_SEED_PREFIXES = [
    'viper', 'wraith', 'phantom', 'reaper', 'cipher', 'cobalt', 'ember', 'onyx',
    'kestrel', 'specter', 'jackal', 'warden', 'hydra', 'nomad', 'vector', 'lynx',
    'sable', 'striker', 'talon', 'zephyr', 'ash', 'pulse', 'rogue', 'valkyrie'
];

let avatarEntropyCounter = 0;

const getRandomUint32 = (): number => {
    try {
        if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
            const buf = new Uint32Array(1);
            globalThis.crypto.getRandomValues(buf);
            return buf[0];
        }
    } catch {}
    return Math.floor(Math.random() * 0xffffffff);
};

export const generateRandomAvatar = (preferredSeed?: string): AvatarConfig => {
    avatarEntropyCounter = (avatarEntropyCounter + 1) % 100000;
    const styleIdx = getRandomUint32() % DICEBEAR_STYLES.length;
    const randomStyle = DICEBEAR_STYLES[styleIdx].id;

    const prefix = RANDOM_SEED_PREFIXES[getRandomUint32() % RANDOM_SEED_PREFIXES.length];
    const tokenA = getRandomUint32().toString(36).slice(0, 5);
    const tokenB = ((Date.now() ^ avatarEntropyCounter) >>> 0).toString(36).slice(-4);

    const cleanedHint = preferredSeed
        ? preferredSeed.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12)
        : '';

    const seed = cleanedHint
        ? `${cleanedHint}-${prefix}-${tokenA}${tokenB}`
        : `${prefix}-${tokenA}${tokenB}`;

    return {
        url: getDicebearUrl(randomStyle, seed),
        style: randomStyle,
        seed
    };
};

