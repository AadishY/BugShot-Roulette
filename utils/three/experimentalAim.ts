import { AimTarget } from '../../types';

export type ExperimentalTargetOwner = 'PLAYER' | 'DEALER' | 'PLAYER3' | 'PLAYER4';

export type ExperimentalHitTag =
    | 'GUN'
    | 'FRONT_OPPONENT'
    | 'LOCAL_PLAYER1'
    | 'PLAYER3'
    | 'PLAYER4'
    | 'TABLE_BOTTOM_A'
    | 'TABLE_BOTTOM_B'
    | 'TABLE_SURFACE'
    | null;

export type ExperimentalAction =
    | { type: 'PICKUP_GUN' }
    | { type: 'SHOOT'; target: ExperimentalTargetOwner }
    | null;

export interface ExperimentalTurnCheckInput {
    phase: string;
    turnOwner: string;
    isLocalSplit?: boolean;
    isMultiplayer?: boolean;
    isMyTurn?: boolean;
    isProcessing?: boolean;
    isRecovering?: boolean;
}

export interface ExperimentalResolveInput {
    isGunHeld: boolean;
    isLocalSplit?: boolean;
    turnOwner: string;
    hitTag: ExperimentalHitTag;
    ndcY?: number;
    tableHitLocalZ?: number | null;
}

export function isExperimentalTurnActive(input: ExperimentalTurnCheckInput): boolean {
    if (input.isProcessing || input.isRecovering) return false;
    if (input.phase !== 'PLAYER_TURN') return false;
    if (input.isMultiplayer) {
        return Boolean(input.isMyTurn);
    }
    if (input.isLocalSplit) {
        return input.turnOwner === 'PLAYER' || input.turnOwner === 'DEALER';
    }
    return input.turnOwner === 'PLAYER';
}

export function getExperimentalSelfTarget(isLocalSplit?: boolean, turnOwner?: string): 'PLAYER' | 'DEALER' {
    return isLocalSplit && turnOwner === 'DEALER' ? 'DEALER' : 'PLAYER';
}

export function resolveExperimentalActionFromHit(input: ExperimentalResolveInput): ExperimentalAction {
    if (!input.hitTag) return null;

    if (!input.isGunHeld) {
        return input.hitTag === 'GUN' ? { type: 'PICKUP_GUN' } : null;
    }

    const isSplitSeatB = Boolean(input.isLocalSplit && input.turnOwner === 'DEALER');
    const selfOwner: 'PLAYER' | 'DEALER' = isSplitSeatB ? 'DEALER' : 'PLAYER';
    const frontOpponentOwner: 'PLAYER' | 'DEALER' = isSplitSeatB ? 'PLAYER' : 'DEALER';

    switch (input.hitTag) {
        case 'FRONT_OPPONENT':
            return { type: 'SHOOT', target: frontOpponentOwner };
        case 'LOCAL_PLAYER1':
            return isSplitSeatB ? { type: 'SHOOT', target: 'PLAYER' } : null;
        case 'PLAYER3':
            return { type: 'SHOOT', target: 'PLAYER3' };
        case 'PLAYER4':
            return { type: 'SHOOT', target: 'PLAYER4' };
        case 'TABLE_BOTTOM_A':
            return !isSplitSeatB ? { type: 'SHOOT', target: 'PLAYER' } : null;
        case 'TABLE_BOTTOM_B':
            return isSplitSeatB ? { type: 'SHOOT', target: 'DEALER' } : null;
        case 'TABLE_SURFACE': {
            if (typeof input.tableHitLocalZ === 'number') {
                if (!isSplitSeatB && input.tableHitLocalZ >= 1.2) {
                    return { type: 'SHOOT', target: selfOwner };
                }
                if (isSplitSeatB && input.tableHitLocalZ <= -1.2) {
                    return { type: 'SHOOT', target: selfOwner };
                }
            }
            if (typeof input.ndcY === 'number' && input.ndcY <= -0.32) {
                return { type: 'SHOOT', target: selfOwner };
            }
            return null;
        }
        default:
            return null;
    }
}

export function getExperimentalHoverLabel(
    action: ExperimentalAction,
    isLocalSplit?: boolean,
    turnOwner?: string,
    targetOpponentName?: string
): string | null {
    if (!action) return null;
    if (action.type === 'PICKUP_GUN') return 'GRAB SHOTGUN';
    const selfOwner = getExperimentalSelfTarget(isLocalSplit, turnOwner);
    if (action.target === selfOwner) return 'SHOOT YOURSELF';
    if (action.target === 'PLAYER3') return 'SHOOT OPPONENT 2';
    if (action.target === 'PLAYER4') return 'SHOOT OPPONENT 3';
    return `SHOOT ${(targetOpponentName || 'DEALER').toUpperCase()}`;
}

export function getExperimentalAimTarget(
    action: ExperimentalAction,
    isLocalSplit?: boolean,
    turnOwner?: string,
    isGunHeld: boolean = true
): AimTarget {
    if (!action || action.type !== 'SHOOT') {
        return isGunHeld ? 'CHOOSING' : 'IDLE';
    }
    const selfTarget = getExperimentalSelfTarget(isLocalSplit, turnOwner);
    if (action.target === selfTarget) return 'SELF';
    if (action.target === 'PLAYER3') return 'LEFT';
    if (action.target === 'PLAYER4') return 'RIGHT';
    return 'OPPONENT';
}
