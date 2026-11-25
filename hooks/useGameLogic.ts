import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GameState, PlayerState, ShellType, ItemType, LogEntry, TurnOwner, CameraView, AimTarget, AnimationState, RoomSettings, TarotCard, PlayerModelKey, LocalSplitConfig } from '../types';
import { MAX_HP, MAX_ITEMS, ITEMS } from '../constants';
import { randomInt, wait, getFriendlyItemName, shuffleArray } from '../utils/gameUtils';
import * as ItemActions from '../utils/game/itemActions';
import { audioManager, resumeAudioContext } from '../utils/audioManager';
import { performShot } from '../utils/game/shooting';
import { distributeItems as distributeItemsAction, getRandomItem, resolveJackpotOutcome, getContractLoot } from '../utils/game/inventory';
import { MatchStats } from '../utils/statsManager';
import { sanitizeSplitConfig, pickRandomStartingTurn } from '../utils/splitMode';

export const useGameLogic = () => {
  // --- State ---
  const [playerName, setPlayerNameState] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const onBatchEndRef = useRef<((keepTurn: boolean) => void) | null>(null);
  const onMPRoundEndRef = useRef<((winner: TurnOwner, pWin?: number, oWin?: number) => void | Promise<void>) | null>(null);
  const [dealerModel, setDealerModel] = useState<PlayerModelKey>('DEFAULT');

  const [gameState, setGameState] = useState<GameState>({
    phase: 'BOOT',
    turnOwner: 'PLAYER',
    winner: null,
    chamber: [],
    currentShellIndex: 0,
    liveCount: 0,
    blankCount: 0,
    roundCount: 0,
    isHardMode: false,
    roomSettings: { rounds: 1, hp: 2, itemsPerShipment: 4 },
    multiModeState: { playerWins: 0, opponentWins: 0 }
  });

  const [player, setPlayer] = useState<PlayerState>({
    hp: MAX_HP,
    maxHp: MAX_HP,
    items: [],
    isHandcuffed: false,
    isSawedActive: false,
    luckycharmsUsed: 0,
    lastTurnItemsUsed: [],
    currentTurnItemsUsed: [],
  });

  const [dealer, setDealer] = useState<PlayerState>({
    hp: MAX_HP,
    maxHp: MAX_HP,
    items: [],
    isHandcuffed: false,
    isSawedActive: false,
    luckycharmsUsed: 0,
    lastTurnItemsUsed: [],
    currentTurnItemsUsed: [],
  });

  const [player3, setPlayer3] = useState<PlayerState>({
    hp: MAX_HP,
    maxHp: MAX_HP,
    items: [],
    isHandcuffed: false,
    isSawedActive: false,
    luckycharmsUsed: 0,
    lastTurnItemsUsed: [],
    currentTurnItemsUsed: [],
  });

  const [player4, setPlayer4] = useState<PlayerState>({
    hp: MAX_HP,
    maxHp: MAX_HP,
    items: [],
    isHandcuffed: false,
    isSawedActive: false,
    luckycharmsUsed: 0,
    lastTurnItemsUsed: [],
    currentTurnItemsUsed: [],
  });

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [knownShell, setKnownShell] = useState<ShellType | null>(null);

  // Animation State Group
  const [animState, setAnimState] = useState<AnimationState>({
    triggerRecoil: 0,
    triggerRack: 0,
    triggerSparks: 0,
    triggerHeal: 0,
    triggerDrink: 0,
    triggerCuff: 0,
    triggerGlass: 0,
    triggerPhone: 0,
    triggerInverter: 0,
    triggerAdrenaline: 0,
    triggerChoke: 0,
    triggerRemote: 0,
    triggerBigInverter: 0,
    triggerContract: 0,
    triggerLuckycharm: 0,
    triggerFlashbang: 0,
    triggerCrusher: 0,
    triggerTotem: 0,
    triggerMirror: 0,
    triggerDeckCard: 0,
    triggerJackpot: 0,
    jackpotResult: null,
    totemTarget: null,
    isSawing: false,
    ejectedShellColor: 'red',
    muzzleFlashIntensity: 0,
    isLiveShot: false,
    dealerHit: false,
    dealerDropping: false,
    playerHit: false,
    playerRecovering: false,
    dealerRecovering: false
  });

  const [aimTarget, setAimTarget] = useState<AimTarget>('IDLE');
  const [cameraView, setCameraView] = useState<CameraView>('PLAYER');
  const [overlayColor, setOverlayColor] = useState<'none' | 'red' | 'green' | 'scan'>('none');
  const [overlayText, setOverlayTextState] = useState<string | null>(null);
  const [overlayTextUpdatedAt, setOverlayTextUpdatedAt] = useState<number>(0);
  const [showBlood, setShowBlood] = useState(false);
  const [showFlash, setShowFlash] = useState(false);
  const [showFlashbang, setShowFlashbang] = useState(false);

  const [receivedItems, setReceivedItems] = useState<ItemType[]>([]);
  const [opponentReceivedItems, setOpponentReceivedItems] = useState<ItemType[]>([]);
  const [showLootOverlay, setShowLootOverlay] = useState(false);

  // --- Refs ---
  const gameStateRef = useRef(gameState);
  const playerRef = useRef(player);
  const dealerRef = useRef(dealer);
  const player3Ref = useRef(player3);
  const player4Ref = useRef(player4);
  const playerNameRef = useRef(playerName);
  const animStateRef = useRef(animState);
  const isProcessingRef = useRef(isProcessing);
  const prevTurnOwnerRef = useRef<TurnOwner>(gameState.turnOwner);

  // Timers
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorOverlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startGameTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const muzzleFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingSafetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundGenRef = useRef<number>(0);
  const gameGenRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  // Synchronous ref mirroring: zero latency for asynchronous handler callbacks
  gameStateRef.current = gameState;
  playerRef.current = player;
  dealerRef.current = dealer;
  player3Ref.current = player3;
  player4Ref.current = player4;
  playerNameRef.current = playerName;
  animStateRef.current = animState;
  isProcessingRef.current = isProcessing;

  // Stats Ref to track current match performance and accurate duration
  const matchStartTimeRef = useRef<number>(Date.now());
  const matchStatsRef = useRef<MatchStats>({
    result: 'LOSS',
    roundsSurvived: 1,
    shotsFired: 0,
    shotsHit: 0,
    selfShots: 0,
    itemsUsed: {},
    damageDealt: 0,
    damageTaken: 0,
    totalScore: 0,
    duration: 0
  });

  const clearAllTimers = useCallback(() => {
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
    if (overlayHideTimeoutRef.current) {
      clearTimeout(overlayHideTimeoutRef.current);
      overlayHideTimeoutRef.current = null;
    }
    if (errorOverlayTimeoutRef.current) {
      clearTimeout(errorOverlayTimeoutRef.current);
      errorOverlayTimeoutRef.current = null;
    }
    if (startGameTimeoutRef.current) {
      clearTimeout(startGameTimeoutRef.current);
      startGameTimeoutRef.current = null;
    }
    if (muzzleFlashTimeoutRef.current) {
      clearTimeout(muzzleFlashTimeoutRef.current);
      muzzleFlashTimeoutRef.current = null;
    }
    if (processingSafetyTimeoutRef.current) {
      clearTimeout(processingSafetyTimeoutRef.current);
      processingSafetyTimeoutRef.current = null;
    }
  }, []);

  // Cleanup all timers and audio resources on hook unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      gameGenRef.current++;
      roundGenRef.current++;
      clearAllTimers();
      audioManager.stopAllSFX();
    };
  }, [clearAllTimers]);

  // Safety watchdog: ensure isProcessing never permanently locks the game UI
  useEffect(() => {
    if (isProcessing) {
      if (processingSafetyTimeoutRef.current) {
        clearTimeout(processingSafetyTimeoutRef.current);
      }
      processingSafetyTimeoutRef.current = setTimeout(() => {
        console.warn('[GameLogic] Safety watchdog: isProcessing locked for >18s, forcing auto-unlock.');
        setIsProcessing(false);
        processingSafetyTimeoutRef.current = null;
      }, 18000);
    } else {
      if (processingSafetyTimeoutRef.current) {
        clearTimeout(processingSafetyTimeoutRef.current);
        processingSafetyTimeoutRef.current = null;
      }
    }

    return () => {
      if (processingSafetyTimeoutRef.current) {
        clearTimeout(processingSafetyTimeoutRef.current);
        processingSafetyTimeoutRef.current = null;
      }
    };
  }, [isProcessing]);

  // Turn transitions & items reset
  useEffect(() => {
    if (gameState.phase === 'LOAD' || gameState.phase === 'LOOTING' || gameState.phase === 'GAME_OVER') {
      const resetTurnItems = (p: PlayerState): PlayerState => {
        if ((p.lastTurnItemsUsed && p.lastTurnItemsUsed.length > 0) || (p.currentTurnItemsUsed && p.currentTurnItemsUsed.length > 0)) {
          return { ...p, lastTurnItemsUsed: [], currentTurnItemsUsed: [] };
        }
        return p;
      };
      setPlayer(resetTurnItems);
      setDealer(resetTurnItems);
      setPlayer3(resetTurnItems);
      setPlayer4(resetTurnItems);
      if (gameState.lastTurnWasSkipped) {
        setGameState(prev => (prev.lastTurnWasSkipped ? { ...prev, lastTurnWasSkipped: false } : prev));
      }
      prevTurnOwnerRef.current = gameState.turnOwner;
      return;
    }

    if (gameState.turnOwner !== prevTurnOwnerRef.current) {
      const prevOwner = prevTurnOwnerRef.current;
      const advanceTurnItems = (p: PlayerState): PlayerState => ({
        ...p,
        lastTurnItemsUsed: p.currentTurnItemsUsed || [],
        currentTurnItemsUsed: []
      });

      if (prevOwner === 'PLAYER') {
        setPlayer(advanceTurnItems);
      } else if (prevOwner === 'DEALER') {
        setDealer(advanceTurnItems);
      } else if (prevOwner === 'PLAYER3') {
        setPlayer3(advanceTurnItems);
      } else if (prevOwner === 'PLAYER4') {
        setPlayer4(advanceTurnItems);
      }
      prevTurnOwnerRef.current = gameState.turnOwner;
    }
  }, [gameState.turnOwner, gameState.phase, gameState.lastTurnWasSkipped]);

  // Load name on mount
  useEffect(() => {
    const saved = localStorage.getItem('aadish_roulette_name');
    if (saved) {
      playerNameRef.current = saved;
      setPlayerNameState(saved);
    }
  }, []);

  const setPlayerName = useCallback((name: string) => {
    playerNameRef.current = name;
    setPlayerNameState(name);
  }, []);

  const setAnim = useCallback((update: Partial<AnimationState> | ((prev: AnimationState) => Partial<AnimationState>)) => {
    setAnimState(prev => ({ ...prev, ...(typeof update === 'function' ? update(prev) : update) }));
  }, []);

  const setOverlayText = useCallback((nextValue: React.SetStateAction<string | null>) => {
    if (overlayHideTimeoutRef.current) {
      clearTimeout(overlayHideTimeoutRef.current);
      overlayHideTimeoutRef.current = null;
    }
    if (errorOverlayTimeoutRef.current) {
      clearTimeout(errorOverlayTimeoutRef.current);
      errorOverlayTimeoutRef.current = null;
    }
    setOverlayTextUpdatedAt(Date.now());
    setOverlayTextState(nextValue);
  }, []);

  // Overlay text hide timer for multiplayer
  useEffect(() => {
    if (!gameState.isMultiplayer) {
      if (overlayHideTimeoutRef.current) {
        clearTimeout(overlayHideTimeoutRef.current);
        overlayHideTimeoutRef.current = null;
      }
      return;
    }

    if (overlayText) {
      if (overlayHideTimeoutRef.current) {
        clearTimeout(overlayHideTimeoutRef.current);
      }
      overlayHideTimeoutRef.current = setTimeout(() => {
        setOverlayText(null);
        overlayHideTimeoutRef.current = null;
      }, 30000);
    } else if (overlayHideTimeoutRef.current) {
      clearTimeout(overlayHideTimeoutRef.current);
      overlayHideTimeoutRef.current = null;
    }

    return () => {
      if (overlayHideTimeoutRef.current) {
        clearTimeout(overlayHideTimeoutRef.current);
        overlayHideTimeoutRef.current = null;
      }
    };
  }, [overlayText, overlayTextUpdatedAt, gameState.isMultiplayer, setOverlayText]);

  const addLog = useCallback((text: string, type: LogEntry['type'] = 'neutral') => {
    setLogs(prev => {
      const next = [...prev, { id: Date.now() + Math.random(), text, type }];
      return next.length > 100 ? next.slice(next.length - 100) : next;
    });
  }, []);

  const resetStats = useCallback(() => {
    matchStartTimeRef.current = Date.now();
    matchStatsRef.current = {
      result: 'LOSS',
      roundsSurvived: 1,
      shotsFired: 0,
      shotsHit: 0,
      selfShots: 0,
      itemsUsed: {},
      damageDealt: 0,
      damageTaken: 0,
      totalScore: 0,
      duration: 0
    };
  }, []);

  const getOpponentName = useCallback(() => {
    if (gameStateRef.current.isLocalSplit) {
      return gameStateRef.current.opponentName || gameStateRef.current.localSplitConfig?.player2Name || 'PLAYER 2';
    }
    return gameStateRef.current.isMultiplayer ? (gameStateRef.current.opponentName || 'OPPONENT') : 'DEALER';
  }, []);

  const getPlayerState = useCallback((owner: TurnOwner) => {
    if (owner === 'PLAYER') return playerRef.current;
    if (owner === 'PLAYER3') return player3Ref.current;
    if (owner === 'PLAYER4') return player4Ref.current;
    return dealerRef.current;
  }, []);

  const getPlayerSetter = useCallback((owner: TurnOwner) => {
    if (owner === 'PLAYER') return setPlayer;
    if (owner === 'PLAYER3') return setPlayer3;
    if (owner === 'PLAYER4') return setPlayer4;
    return setDealer;
  }, []);

  const getPlayerNameByOwner = useCallback((owner: TurnOwner) => {
    if (owner === 'PLAYER') return playerNameRef.current || 'PLAYER';
    const players = gameStateRef.current.multiplayerState?.players || [];
    const myId = gameStateRef.current.localPlayerId || '';
    const myIndex = players.findIndex(p => p.id === myId);
    if (myIndex !== -1 && players.length >= 3) {
      const size = players.length;
      const frontOpponent = players[(myIndex + 2) % size];
      const sideOpponent = players[(myIndex + 1) % size];
      const rightOpponent = size >= 4 ? players[(myIndex + 3) % size] : null;
      if (owner === 'DEALER') return frontOpponent?.name || 'OPPONENT 1';
      if (owner === 'PLAYER3') return sideOpponent?.name || 'OPPONENT 2';
      if (owner === 'PLAYER4') return rightOpponent?.name || 'OPPONENT 3';
    }
    return owner === 'DEALER' ? (gameStateRef.current.opponentName || 'OPPONENT') : 'OPPONENT 2';
  }, []);

  const resolveTargetOwner = useCallback((targetPlayerId: string, localPlayerId: string, players: any[]): TurnOwner => {
    if (!targetPlayerId) return 'DEALER';
    if (targetPlayerId === localPlayerId) return 'PLAYER';

    const size = players?.length || 0;
    const myIndex = players ? players.findIndex(p => p.id === localPlayerId) : -1;
    if (myIndex === -1 || size < 2) return 'DEALER';

    let absoluteId = targetPlayerId;
    if (['PLAYER', 'PLAYER3', 'PLAYER4', 'DEALER'].includes(targetPlayerId)) {
      if (targetPlayerId === 'PLAYER') {
        absoluteId = localPlayerId;
      } else if (targetPlayerId === 'DEALER') {
        absoluteId = players[(myIndex + 2) % size]?.id || localPlayerId;
      } else if (targetPlayerId === 'PLAYER3') {
        absoluteId = players[(myIndex + 1) % size]?.id || localPlayerId;
      } else if (targetPlayerId === 'PLAYER4') {
        absoluteId = players[(myIndex + (size === 4 ? 3 : 1)) % size]?.id || localPlayerId;
      }
    }

    if (absoluteId === localPlayerId) return 'PLAYER';
    const targetIndex = players.findIndex(p => p.id === absoluteId);
    if (targetIndex === -1) return 'DEALER';

    if (size === 2) {
      return 'DEALER';
    }

    if (size === 3) {
      if (targetIndex === (myIndex + 2) % 3) return 'DEALER';
      if (targetIndex === (myIndex + 1) % 3) return 'PLAYER3';
      return 'DEALER';
    }

    if (size >= 4) {
      if (targetIndex === (myIndex + 2) % size) return 'DEALER';
      if (targetIndex === (myIndex + 1) % size) return 'PLAYER3';
      if (targetIndex === (myIndex + 3) % size) return 'PLAYER4';
      return 'DEALER';
    }

    return 'DEALER';
  }, []);

  const startRound = useCallback(async (
    resetItems: boolean = false,
    hardModeOverride?: boolean,
    hardModeStateOverride?: any,
    chamberOverride?: ShellType[],
    pItemsOverride?: ItemType[],
    dItemsOverride?: ItemType[],
    turnOwnerOverride?: TurnOwner,
    hpOverride?: number,
    multiWinsOverride?: { playerWins: number, opponentWins: number },
    p3ItemsOverride?: ItemType[],
    p4ItemsOverride?: ItemType[]
  ) => {
    const currentGen = ++roundGenRef.current;
    const currentGameGen = gameGenRef.current;
    const isRoundCancelled = () => !isMountedRef.current || currentGen !== roundGenRef.current || currentGameGen !== gameGenRef.current;
    setIsProcessing(true);

    try {
      // Resolve Hard Mode State
      const isHM = hardModeOverride !== undefined ? hardModeOverride : gameStateRef.current.isHardMode;
      const hmState = hardModeStateOverride !== undefined ? hardModeStateOverride : gameStateRef.current.hardModeState;

      let chamber: ShellType[];
      let lives: number;
      let blanks: number;

      if (chamberOverride) {
        chamber = chamberOverride;
        lives = chamber.filter(s => s === 'LIVE').length;
        blanks = chamber.filter(s => s === 'BLANK').length;
      } else {
        const isNormalRound1 = !isHM && !gameStateRef.current.isMultiplayer && !gameStateRef.current.isLocalSplit && (gameStateRef.current.normalModeState?.round || 1) === 1;
        const total = isNormalRound1 ? randomInt(2, 4) : randomInt(2, 8);
        const maxLives = Math.floor(total / 2);
        lives = randomInt(1, maxLives);
        if (lives < maxLives && Math.random() > 0.4) {
          lives = maxLives;
        }
        blanks = total - lives;

        chamber = [...Array(lives).fill('LIVE'), ...Array(blanks).fill('BLANK')] as ShellType[];

        for (let i = chamber.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [chamber[i], chamber[j]] = [chamber[j], chamber[i]];
        }
      }

      setGameState(prev => ({
        ...prev,
        chamber,
        currentShellIndex: 0,
        liveCount: lives,
        blankCount: blanks,
        roundCount: resetItems ? 1 : prev.roundCount + 1,
        phase: 'LOAD',
        isHardMode: isHM,
        hardModeState: hmState
      }));

      if (!resetItems && !isHM) {
        matchStatsRef.current.roundsSurvived = (gameStateRef.current.roundCount || 0) + 1;
      } else {
        if (!isHM) matchStatsRef.current.roundsSurvived = 1;
      }

      if (resetItems || !playerRef.current.jackpotImmunityShots || playerRef.current.jackpotImmunityShots <= 0) {
        audioManager.stopJackpotMusic();
      }
      setKnownShell(null);
      setAnim({
        dealerDropping: false,
        dealerHit: false,
        dealerRecovering: false,
        playerHit: false,
        playerRecovering: false,
        player3Hit: false,
        player3Dropping: false,
        player3Recovering: false,
        player4Hit: false,
        player4Dropping: false,
        player4Recovering: false
      });
      let startCamView: CameraView = 'PLAYER';
      if (turnOwnerOverride === 'DEALER') startCamView = 'DEALER';
      else if (turnOwnerOverride === 'PLAYER3') startCamView = 'PLAYER3_GUN';
      else if (turnOwnerOverride === 'PLAYER4') startCamView = 'PLAYER';
      setCameraView(startCamView);

      // HP Setup
      let startingHp = hpOverride || MAX_HP;
      if (gameStateRef.current.isLocalSplit && !hpOverride) {
        startingHp = gameStateRef.current.localSplitConfig?.startingHp || gameStateRef.current.roomSettings?.hp || MAX_HP;
      } else if (isHM && !hpOverride) {
        const stage = hmState?.round || 1;
        if (stage === 1) startingHp = 2;
        else if (stage === 2) startingHp = 3;
        else startingHp = 4;
      } else if (!gameStateRef.current.isMultiplayer && !gameStateRef.current.isLocalSplit && !isHM && !hpOverride) {
        const stage = gameStateRef.current.normalModeState?.round || 1;
        if (stage === 1) startingHp = 2;
        else startingHp = 4;
      }

      // Reset HP only if it's a NEW Stage
      if (resetItems || hpOverride !== undefined) {
        const targetHp = hpOverride || startingHp;
        setPlayer(p => ({ 
          ...p, 
          isHandcuffed: false, 
          isSawedActive: false, 
          isChokeActive: false,
          isFlashbanged: false, 
          luckycharmsUsed: 0, 
          jackpotImmunityShots: 0,
          hasJackpotWinActive: false,
          hp: targetHp, 
          maxHp: targetHp,
          ...(resetItems ? { items: [] } : {})
        }));
        setDealer(d => ({ 
          ...d, 
          isHandcuffed: false, 
          isSawedActive: false, 
          isChokeActive: false,
          isFlashbanged: false, 
          luckycharmsUsed: 0, 
          jackpotImmunityShots: 0,
          hasJackpotWinActive: false,
          hp: targetHp, 
          maxHp: targetHp,
          ...(resetItems ? { items: [] } : {})
        }));
        setPlayer3(p3 => ({ 
          ...p3, 
          isHandcuffed: false, 
          isSawedActive: false, 
          isChokeActive: false,
          isFlashbanged: false, 
          luckycharmsUsed: 0, 
          jackpotImmunityShots: 0,
          hasJackpotWinActive: false,
          hp: targetHp, 
          maxHp: targetHp,
          items: p3ItemsOverride || (resetItems ? [] : p3.items)
        }));
        setPlayer4(p4 => ({ 
          ...p4, 
          isHandcuffed: false, 
          isSawedActive: false, 
          isChokeActive: false,
          isFlashbanged: false, 
          luckycharmsUsed: 0, 
          jackpotImmunityShots: 0,
          hasJackpotWinActive: false,
          hp: targetHp, 
          maxHp: targetHp,
          items: p4ItemsOverride || (resetItems ? [] : p4.items)
        }));
      } else {
        // Just reset status effects
        setPlayer(p => ({ ...p, isHandcuffed: false, isSawedActive: false, isChokeActive: false, isFlashbanged: false }));
        setDealer(d => ({ ...d, isHandcuffed: false, isSawedActive: false, isChokeActive: false, isFlashbanged: false }));
        setPlayer3(p3 => ({ ...p3, isHandcuffed: false, isSawedActive: false, isChokeActive: false, isFlashbanged: false }));
        setPlayer4(p4 => ({ ...p4, isHandcuffed: false, isSawedActive: false, isChokeActive: false, isFlashbanged: false }));
      }

      // 1. Show ROUND X announcement
      let displayRound = resetItems ? 1 : gameStateRef.current.roundCount + 1;
      if (isHM) {
        displayRound = hmState?.round || 1;
      } else if (gameStateRef.current.isMultiplayer || gameStateRef.current.isLocalSplit) {
        const wins = multiWinsOverride || gameStateRef.current.multiModeState;
        displayRound = (wins?.playerWins || 0) + (wins?.opponentWins || 0) + 1;
      } else if (resetItems && gameStateRef.current.normalModeState?.round) {
        displayRound = gameStateRef.current.normalModeState.round;
      }

      setOverlayText(gameStateRef.current.isLocalSplit ? `MATCH ${displayRound}` : `ROUND ${displayRound}`);
      setOverlayColor(isHM ? 'red' : 'none');
      audioManager.playSound('rack');
      await wait(gameStateRef.current.isLocalSplit ? 1800 : 3000);
      if (isRoundCancelled()) return;
      setOverlayText(null);
      setOverlayColor('none');

      // 2. Show LIVE/BLANK announcement
      addLog('--- NEW BATCH ---');
      addLog(`${lives} LIVE, ${blanks} BLANK`);
      setOverlayText(`${lives} LIVE  |  ${blanks} BLANK`);
      audioManager.playSound('insert');
      await wait(4100);
      if (isRoundCancelled()) return;
      setOverlayText(null);

      // Construct effective state for distribution
      const effectiveState = {
        ...gameStateRef.current,
        isHardMode: isHM,
        hardModeState: hmState,
        normalModeState: gameStateRef.current.normalModeState,
        roundCount: resetItems ? 1 : gameStateRef.current.roundCount + 1
      };

      const isNewStageHp = resetItems || hpOverride !== undefined;
      const stageTargetHp = hpOverride || startingHp;
      const effectiveDealerHp = isNewStageHp ? stageTargetHp : dealerRef.current.hp;
      const effectivePlayerHp = isNewStageHp ? stageTargetHp : playerRef.current.hp;
      const effectivePlayerMaxHp = isNewStageHp ? stageTargetHp : playerRef.current.maxHp;
      const effectiveDealerMaxHp = isNewStageHp ? stageTargetHp : dealerRef.current.maxHp;

      await distributeItemsAction(
        resetItems, effectiveState, setPlayer, setDealer, setGameState,
        setReceivedItems, setShowLootOverlay, effectiveDealerHp,
        pItemsOverride, dItemsOverride,
        playerRef.current.items, dealerRef.current.items,
        playerRef.current.luckycharmsUsed || 0,
        dealerRef.current.luckycharmsUsed || 0,
        effectivePlayerHp,
        effectivePlayerMaxHp,
        effectiveDealerMaxHp,
        setPlayer3,
        setPlayer4,
        p3ItemsOverride,
        p4ItemsOverride,
        player3Ref.current.items,
        player4Ref.current.items,
        setOpponentReceivedItems
      );

      if (isRoundCancelled()) return;

      const nextTurn: TurnOwner = turnOwnerOverride
        || (gameStateRef.current.isLocalSplit
          ? (resetItems ? pickRandomStartingTurn() : (gameStateRef.current.turnOwner === 'DEALER' ? 'DEALER' : 'PLAYER'))
          : 'PLAYER');
      let nextPhase: GameState['phase'] = 'PLAYER_TURN';
      if (nextTurn === 'DEALER') nextPhase = 'DEALER_TURN';
      else if (nextTurn === 'PLAYER3') nextPhase = 'PLAYER3_TURN';
      else if (nextTurn === 'PLAYER4') nextPhase = 'PLAYER4_TURN';

      setGameState(prev => ({ ...prev, phase: nextPhase, turnOwner: nextTurn }));
      if (gameStateRef.current.isLocalSplit) {
        const activeName = getPlayerNameByOwner(nextTurn).toUpperCase();
        setCameraView(nextTurn === 'DEALER' ? 'DEALER' : 'PLAYER');
        setAimTarget('IDLE');
        addLog(resetItems ? `${activeName}'S TURN — GOES FIRST!` : `${activeName}'S TURN.`, 'info');
        setOverlayText(resetItems ? `${activeName}'S TURN\nGOES FIRST` : `${activeName}'S TURN`);
        await wait(resetItems ? 1650 : 1200);
        if (!isRoundCancelled()) setOverlayText(null);
      } else if (nextTurn === 'PLAYER') {
        setCameraView('PLAYER');
        addLog('YOUR MOVE.');
      } else {
        setCameraView(nextTurn === 'PLAYER3' ? 'PLAYER3_GUN' : (nextTurn === 'PLAYER4' ? 'PLAYER4_GUN' : 'DEALER'));
        addLog(`${getPlayerNameByOwner(nextTurn).toUpperCase()}'S TURN.`);
      }
    } catch (err) {
      console.error("Error in startRound:", err);
    } finally {
      if (!isRoundCancelled()) {
        setIsProcessing(false);
      }
    }
  }, [addLog, getPlayerNameByOwner, setAnim, setOverlayColor, setOverlayText]);

  /* Fixed Hard Mode logic */
  const handleHardModeRoundEnd = useCallback(async (winner: TurnOwner) => {
    const myGameGen = gameGenRef.current;
    setIsProcessing(true);
    try {
      const currentState = gameStateRef.current.hardModeState || { round: 1, playerWins: 0, dealerWins: 0 };
      const currentRound = currentState.round;

      let nextState = { ...currentState };
      if (winner === 'PLAYER') {
        nextState.playerWins++;
        matchStatsRef.current.roundsSurvived++;
      } else {
        nextState.dealerWins++;
      }

      // Track Round Result
      if (!matchStatsRef.current.roundResults) matchStatsRef.current.roundResults = [];
      matchStatsRef.current.roundResults.push(winner === 'PLAYER' ? 'WIN' : 'LOSS');

      // 1. Show Winner of Round Visuals
      const winMsg = winner === 'PLAYER' ? `${playerNameRef.current} WON ROUND ${currentRound}` : `${getOpponentName().toUpperCase()} WON ROUND ${currentRound}`;
      const color = winner === 'PLAYER' ? 'green' : 'red';

      setOverlayColor(color);
      setOverlayText(winMsg);

      // Sound Effect
      if (winner === 'PLAYER') audioManager.playSound('insert');
      else audioManager.playSound('rack');

      // Wait for reading
      await wait(3000);
      if (!isMountedRef.current || myGameGen !== gameGenRef.current) return;

      // Check Match Over
      if (nextState.playerWins >= 2 || nextState.dealerWins >= 2) {
        setGameState(prev => ({ ...prev, winner, phase: 'GAME_OVER', hardModeState: nextState }));
        matchStatsRef.current.result = winner === 'PLAYER' ? 'WIN' : 'LOSS';
        matchStatsRef.current.totalScore = matchStatsRef.current.totalScore * 2;
        setOverlayColor('none');
        setOverlayText(null);
        return;
      }

      // Next Round Setup
      nextState.round++;
      setOverlayColor('none');
      setOverlayText(`ROUND ${nextState.round}`);

      // Validating Round Start
      addLog(`ROUND ${nextState.round} STARTING...`);

      // Wait for "Round X" text
      await wait(2000);
      if (!isMountedRef.current || myGameGen !== gameGenRef.current) return;

      setOverlayText(null);

      // Trigger Next Round
      setGameState(prev => ({ ...prev, hardModeState: nextState, phase: 'LOAD' }));
      await startRound(true, true, nextState);
    } catch (err) {
      console.error("Error in handleHardModeRoundEnd:", err);
    } finally {
      if (isMountedRef.current && myGameGen === gameGenRef.current) {
        setIsProcessing(false);
      }
    }
  }, [addLog, getOpponentName, setOverlayColor, setOverlayText, startRound]);

  const handleNormalModeRoundEnd = useCallback(async (winner: TurnOwner) => {
    const myGameGen = gameGenRef.current;
    setIsProcessing(true);
    try {
      const currentState = gameStateRef.current.normalModeState || { round: 1, playerWins: 0, dealerWins: 0 };
      const currentRound = currentState.round;

      let nextState = { ...currentState };
      if (winner === 'PLAYER') {
        nextState.playerWins++;
        matchStatsRef.current.roundsSurvived++;
      } else {
        nextState.dealerWins++;
      }

      // Track Round Result
      if (!matchStatsRef.current.roundResults) matchStatsRef.current.roundResults = [];
      matchStatsRef.current.roundResults.push(winner === 'PLAYER' ? 'WIN' : 'LOSS');

      if (winner === 'DEALER') {
        const winMsg = `${getOpponentName().toUpperCase()} WON THE GAME`;
        setOverlayColor('red');
        setOverlayText(winMsg);
        audioManager.playSound('rack');
        await wait(3000);
        if (!isMountedRef.current || myGameGen !== gameGenRef.current) return;
        setGameState(prev => ({ ...prev, winner: 'DEALER', phase: 'GAME_OVER', normalModeState: nextState }));
        matchStatsRef.current.result = 'LOSS';
        setOverlayColor('none');
        setOverlayText(null);
        return;
      }

      // Player won round
      if (currentRound === 1) {
        const winMsg = `${playerNameRef.current} WON ROUND 1`;
        setOverlayColor('green');
        setOverlayText(winMsg);
        audioManager.playSound('insert');
        await wait(3000);
        if (!isMountedRef.current || myGameGen !== gameGenRef.current) return;

        // Transition to Round 2
        setOverlayColor('none');
        setOverlayText("LET'S MAKE THIS A LITTLE MORE INTERESTING");
        addLog("DEALER: LET'S MAKE THIS A LITTLE MORE INTERESTING", 'dealer');
        await wait(3000);
        if (!isMountedRef.current || myGameGen !== gameGenRef.current) return;
        setOverlayText(null);

        nextState.round = 2;
        setGameState(prev => ({ ...prev, normalModeState: nextState, phase: 'LOAD' }));

        // Start round 2 with 4 health
        await startRound(true, false, undefined, undefined, undefined, undefined, undefined, 4);
      } else {
        // If player won round 2, they win the game!
        const winMsg = `${playerNameRef.current} WON THE GAME`;
        setOverlayColor('green');
        setOverlayText(winMsg);
        audioManager.playSound('insert');
        await wait(3000);
        if (!isMountedRef.current || myGameGen !== gameGenRef.current) return;

        setGameState(prev => ({ ...prev, winner: 'PLAYER', phase: 'GAME_OVER', normalModeState: nextState }));
        matchStatsRef.current.result = 'WIN';
        setOverlayColor('none');
        setOverlayText(null);
      }
    } catch (err) {
      console.error("Error in handleNormalModeRoundEnd:", err);
    } finally {
      if (isMountedRef.current && myGameGen === gameGenRef.current) {
        setIsProcessing(false);
      }
    }
  }, [addLog, getOpponentName, setOverlayColor, setOverlayText, startRound]);

  const handleMPRoundEnd = useCallback(async (winner: TurnOwner) => {
    const myGameGen = gameGenRef.current;
    setIsProcessing(true);
    try {
      const mSettings = gameStateRef.current.roomSettings || { rounds: 1, hp: 4 };
      const winsNeeded = Math.ceil(mSettings.rounds / 2) || 1;

      // Track stats
      if (winner === 'PLAYER') {
        matchStatsRef.current.roundsSurvived++;
      }
      if (!matchStatsRef.current.roundResults) matchStatsRef.current.roundResults = [];
      matchStatsRef.current.roundResults.push(winner === 'PLAYER' ? 'WIN' : 'LOSS');

      // Increment wins locally first
      let pWin = (gameStateRef.current.multiModeState?.playerWins || 0) + (winner === 'PLAYER' ? 1 : 0);
      let oWin = (gameStateRef.current.multiModeState?.opponentWins || 0) + (winner === 'PLAYER' ? 0 : 1);

      setGameState(prev => ({
        ...prev,
        multiModeState: { playerWins: pWin, opponentWins: oWin }
      }));

      const winMsg = winner === 'PLAYER' ? `${(playerNameRef.current || 'PLAYER').toUpperCase()} WON THE MATCH!` : `${getOpponentName().toUpperCase()} WON THE MATCH!`;
      const color = winner === 'PLAYER' ? 'green' : 'red';

      setOverlayColor(color);
      setOverlayText(winMsg);
      await wait(3000);
      if (!isMountedRef.current || myGameGen !== gameGenRef.current) return;

      if (pWin >= winsNeeded || oWin >= winsNeeded) {
        setOverlayColor('none');
        setOverlayText(null);
        setGameState(prev => ({ ...prev, winner, phase: 'GAME_OVER' }));
        matchStatsRef.current.result = winner === 'PLAYER' ? 'WIN' : 'LOSS';
        return;
      }

      if (onMPRoundEndRef.current) {
        await onMPRoundEndRef.current(winner, pWin, oWin);
        return;
      }

      // Next Match (Local Split or fallback)
      const nextRoundNum = pWin + oWin + 1;
      setOverlayColor('none');
      setOverlayText(gameStateRef.current.isLocalSplit ? `MATCH ${nextRoundNum}` : `ROUND ${nextRoundNum}`);
      await wait(1600);
      if (!isMountedRef.current || myGameGen !== gameGenRef.current) return;
      setOverlayText(null);

      // Reset HP for next match
      const targetHp = gameStateRef.current.isLocalSplit
        ? (gameStateRef.current.localSplitConfig?.startingHp || mSettings.hp || playerRef.current.maxHp)
        : playerRef.current.maxHp;
      setPlayer(p => ({ ...p, hp: targetHp, maxHp: targetHp }));
      setDealer(d => ({ ...d, hp: targetHp, maxHp: targetHp }));

      const nextStarter: TurnOwner | undefined = gameStateRef.current.isLocalSplit
        ? pickRandomStartingTurn()
        : undefined;

      // Start a new match
      await startRound(true, false, undefined, undefined, undefined, undefined, nextStarter, targetHp, { playerWins: pWin, opponentWins: oWin });
    } catch (err) {
      console.error("Error in handleMPRoundEnd:", err);
    } finally {
      if (isMountedRef.current && myGameGen === gameGenRef.current) {
        setIsProcessing(false);
      }
    }
  }, [getOpponentName, setOverlayColor, setOverlayText, startRound]);

  const resetGame = useCallback((toMenu: boolean = false, startRoundAfterReset: boolean = true) => {
    const nextGameGen = ++gameGenRef.current;
    roundGenRef.current++;
    clearAllTimers();

    setReceivedItems([]);
    setShowLootOverlay(false);
    setOverlayText(null);
    setOverlayColor('none');
    setAimTarget('IDLE');
    resetStats();
    setDealerModel('DEFAULT');

    setGameState({
      phase: toMenu ? 'INTRO' : 'LOAD',
      turnOwner: 'PLAYER',
      winner: null,
      chamber: [],
      currentShellIndex: 0,
      liveCount: 0,
      blankCount: 0,
      roundCount: 0,
      isHardMode: false,
      hardModeState: undefined,
      normalModeState: undefined
    });
    audioManager.stopJackpotMusic();
    const freshPlayerState: PlayerState = {
      hp: MAX_HP,
      maxHp: MAX_HP,
      items: [],
      isHandcuffed: false,
      isSawedActive: false,
      luckycharmsUsed: 0,
      isFlashbanged: false,
      jackpotImmunityShots: 0,
      hasJackpotWinActive: false
    };
    setPlayer(freshPlayerState);
    setDealer(freshPlayerState);
    setPlayer3(freshPlayerState);
    setPlayer4(freshPlayerState);
    setLogs([]);
    setKnownShell(null);
    setAnim({
      triggerRecoil: 0, triggerRack: 0, triggerSparks: 0, triggerHeal: 0, triggerDrink: 0, triggerCuff: 0,
      isSawing: false, ejectedShellColor: 'red', muzzleFlashIntensity: 0, isLiveShot: false,
      dealerHit: false, dealerDropping: false, playerHit: false, playerRecovering: false, dealerRecovering: false,
      player3Hit: false, player3Dropping: false, player3Recovering: false,
      player4Hit: false, player4Dropping: false, player4Recovering: false,
      triggerAdrenaline: 0, triggerChoke: 0, triggerPhone: 0, triggerInverter: 0, triggerRemote: 0, triggerBigInverter: 0, triggerContract: 0, triggerLuckycharm: 0, triggerTotem: 0, triggerMirror: 0, triggerDeckCard: 0, totemTarget: null,
      triggerFlashbang: 0, triggerCrusher: 0, triggerJackpot: 0, jackpotResult: null
    });
    setCameraView('PLAYER');
    setShowBlood(false);
    setShowFlash(false);
    setShowFlashbang(false);
    setShowLootOverlay(false);
    setReceivedItems([]);
    setOpponentReceivedItems([]);
    setIsProcessing(false);

    if (!toMenu && startRoundAfterReset) {
      resetTimeoutRef.current = setTimeout(() => {
        resetTimeoutRef.current = null;
        if (!isMountedRef.current || nextGameGen !== gameGenRef.current) return;
        startRound(true);
      }, 200);
    }
  }, [clearAllTimers, resetStats, setAnim, setOverlayText, startRound]);

  const startGame = useCallback((
    name: string,
    hardMode: boolean = false,
    isMultiplayer: boolean = false,
    opponentName: string = 'OPPONENT',
    turnOwner: TurnOwner = 'PLAYER',
    chamberOverride?: ShellType[],
    pItemsOverride?: ItemType[],
    dItemsOverride?: ItemType[],
    hpOverride?: number,
    mpSettings?: RoomSettings,
    p3ItemsOverride?: ItemType[],
    p4ItemsOverride?: ItemType[]
  ) => {
    resumeAudioContext().catch(() => {});
    const nextGameGen = ++gameGenRef.current;
    roundGenRef.current++;
    clearAllTimers();

    setOverlayText(null);
    setOverlayColor('none');
    setAimTarget('IDLE');
    setShowBlood(false);
    setShowFlash(false);
    setShowFlashbang(false);
    setIsProcessing(false);

    matchStartTimeRef.current = Date.now();
    matchStatsRef.current = {
      result: 'LOSS',
      roundsSurvived: 0,
      shotsFired: 0,
      shotsHit: 0,
      selfShots: 0,
      itemsUsed: {},
      damageDealt: 0,
      damageTaken: 0,
      totalScore: 0,
      isHardMode: hardMode,
      roundResults: []
    };

    const initialHardModeState = hardMode ? { round: 1, playerWins: 0, dealerWins: 0 } : undefined;
    const initialNormalModeState = !hardMode && !isMultiplayer ? { round: 1, playerWins: 0, dealerWins: 0 } : undefined;

    setGameState({
      phase: 'LOAD',
      turnOwner: turnOwner,
      winner: null,
      chamber: [],
      currentShellIndex: 0,
      liveCount: 0,
      blankCount: 0,
      roundCount: 0,
      isHardMode: hardMode,
      isMultiplayer: isMultiplayer,
      isThreePlayer: isMultiplayer && p3ItemsOverride !== undefined && p4ItemsOverride === undefined,
      isFourPlayer: isMultiplayer && p4ItemsOverride !== undefined,
      opponentName: opponentName,
      hardModeState: initialHardModeState,
      normalModeState: initialNormalModeState,
      roomSettings: mpSettings || { rounds: 1, hp: 4, itemsPerShipment: 4 },
      multiModeState: { playerWins: 0, opponentWins: 0 }
    });

    matchStatsRef.current.isHardMode = hardMode;

    startGameTimeoutRef.current = setTimeout(() => {
      startGameTimeoutRef.current = null;
      if (!isMountedRef.current || nextGameGen !== gameGenRef.current) return;
      startRound(true, hardMode, initialHardModeState, chamberOverride, pItemsOverride, dItemsOverride, turnOwner, hpOverride, undefined, p3ItemsOverride, p4ItemsOverride);
    }, 100);
  }, [clearAllTimers, setOverlayText, startRound]);

  const startLocalSplitGame = useCallback((rawConfig: LocalSplitConfig) => {
    const config = sanitizeSplitConfig(rawConfig);
    resumeAudioContext().catch(() => {});
    const nextGameGen = ++gameGenRef.current;
    roundGenRef.current++;
    clearAllTimers();

    matchStartTimeRef.current = Date.now();
    matchStatsRef.current = {
      result: 'LOSS',
      roundsSurvived: 0,
      shotsFired: 0,
      shotsHit: 0,
      selfShots: 0,
      itemsUsed: {},
      damageDealt: 0,
      damageTaken: 0,
      totalScore: 0,
      isHardMode: false,
      isMultiplayer: true,
      isLocalSplit: true,
      roundResults: []
    };

    const firstTurn = pickRandomStartingTurn();
    setPlayerNameState(config.player1Name);
    playerNameRef.current = config.player1Name;
    setDealerModel('DEFAULT');
    setLogs([]);
    setKnownShell(null);
    setOverlayText(null);
    setOverlayColor('none');
    setAimTarget('IDLE');
    setShowBlood(false);
    setShowFlash(false);
    setShowFlashbang(false);
    setShowLootOverlay(false);
    setReceivedItems([]);
    setOpponentReceivedItems([]);
    setIsProcessing(false);

    const freshSplitPlayer: PlayerState = {
      hp: config.startingHp,
      maxHp: config.startingHp,
      items: [],
      isHandcuffed: false,
      isSawedActive: false,
      isChokeActive: false,
      luckycharmsUsed: 0,
      isFlashbanged: false,
      jackpotImmunityShots: 0,
      hasJackpotWinActive: false
    };
    setPlayer(freshSplitPlayer);
    setDealer(freshSplitPlayer);

    setGameState({
      phase: 'LOAD',
      turnOwner: firstTurn,
      winner: null,
      chamber: [],
      currentShellIndex: 0,
      liveCount: 0,
      blankCount: 0,
      roundCount: 0,
      isHardMode: false,
      isMultiplayer: false,
      isLocalSplit: true,
      localSplitConfig: config,
      player1Name: config.player1Name,
      isThreePlayer: false,
      isFourPlayer: false,
      opponentName: config.player2Name,
      hardModeState: undefined,
      normalModeState: undefined,
      roomSettings: {
        rounds: config.totalMatches,
        hp: config.startingHp,
        itemsPerShipment: config.itemsPerShipment,
        itemRule: config.itemRule
      },
      multiModeState: { playerWins: 0, opponentWins: 0 }
    });

    startGameTimeoutRef.current = setTimeout(() => {
      startGameTimeoutRef.current = null;
      if (!isMountedRef.current || nextGameGen !== gameGenRef.current) return;
      startRound(true, false, undefined, undefined, undefined, undefined, firstTurn, config.startingHp);
    }, 100);
  }, [clearAllTimers, setOverlayText, startRound]);

  const pickupGun = useCallback((picker: TurnOwner = 'PLAYER') => {
    const isMP = gameStateRef.current.isMultiplayer;
    if (!isMP) {
      if (
        gameStateRef.current.phase !== 'PLAYER_TURN' &&
        gameStateRef.current.phase !== 'DEALER_TURN' &&
        gameStateRef.current.phase !== 'PLAYER3_TURN' &&
        gameStateRef.current.phase !== 'PLAYER4_TURN' &&
        gameStateRef.current.phase !== 'RESOLVING'
      ) return;
    }

    if (isProcessingRef.current) return;

    // Strict turn check
    if (picker === 'PLAYER' && gameStateRef.current.turnOwner !== 'PLAYER') {
      addLog("NOT YOUR TURN TO PICK UP THE GUN", 'info');
      return;
    }
    if (picker === 'DEALER' && gameStateRef.current.turnOwner !== 'DEALER' && !isMP) return;
    if (picker === 'PLAYER3' && gameStateRef.current.turnOwner !== 'PLAYER3' && !isMP) return;
    if (picker === 'PLAYER4' && gameStateRef.current.turnOwner !== 'PLAYER4' && !isMP) return;

    // Prevent gun pickup while anyone is knocked down or recovering
    const anim = animStateRef.current;
    if (
      anim.playerHit || anim.playerRecovering ||
      anim.dealerDropping || anim.dealerRecovering ||
      anim.player3Hit || anim.player3Recovering ||
      anim.player4Hit || anim.player4Recovering
    ) {
      addLog('WAIT FOR RECOVERY...', 'info');
      return;
    }

    if (picker === 'PLAYER' || (gameStateRef.current.isLocalSplit && picker === 'DEALER')) {
      setCameraView('GUN');
      setAimTarget('CHOOSING');
    } else if (picker === 'PLAYER3') {
      setCameraView('PLAYER3_GUN');
      setAimTarget('IDLE');
    } else if (picker === 'PLAYER4') {
      setCameraView('PLAYER4_GUN');
      setAimTarget('IDLE');
    } else {
      setCameraView('DEALER_GUN');
      setAimTarget('IDLE');
    }
  }, [addLog]);

  const fireShot = useCallback(async (shooter: TurnOwner, target: TurnOwner) => {
    resumeAudioContext().catch(() => {});
    // Basic phase check
    const isMP = gameStateRef.current.isMultiplayer;
    const isSplit = Boolean(gameStateRef.current.isLocalSplit);
    if (!isMP) {
      if (
        gameStateRef.current.phase !== 'PLAYER_TURN' &&
        gameStateRef.current.phase !== 'DEALER_TURN' &&
        gameStateRef.current.phase !== 'PLAYER3_TURN' &&
        gameStateRef.current.phase !== 'PLAYER4_TURN' &&
        gameStateRef.current.phase !== 'RESOLVING'
      ) return;
    }

    // Strict turn check for local human players
    if ((shooter === 'PLAYER' || (isSplit && shooter === 'DEALER')) && gameStateRef.current.turnOwner !== shooter) {
      console.warn("Attempted to fire out of turn.");
      return;
    }

    if ((shooter === 'PLAYER' || isSplit) && isProcessingRef.current) return;

    const isMultiOpponent = gameStateRef.current.isThreePlayer || gameStateRef.current.isFourPlayer;
    let intendedAim: AimTarget = 'OPPONENT';
    if (isMultiOpponent) {
      if (target === shooter) {
        intendedAim = 'SELF';
      } else if (target === 'PLAYER3') {
        intendedAim = 'LEFT';
      } else if (target === 'PLAYER4') {
        intendedAim = 'RIGHT';
      } else {
        intendedAim = 'OPPONENT';
      }
    } else {
      intendedAim = target === (shooter === 'PLAYER' ? 'PLAYER' : 'DEALER') ? 'SELF' : 'OPPONENT';
    }

    if (shooter === 'PLAYER' || isSplit) {
      setCameraView('GUN');
    }

    const myGameGen = gameGenRef.current;
    setIsProcessing(true);

    try {
      if (isMultiOpponent) {
      const currentChamberIdx = gameStateRef.current.currentShellIndex;
      const chamber = gameStateRef.current.chamber;
      if (currentChamberIdx >= chamber.length) {
        setGameState(prev => ({ ...prev, phase: 'RESOLVING' }));
        if (onBatchEndRef.current) {
          onBatchEndRef.current(false);
        } else {
          setIsProcessing(false);
        }
        return;
      }

      setAimTarget(intendedAim);
      await wait(500);
      if (!isMountedRef.current || myGameGen !== gameGenRef.current) return;

      const isSawed = getPlayerState(shooter).isSawedActive;
      const isChoked = getPlayerState(shooter).isChokeActive;

      let processedShells = 1;
      let isLive = chamber[currentChamberIdx] === 'LIVE';
      let liveHits = isLive ? 1 : 0;
      let damage = 0;

      if (isChoked && currentChamberIdx + 1 < chamber.length) {
        processedShells = 2;
        const shell1 = chamber[currentChamberIdx];
        const shell2 = chamber[currentChamberIdx + 1];
        const live1 = shell1 === 'LIVE';
        const live2 = shell2 === 'LIVE';
        isLive = live1 || live2;
        liveHits = (live1 ? 1 : 0) + (live2 ? 1 : 0);

        let chokeDamage = liveHits;
        if (isSawed && chokeDamage > 0) chokeDamage *= 2;
        damage = chokeDamage;

        if (live1 && live2) {
          addLog('DOUBLE BARREL HIT! (2 LIVE)', 'danger');
        } else if (live1 || live2) {
          addLog('SPLIT SHOT (1 LIVE)', 'danger');
        } else {
          addLog('DOUBLE CLICK (2 BLANK)', 'safe');
        }
      } else {
        damage = isLive ? (isSawed ? 2 : 1) : 0;
      }

      if (isLive) {
        audioManager.playSound('liveshell');
      } else {
        audioManager.playSound('blankshell');
      }

      setAnim(p => ({
        ...p,
        triggerRecoil: p.triggerRecoil + (processedShells === 2 ? 2 : 1),
        muzzleFlashIntensity: isLive ? (processedShells === 2 ? 140 : 100) : 0,
        isLiveShot: isLive
      }));

      if (muzzleFlashTimeoutRef.current) {
        clearTimeout(muzzleFlashTimeoutRef.current);
      }
      muzzleFlashTimeoutRef.current = setTimeout(() => {
        muzzleFlashTimeoutRef.current = null;
        if (!isMountedRef.current || myGameGen !== gameGenRef.current) return;
        setAnim(p => ({ ...p, muzzleFlashIntensity: 0 }));
      }, 150);

      const resolvedTargetOwner = target;
      const targetState = getPlayerState(resolvedTargetOwner);
      const targetSetter = getPlayerSetter(resolvedTargetOwner);
      const targetName = getPlayerNameByOwner(resolvedTargetOwner);

      if (damage > 0) {
        const targetImmune = targetState.jackpotImmunityShots !== undefined && targetState.jackpotImmunityShots > 0;
        
        if (targetImmune) {
          const nextImmunity = Math.max(0, (targetState.jackpotImmunityShots || 0) - liveHits);
          targetSetter(p => ({
            ...p,
            jackpotImmunityShots: nextImmunity,
            hasJackpotWinActive: nextImmunity > 0 ? p.hasJackpotWinActive : false
          }));
          if (nextImmunity <= 0) {
            audioManager.stopJackpotMusic();
          }
          addLog(`${targetName.toUpperCase()}'S JACKPOT SHIELD BLOCKED SHOT!`, 'safe');
        } else {
          const newHp = Math.max(0, targetState.hp - damage);
          
          const hasTotem = (targetState.items || []).includes('TOTEM') && !targetState.isFlashbanged;
          if (newHp <= 0 && hasTotem) {
            targetSetter(p => {
              const items = [...p.items];
              const tIdx = items.indexOf('TOTEM');
              if (tIdx !== -1) items.splice(tIdx, 1);
              return { ...p, hp: 1, items };
            });
            setAnim(p => ({ ...p, triggerTotem: p.triggerTotem + 1, totemTarget: resolvedTargetOwner }));
            addLog(`${targetName.toUpperCase()}'S TOTEM OF UNDYING SAVED THEM!`, 'safe');
            setOverlayText(`✨ ${targetName.toUpperCase()} SAVED BY TOTEM ✨`);
            audioManager.playSound('totem');
            await wait(3000);
            setOverlayText(null);
          } else {
            targetSetter(p => ({ ...p, hp: newHp }));
          }
        }

        if (resolvedTargetOwner === 'PLAYER') {
          setAnim(p => ({ ...p, playerHit: true }));
          await wait(1800);
          setAnim(p => ({ ...p, playerHit: false, playerRecovering: true }));
          await wait(1500);
          setAnim(p => ({ ...p, playerRecovering: false }));
        } else if (resolvedTargetOwner === 'DEALER') {
          setAnim(p => ({ ...p, dealerHit: true, dealerDropping: true }));
          await wait(1800);
          setAnim(p => ({ ...p, dealerHit: false, dealerDropping: false, dealerRecovering: true }));
          await wait(1500);
          setAnim(p => ({ ...p, dealerRecovering: false }));
        } else if (resolvedTargetOwner === 'PLAYER3') {
          setAnim(p => ({ ...p, player3Hit: true }));
          await wait(1800);
          setAnim(p => ({ ...p, player3Hit: false, player3Recovering: true }));
          await wait(1500);
          setAnim(p => ({ ...p, player3Recovering: false }));
        } else if (resolvedTargetOwner === 'PLAYER4') {
          setAnim(p => ({ ...p, player4Hit: true }));
          await wait(1800);
          setAnim(p => ({ ...p, player4Hit: false, player4Recovering: true }));
          await wait(1500);
          setAnim(p => ({ ...p, player4Recovering: false }));
        }
      } else {
        addLog("...CLICK. IT'S A BLANK.", 'safe');
        setOverlayText("...CLICK. BLANK.");
        await wait(1500);
        setOverlayText(null);
      }

      // Calculate final target HP after this shot to check if the round ended
      let finalTargetHp = targetState.hp;
      if (damage > 0) {
        const targetImmune = targetState.jackpotImmunityShots !== undefined && targetState.jackpotImmunityShots > 0;
        
        if (!targetImmune) {
          const newHp = Math.max(0, targetState.hp - damage);
          const hasTotem = (targetState.items || []).includes('TOTEM') && !targetState.isFlashbanged;
          if (newHp <= 0 && hasTotem) {
            finalTargetHp = 1;
          } else {
            finalTargetHp = newHp;
          }
        }
      }

      const postPlayerHp = target === 'PLAYER' ? finalTargetHp : playerRef.current.hp;
      const postDealerHp = target === 'DEALER' ? finalTargetHp : dealerRef.current.hp;
      const postPlayer3Hp = target === 'PLAYER3' ? finalTargetHp : player3Ref.current.hp;
      const postPlayer4Hp = target === 'PLAYER4' ? finalTargetHp : player4Ref.current.hp;

      const aliveCount = (postPlayerHp > 0 ? 1 : 0) + (postDealerHp > 0 ? 1 : 0) + (postPlayer3Hp > 0 ? 1 : 0) + (postPlayer4Hp > 0 ? 1 : 0);

      const keepTurn = target === shooter && damage === 0;
      const shooterSetter = getPlayerSetter(shooter);
      shooterSetter(p => ({
        ...p,
        isSawedActive: false,
        isChokeActive: false,
        ...(keepTurn ? {} : { isFlashbanged: false })
      }));

      if (aliveCount <= 1) {
        setIsProcessing(true);
        setGameState(prev => ({ ...prev, phase: 'RESOLVING' }));

        let roundWinner: TurnOwner = 'PLAYER';
        if (postPlayerHp > 0) roundWinner = 'PLAYER';
        else if (postPlayer3Hp > 0) roundWinner = 'PLAYER3';
        else if (postPlayer4Hp > 0) roundWinner = 'PLAYER4';
        else roundWinner = 'DEALER';

        const winnerName = getPlayerNameByOwner(roundWinner);
        setOverlayColor(roundWinner === 'PLAYER' ? 'green' : 'red');
        setOverlayText(`${winnerName.toUpperCase()} WON THE ROUND!`);
        audioManager.playSound('insert');
        await wait(3000);
        if (!isMountedRef.current || myGameGen !== gameGenRef.current) return;
        setOverlayColor('none');
        setOverlayText(null);

        if (onMPRoundEndRef.current) {
          await onMPRoundEndRef.current(roundWinner);
        }
        if (isMountedRef.current && myGameGen === gameGenRef.current) {
          setIsProcessing(false);
        }
        return;
      }

      const nextShellIndex = currentChamberIdx + processedShells;
      const remaining = gameStateRef.current.chamber.length - nextShellIndex;
      const liveCount = gameStateRef.current.chamber.slice(nextShellIndex).filter(s => s === 'LIVE').length;
      const blankCount = gameStateRef.current.chamber.slice(nextShellIndex).filter(s => s === 'BLANK').length;

      if (remaining === 0) {
        setGameState(prev => ({ ...prev, currentShellIndex: nextShellIndex, liveCount, blankCount, phase: 'RESOLVING' }));
        const lastShotKeepsTurn = target === shooter && damage === 0;
        if (onBatchEndRef.current) {
          onBatchEndRef.current(lastShotKeepsTurn);
        } else {
          setIsProcessing(false);
        }
        return;
      }

      let absoluteTurnOwnerId = '';

      const myId = gameStateRef.current.localPlayerId || '';
      if (gameStateRef.current.multiplayerState?.players) {
        const mPlayers = gameStateRef.current.multiplayerState.players;
        const myIndex = mPlayers.findIndex(p => p.id === myId);
        const size = mPlayers.length;
        let shooterId = myId;
        if (shooter === 'DEALER') shooterId = mPlayers[(myIndex + 2) % size].id;
        else if (shooter === 'PLAYER3') shooterId = mPlayers[(myIndex + 1) % size].id;
        else if (shooter === 'PLAYER4') shooterId = mPlayers[(myIndex + 3) % size].id;

        if (keepTurn) {
          absoluteTurnOwnerId = shooterId;
        } else {
          const shooterIdx = mPlayers.findIndex(p => p.id === shooterId);
          const nextIdx = (shooterIdx + 1) % size;
          
          const getNewHp = (id: string) => {
            const relativeOwner = resolveTargetOwner(id, myId, mPlayers);
            if (relativeOwner === 'PLAYER') return postPlayerHp;
            if (relativeOwner === 'PLAYER3') return postPlayer3Hp;
            if (relativeOwner === 'PLAYER4') return postPlayer4Hp;
            return postDealerHp;
          };

          let currentCandidateIdx = nextIdx;
          let iterations = 0;
          while (iterations < size) {
            const candidate = mPlayers[currentCandidateIdx];
            if (getNewHp(candidate.id) > 0) {
              const relOwner = resolveTargetOwner(candidate.id, myId, mPlayers);
              const cState = getPlayerState(relOwner);
              if (cState.isHandcuffed) {
                const cSetter = getPlayerSetter(relOwner);
                cSetter(p => ({ ...p, isHandcuffed: false }));
                addLog(`${candidate.name.toUpperCase()} WAS CUFFED. SKIPPING.`, 'info');
                setOverlayText(`${candidate.name.toUpperCase()} CUFFED`);
                audioManager.playSound('checkhandcuffs');
                await wait(2500);
                setOverlayText(null);
                currentCandidateIdx = (currentCandidateIdx + 1) % size;
                iterations++;
                continue;
              } else {
                absoluteTurnOwnerId = candidate.id;
                break;
              }
            }
            currentCandidateIdx = (currentCandidateIdx + 1) % size;
            iterations++;
          }
          if (!absoluteTurnOwnerId) {
            absoluteTurnOwnerId = mPlayers[nextIdx].id;
          }
        }
      }

      const mPlayers = gameStateRef.current.multiplayerState?.players || [];
      const nextRelTurnOwner = resolveTargetOwner(absoluteTurnOwnerId, myId, mPlayers);
      const nextPhase = nextRelTurnOwner === 'PLAYER' ? 'PLAYER_TURN' : (nextRelTurnOwner === 'PLAYER3' ? 'PLAYER3_TURN' : (nextRelTurnOwner === 'PLAYER4' ? 'PLAYER4_TURN' : 'DEALER_TURN'));

      setGameState(prev => ({
        ...prev,
        currentShellIndex: nextShellIndex,
        liveCount,
        blankCount,
        turnOwner: nextRelTurnOwner,
        phase: nextPhase
      }));

      setCameraView(nextRelTurnOwner === 'PLAYER' ? 'PLAYER' : (nextRelTurnOwner === 'PLAYER3' ? 'PLAYER' : (nextRelTurnOwner === 'PLAYER4' ? 'PLAYER' : 'DEALER')));
      setAimTarget('IDLE');
      setIsProcessing(false);
      return;
    }

    setAimTarget(intendedAim);
    await wait(500);
    if (!isMountedRef.current || myGameGen !== gameGenRef.current) return;

    matchStatsRef.current.shotsFired++;
    if (target === shooter) matchStatsRef.current.selfShots++;

      await performShot(shooter, target, {
        gameState: gameStateRef.current, setGameState, player: playerRef.current, setPlayer, dealer: dealerRef.current, setDealer,
        setAnim, setKnownShell, setAimTarget, setCameraView, setOverlayText,
        setOverlayColor, setShowFlash, setShowBlood, addLog, playerName: playerNameRef.current,
        startRound, setIsProcessing,
        onBatchEnd: onBatchEndRef.current || undefined,
        matchStats: matchStatsRef,
        handleHardModeRoundEnd,
        handleMPRoundEnd,
        handleNormalModeRoundEnd,
        opponentName: getOpponentName()
      });
    } catch (err) {
      console.error("Error in fireShot:", err);
      if (isMountedRef.current && myGameGen === gameGenRef.current) {
        setIsProcessing(false);
      }
    }
  }, [addLog, getOpponentName, getPlayerNameByOwner, getPlayerSetter, getPlayerState, handleHardModeRoundEnd, handleMPRoundEnd, handleNormalModeRoundEnd, resolveTargetOwner, setAnim, setOverlayColor, setOverlayText, startRound]);

  const processItemEffect = useCallback(async (
    user: TurnOwner,
    item: ItemType,
    deckCardsOverride?: string[],
    jackpotOutcomeOverride?: 'JACKPOT' | 'NORMAL' | 'LOSE',
    crushIndexOverride?: number,
    contractLootOverride?: ItemType[],
    phoneFutureIndexOverride?: number,
    targetPlayerId?: string,
    isLocalAction: boolean = true
  ): Promise<boolean> => {
    const isMultiOpponent = gameStateRef.current.isThreePlayer || gameStateRef.current.isFourPlayer;
    const shouldDimMusic = isLocalAction;
    if (isMultiOpponent) {
      const players = gameStateRef.current.multiplayerState?.players || [];
      const myId = gameStateRef.current.localPlayerId || '';
      const userName = getPlayerNameByOwner(user);

      setOverlayText(`${userName.toUpperCase()} USED ${item}`);
      addLog(`${userName.toUpperCase()} USED ${item}`, 'info');
      await wait(1500);
      setOverlayText(null);

      if (user === 'PLAYER') {
        matchStatsRef.current.itemsUsed[item] = (matchStatsRef.current.itemsUsed[item] || 0) + 1;
      }
      
      const userSetter = getPlayerSetter(user);
      userSetter(p => ({
        ...p,
        currentTurnItemsUsed: [...(p.currentTurnItemsUsed || []), item]
      }));

      let resolvedTargetOwner: TurnOwner = gameStateRef.current.adrenalineTargetOwner || 'DEALER';
      if (targetPlayerId) {
        resolvedTargetOwner = resolveTargetOwner(targetPlayerId, myId, players);
      }
      if (resolvedTargetOwner === user) {
        resolvedTargetOwner = user === 'DEALER' ? 'PLAYER' : 'DEALER';
      }

      const targetState = getPlayerState(resolvedTargetOwner);
      const targetSetter = getPlayerSetter(resolvedTargetOwner);
      const targetName = getPlayerNameByOwner(resolvedTargetOwner);
      let multiRoundEnded = false;

      switch (item) {
        case 'CIGS':
          userSetter(p => ({ ...p, hp: Math.min(p.maxHp, p.hp + 1) }));
          setAnim(p => ({ ...p, triggerHeal: p.triggerHeal + 1 }));
          addLog(`${userName.toUpperCase()} HEALED 1 HP`, 'safe');
          setOverlayText(`☀️ HEALED 1 HP!`);
          await wait(1500);
          setOverlayText(null);
          break;

        case 'BEER': {
          const idx = gameStateRef.current.currentShellIndex;
          const chamber = gameStateRef.current.chamber;
          if (idx < chamber.length) {
            const ejected = chamber[idx];
            addLog(`BEER EJECTED A ${ejected} SHELL`, 'info');
            setOverlayText(`🍺 BEER EJECTED: ${ejected}!`);
            setKnownShell(null);
            
            setAnim(p => ({ ...p, triggerDrink: p.triggerDrink + 1, triggerRack: p.triggerRack + 1 }));
            await wait(2000);
            setOverlayText(null);

            setGameState(prev => {
              const nextIdx = prev.currentShellIndex + 1;
              const remaining = prev.chamber.length - nextIdx;
              const liveCount = prev.chamber.slice(nextIdx).filter(s => s === 'LIVE').length;
              const blankCount = prev.chamber.slice(nextIdx).filter(s => s === 'BLANK').length;
              return {
                ...prev,
                currentShellIndex: nextIdx,
                liveCount,
                blankCount,
                phase: remaining === 0 ? 'RESOLVING' : prev.phase
              };
            });

            if (idx + 1 >= chamber.length) {
              multiRoundEnded = true;
              if (onBatchEndRef.current) {
                onBatchEndRef.current(false);
              }
            }
          }
          break;
        }

        case 'SAW':
          userSetter(p => ({ ...p, isSawedActive: true }));
          setAnim(p => ({ ...p, triggerSparks: p.triggerSparks + 1, isSawing: true }));
          addLog(`${userName.toUpperCase()} SAWED SHOTGUN (DOUBLE DAMAGE ACTIVE)`, 'danger');
          setOverlayText(`🪓 SAWED SHOTGUN!`);
          await wait(2000);
          setAnim(p => ({ ...p, isSawing: false }));
          setOverlayText(null);
          break;

        case 'CUFFS':
          if (targetState.hp <= 0) break;
          if (targetState.isHandcuffed) {
            addLog(`${targetName.toUpperCase()} IS ALREADY CUFFED! (CANNOT STACK)`, 'info');
            setOverlayText(`⛓️ ${targetName.toUpperCase()} ALREADY CUFFED!`);
            await wait(1500);
            setOverlayText(null);
            break;
          }
          targetSetter(p => ({ ...p, isHandcuffed: true }));
          setAnim(p => ({ ...p, triggerCuff: p.triggerCuff + 1 }));
          addLog(`${userName.toUpperCase()} CUFFED ${targetName.toUpperCase()}`, 'info');
          setOverlayText(`⛓️ ${targetName.toUpperCase()} CUFFED!`);
          await wait(2000);
          setOverlayText(null);
          break;

        case 'GLASS': {
          const curIdx = gameStateRef.current.currentShellIndex;
          const shell = gameStateRef.current.chamber[curIdx];
          if (shell) {
            if (user === 'PLAYER') {
              setKnownShell(shell);
              addLog(`GLASS REVEALED NEXT SHELL IS ${shell}`, 'safe');
              setOverlayText(`🔍 NEXT SHELL IS ${shell}`);
            } else {
              addLog(`${userName.toUpperCase()} PEEKED WITH GLASS`, 'info');
            }
            setAnim(p => ({ ...p, triggerGlass: p.triggerGlass + 1 }));
            await wait(2000);
            setOverlayText(null);
          }
          break;
        }

        case 'PHONE': {
          const limit = gameStateRef.current.chamber.length;
          const currentShell = gameStateRef.current.currentShellIndex;
          const available = [];
          for (let i = currentShell + 1; i < limit; i++) {
            available.push(i);
          }
          const futIdx = phoneFutureIndexOverride !== undefined ? phoneFutureIndexOverride : (available.length > 0 ? available[Math.floor(Math.random() * available.length)] : null);
          if (futIdx !== null) {
            const futShell = gameStateRef.current.chamber[futIdx];
            const offset = futIdx - currentShell;
            let posName = `${offset + 1}TH`;
            if (offset === 1) posName = '2ND';
            else if (offset === 2) posName = '3RD';
            else if (offset === 3) posName = '4TH';
            if (user === 'PLAYER') {
              addLog(`PHONE REVEALED SHELL ${offset + 1} (${posName} SHELL) IS ${futShell}`, 'safe');
              setOverlayText(`📞 ${posName} SHELL IS ${futShell}`);
            } else {
              addLog(`${userName.toUpperCase()} USED BURNER PHONE`, 'info');
            }
            setAnim(p => ({ ...p, triggerPhone: p.triggerPhone + 1 }));
            await wait(2000);
            setOverlayText(null);
          } else {
            setOverlayText(`📞 PHONE: NO FUTURE SHELLS`);
            await wait(1500);
            setOverlayText(null);
          }
          break;
        }

        case 'INVERTER': {
          const invIdx = gameStateRef.current.currentShellIndex;
          const invShell = gameStateRef.current.chamber[invIdx];
          if (invShell) {
            setGameState(prev => {
              const chamber = [...prev.chamber];
              chamber[invIdx] = invShell === 'LIVE' ? 'BLANK' : 'LIVE';
              const liveCount = chamber.slice(invIdx).filter(s => s === 'LIVE').length;
              const blankCount = chamber.slice(invIdx).filter(s => s === 'BLANK').length;
              return { ...prev, chamber, liveCount, blankCount };
            });
            setKnownShell(null);
            setAnim(p => ({ ...p, triggerInverter: p.triggerInverter + 1 }));
            addLog(`${userName.toUpperCase()} INVERTED NEXT SHELL`, 'info');
            setOverlayText(`🔄 POLARITY INVERTED!`);
            await wait(2000);
            setOverlayText(null);
          }
          break;
        }

        case 'BIG_INVERTER':
          setGameState(prev => {
            const start = prev.currentShellIndex;
            const chamber = prev.chamber.map((s, i) => i >= start ? (s === 'LIVE' ? 'BLANK' : 'LIVE') : s);
            const liveCount = chamber.slice(start).filter(s => s === 'LIVE').length;
            const blankCount = chamber.slice(start).filter(s => s === 'BLANK').length;
            return { ...prev, chamber, liveCount, blankCount };
          });
          setKnownShell(null);
          setAnim(p => ({ ...p, triggerBigInverter: p.triggerBigInverter + 1 }));
          addLog(`${userName.toUpperCase()} INVERTED ALL REMAINING AMMO`, 'info');
          setOverlayText(`🔄 ALL SHELLS INVERTED!`);
          await wait(2000);
          setOverlayText(null);
          break;

        case 'ADRENALINE':
          if (resolvedTargetOwner) {
            setGameState(prev => ({ ...prev, adrenalineTargetOwner: resolvedTargetOwner }));
          }
          setAnim(p => ({ ...p, triggerAdrenaline: p.triggerAdrenaline + 1 }));
          await wait(1500);
          if (user === 'PLAYER') {
            addLog("TIME SLOWS DOWN... PICK AN ITEM TO STEAL", 'danger');
            setOverlayText('⚡ ADRENALINE RUSH ⚡');
            setGameState(prev => ({ ...prev, phase: 'STEALING' }));
            await wait(1000);
            setOverlayText(null);
          }
          break;

        case 'CHOKE':
          userSetter(p => ({ ...p, isChokeActive: true }));
          setAnim(p => ({ ...p, triggerChoke: p.triggerChoke + 1 }));
          addLog(`${userName.toUpperCase()} EQUIPPED BARREL CHOKE (BURST 2 SHELLS)`, 'danger');
          setOverlayText(`💥 BARREL CHOKE EQUIPPED!`);
          await wait(2000);
          setOverlayText(null);
          break;

        case 'REMOTE': {
          const idx = gameStateRef.current.currentShellIndex;
          const chamber = [...gameStateRef.current.chamber];
          if (idx + 1 < chamber.length) {
            const temp = chamber[idx];
            chamber[idx] = chamber[idx + 1];
            chamber[idx + 1] = temp;
            setGameState(prev => ({ ...prev, chamber }));
            setKnownShell(null);
            setAnim(p => ({ ...p, triggerRemote: p.triggerRemote + 1 }));
            addLog(`${userName.toUpperCase()} CYCLED CHAMBER MECHANISM (SWAPPED SHELLS)`, 'info');
            setOverlayText(`🔄 CHAMBER CYCLED!`);
            await wait(2000);
            setOverlayText(null);
          } else {
            setOverlayText(`🔄 REMOTE: NOT ENOUGH SHELLS TO SWAP`);
            await wait(1500);
            setOverlayText(null);
          }
          break;
        }

        case 'LUCKYCHARM':
          userSetter(p => ({ ...p, luckycharmsUsed: (p.luckycharmsUsed || 0) + 1 }));
          setAnim(p => ({ ...p, triggerLuckycharm: p.triggerLuckycharm + 1 }));
          addLog(`${userName.toUpperCase()} USED LUCKY CHARM (+LUCK ON NEXT SHIPMENT)`, 'safe');
          setOverlayText(`🍀 LUCKY CHARM ACTIVATED!`);
          await wait(2000);
          setOverlayText(null);
          break;

        case 'MIRROR': {
          audioManager.playSound('mirror', { dimMusic: shouldDimMusic });
          setAnim(p => ({ ...p, triggerMirror: p.triggerMirror + 1 }));
          await wait(2200);

          const copiedItems = (targetState.lastTurnItemsUsed || []).filter(i => i !== 'MIRROR' && i !== 'ADRENALINE');
          if (copiedItems.length === 0) {
            addLog(`${userName.toUpperCase()} COPIED NO EFFECTS WITH MIRROR`, 'info');
            setOverlayText("🪞 MIRROR: NO EFFECTS TO COPY");
            await wait(2000);
            setOverlayText(null);
          } else {
            const friendlyNames = copiedItems.map(getFriendlyItemName).join(' & ');
            addLog(`${userName.toUpperCase()} MIRROR COPIED: ${friendlyNames}`, 'safe');
            setOverlayText(`🪞 MIRROR DUPLICATED: ${friendlyNames}!`);
            await wait(2200);
            setOverlayText(null);

            for (const copiedItem of copiedItems) {
              if (gameStateRef.current.phase === 'GAME_OVER' || multiRoundEnded) break;
              if (copiedItem === 'DECK_CARD' && gameStateRef.current.phase === 'CARD_SELECT') continue;
              const ended = await processItemEffect(user, copiedItem, undefined, undefined, undefined, undefined, undefined, targetPlayerId);
              if (ended) {
                multiRoundEnded = true;
                break;
              }
              await wait(1600);
            }
          }
          break;
        }

        case 'DECK_CARD': {
          if (gameStateRef.current.phase === 'CARD_SELECT') break;
          const allTarotNames: TarotCard['name'][] = [
            'The Magician', 'The Hanged Man', 'The Hermit', 'The Moon', 'Judgment',
            'Wheel of Fortune', 'The Sun', 'Death', 'The Tower', 'The Fool', 'Justice', 'Temperance'
          ];
          const selectedNames: TarotCard['name'][] = deckCardsOverride
            ? (deckCardsOverride as TarotCard['name'][])
            : shuffleArray(allTarotNames).slice(0, 6);
          const cardPowers: Record<TarotCard['name'], string> = {
            'The Magician': 'Gain a random item',
            'The Hanged Man': 'Lose 1 HP',
            'The Hermit': 'Ends turn instantly',
            'The Moon': 'Grab opponent item',
            'Judgment': '50% chance invert blank to live',
            'Wheel of Fortune': 'Reshuffle ammo',
            'The Sun': 'Gain 1 HP',
            'Death': 'Destroy own item',
            'The Tower': 'Destroy opponent item',
            'The Fool': 'Chamber bullet reveal',
            'Justice': 'Swap HP totals',
            'Temperance': 'Swap items with opponent'
          };
          const deckCards: TarotCard[] = selectedNames.map(name => ({
            name,
            power: cardPowers[name]
          }));

          setGameState(prev => ({
            ...prev,
            deckCards,
            selectedCardIndex: null,
            phase: 'CARD_SELECT'
          }));
          setCameraView('TABLE');
          addLog(`${userName.toUpperCase()} SHUFFLED TAROT CARDS`, 'info');
          setOverlayText("🃏 SELECT A TAROT CARD...");
          await wait(1800);
          setOverlayText(null);
          break;
        }

        case 'TOTEM':
          addLog(`${userName.toUpperCase()}'S TOTEM IS PASSIVE`, 'info');
          break;

        case 'CRUSHER':
          if (targetState.hp <= 0) break;
          if (targetState.items.length > 0) {
            const cIdx = crushIndexOverride !== undefined && crushIndexOverride >= 0 && crushIndexOverride < targetState.items.length
              ? crushIndexOverride
              : Math.floor(Math.random() * targetState.items.length);
            const destroyedItem = targetState.items[cIdx];
            if (destroyedItem) {
              targetSetter(p => {
                const items = [...p.items];
                const idx = items.indexOf(destroyedItem);
                if (idx !== -1) items.splice(idx, 1);
                return { ...p, items };
              });
              setAnim(p => ({ ...p, triggerCrusher: p.triggerCrusher + 1 }));
              addLog(`${userName.toUpperCase()} DESTROYED ${targetName.toUpperCase()}'S ${destroyedItem}`, 'danger');
              setOverlayText(`🔨 CRUSHED ${targetName.toUpperCase()}'S ${destroyedItem}!`);
              await wait(2000);
              setOverlayText(null);
            }
          } else {
            setOverlayText(`🔨 ${targetName.toUpperCase()} HAS NO ITEMS!`);
            addLog(`${userName.toUpperCase()} USED CRUSHER: ${targetName.toUpperCase()} has no items to destroy!`, 'info');
            await wait(1500);
            setOverlayText(null);
          }
          break;

        case 'FLASHBANG':
          if (targetState.hp <= 0) break;
          targetSetter(p => ({ ...p, isFlashbanged: true }));
          setAnim(p => ({ ...p, triggerFlashbang: p.triggerFlashbang + 1 }));
          if (resolvedTargetOwner === 'PLAYER') {
            setShowFlashbang(true);
          }
          addLog(`${userName.toUpperCase()} FLASHBANGED ${targetName.toUpperCase()}`, 'info');
          setOverlayText(`⚡ ${targetName.toUpperCase()} BLINDED!`);
          await wait(2000);
          setOverlayText(null);
          if (resolvedTargetOwner === 'PLAYER') {
            setShowFlashbang(false);
          }
          break;

        case 'JACKPOT': {
          const spinOutcome = jackpotOutcomeOverride ?? resolveJackpotOutcome();
          audioManager.playSound('slotmachine', { dimMusic: shouldDimMusic });
          setAnim(p => ({ ...p, triggerJackpot: p.triggerJackpot + 1, jackpotResult: spinOutcome }));
          addLog(`${userName.toUpperCase()} SPUN THE JACKPOT MACHINE`, 'info');
          await wait(4200);

          if (spinOutcome === 'JACKPOT') {
            addLog("JACKPOT WIN! IMMUNE TO NEXT 3 SHOTS", 'safe');
            setOverlayText(`✨ JACKPOT WIN! ✨\n3 SHOT IMMUNITY FOR ${userName.toUpperCase()}`);
            userSetter(p => ({ ...p, jackpotImmunityShots: (p.jackpotImmunityShots || 0) + 3, hasJackpotWinActive: true }));
            audioManager.playJackpotIntro({ dimMusic: shouldDimMusic });
          } else if (spinOutcome === 'NORMAL') {
            addLog("NORMAL WIN! IMMUNE TO NEXT 1 SHOT", 'safe');
            setOverlayText(`👍 NORMAL WIN! 👍\n1 SHOT IMMUNITY FOR ${userName.toUpperCase()}`);
            userSetter(p => ({ ...p, jackpotImmunityShots: (p.jackpotImmunityShots || 0) + 1 }));
          } else {
            addLog("NO WIN. TRY AGAIN", 'neutral');
            setOverlayText("❌ LOSE ❌\nBETTER LUCK NEXT TIME");
          }
          await wait(1500);
          setOverlayText(null);
          break;
        }

        case 'CONTRACT': {
          const preState = getPlayerState(user);
          const hasTotem = preState.items.includes('TOTEM') && !preState.isFlashbanged;
          const hasJackpot = (preState.jackpotImmunityShots ?? 0) > 0;
          let nextHp = preState.hp - 1;
          let survived = true;

          if (hasJackpot) {
            nextHp = preState.hp;
            const nextImmunity = Math.max(0, (preState.jackpotImmunityShots ?? 0) - 1);
            userSetter(p => ({
              ...p,
              jackpotImmunityShots: nextImmunity,
              hasJackpotWinActive: nextImmunity > 0 ? p.hasJackpotWinActive : false
            }));
            if (nextImmunity <= 0) {
              audioManager.stopJackpotMusic();
            }
          } else if (nextHp <= 0) {
            if (hasTotem) {
              nextHp = 1;
              userSetter(p => {
                const items = [...p.items];
                const tIdx = items.indexOf('TOTEM');
                if (tIdx !== -1) items.splice(tIdx, 1);
                return { ...p, hp: 1, items };
              });
              setAnim(p => ({ ...p, triggerTotem: p.triggerTotem + 1, totemTarget: user }));
              audioManager.playSound('totem');
              addLog(`${userName.toUpperCase()}'S TOTEM ACTIVATED (SURVIVED AT 1 HP)`, 'safe');
            } else {
              nextHp = 0;
              survived = false;
              userSetter(p => ({ ...p, hp: 0 }));
            }
          } else {
            userSetter(p => ({ ...p, hp: nextHp }));
          }

          setAnim(p => ({ ...p, triggerContract: p.triggerContract + 1 }));
          addLog(`${userName.toUpperCase()} SIGNED BLOOD CONTRACT`, 'danger');
          await wait(2500);

          if (survived) {
            const loot = contractLootOverride || getContractLoot(preState.luckycharmsUsed || 0);
            userSetter(p => {
              const items = [...p.items];
              loot.forEach(l => {
                if (items.length < MAX_ITEMS) items.push(l);
              });
              return { ...p, items, luckycharmsUsed: 0 };
            });
            addLog(`${userName.toUpperCase()} GAINED: ${loot.join(', ')}`, 'safe');
            setOverlayText(`🩸 BLOOD CONTRACT SIGNED!\nGAINED: ${loot.join(', ')}`);
            await wait(2200);
            setOverlayText(null);
          } else {
            addLog(`${userName.toUpperCase()} SACRIFICED THEIR LETHAL SHOT FOR THE CONTRACT`, 'danger');
            setOverlayText(`💀 SACRIFICED LETHAL SHOT!`);
            await wait(2200);
            setOverlayText(null);

            const postPlayerHp = user === 'PLAYER' ? 0 : playerRef.current.hp;
            const postDealerHp = user === 'DEALER' ? 0 : dealerRef.current.hp;
            const postPlayer3Hp = user === 'PLAYER3' ? 0 : player3Ref.current.hp;
            const postPlayer4Hp = user === 'PLAYER4' ? 0 : player4Ref.current.hp;
            const aliveCount = (postPlayerHp > 0 ? 1 : 0) + (postDealerHp > 0 ? 1 : 0) + (postPlayer3Hp > 0 ? 1 : 0) + (postPlayer4Hp > 0 ? 1 : 0);

            if (aliveCount <= 1) {
              let roundWinner: TurnOwner = 'PLAYER';
              if (postPlayerHp > 0) roundWinner = 'PLAYER';
              else if (postPlayer3Hp > 0) roundWinner = 'PLAYER3';
              else if (postPlayer4Hp > 0) roundWinner = 'PLAYER4';
              else roundWinner = 'DEALER';

              const winnerName = getPlayerNameByOwner(roundWinner);
              setOverlayColor(roundWinner === 'PLAYER' ? 'green' : 'red');
              setOverlayText(`${winnerName.toUpperCase()} WON THE ROUND!`);
              await wait(3000);
              setOverlayColor('none');
              setOverlayText(null);

              if (onMPRoundEndRef.current) {
                await onMPRoundEndRef.current(roundWinner);
              }
              multiRoundEnded = true;
            } else {
              // Advance turn past dead user so match never softlocks
              const mPlayers = gameStateRef.current.multiplayerState?.players || [];
              const size = mPlayers.length;
              const myId = gameStateRef.current.localPlayerId || '';
              const myIndex = mPlayers.findIndex(p => p.id === myId);
              if (myIndex !== -1 && size > 0) {
                let userIdx = myIndex;
                if (user === 'DEALER') userIdx = (myIndex + 2) % size;
                else if (user === 'PLAYER3') userIdx = (myIndex + 1) % size;
                else if (user === 'PLAYER4') userIdx = (myIndex + 3) % size;
                for (let step = 1; step < size; step++) {
                  const candOwner = resolveTargetOwner(mPlayers[(userIdx + step) % size].id, myId, mPlayers);
                  const candHp = candOwner === 'PLAYER' ? postPlayerHp : (candOwner === 'DEALER' ? postDealerHp : (candOwner === 'PLAYER3' ? postPlayer3Hp : postPlayer4Hp));
                  if (candHp > 0) {
                    const nextPhase = candOwner === 'PLAYER' ? 'PLAYER_TURN' : (candOwner === 'PLAYER3' ? 'PLAYER3_TURN' : (candOwner === 'PLAYER4' ? 'PLAYER4_TURN' : 'DEALER_TURN'));
                    setGameState(prev => ({ ...prev, turnOwner: candOwner, phase: nextPhase }));
                    break;
                  }
                }
              }
              multiRoundEnded = true;
            }
          }
          break;
        }
      }

      return multiRoundEnded;
    }

    if (item === 'CUFFS') {
      const opponent = user === 'PLAYER' ? dealerRef.current : playerRef.current;
      // Check if opponent is already cuffed OR if we just skipped their turn via cuffs
      if (opponent.isHandcuffed || gameStateRef.current.lastTurnWasSkipped) {
        addLog(`${user === 'PLAYER' ? getOpponentName().toUpperCase() : 'YOU'} CAN'T BE CUFFED AGAIN!`, 'info');
        return false;
      }
    }

    const userName = user === 'PLAYER' ? (playerNameRef.current || 'PLAYER').toUpperCase() : getOpponentName().toUpperCase();
    setOverlayText(`${userName} USED ${item}`);

    addLog(`${userName} USED ${item}`, 'info');
    await wait(1500);
    setOverlayText(null);

    // Track Item Usage
    if (user === 'PLAYER') {
      matchStatsRef.current.itemsUsed[item] = (matchStatsRef.current.itemsUsed[item] || 0) + 1;
      setPlayer(p => ({
        ...p,
        currentTurnItemsUsed: [...(p.currentTurnItemsUsed || []), item]
      }));
    } else {
      setDealer(d => ({
        ...d,
        currentTurnItemsUsed: [...(d.currentTurnItemsUsed || []), item]
      }));
    }

    let roundEnded = false;

    switch (item) {
      case 'BEER':
        audioManager.playSound('blankshell', { dimMusic: shouldDimMusic });
        roundEnded = await ItemActions.handleBeer(
          gameStateRef.current, setGameState,
          (v) => setAnim(p => ({ ...p, triggerRack: typeof v === 'function' ? v(p.triggerRack) : v })),
          (v) => setAnim(p => ({ ...p, ejectedShellColor: typeof v === 'function' ? v(p.ejectedShellColor) : v })),
          (v) => setAnim(p => ({ ...p, triggerDrink: typeof v === 'function' ? v(p.triggerDrink) : v })),
          setOverlayText,
          addLog, startRound,
          onBatchEndRef.current || undefined
        );
        break;

      case 'CIGS':
        await ItemActions.handleCigs(user, setPlayer, setDealer,
          (v) => setAnim(p => ({ ...p, triggerHeal: typeof v === 'function' ? v(p.triggerHeal) : v }))
        );
        break;

      case 'SAW':
        await ItemActions.handleSaw(user, setPlayer, setDealer,
          (v) => setAnim(p => ({ ...p, triggerSparks: typeof v === 'function' ? v(p.triggerSparks) : v })),
          (v) => setAnim(p => ({ ...p, isSawing: typeof v === 'function' ? v(p.isSawing) : v }))
        );
        break;

      case 'CUFFS':
        await ItemActions.handleCuffs(user, setPlayer, setDealer, (v) => setAnim(p => ({ ...p, triggerCuff: typeof v === 'function' ? v(p.triggerCuff) : v })));
        await wait(500);
        break;

      case 'GLASS':
        await ItemActions.handleGlass(user, gameStateRef.current, setKnownShell,
          (v) => setAnim(p => ({ ...p, triggerGlass: typeof v === 'function' ? v(p.triggerGlass) : v })),
          addLog
        );
        break;

      case 'PHONE':
        await ItemActions.handlePhone(user, gameStateRef.current,
          (v) => setAnim(p => ({ ...p, triggerPhone: typeof v === 'function' ? v(p.triggerPhone) : v })),
          addLog,
          setOverlayText,
          phoneFutureIndexOverride
        );
        break;

      case 'INVERTER':
        setKnownShell(null);
        await ItemActions.handleInverter(user, gameStateRef.current, setGameState,
          (v) => setAnim(p => ({ ...p, triggerInverter: typeof v === 'function' ? v(p.triggerInverter) : v })),
          addLog,
          setOverlayText
        );
        break;

      case 'BIG_INVERTER':
        setKnownShell(null);
        await ItemActions.handleBigInverter(user, gameStateRef.current, setGameState,
          (v) => setAnim(p => ({ ...p, triggerBigInverter: typeof v === 'function' ? v(p.triggerBigInverter) : v })),
          addLog,
          setOverlayText
        );
        break;

      case 'ADRENALINE':
        await ItemActions.handleAdrenaline(user,
          (v) => setAnim(p => ({ ...p, triggerAdrenaline: typeof v === 'function' ? v(p.triggerAdrenaline) : v })),
          setGameState, addLog, setOverlayText, setOverlayColor,
          Boolean(gameStateRef.current.isLocalSplit)
        );
        await wait(500);
        break;

      case 'CHOKE':
        await ItemActions.handleChoke(user, setPlayer, setDealer,
          (v) => setAnim(p => ({ ...p, triggerChoke: typeof v === 'function' ? v(p.triggerChoke) : v })),
          addLog
        );
        break;

      case 'REMOTE':
        setKnownShell(null);
        await ItemActions.handleRemote(user, gameStateRef.current, setGameState,
          (v) => setAnim(p => ({ ...p, triggerRemote: typeof v === 'function' ? v(p.triggerRemote) : v })),
          addLog,
          setOverlayText
        );
        break;

      case 'CONTRACT':
        roundEnded = await ItemActions.handleContract(
          user, playerRef.current, dealerRef.current, setPlayer, setDealer, setGameState, setAnimState,
          (v) => setAnim(p => ({ ...p, triggerContract: typeof v === 'function' ? v(p.triggerContract) : v })),
          addLog, setOverlayText, setOverlayColor,
          gameStateRef.current.isHardMode, Boolean(gameStateRef.current.isMultiplayer || gameStateRef.current.isLocalSplit),
          handleHardModeRoundEnd, handleMPRoundEnd, handleNormalModeRoundEnd,
          contractLootOverride
        );
        break;

      case 'LUCKYCHARM':
        await ItemActions.handleLuckycharm(
          user, setPlayer, setDealer,
          (v) => setAnim(p => ({ ...p, triggerLuckycharm: typeof v === 'function' ? v(p.triggerLuckycharm) : v })),
          addLog, setOverlayText
        );
        break;

      case 'FLASHBANG':
        await ItemActions.handleFlashbang(
          user, setPlayer, setDealer,
          (v) => setAnim(p => ({ ...p, triggerFlashbang: typeof v === 'function' ? v(p.triggerFlashbang) : v })),
          addLog, setOverlayText, setShowFlashbang
        );
        break;

      case 'CRUSHER':
        await ItemActions.handleCrusher(
          user, playerRef.current, dealerRef.current, setPlayer, setDealer,
          (v) => setAnim(p => ({ ...p, triggerCrusher: typeof v === 'function' ? v(p.triggerCrusher) : v })),
          addLog, setOverlayText,
          crushIndexOverride
        );
        break;

      case 'JACKPOT': {
        let outcome: 'JACKPOT' | 'NORMAL' | 'LOSE';
        
        if ((window as any).__debugJackpotForcedOutcome) {
          outcome = (window as any).__debugJackpotForcedOutcome;
        } else if (jackpotOutcomeOverride) {
          outcome = jackpotOutcomeOverride;
        } else {
          outcome = resolveJackpotOutcome();
        }

        audioManager.playSound('slotmachine', { dimMusic: shouldDimMusic });
        setAnim(p => ({
          ...p,
          triggerJackpot: p.triggerJackpot + 1,
          jackpotResult: outcome
        }));

        addLog(`${userName} SPUN THE JACKPOT MACHINE`, 'info');
        await wait(4200);

        const setOwner = user === 'PLAYER' ? setPlayer : setDealer;

        if (outcome === 'JACKPOT') {
          addLog("JACKPOT WIN! IMMUNE TO NEXT 3 SHOTS", 'safe');
          setOverlayText(`✨ JACKPOT WIN! ✨\n3 SHOT IMMUNITY FOR ${userName.toUpperCase()}`);
          setOwner(p => ({ ...p, jackpotImmunityShots: (p.jackpotImmunityShots || 0) + 3, hasJackpotWinActive: true }));
          audioManager.playJackpotIntro({ dimMusic: shouldDimMusic });
        } else if (outcome === 'NORMAL') {
          addLog("NORMAL WIN! IMMUNE TO NEXT 1 SHOT", 'safe');
          setOverlayText(`👍 NORMAL WIN! 👍\n1 SHOT IMMUNITY FOR ${userName.toUpperCase()}`);
          setOwner(p => ({ ...p, jackpotImmunityShots: (p.jackpotImmunityShots || 0) + 1 }));
        } else {
          addLog("NO WIN. TRY AGAIN", 'neutral');
          setOverlayText("❌ LOSE ❌\nBETTER LUCK NEXT TIME");
        }

        await wait(1500);
        setOverlayText(null);
        break;
      }

      case 'MIRROR': {
        audioManager.playSound('mirror', { dimMusic: shouldDimMusic });
        setAnim(p => ({ ...p, triggerMirror: p.triggerMirror + 1 }));
        await wait(2200);

        const opponentState = user === 'PLAYER' ? dealerRef.current : playerRef.current;
        const blockDealerJackpot = !gameStateRef.current.isMultiplayer && !gameStateRef.current.isLocalSplit && user === 'DEALER';
        const copiedItems = (opponentState.lastTurnItemsUsed || []).filter(
          i => i !== 'MIRROR' && i !== 'ADRENALINE' && (!blockDealerJackpot || i !== 'JACKPOT')
        );
        
        if (copiedItems.length === 0) {
          addLog(`${userName} COPIED NO EFFECTS WITH MIRROR`, 'info');
          setOverlayText("🪞 MIRROR: NO EFFECTS TO COPY");
          await wait(2000);
          setOverlayText(null);
        } else {
          const friendlyNames = copiedItems.map(getFriendlyItemName).join(' & ');
          addLog(`${userName} MIRROR COPIED: ${friendlyNames}`, 'safe');
          setOverlayText(`🪞 MIRROR DUPLICATED: ${friendlyNames}!`);
          await wait(2200);
          setOverlayText(null);

          for (const copiedItem of copiedItems) {
            if (gameStateRef.current.phase === 'GAME_OVER' || roundEnded) break;
            if (copiedItem === 'DECK_CARD' && gameStateRef.current.phase === 'CARD_SELECT') continue;
            const itemEndedRound = await processItemEffect(user, copiedItem);
            if (itemEndedRound) {
              roundEnded = true;
              break;
            }
            await wait(2200);
          }
        }
        break;
      }
      case 'DECK_CARD': {
        if (gameStateRef.current.phase === 'CARD_SELECT') break;
        const allTarotNames: TarotCard['name'][] = [
          'The Magician', 'The Hanged Man', 'The Hermit', 'The Moon', 'Judgment',
          'Wheel of Fortune', 'The Sun', 'Death', 'The Tower', 'The Fool', 'Justice', 'Temperance'
        ];
        
        const selectedNames: TarotCard['name'][] = deckCardsOverride
          ? (deckCardsOverride as TarotCard['name'][])
          : shuffleArray(allTarotNames).slice(0, 6);
        const cardPowers: Record<TarotCard['name'], string> = {
          'The Magician': 'Gain a random item',
          'The Hanged Man': 'Lose 1 HP',
          'The Hermit': 'Ends turn instantly',
          'The Moon': 'Grab opponent item',
          'Judgment': '50% chance invert blank to live',
          'Wheel of Fortune': 'Reshuffle ammo',
          'The Sun': 'Gain 1 HP',
          'Death': 'Destroy own item',
          'The Tower': 'Destroy opponent item',
          'The Fool': 'Chamber bullet reveal',
          'Justice': 'Swap HP totals',
          'Temperance': 'Swap items with opponent'
        };
        const deckCards: TarotCard[] = selectedNames.map(name => ({
          name,
          power: cardPowers[name]
        }));

        setGameState(prev => ({
          ...prev,
          deckCards,
          selectedCardIndex: null,
          phase: 'CARD_SELECT'
        }));
        
        setCameraView('TABLE');
        
        addLog(`${userName} SHUFFLED TAROT CARDS`, 'info');
        setOverlayText("🃏 SELECT A TAROT CARD...");
        await wait(1800);
        setOverlayText(null);
        break;
      }
    }

    await wait(300);

    return roundEnded;
  }, [addLog, getOpponentName, getPlayerNameByOwner, getPlayerSetter, getPlayerState, handleHardModeRoundEnd, handleMPRoundEnd, handleNormalModeRoundEnd, resolveTargetOwner, setAnim, setOverlayColor, setOverlayText, startRound]);

  const canUsePlayerItem = useCallback((
    index: number,
    targetPlayerId?: string
  ): { canUse: boolean; reason?: string } => {
    const isSplit = Boolean(gameStateRef.current.isLocalSplit);
    const activeActor: TurnOwner = isSplit && gameStateRef.current.turnOwner === 'DEALER' ? 'DEALER' : 'PLAYER';
    const expectedPhase = activeActor === 'DEALER' ? 'DEALER_TURN' : 'PLAYER_TURN';
    const actorState = activeActor === 'DEALER' ? dealerRef.current : playerRef.current;
    const defaultOpponentOwner: TurnOwner = activeActor === 'DEALER' ? 'PLAYER' : 'DEALER';

    if (gameStateRef.current.phase !== expectedPhase) {
      return { canUse: false, reason: "NOT YOUR TURN" };
    }
    if (gameStateRef.current.turnOwner !== activeActor) {
      return { canUse: false, reason: "NOT YOUR TURN" };
    }
    if (isProcessingRef.current) {
      return { canUse: false, reason: "SYSTEM BUSY" };
    }

    if (cameraView === 'GUN' || aimTarget !== 'IDLE') {
      return { canUse: false, reason: "CAN'T USE ITEMS WHILE HOLDING GUN" };
    }

    const item = actorState.items[index];
    if (!item) {
      return { canUse: false, reason: "INVALID ITEM" };
    }

    if (actorState.isFlashbanged) {
      return { canUse: false, reason: "YOU ARE BLINDED (FLASHBANGED)! CAN'T USE ITEMS" };
    }

    if (item === 'TOTEM') {
      return { canUse: false, reason: "TOTEM IS A PASSIVE ITEM! TRIGGERS ON LETHAL DAMAGE" };
    }

    if (item === 'CONTRACT') {
      const hasTotem = actorState.items.includes('TOTEM') && !actorState.isFlashbanged;
      const hasJackpot = (actorState.jackpotImmunityShots ?? 0) > 0;
      if (actorState.hp <= 1 && !hasTotem && !hasJackpot) {
        return { canUse: false, reason: "CANNOT SIGN BLOOD CONTRACT AT 1 HP (SUICIDAL)" };
      }
    }

    if (item === 'SAW' && actorState.isSawedActive) {
      return { canUse: false, reason: "BARREL ALREADY SAWED OFF (2X DAMAGE ACTIVE)" };
    }

    if (item === 'CHOKE' && actorState.isChokeActive) {
      return { canUse: false, reason: "CHOKE MOD ALREADY EQUIPPED (2 SHELL BURST ACTIVE)" };
    }

    if (item === 'REMOTE' && gameStateRef.current.currentShellIndex + 1 >= gameStateRef.current.chamber.length) {
      return { canUse: false, reason: "CANNOT CYCLE: ONLY ONE SHELL REMAINING IN CHAMBER" };
    }

    if (item === 'PHONE' && gameStateRef.current.currentShellIndex + 1 >= gameStateRef.current.chamber.length) {
      return { canUse: false, reason: "NO FUTURE SHELLS REMAINING TO INSPECT" };
    }

    if ((item === 'INVERTER' || item === 'BIG_INVERTER' || item === 'GLASS' || item === 'BEER') && gameStateRef.current.currentShellIndex >= gameStateRef.current.chamber.length) {
      return { canUse: false, reason: "CHAMBER IS EMPTY" };
    }

    if (item === 'CUFFS') {
      const isMulti = gameStateRef.current.isThreePlayer || gameStateRef.current.isFourPlayer;
      const targetOwner = isMulti && targetPlayerId ? resolveTargetOwner(targetPlayerId, gameStateRef.current.localPlayerId || '', gameStateRef.current.multiplayerState?.players || []) : defaultOpponentOwner;
      const oppState = getPlayerState(targetOwner);
      if (oppState.hp <= 0) {
        return { canUse: false, reason: `${getPlayerNameByOwner(targetOwner).toUpperCase()} IS ALREADY ELIMINATED` };
      }
      if (oppState.isHandcuffed) {
        return { canUse: false, reason: `${getPlayerNameByOwner(targetOwner).toUpperCase()} IS ALREADY CUFFED!` };
      }
      if (!isMulti && gameStateRef.current.lastTurnWasSkipped) {
        return { canUse: false, reason: "CANNOT CUFF TWICE IN A ROW!" };
      }
    }

    if (item === 'CRUSHER') {
      const isMulti = gameStateRef.current.isThreePlayer || gameStateRef.current.isFourPlayer;
      const targetOwner = isMulti && targetPlayerId ? resolveTargetOwner(targetPlayerId, gameStateRef.current.localPlayerId || '', gameStateRef.current.multiplayerState?.players || []) : defaultOpponentOwner;
      const targetState = getPlayerState(targetOwner);
      if (targetState.hp <= 0) {
        return { canUse: false, reason: `${getPlayerNameByOwner(targetOwner).toUpperCase()} IS ALREADY ELIMINATED` };
      }
      if (targetState.items.length === 0) {
        return { canUse: false, reason: "OPPONENT HAS NO ITEMS TO CRUSH" };
      }
    }

    if (item === 'FLASHBANG') {
      const isMulti = gameStateRef.current.isThreePlayer || gameStateRef.current.isFourPlayer;
      const targetOwner = isMulti && targetPlayerId ? resolveTargetOwner(targetPlayerId, gameStateRef.current.localPlayerId || '', gameStateRef.current.multiplayerState?.players || []) : defaultOpponentOwner;
      const targetState = getPlayerState(targetOwner);
      if (targetState.hp <= 0) {
        return { canUse: false, reason: `${getPlayerNameByOwner(targetOwner).toUpperCase()} IS ALREADY ELIMINATED` };
      }
    }

    if (item === 'MIRROR') {
      const isMulti = gameStateRef.current.isThreePlayer || gameStateRef.current.isFourPlayer;
      const targetOwner = isMulti && targetPlayerId ? resolveTargetOwner(targetPlayerId, gameStateRef.current.localPlayerId || '', gameStateRef.current.multiplayerState?.players || []) : defaultOpponentOwner;
      const oppState = getPlayerState(targetOwner);
      const copiedItems = (oppState.lastTurnItemsUsed || []).filter(i => i !== 'MIRROR' && i !== 'ADRENALINE');
      if (copiedItems.length === 0) {
        return { canUse: false, reason: "NO ITEM EFFECTS TO COPY FROM LAST TURN" };
      }
    }

    if (item === 'ADRENALINE') {
      const isMulti = gameStateRef.current.isThreePlayer || gameStateRef.current.isFourPlayer;
      const targetOwner = isMulti && targetPlayerId
        ? resolveTargetOwner(targetPlayerId, gameStateRef.current.localPlayerId || '', gameStateRef.current.multiplayerState?.players || [])
        : defaultOpponentOwner;
      const targetState = getPlayerState(targetOwner);
      const hasTotem = actorState.items.includes('TOTEM') && !actorState.isFlashbanged;
      const hasJackpot = (actorState.jackpotImmunityShots ?? 0) > 0;
      const remainingShells = gameStateRef.current.chamber.length - gameStateRef.current.currentShellIndex;
      const oppCopied = (targetState.lastTurnItemsUsed || []).filter(i => i !== 'MIRROR' && i !== 'ADRENALINE');

      const stealableItems = targetState.items.filter(i => {
        if (!i || i === 'ADRENALINE' || i === 'JACKPOT' || i === 'TOTEM') return false;
        if (i === 'SAW' && actorState.isSawedActive) return false;
        if (i === 'CHOKE' && actorState.isChokeActive) return false;
        if (i === 'CUFFS' && (targetState.isHandcuffed || (!isMulti && gameStateRef.current.lastTurnWasSkipped))) return false;
        if (i === 'CONTRACT' && actorState.hp <= 1 && !hasTotem && !hasJackpot) return false;
        if (i === 'CRUSHER' && targetState.items.length <= 1) return false;
        if (i === 'MIRROR' && oppCopied.length === 0) return false;
        if ((i === 'PHONE' || i === 'REMOTE') && remainingShells <= 1) return false;
        return true;
      });
      if (stealableItems.length === 0) {
        return {
          canUse: false,
          reason: isMulti ? `NOTHING TO STEAL FROM ${getPlayerNameByOwner(targetOwner).toUpperCase()}` : "NOTHING TO STEAL FROM OPPONENT"
        };
      }
    }

    return { canUse: true };
  }, [aimTarget, cameraView, getPlayerNameByOwner, getPlayerState, resolveTargetOwner]);

  const usePlayerItem = useCallback(async (
    index: number,
    deckCardsOverride?: string[],
    jackpotOutcomeOverride?: 'JACKPOT' | 'NORMAL' | 'LOSE',
    crushIndexOverride?: number,
    contractLootOverride?: ItemType[],
    phoneFutureIndexOverride?: number,
    targetPlayerId?: string
  ): Promise<boolean> => {
    resumeAudioContext().catch(() => {});
    const check = canUsePlayerItem(index, targetPlayerId);
    if (!check.canUse) {
      if (check.reason) {
        addLog(check.reason, 'info');
        const errMsg = `❌ ${check.reason}`;
        setOverlayText(errMsg);
        if (errorOverlayTimeoutRef.current) {
          clearTimeout(errorOverlayTimeoutRef.current);
        }
        errorOverlayTimeoutRef.current = setTimeout(() => {
          errorOverlayTimeoutRef.current = null;
          if (!isMountedRef.current) return;
          setOverlayText(prev => (prev === errMsg ? null : prev));
        }, 2000);
      }
      return false;
    }

    const isSplit = Boolean(gameStateRef.current.isLocalSplit);
    const activeActor: TurnOwner = isSplit && gameStateRef.current.turnOwner === 'DEALER' ? 'DEALER' : 'PLAYER';
    const actorState = activeActor === 'DEALER' ? dealerRef.current : playerRef.current;
    const setActorState = activeActor === 'DEALER' ? setDealer : setPlayer;

    const item = actorState.items[index];
    if (!item) return false;

    if (item === 'ADRENALINE') {
      const isMulti = gameStateRef.current.isThreePlayer || gameStateRef.current.isFourPlayer;
      if (isMulti && targetPlayerId) {
        const targetOwner = resolveTargetOwner(targetPlayerId, gameStateRef.current.localPlayerId || '', gameStateRef.current.multiplayerState?.players || []);
        setGameState(prev => ({ ...prev, adrenalineTargetOwner: targetOwner }));
      }
    }

    const myGameGen = gameGenRef.current;
    setIsProcessing(true);

    try {
      const itemsMap = matchStatsRef.current.itemsUsed || {};
      itemsMap[item] = (itemsMap[item] || 0) + 1;
      matchStatsRef.current.itemsUsed = itemsMap;

      const newItems = [...actorState.items];
      newItems.splice(index, 1);
      setActorState(p => ({ ...p, items: newItems }));

      const roundEnded = await processItemEffect(activeActor, item, deckCardsOverride, jackpotOutcomeOverride, crushIndexOverride, contractLootOverride, phoneFutureIndexOverride, targetPlayerId);

      if (!roundEnded && isMountedRef.current && myGameGen === gameGenRef.current) {
        setIsProcessing(false);
      }
      return true;
    } catch (err) {
      console.error("Error in usePlayerItem:", err);
      if (isMountedRef.current && myGameGen === gameGenRef.current) {
        setIsProcessing(false);
      }
      return false;
    }
  }, [addLog, canUsePlayerItem, processItemEffect, resolveTargetOwner, setOverlayText]);

  const setGamePhase = useCallback((phase: GameState['phase']) => {
    setGameState(prev => ({ ...prev, phase }));
  }, []);

  const canStealItem = useCallback((index: number, stealer: TurnOwner = 'PLAYER'): { canSteal: boolean; reason?: string } => {
    if (index === -1) return { canSteal: true };
    if (isProcessingRef.current) return { canSteal: false, reason: "SYSTEM BUSY" };

    const isMultiOpponent = gameStateRef.current.isThreePlayer || gameStateRef.current.isFourPlayer;
    let target = stealer === 'PLAYER' ? dealerRef.current : playerRef.current;

    if (isMultiOpponent) {
      const targetOwner = gameStateRef.current.adrenalineTargetOwner || (stealer === 'PLAYER' ? 'DEALER' : 'PLAYER');
      target = getPlayerState(targetOwner);
    }

    const itemToSteal = target.items[index];
    if (!itemToSteal) return { canSteal: false, reason: "INVALID ITEM" };

    if (itemToSteal === 'ADRENALINE') {
      return { canSteal: false, reason: "CAN'T STEAL ADRENALINE! PICK ANOTHER" };
    }

    if (itemToSteal === 'TOTEM') {
      return { canSteal: false, reason: "CAN'T STEAL TOTEM! PICK ANOTHER" };
    }

    if (itemToSteal === 'JACKPOT') {
      return { canSteal: false, reason: "CAN'T STEAL JACKPOT! PICK ANOTHER" };
    }

    if (itemToSteal === 'CONTRACT') {
      const stealerState = getPlayerState(stealer);
      const hasTotem = stealerState.items.includes('TOTEM') && !stealerState.isFlashbanged;
      const hasJackpot = (stealerState.jackpotImmunityShots ?? 0) > 0;
      if (stealerState.hp <= 1 && !hasTotem && !hasJackpot) {
        return { canSteal: false, reason: "CANNOT STEAL CONTRACT AT 1 HP (SUICIDAL)!" };
      }
    }

    if (itemToSteal === 'SAW' && getPlayerState(stealer).isSawedActive) {
      return { canSteal: false, reason: "BARREL ALREADY SAWED OFF! PICK ANOTHER" };
    }

    if (itemToSteal === 'CHOKE' && getPlayerState(stealer).isChokeActive) {
      return { canSteal: false, reason: "CHOKE MOD ALREADY ATTACHED! PICK ANOTHER" };
    }

    if (itemToSteal === 'CUFFS' && (target.isHandcuffed || (!isMultiOpponent && gameStateRef.current.lastTurnWasSkipped))) {
      return { canSteal: false, reason: target.isHandcuffed ? "OPPONENT ALREADY HANDCUFFED! PICK ANOTHER" : "CANNOT CUFF TWICE IN A ROW! PICK ANOTHER" };
    }

    if ((itemToSteal === 'PHONE' || itemToSteal === 'REMOTE') && gameStateRef.current.currentShellIndex + 1 >= gameStateRef.current.chamber.length) {
      return { canSteal: false, reason: "NOT ENOUGH SHELLS REMAINING! PICK ANOTHER" };
    }

    if (itemToSteal === 'CRUSHER' && target.items.length <= 1) {
      return { canSteal: false, reason: "OPPONENT HAS NO OTHER ITEMS TO CRUSH! PICK ANOTHER" };
    }

    if (itemToSteal === 'MIRROR') {
      const oppUsed = (target.lastTurnItemsUsed || []).filter(i => i !== 'MIRROR' && i !== 'ADRENALINE');
      if (oppUsed.length === 0) {
        return { canSteal: false, reason: "NO ITEMS TO COPY FROM LAST TURN! PICK ANOTHER" };
      }
    }

    return { canSteal: true };
  }, [getPlayerState]);

  const stealItem = useCallback(async (index: number, stealer: TurnOwner = 'PLAYER') => {
    if (index === -1) {
      const stealerPhase = stealer === 'PLAYER' ? 'PLAYER_TURN' : (stealer === 'PLAYER3' ? 'PLAYER3_TURN' : (stealer === 'PLAYER4' ? 'PLAYER4_TURN' : 'DEALER_TURN'));
      setGameState(p => ({ ...p, phase: stealerPhase, adrenalineTargetOwner: undefined }));
      addLog(`${stealer === 'PLAYER' ? 'YOU' : stealer} CANCELLED EXTRACTION`, 'info');
      return;
    }

    const check = canStealItem(index, stealer);
    if (!check.canSteal) {
      if (stealer === 'PLAYER' || gameStateRef.current.isLocalSplit) {
        addLog(check.reason || "CANNOT STEAL ITEM", 'danger');
        setOverlayText(`❌ ${check.reason || "CANNOT STEAL ITEM"}`);
        await wait(2000);
        setOverlayText(null);
      }
      return;
    }

    const isMultiOpponent = gameStateRef.current.isThreePlayer || gameStateRef.current.isFourPlayer;
    let target = stealer === 'PLAYER' ? dealerRef.current : playerRef.current;
    let setTarget = stealer === 'PLAYER' ? setDealer : setPlayer;
    let targetOwnerForAction: TurnOwner | undefined;

    if (isMultiOpponent) {
      const targetOwner = gameStateRef.current.adrenalineTargetOwner || (stealer === 'PLAYER' ? 'DEALER' : 'PLAYER');
      target = getPlayerState(targetOwner);
      setTarget = getPlayerSetter(targetOwner);
      targetOwnerForAction = targetOwner;
    }

    const itemToSteal = target.items[index];
    if (!itemToSteal) return;

    const myGameGen = gameGenRef.current;
    setIsProcessing(true);

    try {
      const newTargetItems = [...target.items];
      newTargetItems.splice(index, 1);
      setTarget(prev => ({ ...prev, items: newTargetItems }));

      const stealerName = stealer === 'PLAYER' ? (playerNameRef.current || 'PLAYER') : (gameStateRef.current.opponentName || 'OPPONENT');
      addLog(`${stealerName.toUpperCase()} STOLE ${itemToSteal}`, 'info');
      setOverlayText(`🎯 ${stealerName.toUpperCase()} STOLE ${itemToSteal}!`);
      await wait(800);
      if (!isMountedRef.current || myGameGen !== gameGenRef.current) return;
      setOverlayText(null);

      const stealerPhase = stealer === 'PLAYER' ? 'PLAYER_TURN' : (stealer === 'PLAYER3' ? 'PLAYER3_TURN' : (stealer === 'PLAYER4' ? 'PLAYER4_TURN' : 'DEALER_TURN'));
      setGameState(p => ({ ...p, phase: stealerPhase, adrenalineTargetOwner: undefined }));

      await wait(100);
      if (!isMountedRef.current || myGameGen !== gameGenRef.current) return;
      const roundEnded = await processItemEffect(
        stealer,
        itemToSteal,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        targetOwnerForAction
      );

      if (!roundEnded) {
        await wait(300);
        if (isMountedRef.current && myGameGen === gameGenRef.current) {
          setIsProcessing(false);
        }
      }
    } catch (err) {
      console.error("Error in stealItem:", err);
      if (isMountedRef.current && myGameGen === gameGenRef.current) {
        setIsProcessing(false);
      }
    }
  }, [addLog, canStealItem, getPlayerSetter, getPlayerState, processItemEffect, setDealer, setOverlayText, setPlayer]);

  const selectTarotCard = useCallback(async (index: number, cardRandomsOverride?: any) => {
    if (gameStateRef.current.selectedCardIndex !== null && gameStateRef.current.selectedCardIndex !== undefined) return;
    
    const myGameGen = gameGenRef.current;
    setIsProcessing(true);
    
    try {
      setGameState(prev => ({
        ...prev,
        selectedCardIndex: index
      }));

      audioManager.playSound('cards', { dimMusic: true });

      const cards = gameStateRef.current.deckCards;
      if (!cards || !cards[index]) {
        setIsProcessing(false);
        const owner = gameStateRef.current.turnOwner;
        const nextPhase = owner === 'PLAYER' ? 'PLAYER_TURN' : (owner === 'PLAYER3' ? 'PLAYER3_TURN' : (owner === 'PLAYER4' ? 'PLAYER4_TURN' : 'DEALER_TURN'));
        setGameState(prev => ({ ...prev, phase: nextPhase, deckCards: undefined, selectedCardIndex: null }));
        setCameraView('PLAYER');
        return;
      }

      const chosenCard = cards[index];
      const cardName = typeof chosenCard === 'string' ? chosenCard : chosenCard?.name || '';
      const turnOwner = gameStateRef.current.turnOwner;
      const userName = turnOwner === 'PLAYER' ? (playerNameRef.current || 'PLAYER') : (gameStateRef.current.opponentName || 'OPPONENT');
      const wasCuffedBeforeHermit = getPlayerState(turnOwner).isHandcuffed;
      
      setOverlayText(`🃏 ${userName.toUpperCase()} REVEALED: ${cardName.toUpperCase()}...`);

      await wait(1800);
      if (!isMountedRef.current || myGameGen !== gameGenRef.current) return;
      setCameraView(gameStateRef.current.isLocalSplit && turnOwner === 'DEALER' ? 'DEALER' : 'PLAYER');
      await wait(1700);
      if (!isMountedRef.current || myGameGen !== gameGenRef.current) return;

      let deathTriggered = false;
      let savedByTotem = false;

      const resolveNextAliveOwner = (fromOwner: TurnOwner): TurnOwner => {
        const fallback: TurnOwner = fromOwner === 'PLAYER' ? 'DEALER' : 'PLAYER';
        if (gameStateRef.current.isMultiplayer && (gameStateRef.current.isThreePlayer || gameStateRef.current.isFourPlayer)) {
          const mPlayers = gameStateRef.current.multiplayerState?.players || [];
          const size = mPlayers.length;
          const myId = gameStateRef.current.localPlayerId || '';
          const myIndex = mPlayers.findIndex(p => p.id === myId);
          if (myIndex !== -1 && size > 0) {
            let currentId = myId;
            if (fromOwner === 'DEALER') currentId = mPlayers[(myIndex + 2) % size]?.id;
            else if (fromOwner === 'PLAYER3') currentId = mPlayers[(myIndex + 1) % size]?.id;
            else if (fromOwner === 'PLAYER4') currentId = mPlayers[(myIndex + 3) % size]?.id;

            const currentIdx = mPlayers.findIndex(p => p.id === currentId);
            if (currentIdx !== -1) {
              let nextIdx = (currentIdx + 1) % size;
              let attempts = 0;
              while (attempts < size) {
                const relOwner = resolveTargetOwner(mPlayers[nextIdx].id, myId, mPlayers);
                if (getPlayerState(relOwner).hp > 0) {
                  return relOwner;
                }
                nextIdx = (nextIdx + 1) % size;
                attempts++;
              }
            }
          }
        }
        return fallback;
      };

      const getAliveOpponentOwner = (fromOwner: TurnOwner): TurnOwner => {
        if (gameStateRef.current.isThreePlayer || gameStateRef.current.isFourPlayer) {
          return resolveNextAliveOwner(fromOwner);
        }
        return fromOwner === 'PLAYER' ? 'DEALER' : 'PLAYER';
      };

      const dealDamage = async (target: TurnOwner, amount: number) => {
        const isPlayerTarget = target === 'PLAYER';
        const targetState = getPlayerState(target);
        const setTarget = getPlayerSetter(target);
        const targetName = getPlayerNameByOwner(target).toUpperCase();
        const currentHp = targetState.hp;
        const currentItems = targetState.items;
        const isTargetFlashbanged = targetState.isFlashbanged;
        const hasTotem = currentItems.includes('TOTEM') && !isTargetFlashbanged;
        const newHp = currentHp - amount;
        
        if (newHp <= 0) {
          if (hasTotem) {
            savedByTotem = true;
            setTarget(p => {
              const idx = p.items.indexOf('TOTEM');
              const newItems = [...p.items];
              if (idx !== -1) newItems.splice(idx, 1);
              return { ...p, hp: 1, items: newItems };
            });
            
            setOverlayText(`✨ ${targetName} SAVED BY TOTEM ✨`);
            setAnim(prev => ({
              ...prev,
              triggerTotem: (prev.triggerTotem || 0) + 1,
              totemTarget: target
            }));
            audioManager.playSound('totem');
            addLog(`${targetName}'S TOTEM OF UNDYING SAVED THEM!`, 'safe');
            await wait(3000);
            setOverlayText(null);
          } else {
            setTarget(p => ({ ...p, hp: 0 }));
            addLog(`${targetName} DIED TO HANGED MAN EFFECT.`, 'danger');
            
            const isHardMode = gameStateRef.current.isHardMode;
            const isMultiplayer = gameStateRef.current.isMultiplayer;
            const roundWinner: TurnOwner = isPlayerTarget ? 'DEALER' : 'PLAYER';
            
            if (isHardMode) {
              await handleHardModeRoundEnd(roundWinner);
            } else if (isMultiplayer && handleMPRoundEnd) {
              await handleMPRoundEnd(roundWinner);
            } else if (!isMultiplayer && !isHardMode && handleNormalModeRoundEnd) {
              await handleNormalModeRoundEnd(roundWinner);
            } else {
              setGameState(prev => ({ ...prev, winner: roundWinner, phase: 'GAME_OVER' }));
            }
            return true;
          }
        } else {
          setTarget(p => ({ ...p, hp: newHp }));
          addLog(`${targetName} lost ${amount} HP from Hanged Man card.`, 'danger');
        }
        return false;
      };

      switch (cardName) {
        case 'The Magician': {
          const item = (cardRandomsOverride && cardRandomsOverride.magicianItem)
            ? cardRandomsOverride.magicianItem
            : getRandomItem(gameStateRef.current.isHardMode, turnOwner === 'DEALER');
          const setOwner = getPlayerSetter(turnOwner);
          const ownerItems = getPlayerState(turnOwner).items;
          
          if (ownerItems.length < MAX_ITEMS) {
            setOwner(p => ({ ...p, items: [...p.items, item] }));
            addLog(`${userName} gained a random item: ${item}`, 'safe');
            setOverlayText(`🔮 THE MAGICIAN: GAINED ${item}!`);
          } else {
            addLog(`${userName}'s inventory is full. Magic item was discarded.`, 'info');
            setOverlayText("🔮 THE MAGICIAN: INVENTORY FULL!");
          }
          break;
        }
        
        case 'The Hanged Man': {
          deathTriggered = await dealDamage(turnOwner, 1);
          if (!deathTriggered && !savedByTotem) {
            setOverlayText(`🩸 THE HANGED MAN: ${userName} LOST 1 HP!`);
          }
          break;
        }
        
        case 'The Hermit': {
          const resolvedNextOwner = resolveNextAliveOwner(turnOwner);
          const drawerState = getPlayerState(turnOwner);
          const receiverState = getPlayerState(resolvedNextOwner);

          if (drawerState.isHandcuffed) {
            const setOwner = getPlayerSetter(turnOwner);
            setOwner(p => ({ ...p, isHandcuffed: false }));
            addLog(`${userName} broke cuffs with The Hermit.`, 'safe');
            setOverlayText(`⛓️ THE HERMIT: CUFFS BROKEN! TURN RETAINED.`);
          } else if (receiverState.isHandcuffed) {
            const setReceiver = getPlayerSetter(resolvedNextOwner);
            setReceiver(p => ({ ...p, isHandcuffed: false }));
            const receiverName = getPlayerNameByOwner(resolvedNextOwner);
            addLog(`${receiverName} broke cuffs with The Hermit.`, 'safe');
            setOverlayText(`⛓️ THE HERMIT: ${receiverName.toUpperCase()}'S CUFFS BROKEN! TURN TRANSFERRED.`);
          } else {
            addLog(`${userName} ends turn instantly with The Hermit.`, 'danger');
            const opponentNameText = getPlayerNameByOwner(resolvedNextOwner);
            setOverlayText(`⛓️ THE HERMIT: TURN TRANSFERRED TO ${opponentNameText.toUpperCase()}!`);
          }
          break;
        }
        
        case 'The Moon': {
          const oppOwner = getAliveOpponentOwner(turnOwner);
          const opponent = getPlayerState(oppOwner);
          const setOpponent = getPlayerSetter(oppOwner);
          const setOwner = getPlayerSetter(turnOwner);
          const owner = getPlayerState(turnOwner);
          
          const stealableIndices = opponent.items
            .map((item, idx) => ({ item, idx }))
            .filter(x => x.item !== null && x.item !== 'TOTEM' && x.item !== 'JACKPOT')
            .map(x => x.idx);
          
          if (stealableIndices.length > 0) {
            const randIdx = (cardRandomsOverride && cardRandomsOverride.moonIndex !== undefined && cardRandomsOverride.moonIndex < opponent.items.length)
              ? cardRandomsOverride.moonIndex
              : stealableIndices[Math.floor(Math.random() * stealableIndices.length)];
            const stolenItem = opponent.items[randIdx];
            
            if (stolenItem) {
              setOpponent(p => {
                const items = [...p.items];
                items.splice(randIdx, 1);
                return { ...p, items };
              });
              
              if (owner.items.length < MAX_ITEMS) {
                setOwner(p => ({ ...p, items: [...p.items, stolenItem] }));
                addLog(`${userName} stole opponent's ${stolenItem}!`, 'safe');
                setOverlayText(`🌙 THE MOON: STOLE ${stolenItem}!`);
              } else {
                addLog(`${userName} stole ${stolenItem} but inventory was full (discarded)!`, 'info');
                setOverlayText(`🌙 THE MOON: STOLE ${stolenItem} (DISCARDED)`);
              }
            }
          } else {
            addLog("Opponent has no items to steal.", 'info');
            setOverlayText("🌙 THE MOON: OPPONENT HAS NO ITEMS");
          }
          break;
        }
        
        case 'Judgment': {
          const chamber = [...gameStateRef.current.chamber];
          const idx = gameStateRef.current.currentShellIndex;
          if (idx < chamber.length) {
            if (chamber[idx] === 'BLANK') {
              const success = (cardRandomsOverride && Object.prototype.hasOwnProperty.call(cardRandomsOverride, 'judgmentSuccess'))
                ? cardRandomsOverride.judgmentSuccess
                : (Math.random() < 0.5);
              if (success) {
                chamber[idx] = 'LIVE';
                const remaining = chamber.slice(idx);
                setGameState(prev => ({
                  ...prev,
                  chamber,
                  liveCount: remaining.filter(s => s === 'LIVE').length,
                  blankCount: remaining.filter(s => s === 'BLANK').length
                }));
                setKnownShell(null);
              }
            }
            addLog("Current shell was judged by Judgment.", 'info');
            setOverlayText("⚖️ JUDGMENT: CURRENT SHELL JUDGED!");
          } else {
            setOverlayText("⚖️ JUDGMENT: CHAMBER EMPTY");
          }
          break;
        }
        
        case 'Wheel of Fortune': {
          const chamber = [...gameStateRef.current.chamber];
          const idx = gameStateRef.current.currentShellIndex;
          const remaining = chamber.slice(idx);
          if (remaining.length > 0) {
            if (cardRandomsOverride && cardRandomsOverride.wheelChamber) {
              setGameState(prev => {
                const liveCount = cardRandomsOverride.wheelChamber.slice(idx).filter((s: string) => s === 'LIVE').length;
                const blankCount = cardRandomsOverride.wheelChamber.slice(idx).filter((s: string) => s === 'BLANK').length;
                return {
                  ...prev,
                  chamber: cardRandomsOverride.wheelChamber,
                  liveCount,
                  blankCount
                };
              });
            } else {
              const shuffledRemaining = shuffleArray(remaining);
              for (let i = 0; i < shuffledRemaining.length; i++) {
                chamber[idx + i] = shuffledRemaining[i];
              }
              const liveCount = chamber.slice(idx).filter(s => s === 'LIVE').length;
              const blankCount = chamber.slice(idx).filter(s => s === 'BLANK').length;
              setGameState(prev => ({ ...prev, chamber, liveCount, blankCount }));
            }
            setKnownShell(null);
            addLog("Ammo chamber reshuffled!", 'info');
            setOverlayText("🎡 WHEEL OF FORTUNE: SHUFFLED CHAMBER!");
          } else {
            setOverlayText("🎡 WHEEL OF FORTUNE: CHAMBER EMPTY");
          }
          break;
        }
        
        case 'The Sun': {
          const setOwner = getPlayerSetter(turnOwner);
          const ownerState = getPlayerState(turnOwner);
          const newHp = Math.min(ownerState.maxHp, ownerState.hp + 1);
          setOwner(p => ({ ...p, hp: newHp }));
          addLog(`${userName} healed 1 HP.`, 'safe');
          setOverlayText("☀️ THE SUN: HEALED 1 HP!");
          break;
        }
        
        case 'Death': {
          const setOwner = getPlayerSetter(turnOwner);
          const ownerState = getPlayerState(turnOwner);
          if (ownerState.items.length > 0) {
            const randIdx = (cardRandomsOverride && cardRandomsOverride.deathIndex !== undefined && cardRandomsOverride.deathIndex < ownerState.items.length)
              ? cardRandomsOverride.deathIndex
              : Math.floor(Math.random() * ownerState.items.length);
            const destroyedItem = ownerState.items[randIdx];
            setOwner(p => {
              const items = [...p.items];
              items.splice(randIdx, 1);
              return { ...p, items };
            });
            addLog(`${userName} destroyed own item: ${destroyedItem}`, 'danger');
            setOverlayText(`💀 DEATH: DESTROYED OWN ${destroyedItem}!`);
          } else {
            addLog(`${userName} has no items to destroy.`, 'info');
            setOverlayText("💀 DEATH: NO ITEMS TO DESTROY");
          }
          break;
        }
        
        case 'The Tower': {
          const oppOwner = getAliveOpponentOwner(turnOwner);
          const setOpponent = getPlayerSetter(oppOwner);
          const opponentState = getPlayerState(oppOwner);
          const destroyableIndices = opponentState.items
            .map((item, idx) => ({ item, idx }))
            .filter(x => x.item !== null && x.item !== 'TOTEM');
          
          if (destroyableIndices.length > 0) {
            const hasValidOverride = cardRandomsOverride
              && cardRandomsOverride.towerIndex !== undefined
              && cardRandomsOverride.towerIndex >= 0
              && cardRandomsOverride.towerIndex < opponentState.items.length
              && opponentState.items[cardRandomsOverride.towerIndex] !== 'TOTEM';
            const targetIdx = hasValidOverride
              ? cardRandomsOverride.towerIndex
              : destroyableIndices[Math.floor(Math.random() * destroyableIndices.length)].idx;
            const destroyedItem = opponentState.items[targetIdx];
            setOpponent(p => {
              const items = [...p.items];
              items.splice(targetIdx, 1);
              return { ...p, items };
            });
            addLog(`${userName} destroyed opponent's item: ${destroyedItem}`, 'safe');
            setOverlayText(`🏰 THE TOWER: DESTROYED OPPONENT'S ${destroyedItem}!`);
          } else {
            addLog("Opponent has no items to destroy.", 'info');
            setOverlayText("🏰 THE TOWER: OPPONENT HAS NO ITEMS");
          }
          break;
        }
        
        case 'The Fool': {
          const checkLimit = gameStateRef.current.chamber.length;
          const current = gameStateRef.current.currentShellIndex;
          const remaining = checkLimit - current;
          
          let randomIndex = current;
          let positionText = "CURRENT SHELL";
          
          if (remaining > 2) {
            const offset = 1 + Math.floor(Math.random() * (remaining - 1));
            randomIndex = current + offset;
            positionText = `${offset + 1}TH SHELL`;
          } else if (remaining === 2) {
            randomIndex = current + 1;
            positionText = "2ND SHELL";
          } else {
            randomIndex = current;
            positionText = "CURRENT SHELL";
          }
          
          const actualShell = gameStateRef.current.chamber[randomIndex];
          const lieProb = remaining > 2 ? 0.0 : (remaining === 2 ? 0.10 : 0.25);
          const isLying = Math.random() < lieProb;
          const displayedShell = isLying ? (actualShell === 'LIVE' ? 'BLANK' : 'LIVE') : actualShell;

          const displayText = `🃏 THE FOOL: ${positionText} IS ${displayedShell}`;
          addLog(`Tarot reveal: ${positionText} is ${displayedShell}`, 'info');

          if (turnOwner === 'PLAYER') {
            setOverlayText(displayText);
          } else {
            setOverlayText(`🃏 THE FOOL: ${userName.toUpperCase()} IS SEEING THE FUTURE...`);
          }
          break;
        }
        
        case 'Justice': {
          const oppOwner = getAliveOpponentOwner(turnOwner);
          const setOwner = getPlayerSetter(turnOwner);
          const setOpp = getPlayerSetter(oppOwner);
          const ownerHp = getPlayerState(turnOwner).hp;
          const oppHp = getPlayerState(oppOwner).hp;
          setOwner(p => ({ ...p, hp: oppHp }));
          setOpp(d => ({ ...d, hp: ownerHp }));
          addLog(`HP Swapped! ${userName} HP: ${oppHp}, Opponent HP: ${ownerHp}`, 'safe');
          setOverlayText("⚖️ JUSTICE: HP SWAPPED!");
          break;
        }
        
        case 'Temperance': {
          const oppOwner = getAliveOpponentOwner(turnOwner);
          const setOwner = getPlayerSetter(turnOwner);
          const setOpp = getPlayerSetter(oppOwner);
          const ownerItems = [...getPlayerState(turnOwner).items];
          const oppItems = [...getPlayerState(oppOwner).items];
          setOwner(p => ({ ...p, items: oppItems }));
          setOpp(d => ({ ...d, items: ownerItems }));
          addLog(`Items Swapped! ${userName} gained ${oppItems.length} items, Opponent gained ${ownerItems.length} items.`, 'safe');
          setOverlayText("🔀 TEMPERANCE: ITEMS SWAPPED!");
          break;
        }
      }

      if (!deathTriggered) {
        await wait(3000);
        if (!isMountedRef.current || myGameGen !== gameGenRef.current) return;
        setOverlayText(null);
      }

      if (!deathTriggered && gameStateRef.current.phase !== 'GAME_OVER') {
        let nextOwner = turnOwner;
        if (cardName === 'The Hermit') {
          nextOwner = wasCuffedBeforeHermit ? turnOwner : resolveNextAliveOwner(turnOwner);
          if (nextOwner !== turnOwner) {
            const setOwner = getPlayerSetter(turnOwner);
            setOwner(p => ({ ...p, isFlashbanged: false }));
          }
        }
        const nextPhase = nextOwner === 'PLAYER' ? 'PLAYER_TURN' : (nextOwner === 'PLAYER3' ? 'PLAYER3_TURN' : (nextOwner === 'PLAYER4' ? 'PLAYER4_TURN' : 'DEALER_TURN'));
        setGameState(prev => ({
          ...prev,
          phase: nextPhase,
          turnOwner: nextOwner,
          lastTurnWasSkipped: nextOwner !== turnOwner ? false : prev.lastTurnWasSkipped,
          deckCards: undefined,
          selectedCardIndex: null
        }));
      }
      
      setCameraView('PLAYER');
      if (isMountedRef.current && myGameGen === gameGenRef.current) {
        setIsProcessing(false);
      }
    } catch (err) {
      console.error("Error in selectTarotCard:", err);
      if (isMountedRef.current && myGameGen === gameGenRef.current) {
        setIsProcessing(false);
      }
    }
  }, [addLog, getPlayerNameByOwner, getPlayerSetter, getPlayerState, handleHardModeRoundEnd, handleMPRoundEnd, handleNormalModeRoundEnd, resolveTargetOwner, setAnim, setOverlayText]);

  const syncState = useCallback((data: { player: PlayerState, dealer: PlayerState, player3?: PlayerState, player4?: PlayerState, gameState: Partial<GameState> }) => {
    if (data.player) setPlayer(p => ({ ...p, ...data.player }));
    if (data.dealer) setDealer(d => ({ ...d, ...data.dealer }));
    if (data.player3) setPlayer3(p3 => ({ ...p3, ...data.player3 }));
    if (data.player4) setPlayer4(p4 => ({ ...p4, ...data.player4 }));
    if (data.gameState) setGameState(s => {
      const nextState = { ...s, ...data.gameState };
      if (s.phase === 'STEALING' && s.turnOwner === 'PLAYER') {
        nextState.phase = 'STEALING';
      }
      return nextState;
    });
  }, []);

  const setOnBatchEnd = useCallback((cb: (keepTurn: boolean) => void) => {
    onBatchEndRef.current = cb;
  }, []);

  const setOnMPRoundEnd = useCallback((cb: (winner: TurnOwner, pWin?: number, oWin?: number) => void | Promise<void>) => {
    onMPRoundEndRef.current = cb;
  }, []);

  return useMemo(() => ({
    gameState,
    player,
    dealer,
    player3,
    setPlayer3,
    player4,
    setPlayer4,
    logs,
    animState,
    knownShell,
    playerName,
    aimTarget,
    cameraView,
    overlayColor,
    overlayText,
    showBlood,
    showFlash,
    showFlashbang,
    receivedItems,
    opponentReceivedItems,
    showLootOverlay,
    isProcessing,
    setIsProcessing,
    startGame,
    startLocalSplitGame,
    fireShot,
    usePlayerItem,
    canUsePlayerItem,
    stealItem,
    canStealItem,
    selectTarotCard,
    setAimTarget,
    setCameraView,
    setDealer,
    setPlayer,
    setGameState,
    processItemEffect,
    resetGame,
    setPlayerName,
    pickupGun,
    syncState,
    setGamePhase,
    setOverlayText,
    get matchStats() {
      const elapsed = Math.max(1, Math.round((Date.now() - matchStartTimeRef.current) / 1000));
      return {
        ...matchStatsRef.current,
        duration: elapsed
      };
    },
    setOnBatchEnd,
    setOnMPRoundEnd,
    startRound,
    addLog,
    handleHardModeRoundEnd,
    handleMPRoundEnd,
    handleNormalModeRoundEnd,
    dealerModel,
    setDealerModel
  }), [
    gameState,
    player,
    dealer,
    player3,
    player4,
    logs,
    addLog,
    animState,
    knownShell,
    playerName,
    aimTarget,
    cameraView,
    overlayColor,
    overlayText,
    showBlood,
    showFlash,
    showFlashbang,
    receivedItems,
    opponentReceivedItems,
    showLootOverlay,
    isProcessing,
    dealerModel,
    startGame,
    startLocalSplitGame,
    fireShot,
    usePlayerItem,
    canUsePlayerItem,
    stealItem,
    canStealItem,
    selectTarotCard,
    processItemEffect,
    resetGame,
    setPlayerName,
    pickupGun,
    syncState,
    setGamePhase,
    setOverlayText,
    setOnBatchEnd,
    setOnMPRoundEnd,
    startRound,
    handleHardModeRoundEnd,
    handleMPRoundEnd,
    handleNormalModeRoundEnd
  ]);
};
