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
            // Gain a random item — good if inventory has space
            return dealerItems.length < MAX_ITEMS ? 6 : 1;

        case 'The Hanged Man':
            // Lose 1 HP — very bad at low HP, bad otherwise
            if (dealerHp <= 2) return -12;
            return -5;

        case 'The Hermit':
            // Transfers turn to player — bad for dealer (loses control), worse if player is immune
            const playerImmune = (player?.jackpotImmunityShots ?? 0) > 0;
            return playerImmune ? -6 : -3;

        case 'The Moon':
            // Steal a random item from opponent — great if player has good items
            if (playerItems.length === 0) return 0;
            const highValueItems = playerItems.filter(i => ['SAW', 'CUFFS', 'INVERTER', 'CHOKE', 'TOTEM', 'CONTRACT'].includes(i));
            return highValueItems.length > 0 ? 9 : 5;

        case 'Judgment':
            // 50% chance to convert blank to live — useful if there are blank shells left
            return (gameState?.blankCount ?? 0) === 0 ? 0 : 5;

        case 'Wheel of Fortune':
            // Reshuffles chamber — useful if current shell is blank, bad if we have a guaranteed live hit
            if (currentKnown === 'LIVE') return -5;
            if (currentKnown === 'BLANK') return 6;
            return 3;

        case 'The Sun':
            // Heal 1 HP — excellent at low HP, diminishing returns at full
            if (dealerHp >= dealerMaxHp) return 0;
            if (dealerHp <= 2) return 9;
            return 5;

        case 'Death':
            // Destroy own random item — bad unless inventory is mostly junk
            return dealerItems.length <= 1 ? -5 : -2;

        case 'The Tower':
            // Destroy opponent's random item — very good if player has items
            if (playerItems.length === 0) return 0;
            return 7;

        case 'The Fool':
            // Reveals shell info — moderately useful
            return remainingShells > 1 ? 4 : 2;

        case 'Justice':
            // Swap HP — excellent if dealer HP < player HP, terrible otherwise
            if (dealerHp < playerHp) return 10;
            if (dealerHp > playerHp) return -8;
            return 0;

        case 'Temperance': {
            // Swap items — excellent if player has more items than dealer or better items
            const dealerCount = dealerItems.length;
            const playerCount = playerItems.length;
            if (playerCount > dealerCount) return 8;
            if (playerCount < dealerCount) return -5;
            const playerHighValue = playerItems.filter(i => ['SAW', 'CUFFS', 'TOTEM', 'CONTRACT', 'FLASHBANG'].includes(i)).length;
            const dealerHighValue = dealerItems.filter(i => ['SAW', 'CUFFS', 'TOTEM', 'CONTRACT', 'FLASHBANG'].includes(i)).length;
            if (playerHighValue > dealerHighValue) return 6;
            if (playerHighValue < dealerHighValue) return -3;
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
    processItemEffect: (user: TurnOwner, item: ItemType) => Promise<boolean>;
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

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            isAITurnInProgress.current = false;
        };
    }, []);
    // AI Memory: Map<shellIndex, type> - Tracks specifically known shells
    const aiMemory = useRef<Map<number, ShellType>>(new Map());
    const itemsUsedThisTurnRef = useRef<number>(0);
    const [aiTick, setAiTick] = useState(0);

    // Tab visibility handling
    const [isTabVisible, setIsTabVisible] = useState(!document.hidden);
    useEffect(() => {
        const handleVisibility = () => {
            setIsTabVisible(!document.hidden);
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, []);

    // Create refs for hook inputs to avoid stale closures in the async runAITurn loop
    const gameStateRef = useRef(gameState);
    const dealerRef = useRef(dealer);
    const playerRef = useRef(player);
    const knownShellRef = useRef(knownShell);
    const fireShotRef = useRef(fireShot);
    const processItemEffectRef = useRef(processItemEffect);

    useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
    useEffect(() => { dealerRef.current = dealer; }, [dealer]);
    useEffect(() => { playerRef.current = player; }, [player]);
    useEffect(() => { knownShellRef.current = knownShell; }, [knownShell]);
    useEffect(() => { fireShotRef.current = fireShot; }, [fireShot]);
    useEffect(() => { processItemEffectRef.current = processItemEffect; }, [processItemEffect]);

    // Reset memory and item limit counter on new round load or batch restart
    useEffect(() => {
        if (gameState.phase === 'LOAD' || gameState.phase === 'BOOT' || gameState.phase === 'INTRO' || gameState.currentShellIndex === 0) {
            aiMemory.current.clear();
            itemsUsedThisTurnRef.current = 0;
        }
    }, [gameState.phase, gameState.currentShellIndex]);

    // Reset item usage counter when turn switches away from Dealer
    useEffect(() => {
        if (gameState.turnOwner !== 'DEALER') {
            itemsUsedThisTurnRef.current = 0;
        }
    }, [gameState.turnOwner]);

    // Use a ref to track current animState so the async loop sees the latest values
    const animStateRef = useRef(animState);
    useEffect(() => {
        animStateRef.current = animState;
    }, [animState]);

    useEffect(() => {
        if (isMultiplayer) return;
        if (isProcessing) return;

        const isDealerCardSelect = gameState.phase === 'CARD_SELECT' && gameState.turnOwner === 'DEALER' && gameState.selectedCardIndex === null;
        if ((gameState.phase === 'DEALER_TURN' || isDealerCardSelect) && !isAITurnInProgress.current && isTabVisible) {
            isAITurnInProgress.current = true;
            setIsProcessing(true); // Lock input while dealer thinks
            if (gameState.phase === 'DEALER_TURN') {
                setCameraView('PLAYER');
            }

            const runAITurn = async () => {
                try {
                    // Small human-like delay
                    await wait(800 + Math.random() * 800);

                    if (document.hidden || !isTabVisible) {
                        setIsProcessing(false);
                        isAITurnInProgress.current = false;
                        return;
                    }
                    // Re-check validity after delay
                    const currentPhase = gameStateRef.current.phase;
                    const isDealerCardSelectVal = currentPhase === 'CARD_SELECT' && gameStateRef.current.turnOwner === 'DEALER' && gameStateRef.current.selectedCardIndex === null;
                    if ((currentPhase !== 'DEALER_TURN' && !isDealerCardSelectVal) || gameStateRef.current.winner || document.hidden || !isTabVisible) {
                        setIsProcessing(false);
                        isAITurnInProgress.current = false;
                        return;
                    }

                    if (currentPhase === 'CARD_SELECT') {
                        await wait(1500);
                        if (gameStateRef.current.phase === 'CARD_SELECT' && gameStateRef.current.turnOwner === 'DEALER') {
                            const cards = gameStateRef.current.deckCards;
                            if (!cards || cards.length === 0) {
                                isAITurnInProgress.current = false;
                                setIsProcessing(false);
                                return;
                            }
                            let chosenIdx = Math.floor(Math.random() * cards.length);

                            // Hard Mode: 90% chance to peek and choose best card
                            if (gameStateRef.current.isHardMode && cards.length > 0 && Math.random() < 0.90) {
                                const currentIdx = gameStateRef.current.currentShellIndex;
                                const currentKnown = aiMemory.current.get(currentIdx) || null;
                                let bestScore = -Infinity;
                                let bestIdx = 0;
                                for (let ci = 0; ci < cards.length; ci++) {
                                    const card = cards[ci];
                                    if (!card || !card.name) continue;
                                    const score = evaluateCardForDealer(
                                        card.name,
                                        dealerRef.current,
                                        playerRef.current,
                                        gameStateRef.current,
                                        currentKnown
                                    );
                                    if (score > bestScore) {
                                        bestScore = score;
                                        bestIdx = ci;
                                    }
                                }
                                chosenIdx = bestIdx;
                            }

                            if (selectTarotCard) {
                                try {
                                    await selectTarotCard(chosenIdx);
                                } catch (tarotErr) {
                                    console.error("Dealer AI selectTarotCard error:", tarotErr);
                                }
                            }
                        }
                        isAITurnInProgress.current = false;
                        setIsProcessing(false);
                        return;
                    }

                    const chamber = gameStateRef.current?.chamber || [];
                    const currentIdx = gameStateRef.current?.currentShellIndex ?? 0;
                    const remainingShells = chamber.slice(currentIdx);
                    const totalRemaining = remainingShells.length;

                    // Safety guard: if chamber is empty or index invalid, do not attempt actions
                    if (totalRemaining === 0 || currentIdx >= chamber.length) {
                        setIsProcessing(false);
                        isAITurnInProgress.current = false;
                        return;
                    }

                    // --- ANALYSIS ---
                    const liveCountReal = remainingShells.filter(s => s === 'LIVE').length;

                    // Check Global Known (Glass)
                    if (knownShellRef.current) {
                        aiMemory.current.set(currentIdx, knownShellRef.current);
                    }

                    let currentKnown: any = aiMemory.current.get(currentIdx);

                    const visibleLive = gameStateRef.current?.liveCount ?? 0;
                    const visibleBlank = gameStateRef.current?.blankCount ?? 0;

                    // Advanced shell memory deduction:
                    // Count how many known future shells in remaining chamber are LIVE vs BLANK
                    let memorizedFutureLive = 0;
                    let memorizedFutureBlank = 0;
                    for (let i = currentIdx + 1; i < currentIdx + totalRemaining; i++) {
                        const mem = aiMemory.current.get(i);
                        if (mem === 'LIVE') memorizedFutureLive++;
                        else if (mem === 'BLANK') memorizedFutureBlank++;
                    }

                    const unexplainedLive = Math.max(0, visibleLive - memorizedFutureLive);
                    const unexplainedBlank = Math.max(0, visibleBlank - memorizedFutureBlank);

                    // Deduce 100% shell certainty from visible remaining chamber counts and memorized future shells
                    if (!currentKnown) {
                        if (unexplainedLive === 0 && unexplainedBlank > 0) {
                            currentKnown = 'BLANK';
                            aiMemory.current.set(currentIdx, 'BLANK');
                        } else if (unexplainedBlank === 0 && unexplainedLive > 0) {
                            currentKnown = 'LIVE';
                            aiMemory.current.set(currentIdx, 'LIVE');
                        } else if (visibleBlank === 0 && visibleLive > 0) {
                            currentKnown = 'LIVE';
                            aiMemory.current.set(currentIdx, 'LIVE');
                        } else if (visibleLive === 0 && visibleBlank > 0) {
                            currentKnown = 'BLANK';
                            aiMemory.current.set(currentIdx, 'BLANK');
                        } else if (totalRemaining === 1) {
                            const inferred = visibleLive > 0 ? 'LIVE' : 'BLANK';
                            currentKnown = inferred;
                            aiMemory.current.set(currentIdx, inferred);
                        }
                    }

                    const unknownLiveProb = (unexplainedLive + unexplainedBlank > 0)
                        ? (unexplainedLive / (unexplainedLive + unexplainedBlank))
                        : (visibleLive + visibleBlank > 0 ? (visibleLive / (visibleLive + visibleBlank)) : 0);

                    const isFlashbanged = Boolean(dealerRef.current?.isFlashbanged);
                    const dealerItems = dealerRef.current?.items || [];
                    const playerItems = playerRef.current?.items || [];
                    let itemToUse: ItemType | null = null;

                    if (!isFlashbanged && itemsUsedThisTurnRef.current < MAX_ITEMS) {
                        // --- NORMAL MODE 10% MISTAKE TRIGGER ---
                        let skipNormalItems = false;
                        if (!gameStateRef.current?.isHardMode && Math.random() < 0.10) {
                            // 50% chance to skip items entirely, 50% chance to use a random usable item
                            if (Math.random() < 0.5) {
                                skipNormalItems = true;
                            } else if (dealerItems.length > 0) {
                                // Filter out passive items (TOTEM), MIRROR with no prior items, and CRUSHER on empty inventory
                                const usableItems = dealerItems.filter(item => {
                                    if (item === 'TOTEM') return false; // Totem is passive
                                    if (item === 'CONTRACT' && (dealerRef.current?.hp ?? 0) <= 2) return false; // Prevent suicide on Contract
                                    if (item === 'MIRROR') {
                                        const lastUsed = (playerRef.current?.lastTurnItemsUsed || []).filter(i => i !== 'MIRROR');
                                        return lastUsed.length > 0;
                                    }
                                    if (item === 'CRUSHER') {
                                        return playerItems.length > 0;
                                    }
                                    if (item === 'ADRENALINE') {
                                        return playerItems.length > 0;
                                    }
                                    return true;
                                });
                                if (usableItems.length > 0) {
                                    const randIdx = Math.floor(Math.random() * usableItems.length);
                                    itemToUse = usableItems[randIdx];
                                }
                            }
                        }

                        const dealerHp = dealerRef.current?.hp ?? 0;
                        const dealerMaxHp = dealerRef.current?.maxHp ?? 4;
                        const dealerSawed = Boolean(dealerRef.current?.isSawedActive);
                        const dealerChoke = Boolean(dealerRef.current?.isChokeActive);

                        if (skipNormalItems) {
                            // Do nothing, itemToUse remains null to skip items this turn
                        } else if (itemToUse) {
                            // Keep the random item chosen above
                        } else if (gameStateRef.current?.isHardMode) {
                            // --- HARD MODE LOGIC (GOD TIER) ---
                            // 0. SUPERNATURAL INTUITION (The Dealer can smell the gunpowder)
                            if (!currentKnown && Math.random() < 0.75) {
                                const actual = chamber[currentIdx];
                                if (actual) {
                                    aiMemory.current.set(currentIdx, actual);
                                    currentKnown = actual;
                                }
                            }

                            const playerHasActiveTotem = playerItems.includes('TOTEM') && !playerRef.current?.isFlashbanged;
                            const playerImmune = (playerRef.current?.jackpotImmunityShots ?? 0) > 0;

                            // 1. SURVIVAL HEAL (Highest Priority when damaged)
                            if (dealerHp < dealerMaxHp && dealerItems.includes('CIGS')) {
                                const shouldHeal = dealerHp <= 2 || (dealerHp < dealerMaxHp && Math.random() < 0.85);
                                if (shouldHeal) itemToUse = 'CIGS';
                            }
                            // 2. LUCKY CHARM + CONTRACT COMBO (Prioritize Lucky Charm first)
                            else if (dealerItems.includes('LUCKYCHARM') && dealerItems.includes('CONTRACT') && dealerHp >= 3 && dealerItems.length <= 6) {
                                itemToUse = 'LUCKYCHARM';
                            }
                            // 3. SACRIFICE FOR POWER (CONTRACT)
                            else if (dealerHp >= 3 && dealerItems.length <= 6 && dealerItems.includes('CONTRACT')) {
                                itemToUse = 'CONTRACT';
                            }
                            // 4. INTEL GATHERING (GLASS) - PRIORITIZED EARLY
                            // If shell is unknown and dealer has items that depend on knowing shell type, peek first!
                            else if (!currentKnown && dealerItems.includes('GLASS') && totalRemaining >= 1) {
                                const hasActionableItem = dealerItems.some(i => ['SAW', 'INVERTER', 'BIG_INVERTER', 'CHOKE', 'CUFFS', 'BEER'].includes(i));
                                if (hasActionableItem || dealerHp <= 2 || Math.abs(unknownLiveProb - 0.5) <= 0.25) {
                                    itemToUse = 'GLASS';
                                }
                            }
                            // 5. INVERTER OVERRIDE FOR JACKPOT IMMUNITY (flip live to blank and shoot self to keep turn)
                            else if (currentKnown === 'LIVE' && playerImmune && dealerItems.includes('INVERTER')) {
                                itemToUse = 'INVERTER';
                            }
                            // 6. INVERTER COMBO: BLANK -> LIVE CONVERSION
                            else if (currentKnown === 'BLANK' && dealerItems.includes('INVERTER')) {
                                itemToUse = 'INVERTER';
                            }
                            // 7. BIG INVERTER
                            else if (dealerItems.includes('BIG_INVERTER')) {
                                const remaining = remainingShells.length;
                                const knownBlanks = remainingShells.filter(s => s === 'BLANK').length;
                                if (knownBlanks / remaining > 0.5 || (currentKnown === 'BLANK' && remaining >= 2)) {
                                    itemToUse = 'BIG_INVERTER';
                                }
                            }
                            // 8. LIVE SHELL + PLAYER TOTEM -> FLASHBANG/CRUSHER
                            else if (currentKnown === 'LIVE' && playerHasActiveTotem && dealerItems.includes('FLASHBANG')) {
                                itemToUse = 'FLASHBANG';
                            }
                            else if (currentKnown === 'LIVE' && playerHasActiveTotem && dealerItems.includes('CRUSHER') && playerItems.length > 0) {
                                itemToUse = 'CRUSHER';
                            }
                            // 9. LETHAL SAW EXECUTION (Known Live or very high live probability)
                            else if ((currentKnown === 'LIVE' || (unknownLiveProb >= 0.70 && totalRemaining >= 2)) && dealerItems.includes('SAW') && !dealerSawed && !playerImmune && (playerRef.current?.hp ?? 0) > 1) {
                                itemToUse = 'SAW';
                            }
                            // 10. CUFFS LOCK (Known Live or favorable live probability)
                            else if ((currentKnown === 'LIVE' || unknownLiveProb >= 0.5) && dealerItems.includes('CUFFS') && !playerRef.current?.isHandcuffed && totalRemaining > 1) {
                                itemToUse = 'CUFFS';
                            }
                            // 11. CHOKE LOGIC (Double shell burst)
                            else if (dealerItems.includes('CHOKE') && !dealerChoke && totalRemaining >= 2) {
                                const nextKnown = aiMemory.current.get(currentIdx + 1);
                                const actualNext = chamber[currentIdx + 1];
                                let shell2 = nextKnown;
                                if (!shell2 && Math.random() < 0.75) {
                                    shell2 = actualNext;
                                    if (actualNext) aiMemory.current.set(currentIdx + 1, actualNext);
                                }
                                const shell1 = currentKnown;
                                if (shell1 === 'LIVE' && shell2 === 'LIVE') itemToUse = 'CHOKE';
                                else if ((shell1 === 'LIVE' || unknownLiveProb >= 0.6) && dealerHp > 1) itemToUse = 'CHOKE';
                            }
                            // 12. CHAMBER MANIPULATION - REMOTE
                            else if (dealerItems.includes('REMOTE') && totalRemaining >= 2) {
                                let nextKnown = aiMemory.current.get(currentIdx + 1);
                                if (!nextKnown && Math.random() < 0.75) {
                                    const actualNext = chamber[currentIdx + 1];
                                    if (actualNext) {
                                        nextKnown = actualNext;
                                        aiMemory.current.set(currentIdx + 1, actualNext);
                                    }
                                }
                                if (currentKnown === 'BLANK' && nextKnown === 'LIVE') {
                                    itemToUse = 'REMOTE';
                                }
                            }
                            // 13. INTEL - PHONE
                            else if (dealerItems.includes('PHONE') && totalRemaining > 1) {
                                itemToUse = 'PHONE';
                            }
                            // 14. TAROT DECK CARD
                            else if (dealerItems.includes('DECK_CARD')) {
                                if (dealerItems.length >= 5 || Math.random() < 0.6) {
                                    itemToUse = 'DECK_CARD';
                                }
                            }
                            // 15. MIRROR LOGIC (Only if player used items last turn)
                            else if (dealerItems.includes('MIRROR')) {
                                const playerUsedItems = (playerRef.current?.lastTurnItemsUsed || []).filter(i => i !== 'MIRROR');
                                if (playerUsedItems.length > 0) {
                                    let isSmart = false;
                                    for (const pItem of playerUsedItems) {
                                        if (pItem === 'CIGS' && dealerRef.current.hp < dealerRef.current.maxHp) isSmart = true;
                                        if (pItem === 'SAW' && (currentKnown === 'LIVE' || unknownLiveProb > 0.6)) isSmart = true;
                                        if (pItem === 'CUFFS' && !playerRef.current?.isHandcuffed) isSmart = true;
                                        if (pItem === 'GLASS' && !currentKnown) isSmart = true;
                                        if (pItem === 'INVERTER' && currentKnown === 'BLANK') isSmart = true;
                                        if (pItem === 'BIG_INVERTER' && totalRemaining >= 3) isSmart = true;
                                        if (pItem === 'PHONE' && totalRemaining > 1) isSmart = true;
                                        if (pItem === 'REMOTE' && totalRemaining >= 2) isSmart = true;
                                        if (pItem === 'CHOKE' && totalRemaining >= 2) isSmart = true;
                                        if (pItem === 'CONTRACT' && dealerRef.current.hp >= 3 && dealerItems.length <= 6) isSmart = true;
                                        if (pItem === 'FLASHBANG' && !playerRef.current?.isFlashbanged) isSmart = true;
                                        if (pItem === 'CRUSHER' && playerItems.length > 0) isSmart = true;
                                        if (pItem === 'LUCKYCHARM') isSmart = true;
                                    }
                                    if (isSmart) {
                                        itemToUse = 'MIRROR';
                                    }
                                }
                            }
                            // 16. THEFT (Adrenaline) - Must have items to steal
                            else if (dealerItems.includes('ADRENALINE') && playerItems.some(i => i !== 'ADRENALINE' && i !== 'JACKPOT' && i !== 'TOTEM')) {
                                const targets = ['SAW', 'INVERTER', 'CUFFS', 'MIRROR', 'CHOKE', 'REMOTE', 'CIGS', 'DECK_CARD'];
                                if (playerItems.some(i => targets.includes(i))) itemToUse = 'ADRENALINE';
                            }
                            // 17. SAFE CYCLING (BEER) - NEVER rack a known blank! (Shoot self with blank instead)
                            else if (dealerItems.includes('BEER')) {
                                if (currentKnown === 'LIVE' && (playerImmune || playerHasActiveTotem)) {
                                    itemToUse = 'BEER'; // Safely discard the live round without wasting damage on an immune player
                                } else if (!currentKnown && dealerRef.current.hp === 1 && unknownLiveProb >= 0.45) {
                                    itemToUse = 'BEER'; // At 1 HP, self-shot on unknown shell is risky; eject safely
                                }
                            }
                            // 18. FLASHBANG / CRUSHER (Threat Neutralization)
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
                            // --- NORMAL LOGIC ---
                            if (dealerHp < dealerMaxHp && dealerItems.includes('CIGS')) {
                                if (dealerHp <= 2 || Math.random() > 0.35) itemToUse = 'CIGS';
                            }
                            else if (!currentKnown && dealerItems.includes('GLASS') && totalRemaining >= 1 && Math.random() > 0.25) {
                                itemToUse = 'GLASS'; // Normal mode uses glass to check round!
                            }
                            else if (dealerItems.includes('INVERTER')) {
                                const playerImmune = (playerRef.current?.jackpotImmunityShots ?? 0) > 0;
                                if (currentKnown === 'BLANK' || (currentKnown === 'LIVE' && playerImmune)) {
                                    itemToUse = 'INVERTER';
                                }
                            }
                            else if (dealerItems.includes('SAW') && !dealerSawed && (currentKnown === 'LIVE' || unknownLiveProb >= 0.70) && (playerRef.current?.hp ?? 0) > 1) {
                                const playerImmune = (playerRef.current?.jackpotImmunityShots ?? 0) > 0;
                                if (!playerImmune) {
                                    itemToUse = 'SAW';
                                }
                            }
                            else if (dealerItems.includes('CUFFS') && !playerRef.current?.isHandcuffed && totalRemaining > 1 && (currentKnown === 'LIVE' || unknownLiveProb >= 0.5)) {
                                itemToUse = 'CUFFS';
                            }
                            else if (dealerHp >= 3 && dealerItems.length <= 5 && dealerItems.includes('CONTRACT') && Math.random() > 0.5) {
                                itemToUse = 'CONTRACT';
                            }
                            else if (dealerItems.includes('ADRENALINE') && playerItems.some(i => i !== 'ADRENALINE' && i !== 'JACKPOT' && i !== 'TOTEM') && Math.random() > 0.2) {
                                const threats = ['SAW', 'CUFFS', 'INVERTER', 'CHOKE', 'CIGS', 'MIRROR', 'DECK_CARD'];
                                if (playerItems.some(i => threats.includes(i))) itemToUse = 'ADRENALINE';
                            }
                            else if (dealerItems.includes('MIRROR') && Math.random() > 0.3) {
                                const playerUsedItems = (playerRef.current?.lastTurnItemsUsed || []).filter(i => i !== 'MIRROR');
                                if (playerUsedItems.length > 0) {
                                    itemToUse = 'MIRROR';
                                }
                            }
                            else if (dealerItems.includes('BIG_INVERTER') && currentKnown === 'BLANK' && totalRemaining >= 3) {
                                itemToUse = 'BIG_INVERTER';
                            }
                            else if (dealerItems.includes('REMOTE') && totalRemaining >= 2 && Math.random() > 0.4) {
                                const nextKnown = aiMemory.current.get(currentIdx + 1);
                                if (currentKnown === 'BLANK' && nextKnown === 'LIVE') {
                                    itemToUse = 'REMOTE';
                                }
                            }
                            else if (dealerItems.includes('PHONE') && totalRemaining > 2 && Math.random() > 0.3) {
                                itemToUse = 'PHONE';
                            }
                            else if (dealerItems.includes('DECK_CARD') && Math.random() < 0.5) {
                                itemToUse = 'DECK_CARD';
                            }
                            else if (dealerItems.includes('BEER')) {
                                const playerImmune = (playerRef.current?.jackpotImmunityShots ?? 0) > 0;
                                // In normal mode, do NOT drink beer if known blank! Only if immune live or at 1 HP
                                if ((currentKnown === 'LIVE' && playerImmune) || (!currentKnown && dealerHp === 1 && unknownLiveProb >= 0.5)) {
                                    itemToUse = 'BEER';
                                }
                            }
                            else if (dealerItems.includes('CHOKE') && !dealerChoke && totalRemaining >= 2 && (currentKnown === 'LIVE' || unknownLiveProb >= 0.5)) {
                                if (Math.random() < 0.6) itemToUse = 'CHOKE';
                            }
                            else if (dealerItems.includes('LUCKYCHARM')) {
                                itemToUse = 'LUCKYCHARM';
                            }
                            else if (dealerItems.includes('FLASHBANG') && !playerRef.current?.isFlashbanged) {
                                const playerHasTotem = playerItems.includes('TOTEM');
                                if (playerHasTotem || Math.random() > 0.3) {
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
                            await wait(500);
                            setTargetAim('IDLE');
                            await wait(500);

                            // Helper to trigger item use
                            const triggerItemUse = async (index: number) => {
                                const item = dealerRef.current?.items?.[index];
                                if (!item) return;
                                setDealer(d => {
                                    const ni = [...(d.items || [])];
                                    ni.splice(index, 1);
                                    return { ...d, items: ni };
                                });
                                try {
                                    await processItemEffectRef.current('DEALER', item);
                                } catch (err) {
                                    console.error("Dealer AI triggerItemUse error:", err);
                                }
                            };

                            if (itemToUse === 'ADRENALINE') {
                                // Remove Adrenaline
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
                                await wait(1500);

                                 // Simulate Steal
                                 let stealIdx = -1;
                                 const priorities: ItemType[] = gameStateRef.current?.isHardMode
                                     ? ['SAW', 'INVERTER', 'CUFFS', 'MIRROR', 'CHOKE', 'REMOTE', 'CIGS', 'PHONE', 'GLASS', 'CONTRACT', 'DECK_CARD', 'BEER']
                                     : ['SAW', 'INVERTER', 'CUFFS', 'MIRROR', 'CHOKE', 'CIGS', 'PHONE', 'GLASS', 'REMOTE', 'CONTRACT', 'DECK_CARD', 'BEER'];

                                 const activePriorities = ((dealerRef.current?.hp ?? 0) < 2 
                                     ? ['CIGS', ...priorities] 
                                     : priorities
                                 ).filter(i => i !== 'ADRENALINE' && i !== 'JACKPOT' && i !== 'TOTEM');

                                 const currentTargetItems = playerRef.current?.items || [];

                                 for (const pItem of activePriorities) {
                                     if (pItem === 'MIRROR') {
                                         const playerLastItems = (playerRef.current?.lastTurnItemsUsed || []).filter(i => i !== 'MIRROR');
                                         if (playerLastItems.length === 0) continue;
                                     }
                                     const pIdx = currentTargetItems.indexOf(pItem as ItemType);
                                     if (pIdx !== -1) {
                                         stealIdx = pIdx;
                                         break;
                                     }
                                 }
                                 if (stealIdx === -1 && currentTargetItems.length > 0) {
                                     stealIdx = currentTargetItems.findIndex(i => i !== 'TOTEM' && i !== 'ADRENALINE' && i !== 'JACKPOT');
                                 }

                                 if (stealIdx !== -1) {
                                     const stolen = currentTargetItems[stealIdx];
                                     setPlayer(p => {
                                         const ni = [...(p.items || [])];
                                         ni.splice(stealIdx, 1);
                                         return { ...p, items: ni };
                                     });
                                     if (setOverlayText) {
                                         setOverlayText(`DEALER STOLE ${stolen}`);
                                         setTimeout(() => setOverlayText?.(null), 1500);
                                     }
                                     await wait(1000);

                                     if (stolen === 'ADRENALINE') {
                                         setDealer(d => ({ ...d, items: [...(d.items || []), 'ADRENALINE'].slice(0, MAX_ITEMS) as ItemType[] }));
                                     } else if (stolen === 'TOTEM') {
                                         setDealer(d => ({ ...d, items: [...(d.items || []), 'TOTEM'].slice(0, MAX_ITEMS) as ItemType[] }));
                                         if (setOverlayText) {
                                             setOverlayText("DEALER STOLE TOTEM (STASHED)");
                                             setTimeout(() => setOverlayText?.(null), 1500);
                                         }
                                     } else if (stolen === 'CONTRACT' && (dealerRef.current?.hp ?? 0) <= 2) {
                                         // Safety check: Stash stolen CONTRACT instead of using it and self-eliminating
                                         setDealer(d => ({ ...d, items: [...(d.items || []), 'CONTRACT'].slice(0, MAX_ITEMS) as ItemType[] }));
                                         if (setOverlayText) {
                                             setOverlayText("DEALER STOLE CONTRACT (STASHED)");
                                             setTimeout(() => setOverlayText?.(null), 1500);
                                         }
                                     } else if (stolen === 'MIRROR') {
                                         // Edge case: Mirror with no prior item used
                                         const playerLast = (playerRef.current?.lastTurnItemsUsed || []).filter(i => i !== 'MIRROR');
                                         if (playerLast.length === 0) {
                                             setDealer(d => ({ ...d, items: [...(d.items || []), 'MIRROR'].slice(0, MAX_ITEMS) as ItemType[] }));
                                             if (setOverlayText) {
                                                 setOverlayText("DEALER STOLE MIRROR (STASHED)");
                                                 setTimeout(() => setOverlayText?.(null), 1500);
                                             }
                                         } else {
                                             try {
                                                 await processItemEffectRef.current('DEALER', stolen);
                                             } catch (err) {
                                                 console.error("Dealer AI processItemEffect stolen MIRROR error:", err);
                                             }
                                         }
                                     } else if (stolen === 'CRUSHER') {
                                         // Edge case: Crusher on empty inventory (player had 1 item and we just stole it!)
                                         const remainingTargetItems = (playerRef.current?.items || []).filter((_, idx) => idx !== stealIdx);
                                         if (remainingTargetItems.length === 0) {
                                             setDealer(d => ({ ...d, items: [...(d.items || []), 'CRUSHER'].slice(0, MAX_ITEMS) as ItemType[] }));
                                             if (setOverlayText) {
                                                 setOverlayText("DEALER STOLE CRUSHER (STASHED)");
                                                 setTimeout(() => setOverlayText?.(null), 1500);
                                             }
                                         } else {
                                             try {
                                                 await processItemEffectRef.current('DEALER', stolen);
                                             } catch (err) {
                                                 console.error("Dealer AI processItemEffect stolen CRUSHER error:", err);
                                             }
                                         }
                                     } else {
                                         if (stolen === 'GLASS' && chamber[currentIdx]) aiMemory.current.set(currentIdx, chamber[currentIdx]);
                                         if (stolen === 'INVERTER') {
                                             if (aiMemory.current.has(currentIdx)) {
                                                 const prevM = aiMemory.current.get(currentIdx);
                                                 aiMemory.current.set(currentIdx, prevM === 'LIVE' ? 'BLANK' : 'LIVE');
                                             } else if (gameStateRef.current?.isHardMode) {
                                                 aiMemory.current.set(currentIdx, 'LIVE');
                                             }
                                         }
                                         try {
                                             await processItemEffectRef.current('DEALER', stolen);
                                         } catch (err) {
                                             console.error("Dealer AI processItemEffect stolen item error:", err);
                                         }
                                     }}
                                else {
                                    if (setOverlayText) {
                                        setOverlayText("NOTHING TO STEAL");
                                        setTimeout(() => setOverlayText?.(null), 1000);
                                    }
                                }
                                itemsUsedThisTurnRef.current += 1;
                                setAiTick(t => t + 1);
                                isAITurnInProgress.current = false;
                                return;
                            }
                            // Non-stealing items
                            else {
                                await triggerItemUse(idx);

                                // UPDATE MEMORY BASED ON ACTION
                                if (itemToUse === 'GLASS') {
                                    if (chamber[currentIdx]) aiMemory.current.set(currentIdx, chamber[currentIdx]);
                                }
                                else if (itemToUse === 'INVERTER') {
                                    if (aiMemory.current.has(currentIdx)) {
                                        const prevM = aiMemory.current.get(currentIdx);
                                        aiMemory.current.set(currentIdx, prevM === 'LIVE' ? 'BLANK' : 'LIVE');
                                    } else if (gameStateRef.current?.isHardMode) {
                                        aiMemory.current.set(currentIdx, 'LIVE');
                                    }
                                }
                                else if (itemToUse === 'BEER') {
                                    aiMemory.current.delete(currentIdx);
                                }
                                else if (itemToUse === 'BIG_INVERTER') {
                                    // Invert MEMORY for all remaining shells
                                    for (let i = currentIdx; i < chamber.length; i++) {
                                        if (aiMemory.current.has(i)) {
                                            const m = aiMemory.current.get(i);
                                            if (m) aiMemory.current.set(i, m === 'LIVE' ? 'BLANK' : 'LIVE');
                                        }
                                    }
                                }
                                else if (itemToUse === 'PHONE') {
                                    // Dealer used phone: Memorize a random future shell
                                    const available = [];
                                    const limit = chamber.length;
                                    for (let i = currentIdx + 1; i < limit; i++) {
                                        if (!aiMemory.current.has(i)) available.push(i);
                                    }
                                    if (available.length > 0) {
                                        const r = available[Math.floor(Math.random() * available.length)];
                                        if (chamber[r]) aiMemory.current.set(r, chamber[r]);
                                    }
                                }

                                await wait(500);
                                itemsUsedThisTurnRef.current += 1;
                                setAiTick(t => t + 1);
                                isAITurnInProgress.current = false;
                                return;
                            }
                        }
                    }

                    // --- SHOOTING DECISION ---
                    itemsUsedThisTurnRef.current = 0;
                    await wait(500);
                    setTargetAim('IDLE');
                    await wait(600);

                    // Re-evaluate known after item usage
                    currentKnown = aiMemory.current.get(currentIdx);

                    // Re-check deductions after item usage
                    if (!currentKnown) {
                        const curLive = gameStateRef.current?.liveCount ?? 0;
                        const curBlank = gameStateRef.current?.blankCount ?? 0;
                        if (curBlank === 0 && curLive > 0) currentKnown = 'LIVE';
                        else if (curLive === 0 && curBlank > 0) currentKnown = 'BLANK';
                    }

                    const finalLiveProb = currentKnown ? (currentKnown === 'LIVE' ? 1.0 : 0.0) : unknownLiveProb;

                    let target: TurnOwner = 'PLAYER';

                    // DECISION LOGIC
                    const dealerHp = dealerRef.current?.hp ?? 0;
                    const isSawed = Boolean(dealerRef.current?.isSawedActive);
                    const isChoked = Boolean(dealerRef.current?.isChokeActive);
                    const maxSelfDmg = isSawed ? (isChoked ? 4 : 2) : (isChoked ? 2 : 1);

                    if (finalLiveProb === 1.0) {
                        target = 'PLAYER';
                    } else if (finalLiveProb === 0.0) {
                        // 100% BLANK: Shoot self to deal 0 damage and gain another turn!
                        target = 'DEALER';
                    } else {
                        // Gun is loaded with an UNCERTAIN shell (0 < finalLiveProb < 1)
                        if (isSawed || dealerHp <= maxSelfDmg) {
                            // High risk of lethal or severe self-damage: never shoot self on uncertain shell!
                            target = 'PLAYER';
                        } else if (gameStateRef.current?.isHardMode) {
                            // Smart Hard Mode Logic:
                            // Calculate EV: shoot self only if probability of blank is overwhelmingly favorable
                            const threshold = 0.5 - (visibleBlank * 0.05);
                            target = finalLiveProb >= Math.max(0.35, threshold) ? 'PLAYER' : 'DEALER';
                        } else {
                            // Normal Mode:
                            const playerImmune = (playerRef.current?.jackpotImmunityShots ?? 0) > 0;
                            if (playerImmune) {
                                target = finalLiveProb >= 0.75 ? 'PLAYER' : 'DEALER';
                            } else {
                                target = finalLiveProb >= 0.45 ? 'PLAYER' : 'DEALER';
                            }

                            // Normal Mode Personality override: 8% human blunder / bluff
                            if (Math.random() < 0.08) {
                                target = target === 'PLAYER' ? 'DEALER' : 'PLAYER';
                            }
                        }
                    }

                    setTargetAim(target === 'PLAYER' ? 'OPPONENT' : 'SELF');
                    await wait(1000);
                    aiMemory.current.delete(currentIdx); // Clear memory of this shell once used
                    if (isChoked && currentIdx + 1 < chamber.length) {
                        aiMemory.current.delete(currentIdx + 1); // Choke fired 2 shells, clear both
                    }
                    await fireShotRef.current('DEALER', target);

                } catch (e) {
                    console.error("Dealer AI Error:", e);
                } finally {
                    isAITurnInProgress.current = false;
                    setIsProcessing(false); // Always unlock after turn logic finishes
                }
            };
            runAITurn();
        }
    }, [gameState.phase, aiTick, gameState.turnOwner, isProcessing, dealer, isTabVisible]);
};