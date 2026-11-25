export type MenuBadgeMode = 'CORNER' | 'INLINE';

export interface MenuScaleInput {
    viewportW: number;
    viewportH: number;
    measuredW: number;
    measuredH: number;
    isCompact: boolean;
    isMobileUA: boolean;
    hasTouch: boolean;
}

export interface MenuScaleResult {
    badgeMode: MenuBadgeMode;
    scale: number;
    availHeight: number;
    safeCenterWidth: number;
}

/**
 * Use top-left & top-right corner badges whenever viewport width >= 500px
 * (covers Android landscape phones cleanly without inflating center column height).
 * On narrow portrait widths (< 500px), render Messages & Profile inline above controls.
 */
export function resolveMenuBadgeMode(viewportWidth: number): MenuBadgeMode {
    return viewportWidth >= 500 ? 'CORNER' : 'INLINE';
}

export function computeMenuScaleMetrics(input: MenuScaleInput): MenuScaleResult {
    const w = Math.max(240, input.viewportW);
    const h = Math.max(240, input.viewportH);
    const measuredW = Math.max(200, Math.min(input.measuredW || 400, 448));
    const measuredH = Math.max(200, input.measuredH || (w < 500 ? 590 : 520));

    const badgeMode = resolveMenuBadgeMode(w);
    const availHeight = Math.max(180, h - (h < 520 ? 10 : 20));
    const heightScale = availHeight / measuredH;

    let safeCenterWidth = Math.max(220, w - 16);
    if (badgeMode === 'CORNER') {
        const cornerClearance = w < 680 ? 228 : input.isCompact ? 324 : 490;
        safeCenterWidth = Math.max(210, w - cornerClearance);
    }

    const widthScale = safeCenterWidth / measuredW;
    const fitScale = Math.min(heightScale, widthScale);

    const compact = input.isCompact || input.isMobileUA || input.hasTouch || h < 580 || w < 1024;
    let scale = fitScale;
    if (w >= 1024 && h >= 580 && !compact) {
        scale = Math.max(0.75, Math.min(1.12, Math.min(fitScale, h / 780)));
    } else {
        scale = Math.max(0.4, Math.min(1.0, fitScale));
    }

    return {
        badgeMode,
        scale,
        availHeight,
        safeCenterWidth
    };
}
