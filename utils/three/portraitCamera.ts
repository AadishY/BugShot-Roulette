export type PortraitCameraFovInput = {
    baseFov: number;
    aspect: number;
    isSelfAim?: boolean;
};

/**
 * Compensate Three.js vertical FOV on portrait/vertical aspect ratios (< 1.0)
 * so table width, side seats (3P/4P), tarot cards, and held shotgun barrels remain visible
 * instead of being cropped on the left and right edges.
 * Returns `baseFov` unchanged for landscape/square screens (aspect >= 1.0).
 */
export function computeResponsiveCameraFov(
    baseFov: number,
    aspect: number,
    isSelfAim: boolean = false
): number {
    if (!Number.isFinite(baseFov) || baseFov <= 0) return 85;
    if (!Number.isFinite(aspect) || aspect <= 0 || aspect >= 1.0) {
        return baseFov;
    }

    // Clamp extremely tall aspect ratios (~9:22) to avoid heavy fisheye distortion
    const safeAspect = Math.max(0.45, aspect);
    // Target ~1.04 reference horizontal aspect framing while blending gently
    const refAspect = 1.04;
    const halfBaseRad = ((baseFov * Math.PI) / 180) * 0.5;
    const rawCompensatedDeg =
        (2 * Math.atan(Math.tan(halfBaseRad) * (refAspect / safeAspect)) * 180) / Math.PI;

    // Blend 72% toward Hor+ compensation so vertical depth still feels natural
    const blended = baseFov + (rawCompensatedDeg - baseFov) * 0.72;
    const maxCap = isSelfAim ? 92 : 104;
    return Math.min(maxCap, Math.max(baseFov, Number(blended.toFixed(2))));
}

/**
 * Pull camera slightly further back along Z on narrow portrait viewports during
 * neutral / table / choosing views so the table surface and resting shotgun stay framed cleanly.
 */
export function computePortraitCameraZAdjust(
    aspect: number,
    aimTarget: string,
    cameraView: string,
    phase: string
): number {
    if (!Number.isFinite(aspect) || aspect <= 0 || aspect >= 1.0) {
        return 0;
    }
    if (phase === 'BOOT' || phase === 'INTRO') return 0;
    if (aimTarget === 'SELF') return 0;

    const narrowness = Math.min(1, Math.max(0, (1.0 - Math.max(0.45, aspect)) / 0.55));
    if (cameraView === 'TABLE') {
        return Number((1.6 * narrowness).toFixed(2));
    }
    if (aimTarget === 'OPPONENT' || aimTarget === 'LEFT' || aimTarget === 'RIGHT') {
        return Number((1.25 * narrowness).toFixed(2));
    }
    return Number((2.4 * narrowness).toFixed(2));
}

/**
 * Keep the held shotgun centered horizontally on narrow portrait screens so the barrel tip
 * stays cleanly inside the vertical viewport.
 */
export function computePortraitGunChoosingX(aspect: number, desktopX: number): number {
    if (!Number.isFinite(aspect) || aspect <= 0 || aspect >= 1.0) {
        return desktopX;
    }
    return 0;
}
