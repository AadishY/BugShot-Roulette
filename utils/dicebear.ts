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

export const DICEBEAR_STYLES: { id: DicebearStyle; label: string; description: string }[] = [
    { id: 'thumbs', label: 'Thumbs', description: 'Funky combat operative with tactical glasses' },
    { id: 'moods', label: 'Moods', description: 'Pastel expressions and emotional moods' },
    { id: 'bottts-neutral', label: 'Bottts Neutral', description: 'Mechanical robotic cyber heads' },
    { id: 'critters', label: 'Critters', description: 'Playful cyber alien creatures' },
    { id: 'avataaars-neutral', label: 'Avataaars Neutral', description: 'Tactical stylized agent operatives' }
];

/**
 * Returns canonical, official DiceBear 10.x SVG API URL.
 * Tested and verified 200 OK across all 5 supported styles:
 * thumbs, moods, bottts-neutral, critters, avataaars-neutral.
 */
export const getDicebearUrl = (style: DicebearStyle | string, seed: string): string => {
    const cleanSeed = encodeURIComponent((seed || 'operator').trim());
    const validStyle = DICEBEAR_STYLES.some(s => s.id === style) ? style : 'thumbs';
    return `https://api.dicebear.com/10.x/${validStyle}/svg?seed=${cleanSeed}`;
};

export const generateRandomAvatar = (preferredSeed?: string): AvatarConfig => {
    const randomStyle = DICEBEAR_STYLES[Math.floor(Math.random() * DICEBEAR_STYLES.length)].id;
    const seed = preferredSeed && preferredSeed.trim() 
        ? preferredSeed.trim() 
        : `operator_${Math.random().toString(36).substring(2, 9)}`;
    
    return {
        url: getDicebearUrl(randomStyle, seed),
        style: randomStyle,
        seed
    };
};
