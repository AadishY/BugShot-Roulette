import { ItemType } from '../types';

export const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const shuffleArray = <T>(items: T[]): T[] => {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

const FRIENDLY_ITEM_NAMES: Record<ItemType, string> = {
    BEER: 'Beer',
    CIGS: 'Cigarettes',
    GLASS: 'Magnifying Glass',
    CUFFS: 'Handcuffs',
    SAW: 'Hand Saw',
    PHONE: 'Burner Phone',
    INVERTER: 'Polarity Inverter',
    ADRENALINE: 'Adrenaline',
    CHOKE: 'Choke Mod',
    REMOTE: 'Remote Control',
    BIG_INVERTER: 'Big Inverter',
    CONTRACT: 'Blood Contract',
    LUCKYCHARM: 'Lucky Charm',
    FLASHBANG: 'Flashbang',
    CRUSHER: 'Item Crusher',
    TOTEM: 'Totem of Undying',
    MIRROR: 'Mirror',
    DECK_CARD: 'Tarot Card',
    JACKPOT: 'Jackpot Slot Machine'
};

export const getFriendlyItemName = (item: ItemType): string => FRIENDLY_ITEM_NAMES[item] || item;

export type DeviceType = 'mobile' | 'tablet' | 'pc';

export const getDeviceType = (): DeviceType => {
    if (typeof window === 'undefined') return 'pc';
    const ua = navigator.userAgent.toLowerCase();
    const width = window.innerWidth;
    
    const isMobileUA = /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua);
    const isTabletUA = /ipad|tablet|playbook|silk/i.test(ua) || (ua.includes('macintosh') && 'ontouchend' in document);
    
    if (isTabletUA || (width >= 768 && width <= 1024 && ('ontouchstart' in window || navigator.maxTouchPoints > 0))) {
        return 'tablet';
    }
    if (isMobileUA || (width < 768 && ('ontouchstart' in window || navigator.maxTouchPoints > 0))) {
        return 'mobile';
    }
    return 'pc';
};