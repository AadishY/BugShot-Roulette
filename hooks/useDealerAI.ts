import React, { useEffect, useRef, useState } from 'react';
import { GameState, PlayerState, ShellType, ItemType, TurnOwner, AimTarget, CameraView, AnimationState, TarotCard } from '../types';
import { wait } from '../utils/gameUtils';
import { MAX_ITEMS } from '../constants';

// Utility scoring for Dealer's smart Tarot card selection (Hard Mode)
const evaluateCardForDealer = (
    cardName: TarotCard['name'],
    dealer: PlayerState,
    player: PlayerState,
    gameState: GameState,
    currentKnown: ShellType | null
): number => {
    const dealerHp = dealer?.hp ?? 0;
    const dealerMaxHp = dealer?.maxHp ?? 0;
    const playerHp = player?.hp ?? 0;
    const chamber = gameState?.chamber || [];
    const curIdx = gameState?.currentShellIndex ?? 0;
    const remainingShells = Math.max(0, chamber.length - curIdx);
    const dealerItems = dealer?.items || [];
    const playerItems = player?.items || [];

    switch (cardName) {
        case 'The Magician':
            return dealerItems.length < MAX_ITEMS ? 6 : 1;

        case 'The Hanged Man':
            if (dealerHp <= 1) return dealerItems.includes('TOTEM') && !dealer.isFlashbanged ? -8 : -20;
            if (dealerHp <= 2) return -12;
            return -5;

        case 'The Hermit': {
            if (dealer.isHandcuffed) return 8; // Breaks own cuffs and keeps turn!
            const playerImmune = (player?.jackpotImmunityShots ?? 0) > 0;
            return playerImmune ? -6 : -3;
        }

        case 'The Moon': {
            const stealable = playerItems.filter(i => i !== 'TOTEM' && i !== 'JACKPOT');
            if (stealable.length === 0) return 0;
            const highValueItems = stealable.filter(i => ['SAW', 'CUFFS', 'INVERTER', 'CHOKE', 'CIGS', 'FLASHBANG', 'CONTRACT'].includes(i));
            return highValueItems.length > 0 ? 9 : 5;
        }

        case 'Judgment':
            if (currentKnown === 'LIVE') return 0;
            return (gameState?.blankCount ?? 0) === 0 ? 0 : 6;

        case 'Wheel of Fortune':
            if (currentKnown === 'LIVE') return -5;
            if (currentKnown === 'BLANK') return 6;
            return 3;

        case 'The Sun':
            if (dealerHp >= dealerMaxHp) return 0;
            if (dealerHp <= 2) return 9;
            return 5;

        case 'Death':
            return dealerItems.length === 0 ? 0 : (dealerItems.length <= 1 ? -5 : -2);

        case 'The Tower': {
            const destroyable = playerItems.filter(i => i !== 'TOTEM');
            if (destroyable.length === 0) return 0;
            return 7;
        }

        case 'The Fool':
            return remainingShells > 1 ? 4 : 2;

        case 'Justice':
            if (dealerHp < playerHp) return 10;
            if (dealerHp > playerHp) return -8;
            return 0;

        case 'Temperance': {
            const dealerCount = dealerItems.length;
            const playerCount = playerItems.length;
            if (playerCount > dealerCount) return 8;
            if (playerCount < dealerCount) return -5;
            const highVal = (arr: ItemType[]) => arr.filter(i => ['SAW', 'CUFFS', 'TOTEM', 'CONTRACT', 'FLASHBANG'].includes(i)).length;
            const diff = highVal(playerItems) - highVal(dealerItems);
            if (diff > 0) return 6;
            if (diff < 0) return -3;
            return 0;
        }

        default:
            return 0;
    }
};

interface DealerAIProps {
    gameState: GameState;
    dealer: PlayerState;
    player: PlayerState;
    knownShell: ShellType | null;
    animState: AnimationState;
    fireShot: (shooter: TurnOwner, target: TurnOwner) => Promise<void>;
    processItemEffect: (
        user: TurnOwner,
        item: ItemType,
        deckCardsOverride?: string[],
        jackpotOutcomeOverride?: 'JACKPOT' | 'NORMAL' | 'LOSE',
        crushIndexOverride?: number,
        contractLootOverride?: ItemType[],
        phoneFutureIndexOverride?: number
    ) => Promise<boolean>;
    setDealer: React.Dispatch<React.SetStateAction<PlayerState>>;
    setPlayer: React.Dispatch<React.SetStateAction<PlayerState>>;
    setTargetAim: (aim: AimTarget) => void;
    setCameraView: (view: CameraView) => void;
    setOverlayText?: React.Dispatch<React.SetStateAction<string | null>>;
    isMultiplayer?: boolean;
    isProcessing: boolean;
    setIsProcessing: (val: boolean) => void;
    selectTarotCard?: (index: number) => Promise<void>;
}

const getStealableIndices = (
    playerItems: ItemType[],
    dealerState: PlayerState,
    playerState: PlayerState,
    gameState: GameState
): number[] => {
    const remainingShells = (gameState.chamber?.length ?? 0) - (gameState.currentShellIndex ?? 0);
    const hasTotem = (dealerState.items || []).includes('TOTEM') && !dealerState.isFlashbanged;
    const hasJackpot = (dealerState.jackpotImmunityShots ?? 0) > 0;
    const playerCopied = (playerState.lastTurnItemsUsed || []).filter(i => i !== 'MIRROR' && i !== 'ADRENALINE' && i !== 'JACKPOT');

    const indices: number[] = [];
    for (let i = 0; i < playerItems.length; i++) {
        const item = playerItems[i];
        if (!item || item === 'ADRENALINE' || item === 'TOTEM' || item === 'JACKPOT') continue;
        if (item === 'SAW' && dealerState.isSawedActive) continue;
        if (item === 'CHOKE' && dealerState.isChokeActive) continue;
        if (item === 'CUFFS' && (playerState.isHandcuffed || gameState.lastTurnWasSkipped)) continue;
        if (item === 'CONTRACT' && dealerState.hp <= 1 && !hasTotem && !hasJackpot) continue;
        if (item === 'CRUSHER' && playerItems.length <= 1) continue;
        if (item === 'MIRROR' && playerCopied.length === 0) continue;
        if ((item === 'PHONE' || item === 'REMOTE') && remainingShells <= 1) continue;
        indices.push(i);
    }
    return indices;
};

