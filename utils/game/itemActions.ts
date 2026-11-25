import React from 'react';
import { GameState, PlayerState, TurnOwner, ShellType, ItemType, LogEntry, AnimationState } from '../../types';
import { wait, getFriendlyItemName } from '../gameUtils';
import { audioManager } from '../audioManager';
import { getContractLoot } from './inventory';
import { MAX_ITEMS } from '../../constants';

// Helper to update state safely
type StateSetter<T> = React.Dispatch<React.SetStateAction<T>>;

// Schedule overlay clear safely so stale timers never erase a newer message
const showTimedOverlay = (
    setOverlayText: StateSetter<string | null> | undefined,
    message: string,
    durationMs: number
) => {
    if (!setOverlayText) return;
    setOverlayText(message);
    setTimeout(() => {
        setOverlayText(prev => (prev === message ? null : prev));
    }, durationMs);
};

export const handleContract = async (
    user: TurnOwner,
    player: PlayerState,
    dealer: PlayerState,
    setPlayer: StateSetter<PlayerState>,
    setDealer: StateSetter<PlayerState>,
    setGameState: StateSetter<GameState>,
    setAnim: StateSetter<AnimationState>,
    setTriggerContract: StateSetter<number>,
    addLog: (text: string, type: LogEntry['type']) => void,
    setOverlayText?: StateSetter<string | null>,
    setOverlayColor?: StateSetter<'none' | 'red' | 'green' | 'scan'>,
    isHardMode?: boolean,
    isMultiplayer?: boolean,
    handleHardModeRoundEnd?: (winner: TurnOwner) => Promise<void> | void,
    handleMPRoundEnd?: (winner: TurnOwner) => Promise<void> | void,
    handleNormalModeRoundEnd?: (winner: TurnOwner) => Promise<void> | void,
    contractLootOverride?: ItemType[]
): Promise<boolean> => {
    setTriggerContract(p => p + 1);
    await wait(2500); // Wait for contract sign/burn animation

    if (setOverlayColor) setOverlayColor('red'); // Blood effect

    const isPlayerUser = user === 'PLAYER';
    const userState = isPlayerUser ? player : dealer;
    const setUser = isPlayerUser ? setPlayer : setDealer;
    const winnerOnDeath: TurnOwner = isPlayerUser ? 'DEALER' : 'PLAYER';
    const hasJackpot = (userState.jackpotImmunityShots ?? 0) > 0;

    // 1. Pay Handling Cost (1 HP, or 1 Jackpot shield charge, or Totem save)
    if (hasJackpot) {
        const nextImmunity = Math.max(0, (userState.jackpotImmunityShots ?? 0) - 1);
        const originalHp = userState.hp;
        const tempHp = Math.max(0, originalHp - 1);

        setUser(u => ({
            ...u,
            hp: tempHp,
            jackpotImmunityShots: nextImmunity,
            hasJackpotWinActive: nextImmunity > 0 ? u.hasJackpotWinActive : false
        }));
        if (nextImmunity <= 0) {
            audioManager.stopJackpotMusic();
        }

        if (setOverlayColor) setOverlayColor('red');
        if (setOverlayText) {
            setOverlayText(isPlayerUser ? '✨ REVERSE CURSED TECHNIQUE ✨' : '✨ DEALER RCT ACTIVATED ✨');
        }
        setAnim(prev => ({
            ...prev,
            ...(isPlayerUser ? { playerHit: true, playerRecovering: false } : { dealerHit: true, dealerRecovering: false })
        }));

        await wait(1800);

        setUser(u => ({ ...u, hp: originalHp }));
        if (setOverlayText) setOverlayText('✨ RCT: HEALED! ✨');
        if (setOverlayColor) setOverlayColor('green');

        setAnim(prev => ({
            ...prev,
            ...(isPlayerUser ? { playerHit: false, playerRecovering: true } : { dealerHit: false, dealerRecovering: true })
        }));
        await wait(1500);

        setAnim(prev => ({
            ...prev,
            ...(isPlayerUser ? { playerRecovering: false } : { dealerRecovering: false })
        }));
        if (setOverlayColor) setOverlayColor('none');
        if (setOverlayText) setOverlayText(null);
    } else {
        const newHp = userState.hp - 1;
        const hasTotem = (userState.items || []).includes('TOTEM') && !userState.isFlashbanged;

        if (newHp <= 0) {
            if (hasTotem) {
                setUser(u => {
                    const items = u.items || [];
                    const idx = items.indexOf('TOTEM');
                    const newItems = [...items];
                    if (idx !== -1) newItems.splice(idx, 1);
                    return { ...u, hp: 1, items: newItems };
                });

                if (setOverlayText) {
                    setOverlayText(isPlayerUser
                        ? '✨ TOTEM ACTIVATED ✨\nSurvives at 1 HP!'
                        : '✨ TOTEM ACTIVATED ✨\nDealer survives at 1 HP!'
                    );
                }
                setAnim(prev => ({
                    ...prev,
                    triggerTotem: (prev.triggerTotem || 0) + 1,
                    totemTarget: isPlayerUser ? 'PLAYER' : 'DEALER'
                }));
                audioManager.playSound('totem');
                addLog(
                    isPlayerUser
                        ? "PLAYER'S TOTEM ACTIVATED: Survived lethal blood contract sacrifice at 1 HP!"
                        : "DEALER'S TOTEM ACTIVATED: Survived lethal blood contract sacrifice at 1 HP!",
                    'safe'
                );
                await wait(3000);
                if (setOverlayText) setOverlayText(null);
            } else {
                setUser(u => ({ ...u, hp: 0 }));
                if (setOverlayColor) setOverlayColor('none');
                if (isPlayerUser) {
                    addLog('YOU DIED (BLOOD CONTRACT).', 'danger');
                } else {
                    addLog('DEALER DIED (BLOOD CONTRACT).', 'safe');
                }

                if (isHardMode && handleHardModeRoundEnd) {
                    await handleHardModeRoundEnd(winnerOnDeath);
                    return true;
                }
                if (isMultiplayer && handleMPRoundEnd) {
                    await handleMPRoundEnd(winnerOnDeath);
                    return true;
                }
                if (!isMultiplayer && !isHardMode && handleNormalModeRoundEnd) {
                    await handleNormalModeRoundEnd(winnerOnDeath);
                    return true;
                }
                setGameState(prev => ({ ...prev, winner: winnerOnDeath, phase: 'GAME_OVER' }));
                await wait(1500);
                return true; // End execution
            }
        } else {
            setUser(u => ({ ...u, hp: newHp }));
        }
    }

    await wait(800); // Wait for pain
    if (setOverlayColor) setOverlayColor('none');

    // 2. Grant Loot
    const activeCharmsCount = userState.luckycharmsUsed || 0;
    const newItems = contractLootOverride || getContractLoot(activeCharmsCount);
    const itemNames = newItems.join(' & ');
    const userName = user === 'PLAYER' ? 'YOU' : (user === 'DEALER' ? 'OPPONENT' : user);

    setUser(u => {
        const combined = [...(u.items || []), ...newItems].slice(0, MAX_ITEMS);
        return { ...u, items: combined, luckycharmsUsed: 0 };
    });

    if (setOverlayText) {
        const acceptMsg = `🩸 BLOOD ACCEPTED 🩸\n${userName} SACRIFICED 1 HP`;
        const offerMsg = `${userName} OFFERING:\n${itemNames}`;
        setOverlayText(acceptMsg);
        setTimeout(() => {
            setOverlayText(prev => (prev === acceptMsg ? offerMsg : prev));
        }, 2500);
        setTimeout(() => {
            setOverlayText(prev => (prev === offerMsg ? null : prev));
        }, 5000);
    }

    addLog(`${userName} SACRIFICED HP FOR: ${itemNames}`, 'danger');
    await wait(1000);
    return false;
};

