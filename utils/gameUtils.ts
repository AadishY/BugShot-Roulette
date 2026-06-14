export const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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