const isMirrorSafeForDealer = (
    copiedItems: ItemType[],
    dealerState: PlayerState,
    currentKnown: ShellType | null
): boolean => {
    if (copiedItems.length === 0) return false;
    const hasTotem = (dealerState.items || []).includes('TOTEM') && !dealerState.isFlashbanged;
    const hasJackpot = (dealerState.jackpotImmunityShots ?? 0) > 0;
    if (copiedItems.includes('CONTRACT') && dealerState.hp <= 1 && !hasTotem && !hasJackpot) return false;
    if (copiedItems.includes('BEER') && currentKnown === 'BLANK') return false;
    return true;
};

export const useDealerAI = ({
    gameState,
    dealer,
    player,
    knownShell,
    animState,
    fireShot,
    processItemEffect,
    setDealer,
    setPlayer,
    setTargetAim,
    setCameraView,
    setOverlayText,
    isMultiplayer = false,
    isProcessing,
    setIsProcessing,
    selectTarotCard
}: DealerAIProps) => {
    const isAITurnInProgress = useRef(false);
    const isMountedRef = useRef(true);
    const turnGenRef = useRef(0);
    const activeTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

    // AI Memory: Map<shellIndex, type> - Tracks specifically known shells
    const aiMemory = useRef<Map<number, ShellType>>(new Map());
    const itemsUsedThisTurnRef = useRef<number>(0);
    const [aiTick, setAiTick] = useState(0);

    // Tracking refs for chamber / phase mutations
    const prevPhaseRef = useRef(gameState.phase);
    const prevChamberRef = useRef(gameState.chamber);
    const prevShellIndexRef = useRef(gameState.currentShellIndex);
    const prevPlayerUsedLenRef = useRef((player.currentTurnItemsUsed || []).length);
    const prevSelectedCardRef = useRef<{ name: TarotCard['name']; liveCount: number; index: number } | null>(null);

    // Tab visibility handling
    const [isTabVisible, setIsTabVisible] = useState(!document.hidden);
    const isTabVisibleRef = useRef(!document.hidden);
    useEffect(() => {
        const handleVisibility = () => {
            const visible = !document.hidden;
            isTabVisibleRef.current = visible;
            setIsTabVisible(visible);
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, []);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            isAITurnInProgress.current = false;
            turnGenRef.current++;
            activeTimersRef.current.forEach(clearTimeout);
            activeTimersRef.current.clear();
        };
    }, []);

    // Live refs for async turn loop
    const gameStateRef = useRef(gameState);
    const dealerRef = useRef(dealer);
    const playerRef = useRef(player);
    const knownShellRef = useRef(knownShell);
    const fireShotRef = useRef(fireShot);
    const processItemEffectRef = useRef(processItemEffect);
    const animStateRef = useRef(animState);
    const selectTarotCardRef = useRef(selectTarotCard);

    gameStateRef.current = gameState;
    dealerRef.current = dealer;
    playerRef.current = player;
    knownShellRef.current = knownShell;
    fireShotRef.current = fireShot;
    processItemEffectRef.current = processItemEffect;
    animStateRef.current = animState;
    selectTarotCardRef.current = selectTarotCard;

    const scheduleOverlayClear = (message: string, durationMs: number) => {
        if (!setOverlayText) return;
        setOverlayText(message);
        const id = setTimeout(() => {
            activeTimersRef.current.delete(id);
            if (isMountedRef.current) {
                setOverlayText(prev => (prev === message ? null : prev));
            }
        }, durationMs);
        activeTimersRef.current.add(id);
    };

    // Reset memory ONLY on actual round/batch transitions (not every time currentShellIndex === 0!)
    useEffect(() => {
        const enteringResetPhase =
            (gameState.phase === 'LOAD' || gameState.phase === 'BOOT' || gameState.phase === 'INTRO' || gameState.phase === 'LOOTING') &&
            prevPhaseRef.current !== gameState.phase;
        const freshBatchLoaded =
            gameState.currentShellIndex === 0 &&
            prevChamberRef.current !== gameState.chamber &&
            (gameState.phase === 'LOAD' || gameState.phase === 'LOOTING');

        if (enteringResetPhase || freshBatchLoaded) {
            aiMemory.current.clear();
            itemsUsedThisTurnRef.current = 0;
            prevPlayerUsedLenRef.current = 0;
            prevSelectedCardRef.current = null;
        }

        if (gameState.phase === 'BOOT' || gameState.phase === 'INTRO' || gameState.phase === 'GAME_OVER') {
            turnGenRef.current++;
        }

        prevPhaseRef.current = gameState.phase;
        prevChamberRef.current = gameState.chamber;
    }, [gameState.phase, gameState.chamber, gameState.currentShellIndex]);

    // Prune consumed shell indices when currentShellIndex advances
    useEffect(() => {
        if (gameState.currentShellIndex !== prevShellIndexRef.current) {
            for (const key of Array.from(aiMemory.current.keys())) {
                if (key < gameState.currentShellIndex) {
                    aiMemory.current.delete(key);
                }
            }
            prevShellIndexRef.current = gameState.currentShellIndex;
        }
    }, [gameState.currentShellIndex]);

    // Reset item usage counter when turn switches away from Dealer
    useEffect(() => {
        if (gameState.turnOwner !== 'DEALER') {
            itemsUsedThisTurnRef.current = 0;
            prevPlayerUsedLenRef.current = (player.currentTurnItemsUsed || []).length;
        }
    }, [gameState.turnOwner, player.currentTurnItemsUsed]);

    // Keep AI memory accurate when PLAYER mutates the chamber (Inverter, Big Inverter, Remote, Beer)
    useEffect(() => {
        const used = player.currentTurnItemsUsed || [];
        if (gameState.turnOwner === 'PLAYER' && used.length > prevPlayerUsedLenRef.current) {
            const idx = gameState.currentShellIndex;
            for (let k = prevPlayerUsedLenRef.current; k < used.length; k++) {
                const act = used[k];
                if (act === 'INVERTER') {
                    if (aiMemory.current.has(idx)) {
                        const prevVal = aiMemory.current.get(idx);
                        if (prevVal) aiMemory.current.set(idx, prevVal === 'LIVE' ? 'BLANK' : 'LIVE');
                    }
                } else if (act === 'BIG_INVERTER') {
                    for (const [slot, val] of Array.from(aiMemory.current.entries())) {
                        if (slot >= idx) {
                            aiMemory.current.set(slot, val === 'LIVE' ? 'BLANK' : 'LIVE');
                        }
                    }
                } else if (act === 'REMOTE') {
                    const m1 = aiMemory.current.get(idx);
                    const m2 = aiMemory.current.get(idx + 1);
                    if (m2) aiMemory.current.set(idx, m2);
                    else aiMemory.current.delete(idx);
                    if (m1) aiMemory.current.set(idx + 1, m1);
                    else aiMemory.current.delete(idx + 1);
                } else if (act === 'BEER') {
                    aiMemory.current.delete(idx);
                }
            }
        }
        prevPlayerUsedLenRef.current = used.length;
    }, [player.currentTurnItemsUsed, gameState.turnOwner, gameState.currentShellIndex]);

    // Keep AI memory accurate after Tarot cards (Wheel of Fortune / Judgment)
    useEffect(() => {
        if (
            gameState.phase === 'CARD_SELECT' &&
            gameState.selectedCardIndex !== null &&
            gameState.selectedCardIndex !== undefined &&
            gameState.deckCards?.[gameState.selectedCardIndex]
        ) {
            prevSelectedCardRef.current = {
                name: gameState.deckCards[gameState.selectedCardIndex].name,
                liveCount: gameState.liveCount,
                index: gameState.currentShellIndex
            };
        } else if (prevSelectedCardRef.current && gameState.phase !== 'CARD_SELECT') {
            const { name, liveCount: oldLive, index: cardIdx } = prevSelectedCardRef.current;
            prevSelectedCardRef.current = null;
            if (name === 'Wheel of Fortune') {
                aiMemory.current.clear();
            } else if (name === 'Judgment') {
                if (gameState.liveCount > oldLive) {
                    aiMemory.current.set(cardIdx, 'LIVE');
                } else {
                    aiMemory.current.delete(cardIdx);
                }
            }
        }
    }, [gameState.phase, gameState.selectedCardIndex, gameState.deckCards, gameState.liveCount, gameState.currentShellIndex]);

    useEffect(() => {
        if (isMultiplayer) return;
        if (isProcessing) return;

        const isDealerCardSelect = gameState.phase === 'CARD_SELECT' && gameState.turnOwner === 'DEALER' && gameState.selectedCardIndex === null;
        if ((gameState.phase === 'DEALER_TURN' || isDealerCardSelect) && !isAITurnInProgress.current && isTabVisible) {
            isAITurnInProgress.current = true;
            setIsProcessing(true);
            if (gameState.phase === 'DEALER_TURN') {
                setCameraView('PLAYER');
            }

            const myGen = turnGenRef.current;
            const isCancelled = () => !isMountedRef.current || myGen !== turnGenRef.current || document.hidden || !isTabVisibleRef.current;

            const applyMemoryForDealerItem = (
                item: ItemType,
                chamber: ShellType[],
                slotIdx: number,
                phoneIdx?: number
            ) => {
                if (item === 'GLASS') {
                    if (chamber[slotIdx]) aiMemory.current.set(slotIdx, chamber[slotIdx]);
                } else if (item === 'INVERTER') {
                    if (aiMemory.current.has(slotIdx)) {
                        const prevM = aiMemory.current.get(slotIdx);
                        if (prevM) aiMemory.current.set(slotIdx, prevM === 'LIVE' ? 'BLANK' : 'LIVE');
                    }
                } else if (item === 'BIG_INVERTER') {
                    for (const [k, v] of Array.from(aiMemory.current.entries())) {
                        if (k >= slotIdx) {
                            aiMemory.current.set(k, v === 'LIVE' ? 'BLANK' : 'LIVE');
                        }
                    }
                } else if (item === 'REMOTE') {
                    const m1 = aiMemory.current.get(slotIdx);
                    const m2 = aiMemory.current.get(slotIdx + 1);
                    if (m2) aiMemory.current.set(slotIdx, m2);
                    else aiMemory.current.delete(slotIdx);
                    if (m1) aiMemory.current.set(slotIdx + 1, m1);
                    else aiMemory.current.delete(slotIdx + 1);
                } else if (item === 'BEER') {
                    aiMemory.current.delete(slotIdx);
                } else if (item === 'PHONE' && phoneIdx !== undefined && chamber[phoneIdx]) {
                    aiMemory.current.set(phoneIdx, chamber[phoneIdx]);
                }
            };

            const runAITurn = async () => {
                let handedOffRound = false;
                try {
                    await wait(800 + Math.random() * 700);
                    if (isCancelled()) return;

                    const currentPhase = gameStateRef.current.phase;
                    const isDealerCardSelectVal = currentPhase === 'CARD_SELECT' && gameStateRef.current.turnOwner === 'DEALER' && gameStateRef.current.selectedCardIndex === null;
                    if ((currentPhase !== 'DEALER_TURN' && !isDealerCardSelectVal) || gameStateRef.current.winner) {
                        return;
                    }

                    if (currentPhase === 'CARD_SELECT') {
                        await wait(1100);
                        if (isCancelled()) return;

                        if (gameStateRef.current.phase === 'CARD_SELECT' && gameStateRef.current.turnOwner === 'DEALER') {
                            const cards = gameStateRef.current.deckCards;
                            if (!cards || cards.length === 0) {
                                // Recover safely if deckCards is ever empty
                                setGameStateSafeRecover(selectTarotCardRef.current);
                                return;
                            }
                            let chosenIdx = Math.floor(Math.random() * cards.length);

                            // Hard Mode: 90% chance to peek and choose best card
                            if (gameStateRef.current.isHardMode && Math.random() < 0.90) {
                                const curIdx = gameStateRef.current.currentShellIndex;
                                const curKnown = aiMemory.current.get(curIdx) || null;
                                let bestScore = -Infinity;
                                let bestIdx = 0;
                                for (let ci = 0; ci < cards.length; ci++) {
                                    const card = cards[ci];
                                    if (!card?.name) continue;
                                    const score = evaluateCardForDealer(
                                        card.name,
                                        dealerRef.current,
                                        playerRef.current,
                                        gameStateRef.current,
                                        curKnown
                                    );
                                    if (score > bestScore) {
                                        bestScore = score;
                                        bestIdx = ci;
                                    }
                                }
                                chosenIdx = bestIdx;
                            }

                            if (selectTarotCardRef.current) {
                                try {
                                    await selectTarotCardRef.current(chosenIdx);
                                    handedOffRound = true;
                                } catch (tarotErr) {
                                    console.error("Dealer AI selectTarotCard error:", tarotErr);
                                }
                            }
                        }
                        return;
                    }

                    const chamber = gameStateRef.current?.chamber || [];
                    const currentIdx = gameStateRef.current?.currentShellIndex ?? 0;
                    const totalRemaining = Math.max(0, chamber.length - currentIdx);

                    if (totalRemaining === 0 || currentIdx >= chamber.length) {
                        return;
                    }

                    // --- ACCURATE SHELL COUNTING & DEDUCTION ---
                    const visibleLive = gameStateRef.current?.liveCount ?? 0;
                    const visibleBlank = gameStateRef.current?.blankCount ?? 0;

                    if (knownShellRef.current) {
                        aiMemory.current.set(currentIdx, knownShellRef.current);
                    }

                    const countMemoryAndDeduce = () => {
                        let memLive = 0;
                        let memBlank = 0;
                        for (let i = currentIdx; i < chamber.length; i++) {
                            const m = aiMemory.current.get(i);
                            if (m === 'LIVE') memLive++;
                            else if (m === 'BLANK') memBlank++;
                        }
                        const unexpLive = Math.max(0, visibleLive - memLive);
                        const unexpBlank = Math.max(0, visibleBlank - memBlank);
                        const unkSlots = Math.max(0, totalRemaining - memLive - memBlank);

                        if (unkSlots > 0) {
                            if (unexpLive === 0 && unexpBlank > 0) {
                                for (let i = currentIdx; i < chamber.length; i++) {
                                    if (!aiMemory.current.has(i)) aiMemory.current.set(i, 'BLANK');
                                }
                            } else if (unexpBlank === 0 && unexpLive > 0) {
                                for (let i = currentIdx; i < chamber.length; i++) {
                                    if (!aiMemory.current.has(i)) aiMemory.current.set(i, 'LIVE');
                                }
                            }
                        }

                        const curKnown = aiMemory.current.get(currentIdx) || null;
                        // Recompute after deduction
                        let mLive2 = 0;
                        let mBlank2 = 0;
                        for (let i = currentIdx; i < chamber.length; i++) {
                            const m = aiMemory.current.get(i);
                            if (m === 'LIVE') mLive2++;
                            else if (m === 'BLANK') mBlank2++;
                        }
                        const remLive = Math.max(0, visibleLive - mLive2);
                        const remBlank = Math.max(0, visibleBlank - mBlank2);
                        const remUnk = Math.max(0, totalRemaining - mLive2 - mBlank2);
                        const unkProb = remUnk > 0
                            ? Math.min(1, Math.max(0, remLive / remUnk))
                            : (visibleLive + visibleBlank > 0 ? visibleLive / (visibleLive + visibleBlank) : 0);

                        return { curKnown, unkProb, remLive, remBlank, remUnk };
                    };

                    let { curKnown: currentKnown, unkProb: unknownLiveProb } = countMemoryAndDeduce();

                    const isFlashbanged = Boolean(dealerRef.current?.isFlashbanged);
                    const dealerItems = dealerRef.current?.items || [];
                    const playerItems = playerRef.current?.items || [];
                    const dealerHp = dealerRef.current?.hp ?? 0;
                    const dealerMaxHp = dealerRef.current?.maxHp ?? 4;
                    const dealerSawed = Boolean(dealerRef.current?.isSawedActive);
                    const dealerChoke = Boolean(dealerRef.current?.isChokeActive);
                    const playerImmune = (playerRef.current?.jackpotImmunityShots ?? 0) > 0;
                    const playerHasActiveTotem = playerItems.includes('TOTEM') && !playerRef.current?.isFlashbanged;
                    const lastTurnSkipped = Boolean(gameStateRef.current?.lastTurnWasSkipped);
                    const canCuffPlayer = !playerRef.current?.isHandcuffed && !lastTurnSkipped && totalRemaining > (dealerChoke ? 2 : 1);
                    const unknownFutureSlots: number[] = [];
                    for (let i = currentIdx + 1; i < chamber.length; i++) {
                        if (!aiMemory.current.has(i)) unknownFutureSlots.push(i);
                    }
                    const stealableIndices = getStealableIndices(playerItems, dealerRef.current, playerRef.current, gameStateRef.current);
                    const playerMirrorItems = (playerRef.current?.lastTurnItemsUsed || []).filter(i => i !== 'MIRROR' && i !== 'ADRENALINE' && i !== 'JACKPOT');
                    const mirrorSafe = isMirrorSafeForDealer(playerMirrorItems, dealerRef.current, currentKnown);

                    let itemToUse: ItemType | null = null;

                    if (!isFlashbanged && itemsUsedThisTurnRef.current < MAX_ITEMS) {
                        // --- NORMAL MODE 10% MISTAKE / VARIANCE TRIGGER ---
                        let skipNormalItems = false;
                        if (!gameStateRef.current?.isHardMode && Math.random() < 0.10) {
                            if (Math.random() < 0.5) {
                                skipNormalItems = true;
                            } else if (dealerItems.length > 0) {
                                const usableItems = dealerItems.filter(item => {
                                    if (item === 'TOTEM') return false;
                                    if (item === 'CONTRACT' && dealerHp <= 2) return false;
                                    if (item === 'SAW' && dealerSawed) return false;
                                    if (item === 'CHOKE' && (dealerChoke || totalRemaining < 2)) return false;
                                    if (item === 'CUFFS' && !canCuffPlayer) return false;
                                    if (item === 'REMOTE' && totalRemaining < 2) return false;
                                    if (item === 'PHONE' && totalRemaining < 2) return false;
                                    if (item === 'MIRROR' && !mirrorSafe) return false;
                                    if (item === 'CRUSHER' && playerItems.length === 0) return false;
                                    if (item === 'ADRENALINE' && stealableIndices.length === 0) return false;
                                    if (item === 'FLASHBANG' && playerRef.current?.isFlashbanged) return false;
                                    return true;
                                });
                                if (usableItems.length > 0) {
                                    itemToUse = usableItems[Math.floor(Math.random() * usableItems.length)];
                                }
                            }
                        }

                        if (skipNormalItems || itemToUse) {
                            // Keep decision from above
                        } else if (gameStateRef.current?.isHardMode) {
                            // --- HARD MODE LOGIC ---
                            // 0. SUPERNATURAL INTUITION (75% chance on unknown current slot)
                            if (!currentKnown && Math.random() < 0.75) {
                                const actual = chamber[currentIdx];
                                if (actual) {
                                    aiMemory.current.set(currentIdx, actual);
                                    ({ curKnown: currentKnown, unkProb: unknownLiveProb } = countMemoryAndDeduce());
                                }
                            }

                            // 1. SURVIVAL HEAL
                            if (dealerHp < dealerMaxHp && dealerItems.includes('CIGS')) {
                                if (dealerHp <= 2 || Math.random() < 0.85) itemToUse = 'CIGS';
                            }
                            // 2. LUCKY CHARM + CONTRACT COMBO
                            else if (dealerItems.includes('LUCKYCHARM') && dealerItems.includes('CONTRACT') && dealerHp >= 3 && dealerItems.length <= 6) {
                                itemToUse = 'LUCKYCHARM';
                            }
                            // 3. CONTRACT SACRIFICE
                            else if (dealerHp >= 3 && dealerItems.length <= 6 && dealerItems.includes('CONTRACT')) {
                                itemToUse = 'CONTRACT';
                            }
                            // 4. INTEL GATHERING (GLASS)
                            else if (!currentKnown && dealerItems.includes('GLASS') && totalRemaining >= 1) {
                                const hasActionableItem = dealerItems.some(i => ['SAW', 'INVERTER', 'BIG_INVERTER', 'CHOKE', 'CUFFS', 'BEER', 'REMOTE'].includes(i));
                                if (hasActionableItem || dealerHp <= 2 || Math.abs(unknownLiveProb - 0.5) <= 0.30) {
                                    itemToUse = 'GLASS';
                                }
                            }
                            // 5. INTEL GATHERING (PHONE) - Gather unknown future slot intel before Choke/Remote/BigInverter
                            else if (dealerItems.includes('PHONE') && unknownFutureSlots.length > 0) {
                                itemToUse = 'PHONE';
                            }
                            // 6. INVERTER OVERRIDE FOR JACKPOT IMMUNITY (flip LIVE -> BLANK and shoot self to keep turn)
                            else if (currentKnown === 'LIVE' && playerImmune && dealerItems.includes('INVERTER')) {
                                itemToUse = 'INVERTER';
                            }
                            // 7. INVERTER COMBO (BLANK -> LIVE)
                            else if (currentKnown === 'BLANK' && dealerItems.includes('INVERTER')) {
                                itemToUse = 'INVERTER';
                            }
                            // 8. BIG INVERTER (only when blanks outnumber lives, or equal and current is known blank)
                            else if (dealerItems.includes('BIG_INVERTER') && totalRemaining >= 2) {
                                if (visibleBlank > visibleLive || (visibleBlank === visibleLive && currentKnown === 'BLANK')) {
                                    itemToUse = 'BIG_INVERTER';
                                }
                            }
                            // 9. TOTEM NEUTRALIZATION BEFORE LIVE SHOT
                            else if ((currentKnown === 'LIVE' || unknownLiveProb >= 0.70) && playerHasActiveTotem && dealerItems.includes('FLASHBANG')) {
                                itemToUse = 'FLASHBANG';
                            }
                            else if ((currentKnown === 'LIVE' || unknownLiveProb >= 0.70) && playerHasActiveTotem && dealerItems.includes('CRUSHER') && playerItems.length > 0) {
                                itemToUse = 'CRUSHER';
                            }
                            // 10. LETHAL SAW EXECUTION (Glass -> Saw -> Shot / Inverter -> Saw -> Shot)
                            else if ((currentKnown === 'LIVE' || (unknownLiveProb >= 0.70 && totalRemaining >= 2)) && dealerItems.includes('SAW') && !dealerSawed && !playerImmune && (playerRef.current?.hp ?? 0) > 1) {
                                itemToUse = 'SAW';
                            }
                            // 11. CUFFS LOCK
                            else if (canCuffPlayer && (currentKnown === 'LIVE' || unknownLiveProb >= 0.50) && dealerItems.includes('CUFFS')) {
                                itemToUse = 'CUFFS';
                            }
                            // 12. CHOKE LOGIC (Never waste Choke on known BLANK or Immune player!)
                            else if (dealerItems.includes('CHOKE') && !dealerChoke && !playerImmune && totalRemaining >= 2 && currentKnown !== 'BLANK') {
                                let nextKnown = aiMemory.current.get(currentIdx + 1) || null;
                                if (!nextKnown && Math.random() < 0.75 && chamber[currentIdx + 1]) {
                                    nextKnown = chamber[currentIdx + 1];
                                    aiMemory.current.set(currentIdx + 1, nextKnown);
                                }
                                if (currentKnown === 'LIVE' && nextKnown === 'LIVE') {
                                    itemToUse = 'CHOKE';
                                } else if (currentKnown === 'LIVE' && (!nextKnown && unknownLiveProb >= 0.50) && dealerHp > 1) {
                                    itemToUse = 'CHOKE';
                                } else if (!currentKnown && unknownLiveProb >= 0.65 && dealerHp > 1) {
                                    itemToUse = 'CHOKE';
                                }
                            }
                            // 13. REMOTE SWAP (BLANK -> LIVE)
                            else if (dealerItems.includes('REMOTE') && totalRemaining >= 2 && currentKnown === 'BLANK') {
                                let nextKnown = aiMemory.current.get(currentIdx + 1);
                                if (!nextKnown && Math.random() < 0.75 && chamber[currentIdx + 1]) {
                                    nextKnown = chamber[currentIdx + 1];
                                    aiMemory.current.set(currentIdx + 1, nextKnown);
                                }
                                if (nextKnown === 'LIVE') {
                                    itemToUse = 'REMOTE';
                                }
                            }
                            // 14. TAROT DECK CARD
                            else if (dealerItems.includes('DECK_CARD')) {
                                if (dealerItems.length >= 5 || Math.random() < 0.6) {
                                    itemToUse = 'DECK_CARD';
                                }
                            }
                            // 15. MIRROR LOGIC
                            else if (dealerItems.includes('MIRROR') && mirrorSafe) {
                                let isSmart = false;
                                for (const pItem of playerMirrorItems) {
                                    if (pItem === 'CIGS' && dealerHp < dealerMaxHp) isSmart = true;
                                    if (pItem === 'SAW' && !dealerSawed && !playerImmune && (currentKnown === 'LIVE' || unknownLiveProb > 0.6)) isSmart = true;
                                    if (pItem === 'CUFFS' && canCuffPlayer) isSmart = true;
                                    if (pItem === 'GLASS' && !currentKnown) isSmart = true;
                                    if (pItem === 'INVERTER' && (currentKnown === 'BLANK' || (currentKnown === 'LIVE' && playerImmune))) isSmart = true;
                                    if (pItem === 'BIG_INVERTER' && totalRemaining >= 2 && visibleBlank > visibleLive) isSmart = true;
                                    if (pItem === 'PHONE' && unknownFutureSlots.length > 0) isSmart = true;
                                    if (pItem === 'REMOTE' && totalRemaining >= 2 && currentKnown === 'BLANK') isSmart = true;
                                    if (pItem === 'CHOKE' && !dealerChoke && !playerImmune && totalRemaining >= 2 && currentKnown !== 'BLANK') isSmart = true;
                                    if (pItem === 'CONTRACT' && dealerHp >= 3 && dealerItems.length <= 6) isSmart = true;
                                    if (pItem === 'FLASHBANG' && !playerRef.current?.isFlashbanged) isSmart = true;
                                    if (pItem === 'CRUSHER' && playerItems.length > 0) isSmart = true;
                                    if (pItem === 'LUCKYCHARM') isSmart = true;
                                }
                                if (isSmart) {
                                    itemToUse = 'MIRROR';
                                }
                            }
                            // 16. THEFT (ADRENALINE)
                            else if (dealerItems.includes('ADRENALINE') && stealableIndices.length > 0) {
                                const highValueTargets: ItemType[] = ['SAW', 'INVERTER', 'CUFFS', 'MIRROR', 'CHOKE', 'REMOTE', 'CIGS', 'DECK_CARD', 'FLASHBANG', 'GLASS'];
                                const hasGoodSteal = stealableIndices.some(i => highValueTargets.includes(playerItems[i]));
                                if (hasGoodSteal) itemToUse = 'ADRENALINE';
                            }
                            // 17. SAFE CYCLING (BEER) - Never rack a known BLANK!
                            else if (dealerItems.includes('BEER')) {
                                if (currentKnown === 'LIVE' && (playerImmune || playerHasActiveTotem)) {
                                    itemToUse = 'BEER';
                                } else if (!currentKnown && dealerHp === 1 && unknownLiveProb >= 0.45) {
                                    itemToUse = 'BEER';
                                } else if (!currentKnown && dealerHp <= 2 && visibleLive === 1 && visibleBlank >= 2) {
                                    itemToUse = 'BEER'; // Cycle low-live probability to narrow chamber safely
                                }
                            }
                            // 18. THREAT NEUTRALIZATION (FLASHBANG / CRUSHER)
                            else if (dealerItems.includes('FLASHBANG') && !playerRef.current?.isFlashbanged) {
                                const playerHasThreat = playerItems.some(i => ['SAW', 'CUFFS', 'CHOKE', 'ADRENALINE', 'CONTRACT', 'TOTEM'].includes(i));
                                if (playerHasThreat || Math.random() < 0.4) {
                                    itemToUse = 'FLASHBANG';
                                }
                            }
                            else if (dealerItems.includes('CRUSHER') && playerItems.length > 0) {
                                const playerHasThreat = playerItems.some(i => ['SAW', 'CUFFS', 'CHOKE', 'ADRENALINE', 'CONTRACT', 'BIG_INVERTER', 'FLASHBANG', 'TOTEM'].includes(i));
                                if (playerHasThreat || Math.random() < 0.6) {
                                    itemToUse = 'CRUSHER';
                                }
                            }
                            // 19. LUCKY CHARM
                            else if (dealerItems.includes('LUCKYCHARM')) {
                                itemToUse = 'LUCKYCHARM';
                            }
                        } else {
                            // --- NORMAL MODE LOGIC ---
                            if (dealerHp < dealerMaxHp && dealerItems.includes('CIGS')) {
                                if (dealerHp <= 2 || Math.random() > 0.35) itemToUse = 'CIGS';
                            }
                            else if (!currentKnown && dealerItems.includes('GLASS') && totalRemaining >= 1 && Math.random() > 0.25) {
                                itemToUse = 'GLASS';
                            }
                            else if (dealerItems.includes('PHONE') && unknownFutureSlots.length > 0 && totalRemaining > 2 && Math.random() > 0.3) {
                                itemToUse = 'PHONE';
                            }
                            else if (dealerItems.includes('INVERTER')) {
                                if (currentKnown === 'BLANK' || (currentKnown === 'LIVE' && playerImmune)) {
                                    itemToUse = 'INVERTER';
                                }
                            }
                            else if (dealerItems.includes('SAW') && !dealerSawed && !playerImmune && (currentKnown === 'LIVE' || unknownLiveProb >= 0.70) && (playerRef.current?.hp ?? 0) > 1) {
                                itemToUse = 'SAW';
                            }
                            else if (dealerItems.includes('CUFFS') && canCuffPlayer && (currentKnown === 'LIVE' || unknownLiveProb >= 0.50)) {
                                itemToUse = 'CUFFS';
                            }
                            else if (dealerHp >= 3 && dealerItems.length <= 5 && dealerItems.includes('CONTRACT') && Math.random() > 0.5) {
                                itemToUse = 'CONTRACT';
                            }
                            else if (dealerItems.includes('ADRENALINE') && stealableIndices.length > 0 && Math.random() > 0.2) {
                                const threats: ItemType[] = ['SAW', 'CUFFS', 'INVERTER', 'CHOKE', 'CIGS', 'MIRROR', 'DECK_CARD', 'FLASHBANG'];
                                if (stealableIndices.some(i => threats.includes(playerItems[i]))) itemToUse = 'ADRENALINE';
                            }
                            else if (dealerItems.includes('MIRROR') && mirrorSafe && Math.random() > 0.3) {
                                itemToUse = 'MIRROR';
                            }
                            else if (dealerItems.includes('BIG_INVERTER') && totalRemaining >= 3 && visibleBlank > visibleLive) {
                                itemToUse = 'BIG_INVERTER';
                            }
                            else if (dealerItems.includes('REMOTE') && totalRemaining >= 2 && currentKnown === 'BLANK' && Math.random() > 0.4) {
                                const nextKnown = aiMemory.current.get(currentIdx + 1);
                                if (nextKnown === 'LIVE') itemToUse = 'REMOTE';
                            }
                            else if (dealerItems.includes('DECK_CARD') && Math.random() < 0.5) {
                                itemToUse = 'DECK_CARD';
                            }
                            else if (dealerItems.includes('BEER')) {
                                // Never rack a known blank!
                                if ((currentKnown === 'LIVE' && playerImmune) || (!currentKnown && dealerHp === 1 && unknownLiveProb >= 0.5)) {
                                    itemToUse = 'BEER';
                                }
                            }
                            else if (dealerItems.includes('CHOKE') && !dealerChoke && !playerImmune && totalRemaining >= 2 && currentKnown !== 'BLANK' && (currentKnown === 'LIVE' || unknownLiveProb >= 0.5)) {
                                if (Math.random() < 0.6) itemToUse = 'CHOKE';
                            }
                            else if (dealerItems.includes('LUCKYCHARM')) {
                                itemToUse = 'LUCKYCHARM';
                            }
                            else if (dealerItems.includes('FLASHBANG') && !playerRef.current?.isFlashbanged) {
                                if (playerHasActiveTotem || Math.random() > 0.3) {
                                    itemToUse = 'FLASHBANG';
                                }
                            }
                            else if (dealerItems.includes('CRUSHER') && playerItems.length > 0 && Math.random() > 0.4) {
                                itemToUse = 'CRUSHER';
                            }
                        }
                    }

                    // --- EXECUTION ---
                    if (itemToUse) {
                        const idx = dealerItems.indexOf(itemToUse);
                        if (idx !== -1) {
                            await wait(450);
                            if (isCancelled()) return;
                            setTargetAim('IDLE');
                            await wait(450);
                            if (isCancelled()) return;

                            const triggerItemUse = async (
                                index: number,
                                phoneFutureIndexOverride?: number
                            ): Promise<boolean> => {
                                const item = dealerRef.current?.items?.[index];
                                if (!item) return false;
                                setDealer(d => {
                                    const ni = [...(d.items || [])];
                                    ni.splice(index, 1);
                                    return { ...d, items: ni };
                                });
                                try {
                                    return await processItemEffectRef.current(
                                        'DEALER',
                                        item,
                                        undefined,
                                        undefined,
                                        undefined,
                                        undefined,
                                        phoneFutureIndexOverride
                                    );
                                } catch (err) {
                                    console.error("Dealer AI triggerItemUse error:", err);
                                    return false;
                                }
                            };

                            if (itemToUse === 'ADRENALINE') {
                                setDealer(d => {
                                    const ni = [...(d.items || [])];
                                    ni.splice(idx, 1);
                                    return { ...d, items: ni };
                                });
                                try {
                                    await processItemEffectRef.current('DEALER', 'ADRENALINE');
                                } catch (err) {
                                    console.error("Dealer AI ADRENALINE effect error:", err);
                                }
                                await wait(1200);
                                if (isCancelled()) return;

                                // Pick highest-priority valid stealable item
                                const currentTargetItems = playerRef.current?.items || [];
                                const validStealIndices = getStealableIndices(
                                    currentTargetItems,
                                    dealerRef.current,
                                    playerRef.current,
                                    gameStateRef.current
                                );

                                const priorities: ItemType[] = gameStateRef.current?.isHardMode
                                    ? ['SAW', 'INVERTER', 'CUFFS', 'MIRROR', 'CHOKE', 'REMOTE', 'CIGS', 'PHONE', 'GLASS', 'CONTRACT', 'DECK_CARD', 'FLASHBANG', 'CRUSHER', 'BEER']
                                    : ['SAW', 'INVERTER', 'CUFFS', 'MIRROR', 'CHOKE', 'CIGS', 'PHONE', 'GLASS', 'REMOTE', 'CONTRACT', 'DECK_CARD', 'FLASHBANG', 'CRUSHER', 'BEER'];
                                const activePriorities = (dealerRef.current?.hp ?? 0) < 2
                                    ? (['CIGS', ...priorities] as ItemType[])
                                    : priorities;

                                let stealIdx = -1;
                                for (const pItem of activePriorities) {
                                    const found = validStealIndices.find(vi => currentTargetItems[vi] === pItem);
                                    if (found !== undefined) {
                                        stealIdx = found;
                                        break;
                                    }
                                }
                                if (stealIdx === -1 && validStealIndices.length > 0) {
                                    stealIdx = validStealIndices[0];
                                }

                                let itemEndedRound = false;

                                if (stealIdx !== -1) {
                                    const stolen = currentTargetItems[stealIdx];
                                    const remainingCountAfterSteal = currentTargetItems.length - 1;
                                    setPlayer(p => {
                                        const ni = [...(p.items || [])];
                                        ni.splice(stealIdx, 1);
                                        return { ...p, items: ni };
                                    });
                                    scheduleOverlayClear(`DEALER STOLE ${stolen}`, 1500);
                                    await wait(900);
                                    if (isCancelled()) return;

                                    if (stolen === 'CONTRACT' && (dealerRef.current?.hp ?? 0) <= 2 && !(dealerRef.current?.items || []).includes('TOTEM')) {
                                        setDealer(d => ({ ...d, items: [...(d.items || []), 'CONTRACT'].slice(0, MAX_ITEMS) as ItemType[] }));
                                        scheduleOverlayClear("DEALER STOLE CONTRACT (STASHED)", 1500);
                                    } else if (stolen === 'CRUSHER' && remainingCountAfterSteal <= 0) {
                                        setDealer(d => ({ ...d, items: [...(d.items || []), 'CRUSHER'].slice(0, MAX_ITEMS) as ItemType[] }));
                                        scheduleOverlayClear("DEALER STOLE CRUSHER (STASHED)", 1500);
                                    } else {
                                        const stolenPhoneIdx = stolen === 'PHONE' && unknownFutureSlots.length > 0
                                            ? unknownFutureSlots[Math.floor(Math.random() * unknownFutureSlots.length)]
                                            : undefined;
                                        if (stolen === 'MIRROR') {
                                            let virtualIdx = currentIdx;
                                            for (const copied of playerMirrorItems) {
                                                const copiedPhoneIdx = copied === 'PHONE' && chamber.length - virtualIdx > 1
                                                    ? (virtualIdx + 1 + Math.floor(Math.random() * (chamber.length - virtualIdx - 1)))
                                                    : undefined;
                                                applyMemoryForDealerItem(copied, chamber, virtualIdx, copiedPhoneIdx);
                                                if (copied === 'BEER') virtualIdx++;
                                            }
                                        } else {
                                            applyMemoryForDealerItem(stolen, chamber, currentIdx, stolenPhoneIdx);
                                        }
                                        try {
                                            itemEndedRound = await processItemEffectRef.current(
                                                'DEALER',
                                                stolen,
                                                undefined,
                                                undefined,
                                                undefined,
                                                undefined,
                                                stolenPhoneIdx
                                            );
                                        } catch (err) {
                                            console.error("Dealer AI processItemEffect stolen item error:", err);
                                        }
                                    }
                                } else {
                                    scheduleOverlayClear("NOTHING TO STEAL", 1000);
                                }

                                if (itemEndedRound || gameStateRef.current.phase !== 'DEALER_TURN') {
                                    handedOffRound = itemEndedRound;
                                    return;
                                }
                                itemsUsedThisTurnRef.current += 1;
                                setAiTick(t => t + 1);
                                return;
                            } else {
                                // Non-stealing item
                                const chosenPhoneIdx = itemToUse === 'PHONE'
                                    ? (unknownFutureSlots.length > 0
                                        ? unknownFutureSlots[Math.floor(Math.random() * unknownFutureSlots.length)]
                                        : undefined)
                                    : undefined;

                                const itemEndedRound = await triggerItemUse(idx, chosenPhoneIdx);
                                if (isCancelled()) return;

                                if (itemToUse === 'MIRROR') {
                                    let virtualIdx = currentIdx;
                                    for (const copied of playerMirrorItems) {
                                        const copiedPhoneIdx = copied === 'PHONE' && chamber.length - virtualIdx > 1
                                            ? (virtualIdx + 1 + Math.floor(Math.random() * (chamber.length - virtualIdx - 1)))
                                            : undefined;
                                        applyMemoryForDealerItem(copied, chamber, virtualIdx, copiedPhoneIdx);
                                        if (copied === 'BEER') virtualIdx++;
                                    }
                                } else {
                                    applyMemoryForDealerItem(itemToUse, chamber, currentIdx, chosenPhoneIdx);
                                }

                                if (itemEndedRound) {
                                    handedOffRound = true;
                                    return;
                                }

                                await wait(400);
                                if (isCancelled()) return;
                                itemsUsedThisTurnRef.current += 1;
                                setAiTick(t => t + 1);
                                return;
                            }
                        }
                    }

                    // --- SHOOTING DECISION ---
                    itemsUsedThisTurnRef.current = 0;
                    await wait(450);
                    if (isCancelled()) return;
                    setTargetAim('IDLE');
                    await wait(500);
                    if (isCancelled()) return;

                    // Re-evaluate known & probabilities after item usage
                    ({ curKnown: currentKnown, unkProb: unknownLiveProb } = countMemoryAndDeduce());
                    const finalLiveProb = currentKnown ? (currentKnown === 'LIVE' ? 1.0 : 0.0) : unknownLiveProb;

                    let target: TurnOwner = 'PLAYER';
                    const isSawed = Boolean(dealerRef.current?.isSawedActive);
                    const isChoked = Boolean(dealerRef.current?.isChokeActive);
                    const maxSelfDmg = isSawed ? (isChoked ? 4 : 2) : (isChoked ? 2 : 1);

                    if (finalLiveProb === 1.0) {
                        target = 'PLAYER';
                    } else if (finalLiveProb === 0.0) {
                        // Guaranteed blank (or double-blank if choked and nextKnown === 'BLANK'):
                        if (isChoked && currentIdx + 1 < chamber.length) {
                            const nextMem = aiMemory.current.get(currentIdx + 1);
                            if (nextMem === 'BLANK') target = 'DEALER';
                            else if (nextMem === 'LIVE') target = 'PLAYER';
                            else target = unknownLiveProb >= 0.45 || dealerHp <= maxSelfDmg ? 'PLAYER' : 'DEALER';
                        } else {
                            target = 'DEALER';
                        }
                    } else {
                        if (isSawed || dealerHp <= maxSelfDmg) {
                            target = 'PLAYER';
                        } else if (gameStateRef.current?.isHardMode) {
                            const curBlank = gameStateRef.current?.blankCount ?? 0;
                            const threshold = 0.5 - (curBlank * 0.05);
                            target = finalLiveProb >= Math.max(0.35, threshold) ? 'PLAYER' : 'DEALER';
                        } else {
                            target = playerImmune
                                ? (finalLiveProb >= 0.75 ? 'PLAYER' : 'DEALER')
                                : (finalLiveProb >= 0.45 ? 'PLAYER' : 'DEALER');

                            if (Math.random() < 0.08) {
                                target = target === 'PLAYER' ? 'DEALER' : 'PLAYER';
                            }
                        }
                    }

                    setTargetAim(target === 'PLAYER' ? 'OPPONENT' : 'SELF');
                    await wait(900);
                    if (isCancelled()) return;

                    aiMemory.current.delete(currentIdx);
                    if (isChoked && currentIdx + 1 < chamber.length) {
                        aiMemory.current.delete(currentIdx + 1);
                    }
                    await fireShotRef.current('DEALER', target);
                    handedOffRound = true;
                } catch (e) {
                    console.error("Dealer AI Error:", e);
                } finally {
                    isAITurnInProgress.current = false;
                    // fireShot / selectTarotCard / round-ending Beer/Contract manage isProcessing for their own async transitions
                    if (isMountedRef.current && !handedOffRound && gameStateRef.current.phase !== 'LOAD' && gameStateRef.current.phase !== 'LOOTING') {
                        setIsProcessing(false);
                    }
                }
            };

            const setGameStateSafeRecover = (fn?: (index: number) => Promise<void>) => {
                if (fn) fn(0).catch(() => {});
            };

            runAITurn();
        }
    }, [gameState.phase, aiTick, gameState.turnOwner, isProcessing, dealer, isTabVisible, isMultiplayer, setCameraView, setIsProcessing, setPlayer, setDealer, setTargetAim]);
};