export const handleBeer = async (
    gameState: GameState,
    setGameState: StateSetter<GameState>,
    setTriggerRack: StateSetter<number>,
    setEjectedShellColor: StateSetter<AnimationState['ejectedShellColor']>,
    setTriggerDrink: StateSetter<number>,
    setOverlayText: StateSetter<string | null>,
    addLog: (text: string, type: LogEntry['type']) => void,
    startRound: () => Promise<void> | void,
    onBatchEnd?: (keepTurn: boolean) => void
): Promise<boolean> => {
    if (gameState.currentShellIndex >= gameState.chamber.length) {
        addLog('CHAMBER IS EMPTY', 'neutral');
        return false;
    }

    setTriggerDrink(p => p + 1); // Visual cue
    await wait(1500); // Wait for drinking animation

    const shell = gameState.chamber[gameState.currentShellIndex];
    if (!shell) return false;
    setEjectedShellColor(shell === 'LIVE' ? 'red' : 'blue');
    setTriggerRack(p => p + 1);
    addLog(`RACKED: ${shell}`, shell === 'LIVE' ? 'danger' : 'safe');

    // Note: Beer does NOT consume Choke status (it remains active for the actual shot)
    // This is intended behavior.

    // Show overlay text for Beer result
    setOverlayText(`WAS ${shell}`);

    await wait(2000); // Wait for rack animation and message
    setOverlayText(null);

    let roundEnded = false;

    setGameState(prev => {
        const next = prev.currentShellIndex + 1;
        const remaining = prev.chamber.slice(next);
        return {
            ...prev,
            currentShellIndex: next,
            liveCount: remaining.filter(s => s === 'LIVE').length,
            blankCount: remaining.filter(s => s === 'BLANK').length
        };
    });

    if (gameState.currentShellIndex + 1 >= gameState.chamber.length) {
        if (gameState.isMultiplayer) {
            if (onBatchEnd) {
                // Beer discards a shell but doesn't grant a free turn — treat like a turn-ending action
                onBatchEnd(false);
            } else {
                setOverlayText("WAITING FOR HOST...");
            }
        } else {
            await wait(1000);
            await startRound();
        }
        roundEnded = true;
    }

    await wait(300); // Final sync
    return roundEnded;
};

