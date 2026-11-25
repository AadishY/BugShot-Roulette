import React from 'react';
import { GameState, PlayerState, TurnOwner, ShellType, LogEntry, AnimationState, AimTarget, CameraView } from '../../types';
import { wait } from '../gameUtils';
import { audioManager } from '../audioManager';
import { MatchStats } from '../../utils/statsManager';

type StateSetter<T> = React.Dispatch<React.SetStateAction<T>>;

interface ShootingContext {
    gameState: GameState;
    setGameState: StateSetter<GameState>;
    player: PlayerState;
    setPlayer: StateSetter<PlayerState>;
    dealer: PlayerState;
    setDealer: StateSetter<PlayerState>;
    setAnim: (update: Partial<AnimationState> | ((prev: AnimationState) => Partial<AnimationState>)) => void;
    setKnownShell: StateSetter<ShellType | null>;
    setAimTarget: StateSetter<AimTarget>;
    setCameraView: StateSetter<CameraView>;
    setOverlayText: StateSetter<string | null>;
    setOverlayColor: StateSetter<'none' | 'red' | 'green' | 'scan'>;
    setShowFlash: StateSetter<boolean>;
    setShowBlood: StateSetter<boolean>;
    addLog: (text: string, type: LogEntry['type']) => void;
    playerName: string;
    startRound: (resetItems?: boolean) => Promise<void> | void;
    setIsProcessing: StateSetter<boolean>;
    matchStats?: React.MutableRefObject<MatchStats>; // Added
    handleHardModeRoundEnd?: (winner: TurnOwner) => Promise<void> | void;
    handleMPRoundEnd?: (winner: TurnOwner) => Promise<void> | void;
    handleNormalModeRoundEnd?: (winner: TurnOwner) => Promise<void> | void;
    opponentName: string;
    onBatchEnd?: (keepTurn: boolean) => void;
}

