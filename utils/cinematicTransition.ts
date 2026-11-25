export const MENU_LAUNCH_DURATION_MS = 380;
export const LOADING_EXIT_DURATION_MS = 340;
export const GAME_REVEAL_DURATION_MS = 650;

export type AppTransitionOrigin = 'MENU' | 'LOADING_SP' | 'LOADING_MP' | 'LOBBY' | 'MP_SELECTION' | 'GAME' | string;

export function resolveTransitionDelay(baseMs: number, reduceMotion?: boolean): number {
    if (reduceMotion) return 0;
    return Math.max(0, Math.round(baseMs));
}

export function shouldTriggerGameReveal(prevState: AppTransitionOrigin, nextState: AppTransitionOrigin): boolean {
    if (prevState === nextState) return false;
    if (nextState === 'GAME') return true;
    if ((prevState === 'LOADING_MP' || prevState === 'LOADING_SP') && (nextState === 'MP_SELECTION' || nextState === 'LOBBY')) {
        return true;
    }
    return false;
}