export const handleCigs = async (
    user: TurnOwner,
    setPlayer: StateSetter<PlayerState>,
    setDealer: StateSetter<PlayerState>,
    setTriggerHeal: StateSetter<number>
) => {
    setTriggerHeal(p => p + 1);
    // audioManager.playSound('grab', { playbackRate: 1.5 }); // Lighter sound
    await wait(2500); // Wait for smoking animation to complete
    if (user === 'PLAYER') setPlayer(p => ({ ...p, hp: Math.min(p.maxHp, p.hp + 1) }));
    else setDealer(d => ({ ...d, hp: Math.min(d.maxHp, d.hp + 1) }));
    await wait(500); // Brief pause after
};

export const handleSaw = async (
    user: TurnOwner,
    setPlayer: StateSetter<PlayerState>,
    setDealer: StateSetter<PlayerState>,
    setTriggerSparks: StateSetter<number>,
    setIsSawing: StateSetter<boolean>
) => {
    setIsSawing(true);
    setTriggerSparks(p => p + 1);
    await wait(1500); // Wait for saw animation
    setIsSawing(false);

    if (user === 'PLAYER') setPlayer(p => ({ ...p, isSawedActive: true }));
    else setDealer(d => ({ ...d, isSawedActive: true }));
    await wait(500); // Brief pause after
};

export const handleCuffs = async (
    user: TurnOwner,
    setPlayer: StateSetter<PlayerState>,
    setDealer: StateSetter<PlayerState>,
    setTriggerCuff: StateSetter<number>
) => {
    setTriggerCuff(p => p + 1);
    // audioManager.playSound('blankshell', { playbackRate: 2.0 }); // High click
    await wait(1500); // Wait for cuff animation to complete
    if (user === 'PLAYER') setDealer(d => ({ ...d, isHandcuffed: true }));
    else setPlayer(p => ({ ...p, isHandcuffed: true }));
    await wait(300); // Final sync
};

export const handleGlass = async (
    user: TurnOwner,
    gameState: GameState,
    setKnownShell: StateSetter<ShellType | null>,
    setTriggerGlass: StateSetter<number>,
    addLog: (text: string, type: LogEntry['type']) => void
) => {
    if (gameState.currentShellIndex >= gameState.chamber.length) {
        addLog('CHAMBER IS EMPTY', 'neutral');
        return;
    }

    // 1. Instant Animation Trigger
    setTriggerGlass(p => p + 1);

    // 2. Delay for lift up animation
    await wait(1200);

    const nextShell = gameState.chamber[gameState.currentShellIndex];
    if (!nextShell) return;

    if (user === 'PLAYER' || gameState.isLocalSplit) {
        setKnownShell(nextShell);
        addLog(`IT IS ${nextShell}`, 'info');
        // Clear after 2.5 seconds only if still showing this inspected shell
        setTimeout(() => setKnownShell(prev => (prev === nextShell ? null : prev)), 2500);
        await wait(1200); // Wait for player to see result
    } else {
        // Dealer uses it: AI logic knows the shell, but we DO NOT show it to player
        addLog(`DEALER INSPECTS CHAMBER`, 'dealer');
        await wait(1500);
    }
    await wait(300); // Final sync
};