export const performShot = async (
    shooter: TurnOwner,
    target: TurnOwner,
    ctx: ShootingContext
) => {
    const {
        gameState, setGameState, player, setPlayer, dealer, setDealer,
        setAnim, setKnownShell, setAimTarget, setCameraView, setOverlayText, setOverlayColor,
        setShowFlash, setShowBlood, addLog, playerName, startRound, setIsProcessing, matchStats,
        handleHardModeRoundEnd, handleMPRoundEnd, handleNormalModeRoundEnd, opponentName, onBatchEnd
    } = ctx;

    setIsProcessing(true);

    try {
        // Align gun before firing
        await wait(450);

        const { chamber, currentShellIndex } = gameState;

        if (currentShellIndex >= chamber.length) {
            setGameState(prev => ({ ...prev, phase: 'RESOLVING' })); // Mark as resolving while waiting
            console.log("CHAMBER EMPTY - SYNCING...");
            if (gameState.isMultiplayer) {
                if (onBatchEnd) {
                    // Chamber was empty before firing – no shot happened, so no "keep turn" bonus
                    onBatchEnd(false);
                } else {
                    addLog("WAITING FOR REPLENISHMENT...", 'info');
                    setOverlayText("WAITING FOR HOST...");
                }
            } else {
                await startRound();
            }
            // Don't setIsProcessing(false) yet, we are waiting for the next round
            return;
        }

        setGameState(prev => ({ ...prev, phase: 'RESOLVING' }));

    const shell = chamber[currentShellIndex];
    const isLive = shell === 'LIVE';

    const isSawed = shooter === 'PLAYER' ? player.isSawedActive : dealer.isSawedActive;
    const isChoked = shooter === 'PLAYER' ? player.isChokeActive : dealer.isChokeActive;
    const isChokeBurst = isChoked && currentShellIndex + 1 < chamber.length;
    const processedShells = isChokeBurst ? 2 : 1;

    const shell1 = chamber[currentShellIndex];
    const shell2 = isChokeBurst ? chamber[currentShellIndex + 1] : null;
    const live1 = shell1 === 'LIVE';
    const live2 = shell2 === 'LIVE';
    const liveHits = (live1 ? 1 : 0) + (live2 ? 1 : 0);
    const anyLive = liveHits > 0;
    const willHit = anyLive;

    let damage = liveHits;
    if (isSawed && damage > 0) damage *= 2;

    const targetState = target === 'PLAYER' ? player : dealer;
    const targetHasJackpot = (targetState.jackpotImmunityShots ?? 0) > 0;

    if (isChokeBurst) {
        if (anyLive) {
            if (live1 && live2) audioManager.playSound('liveshell', { playbackRate: 0.8 });
            else audioManager.playSound('liveshell');
        } else {
            audioManager.playSound('blankshell');
            setTimeout(() => audioManager.playSound('blankshell'), 150);
        }
    } else {
        setTimeout(() => {
            if (anyLive) audioManager.playSound('liveshell');
            else audioManager.playSound('blankshell');
        }, 50);
    }

    setAnim(prev => ({
        ...prev,
        isLiveShot: anyLive,
        triggerRecoil: prev.triggerRecoil + (isChokeBurst && anyLive ? 2 : 1),
        muzzleFlashIntensity: anyLive ? (isChokeBurst ? 150 : 120) : 0
    }));

    if (willHit && target === 'DEALER') {
        setAnim(prev => ({ ...prev, dealerHit: true, dealerDropping: true }));
        setTimeout(() => setAnim(prev => ({ ...prev, dealerHit: false })), 200);
    }

    if (willHit && target === 'PLAYER') {
        setAnim(prev => ({ ...prev, playerHit: true, playerRecovering: false }));
        setOverlayColor('red');
        setShowBlood(true);
        setTimeout(() => {
            setShowBlood(false);
        }, 2200);
    }

    if (anyLive) {
        setShowFlash(true);
        setTimeout(() => {
            setShowFlash(false);
            setAnim({ muzzleFlashIntensity: 0 });
        }, 100);
    }

    if (isChokeBurst) {
        if (live1 && live2) {
            addLog('DOUBLE BARREL HIT! (2 LIVE)', 'danger');
        } else if (live1 || live2) {
            addLog('SPLIT SHOT (1 LIVE)', 'danger');
        } else {
            addLog('DOUBLE CLICK (2 BLANK)', 'safe');
        }
        if (isSawed && damage > 0) {
            addLog('CRITICAL MASS! (SAWED+CHOKE)', 'danger');
        }
        setOverlayText(`${shell1} + ${shell2}`);
    } else {
        if (isChoked) addLog("(CHOKE FAILED - 1 SHELL LEFT)", 'neutral');
        if (isLive && isSawed) {
            addLog('CRITICAL HIT! (SAWED-OFF)', 'danger');
        }
        addLog(isLive ? `BANG! ${damage} DMG` : 'CLICK.', isLive ? 'danger' : 'safe');
        setOverlayText(shell);
    }

    // Update Match Stats (only count damage if not absorbed by Jackpot shield)
    if (matchStats && matchStats.current && damage > 0 && !targetHasJackpot) {
        if (target === 'PLAYER') {
            matchStats.current.damageTaken += damage;
        } else if (target === 'DEALER' && shooter === 'PLAYER') {
            matchStats.current.damageDealt += damage;
            matchStats.current.shotsHit++;
        }
    }

    // --- INSTANT SHELL COUNT UPDATE ---
    const nextIndex = currentShellIndex + processedShells;

    setGameState(prev => {
        const remainingShells = prev.chamber.slice(nextIndex);
        return {
            ...prev,
            currentShellIndex: nextIndex,
            liveCount: remainingShells.filter(s => s === 'LIVE').length,
            blankCount: remainingShells.filter(s => s === 'BLANK').length
        };
    });

    // Rack Sequence
    await wait(500);

    let shellColorStr: 'red' | 'blue' | 'red+red' | 'red+blue' | 'blue+red' | 'blue+blue' = isLive ? 'red' : 'blue';

    if (processedShells === 2) {
        const s1 = chamber[currentShellIndex] === 'LIVE' ? 'red' : 'blue';
        const s2 = chamber[currentShellIndex + 1] === 'LIVE' ? 'red' : 'blue';
        shellColorStr = `${s1}+${s2}` as any;
    }

    setAnim(prev => ({
        ...prev,
        ejectedShellColor: shellColorStr,
        triggerRack: prev.triggerRack + 1
    }));

    await wait(800); // Shorter
    setOverlayText(null);
    setAimTarget('IDLE');

    // Reset Saw and Choke
    if (shooter === 'PLAYER') setPlayer(p => ({ ...p, isSawedActive: false, isChokeActive: false }));
    else setDealer(d => ({ ...d, isSawedActive: false, isChokeActive: false }));

    // Handle Damage & Win Check
    let gameOver = false;



    if (damage > 0) {
        const isPlayerTarget = target === 'PLAYER';
        const setTarget = isPlayerTarget ? setPlayer : setDealer;
        const winnerOnDeath: TurnOwner = isPlayerTarget ? 'DEALER' : 'PLAYER';
        const hasJackpot = (targetState.jackpotImmunityShots ?? 0) > 0;

        if (hasJackpot) {
            const nextImmunity = Math.max(0, (targetState.jackpotImmunityShots || 0) - liveHits);
            setTarget(p => ({
                ...p,
                jackpotImmunityShots: nextImmunity,
                hasJackpotWinActive: nextImmunity > 0 ? p.hasJackpotWinActive : false
            }));
            if (nextImmunity <= 0) {
                audioManager.stopJackpotMusic();
            }

            // RCT Sequence
            const originalHp = targetState.hp;
            const tempHp = Math.max(0, originalHp - damage);

            setTarget(p => ({ ...p, hp: tempHp }));
            setOverlayColor('red');
            setOverlayText(isPlayerTarget
                ? '✨ REVERSE CURSED TECHNIQUE ✨'
                : `✨ REVERSE CURSED TECHNIQUE FOR ${opponentName.toUpperCase()} ✨`
            );
            setAnim(prev => ({
                ...prev,
                ...(isPlayerTarget ? { playerHit: true, playerRecovering: false } : { dealerHit: true, dealerRecovering: false })
            }));

            await wait(1800);

            setTarget(p => ({ ...p, hp: originalHp }));
            setOverlayText('✨ RCT: HEALED! ✨');
            setOverlayColor('green');

            setAnim(prev => ({
                ...prev,
                ...(isPlayerTarget ? { playerHit: false, playerRecovering: true } : { dealerHit: false, dealerRecovering: true })
            }));
            await wait(1500);
            setAnim(prev => ({
                ...prev,
                ...(isPlayerTarget ? { playerRecovering: false } : { dealerRecovering: false })
            }));
            setOverlayColor('none');
            setOverlayText(null);
        } else {
            let newHp = Math.max(0, targetState.hp - damage);
            const hasTotem = (targetState.items || []).includes('TOTEM') && !targetState.isFlashbanged;

            if (newHp <= 0 && hasTotem) {
                newHp = 1;
                setTarget(p => {
                    const idx = p.items.indexOf('TOTEM');
                    const newItems = [...p.items];
                    if (idx !== -1) newItems.splice(idx, 1);
                    return { ...p, hp: 1, items: newItems };
                });

                setOverlayText(isPlayerTarget
                    ? '✨ TOTEM ACTIVATED ✨\nSurvives at 1 HP!'
                    : `✨ TOTEM ACTIVATED FOR ${opponentName.toUpperCase()} ✨\nSurvives at 1 HP!`
                );
                setAnim(prev => ({
                    ...prev,
                    triggerTotem: (prev.triggerTotem || 0) + 1,
                    totemTarget: target
                }));
                audioManager.playSound('totem');
                addLog(
                    isPlayerTarget
                        ? "PLAYER'S TOTEM ACTIVATED: Survived lethal damage at 1 HP!"
                        : `${opponentName.toUpperCase()}'S TOTEM ACTIVATED: Survived lethal damage at 1 HP!`,
                    'safe'
                );

                await wait(3000);
                setOverlayText(null);

                // Recovery animation
                setOverlayColor('red');
                setAnim(prev => ({
                    ...prev,
                    ...(isPlayerTarget
                        ? { playerHit: false, playerRecovering: true }
                        : { dealerHit: false, dealerDropping: false, dealerRecovering: true })
                }));
                await wait(2200);
                setAnim(prev => ({
                    ...prev,
                    ...(isPlayerTarget ? { playerRecovering: false } : { dealerRecovering: false })
                }));
                setOverlayColor('none');
            } else {
                setTarget(p => ({ ...p, hp: newHp }));

                if (newHp <= 0) {
                    setAnim(prev => ({
                        ...prev,
                        ...(isPlayerTarget ? { playerHit: false, playerRecovering: false } : { dealerHit: false, dealerRecovering: false })
                    }));
                    setOverlayColor('none');

                    if (gameState.isHardMode && handleHardModeRoundEnd) {
                        addLog(isPlayerTarget ? 'ROUND LOST' : 'ROUND WON', isPlayerTarget ? 'danger' : 'safe');
                        await handleHardModeRoundEnd(winnerOnDeath);
                        setIsProcessing(false);
                        return;
                    }
                    if (gameState.isMultiplayer && handleMPRoundEnd) {
                        addLog(isPlayerTarget ? 'ROUND LOST' : 'ROUND WON', isPlayerTarget ? 'danger' : 'safe');
                        await handleMPRoundEnd(winnerOnDeath);
                        setIsProcessing(false);
                        return;
                    }
                    if (!gameState.isMultiplayer && !gameState.isHardMode && handleNormalModeRoundEnd) {
                        addLog(isPlayerTarget ? 'ROUND LOST' : 'ROUND WON', isPlayerTarget ? 'danger' : 'safe');
                        await handleNormalModeRoundEnd(winnerOnDeath);
                        setIsProcessing(false);
                        return;
                    }
                    setGameState(prev => ({ ...prev, winner: winnerOnDeath, phase: 'GAME_OVER' }));
                    if (matchStats?.current) matchStats.current.result = isPlayerTarget ? 'LOSS' : 'WIN';
                    gameOver = true;
                    addLog(isPlayerTarget ? 'YOU DIED.' : `${opponentName.toUpperCase()} ELIMINATED.`, isPlayerTarget ? 'danger' : 'safe');
                } else if (isPlayerTarget) {
                    setOverlayColor('red');
                    setAnim(prev => ({ ...prev, playerHit: true }));
                    await wait(1800);
                    setAnim(prev => ({ ...prev, playerHit: false, playerRecovering: true }));
                    await wait(1500);
                    setAnim(prev => ({ ...prev, playerRecovering: false }));
                    setOverlayColor('none');
                } else {
                    setOverlayColor('green');
                    setAnim(prev => ({ ...prev, dealerHit: true, dealerDropping: true }));
                    await wait(1200);
                    setAnim(prev => ({ ...prev, dealerHit: false, dealerRecovering: true }));
                    await wait(1200);
                    setAnim(prev => ({ ...prev, dealerDropping: false }));
                    await wait(1000);
                    setAnim(prev => ({ ...prev, dealerRecovering: false }));
                    setOverlayColor('none');
                }
            }
        }
    }

    if (gameOver) {
        setIsProcessing(false);
        return;
    }

    setKnownShell(null);
    await wait(400); // Shorter pause

    const remaining = chamber.length - nextIndex;

    if (remaining === 0) {
        setGameState(prev => ({ ...prev, phase: 'RESOLVING' })); // Mark as resolving while waiting
        console.log("NO SHELLS REMAINING - SYNCING...");
        // Determine if the shooter keeps the turn (shot self + blank = no damage)
        const lastShotKeepsTurn = target === shooter && damage === 0;
        if (gameState.isMultiplayer) {
            if (onBatchEnd) {
                onBatchEnd(lastShotKeepsTurn);
            } else {
                addLog("WAITING FOR REPLENISHMENT...", 'info');
                setOverlayText("WAITING FOR HOST...");
            }
        } else {
            await startRound();
        }
        // Don't setIsProcessing(false) yet
        return;
    }

    // Pass Turn Logic
    // - Shoot self (Blank) -> Go again (Keep Turn).
    // - Any other case -> Pass Turn.
    // Pass Turn Logic
    // - Shoot self (Blank) -> Go again (Keep Turn).
    // - BUT Choke Special Rule: If you shoot 2 Blanks at self... do you go again? 
    //   Usually "Blank allows go again". IF BOTH are blank, logic implies "Nothing happens" = Go again?
    //   Prompt says "If both blank, nothing happens." -> Assume Turn Retained on full blank volley if target self.
    //   Mixed (Live+Blank) deals damage -> Turn Lost.

    const isSuccessSelf = target === shooter && damage === 0;
    const keepTurn = isSuccessSelf;
    let nextOwner = keepTurn ? shooter : (shooter === 'PLAYER' ? 'DEALER' : 'PLAYER');
    let turnChanged = !keepTurn;

    const shooterName = shooter === 'PLAYER' ? playerName.toUpperCase() : opponentName.toUpperCase();
    if (keepTurn) {
        addLog(`${shooterName} GOES AGAIN`, 'neutral');
    }

    // Handle Handcuffs Logic
    let skipped = false;
    if (turnChanged) {
        const nextPersonState = nextOwner === 'PLAYER' ? player : dealer;
        const nextPersonName = nextOwner === 'PLAYER' ? playerName.toUpperCase() : opponentName.toUpperCase();
        if (nextPersonState.isHandcuffed) {
            const message = `${nextPersonName} CUFFED. SKIPPING.`;
            addLog(message, 'info');
            setOverlayText(`${nextOwner} CUFFED`);
            audioManager.playSound('checkhandcuffs');

            await wait(2800); // Slower
            setOverlayText(null);

            if (nextOwner === 'PLAYER') setPlayer(p => ({ ...p, isHandcuffed: false }));
            else setDealer(d => ({ ...d, isHandcuffed: false }));

            nextOwner = shooter;
            skipped = true;
        }
    }

    const ownerPhase = nextOwner === 'PLAYER' ? 'PLAYER_TURN' : 'DEALER_TURN';
    setGameState(prev => ({
        ...prev,
        turnOwner: nextOwner,
        phase: ownerPhase,
        lastTurnWasSkipped: turnChanged ? skipped : prev.lastTurnWasSkipped
    }));
    
    // Note: lastTurnWasSkipped should be cleared when the skipped player's turn comes around again
    // This will be handled by the turn transition logic in useGameLogic
    
    if (skipped) {
        if (nextOwner === 'PLAYER') {
            // Player gets another turn - release the gun so they can use items
            setCameraView('PLAYER');
            setAimTarget('IDLE');
        } else {
            // Dealer gets another turn
            setCameraView('DEALER');
            setAimTarget('IDLE');
        }
    } else {
        setCameraView(nextOwner === 'PLAYER' ? 'PLAYER' : 'DEALER');
    }

    if (turnChanged) {
        if (shooter === 'PLAYER') setPlayer(p => ({ ...p, isFlashbanged: false }));
        else setDealer(d => ({ ...d, isFlashbanged: false }));
    }

    setIsProcessing(false);
  } catch (err) {
    console.error("Critical error in performShot:", err);
    setIsProcessing(false);
  }
};