export const handlePhone = async (
    user: TurnOwner,
    gameState: GameState,
    setTriggerPhone: StateSetter<number>,
    addLog: (text: string, type: LogEntry['type']) => void,
    setOverlayText?: StateSetter<string | null>,
    phoneFutureIndexOverride?: number
) => {
    setTriggerPhone(p => p + 1);
    await wait(2500); // Wait for phone animation

    const checkLimit = gameState.chamber.length;
    const current = gameState.currentShellIndex;

    // Logic: Reveal a random shell from future rounds.
    const available = [];
    for (let i = current + 1; i < checkLimit; i++) {
        available.push(i);
    }

    const isHumanViewer = user === 'PLAYER' || Boolean(gameState.isLocalSplit);

    if (available.length === 0) {
        if (isHumanViewer) {
            const msg = "YOU ARE ON YOUR OWN BUD";
            addLog("📞 NO INTEL AVAILABLE", 'neutral');
            showTimedOverlay(setOverlayText, msg, 2500);
        } else {
            addLog("DEALER CHECKS PHONE", 'dealer');
        }
    } else {
        const randomIndex = phoneFutureIndexOverride !== undefined && phoneFutureIndexOverride < checkLimit
            ? phoneFutureIndexOverride
            : available[Math.floor(Math.random() * available.length)];
        const actualShell = gameState.chamber[randomIndex];
        const offset = randomIndex - current;

        // 5% chance to LIE about the shell type (for human burner phone)
        const isLying = isHumanViewer && Math.random() < 0.05;
        const displayedShell = isLying ? (actualShell === 'LIVE' ? 'BLANK' : 'LIVE') : actualShell;

        let positionText = "";
        if (offset === 1) positionText = "2ND SHELL";
        else if (offset === 2) positionText = "3RD SHELL";
        else if (offset === 3) positionText = "4TH SHELL";
        else if (offset === 4) positionText = "5TH SHELL";
        else positionText = `${offset + 1}TH SHELL`;

        if (isHumanViewer) {
            const displayText = `📞 ${positionText} IS ${displayedShell}`;
            addLog(`${positionText} IS ${displayedShell}`, 'info');
            showTimedOverlay(setOverlayText, displayText, 2500);
        } else {
            // Dealer gets the REAL info (AI knows truth)
            addLog(`DEALER USES PHONE`, 'dealer');
        }
    }
    await wait(2500); // Wait for full phone animation and result display
};

export const handleInverter = async (
    user: TurnOwner,
    gameState: GameState,
    setGameState: StateSetter<GameState>,
    setTriggerInverter: StateSetter<number>,
    addLog: (text: string, type: LogEntry['type']) => void,
    setOverlayText?: StateSetter<string | null>
) => {
    if (gameState.currentShellIndex >= gameState.chamber.length) {
        addLog('CHAMBER IS EMPTY', 'neutral');
        return;
    }

    setTriggerInverter(p => p + 1);
    await wait(1500); // Wait for animation to play

    setGameState(prev => {
        if (prev.currentShellIndex >= prev.chamber.length) return prev;
        const newChamber = [...prev.chamber];
        const cur = newChamber[prev.currentShellIndex];
        newChamber[prev.currentShellIndex] = cur === 'LIVE' ? 'BLANK' : 'LIVE';

        const remaining = newChamber.slice(prev.currentShellIndex);
        return {
            ...prev,
            chamber: newChamber,
            liveCount: remaining.filter(s => s === 'LIVE').length,
            blankCount: remaining.filter(s => s === 'BLANK').length
        };
    });

    addLog(`${user} INVERTED POLARITY`, 'info');
    showTimedOverlay(setOverlayText, '⚡ POLARITY CHANGED ⚡', 2000);

    await wait(800); // Final sync
};

export const handleBigInverter = async (
    user: TurnOwner,
    gameState: GameState,
    setGameState: StateSetter<GameState>,
    setTriggerBigInverter: StateSetter<number>,
    addLog: (text: string, type: LogEntry['type']) => void,
    setOverlayText?: StateSetter<string | null>
) => {
    if (gameState.currentShellIndex >= gameState.chamber.length) {
        addLog('CHAMBER IS EMPTY', 'neutral');
        return;
    }

    setTriggerBigInverter(p => p + 1);
    await wait(2800); // Wait for animation (longer for BIG effect)

    setGameState(prev => {
        const newChamber = [...prev.chamber];
        let newLive = 0;
        let newBlank = 0;

        for (let i = prev.currentShellIndex; i < newChamber.length; i++) {
            const inverted = newChamber[i] === 'LIVE' ? 'BLANK' : 'LIVE';
            newChamber[i] = inverted;
            if (inverted === 'LIVE') newLive++;
            else newBlank++;
        }

        return {
            ...prev,
            chamber: newChamber,
            liveCount: newLive,
            blankCount: newBlank
        };
    });

    addLog(`${user} INVERTED THE ENTIRE CHAMBER!`, 'danger');
    showTimedOverlay(setOverlayText, '⚡ TOTAL POLARITY REVERSAL ⚡', 2500);

    await wait(800);
};

export const handleAdrenaline = async (
    user: TurnOwner,
    setTriggerAdrenaline: StateSetter<number>,
    setGameState: StateSetter<GameState>,
    addLog: (text: string, type: LogEntry['type']) => void,
    setOverlayText?: StateSetter<string | null>,
    setOverlayColor?: StateSetter<'none' | 'red' | 'green' | 'scan'>,
    isLocalSplit: boolean = false
) => {
    setTriggerAdrenaline(p => p + 1);

    await wait(500);
    // Heartbeat / Rush effect
    if (setOverlayColor) setOverlayColor('red');

    await wait(1300); // Wait for injection animation completion

    if (setOverlayColor) setOverlayColor('none');

    // Show message AFTER animation plays
    showTimedOverlay(
        setOverlayText,
        user === 'PLAYER' || isLocalSplit ? '⚡ ADRENALINE RUSH ⚡' : '💉 DEALER SURGE',
        2000
    );

    await wait(500); // Pause before phase change

    if (user === 'PLAYER' || isLocalSplit) {
        addLog("TIME SLOWS DOWN... PICK AN ITEM TO STEAL", 'danger');
        setGameState(prev => ({ ...prev, phase: 'STEALING' }));
    } else {
        addLog("DEALER MOVING WITH UNNATURAL SPEED", 'dealer');
        // Dealer logic handles its own stealing flow in useDealerAI
    }
    await wait(300); // Final sync
};

export const handleChoke = async (
    user: TurnOwner,
    setPlayer: StateSetter<PlayerState>,
    setDealer: StateSetter<PlayerState>,
    setTriggerChoke: StateSetter<number>,
    addLog: (text: string, type: LogEntry['type']) => void
) => {
    setTriggerChoke(p => p + 1);
    // Audio handled in animations.ts
    await wait(1800); // Wait for animation (sound is ~1.5s)

    if (user === 'PLAYER') setPlayer(p => ({ ...p, isChokeActive: true }));
    else setDealer(d => ({ ...d, isChokeActive: true }));

    addLog(`${user === 'PLAYER' ? 'YOU' : 'DEALER'} ATTACHED CHOKE MOD`, 'danger');
    await wait(500);
};

export const handleRemote = async (
    user: TurnOwner,
    gameState: GameState,
    setGameState: StateSetter<GameState>,
    setTriggerRemote: StateSetter<number>,
    addLog: (text: string, type: LogEntry['type']) => void,
    setOverlayText?: StateSetter<string | null>
) => {
    setTriggerRemote(p => p + 1);
    await wait(2500); // Wait for animation

    const currentIdx = gameState.currentShellIndex;
    if (currentIdx + 1 < gameState.chamber.length) {
        // Swap Current with Next
        setGameState(prev => {
            const idx = prev.currentShellIndex;
            if (idx + 1 >= prev.chamber.length) return prev;
            const newChamber = [...prev.chamber];
            const s1 = newChamber[idx];
            const s2 = newChamber[idx + 1];
            newChamber[idx] = s2;
            newChamber[idx + 1] = s1;
            return { ...prev, chamber: newChamber };
        });

        addLog(`${user} SWAPPED SHELL ORDER`, 'info');
        showTimedOverlay(setOverlayText, '↻ CHAMBER CYCLED ↻', 2000);
    } else {
        addLog(`${user} TRIED REMOTE (FAILED)`, 'neutral');
    }

    await wait(800);
};

export const handleLuckycharm = async (
    user: TurnOwner,
    setPlayer: StateSetter<PlayerState>,
    setDealer: StateSetter<PlayerState>,
    setTriggerLuckycharm: StateSetter<number>,
    addLog: (text: string, type: LogEntry['type']) => void,
    setOverlayText?: StateSetter<string | null>
) => {
    setTriggerLuckycharm(p => p + 1);
    await wait(2500); // Wait for animation

    if (user === 'PLAYER') {
        setPlayer(p => ({ ...p, luckycharmsUsed: (p.luckycharmsUsed || 0) + 1 }));
        showTimedOverlay(setOverlayText, '🍀 LUCK CHARMED 🍀\nHope you will get better items', 2500);
        addLog("YOU ACTIVATED LUCKY CHARM: Next shipment improved", 'safe');
    } else {
        setDealer(d => ({ ...d, luckycharmsUsed: (d.luckycharmsUsed || 0) + 1 }));
        addLog("DEALER ACTIVATED LUCKY CHARM: Next shipment improved", 'dealer');
    }

    await wait(800);
};

export const handleFlashbang = async (
    user: TurnOwner,
    setPlayer: StateSetter<PlayerState>,
    setDealer: StateSetter<PlayerState>,
    setTriggerFlashbang: StateSetter<number>,
    addLog: (text: string, type: LogEntry['type']) => void,
    setOverlayText?: StateSetter<string | null>,
    setShowFlashbang?: StateSetter<boolean>
) => {
    setTriggerFlashbang(p => p + 1);
    await wait(1500); // Wait for animation fuse cooking

    // Detonate!
    if (setShowFlashbang) setShowFlashbang(true);

    await wait(400); // White screen peak

    if (user === 'PLAYER') {
        setDealer(d => ({ ...d, isFlashbanged: true }));
        showTimedOverlay(setOverlayText, '💥 FLASHBANGED 💥\nOpponent cannot use items next turn', 2500);
        addLog("YOU FLASHBANGED THE DEALER: Items blocked on their next turn", 'safe');
    } else {
        setPlayer(p => ({ ...p, isFlashbanged: true }));
        showTimedOverlay(setOverlayText, '💥 BLINDED! 💥\nYou cannot use items next turn', 2500);
        addLog("DEALER FLASHBANGED YOU: Items blocked on your next turn", 'danger');
    }

    await wait(1800); // Let the screen blind fade out
    if (setShowFlashbang) setShowFlashbang(false);
};

export const handleCrusher = async (
    user: TurnOwner,
    player: PlayerState,
    dealer: PlayerState,
    setPlayer: StateSetter<PlayerState>,
    setDealer: StateSetter<PlayerState>,
    setTriggerCrusher: StateSetter<number>,
    addLog: (text: string, type: LogEntry['type']) => void,
    setOverlayText?: StateSetter<string | null>,
    crushIndexOverride?: number
) => {
    // 1. Trigger animation
    setTriggerCrusher(p => p + 1);

    // 2. Wait for impact (1.3s in animation)
    await wait(1300);

    const target = user === 'PLAYER' ? dealer : player;
    const targetSetter = user === 'PLAYER' ? setDealer : setPlayer;

    if (target.items.length === 0) {
        showTimedOverlay(setOverlayText, user === 'PLAYER' ? "Dealer's inventory is empty!" : "Your inventory is empty!", 2000);
        addLog(user === 'PLAYER' ? "YOU USED CRUSHER: Opponent has no items to destroy!" : "DEALER USED CRUSHER: You have no items to destroy!", 'safe');
        await wait(900); // Wait for remainder of 2.2s animation
        return;
    }

    // Determine the item to destroy based on target items
    const safeIdx = crushIndexOverride !== undefined && crushIndexOverride >= 0 && crushIndexOverride < target.items.length
        ? crushIndexOverride
        : Math.floor(Math.random() * target.items.length);
    const itemToDestroy = target.items[safeIdx];
    if (!itemToDestroy) {
        await wait(900);
        return;
    }
    const friendlyName = getFriendlyItemName(itemToDestroy);

    // Remove the item from the state safely by value-matching
    targetSetter(prev => {
        const idx = prev.items.indexOf(itemToDestroy);
        if (idx === -1) return prev;
        const newItems = [...prev.items];
        newItems.splice(idx, 1);
        return { ...prev, items: newItems };
    });

    const ownerName = user === 'PLAYER' ? "Dealer's" : "Player's";
    showTimedOverlay(setOverlayText, `DESTROYED_ITEM::${itemToDestroy}::${ownerName}::${friendlyName}`, 4000);

    if (user === 'PLAYER') {
        addLog(`YOU CRUSHED DEALER'S ITEM: Destroyed 1 ${friendlyName}`, 'safe');
    } else {
        addLog(`DEALER CRUSHED YOUR ITEM: Destroyed 1 ${friendlyName}`, 'danger');
    }

    await wait(900); // Wait for remainder of 2.2s animation
};


