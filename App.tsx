import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { RotateCw } from 'lucide-react';
import { ThreeScene } from './components/ThreeScene';
import { GameUI } from './components/GameUI';
import { useGameLogic } from './hooks/useGameLogic';
import { useDealerAI } from './hooks/useDealerAI';
import { SettingsMenu } from './components/SettingsMenu';
import { GameSettings } from './types';
import { DEFAULT_SETTINGS, ACTIVE_ITEMS, TACTICAL_STICKERS, isUltraPerf } from './constants';
import { DiscordSDK } from '@discord/embedded-app-sdk';

import { LoadingScreen } from './components/LoadingScreen';
import { DebugOverlay } from './components/ui/DebugOverlay';
import { TutorialGuide } from './components/TutorialGuide';
import { Scoreboard } from './components/ui/Scoreboard';
import { UpdateNotification } from './components/ui/UpdateNotification';
import { audioManager } from './utils/audioManager';
import { preloadAllModels, getGLBLoadingProgress } from './utils/three/glbPreloader';
import { useMultiplayer } from './hooks/useMultiplayer';
import { MultiplayerLobby } from './components/MultiplayerLobby';
import { ChatBox } from './components/ChatBox';
import { MultiplayerSelection } from './components/MultiplayerSelection';
import { generateLootBatch, resolveJackpotOutcome } from './utils/game/inventory';
import { randomInt } from './utils/gameUtils';
import { ShellType, ItemType, TurnOwner, AimTarget, LocalSplitConfig } from './types';
import { getCurrentUserProfile, UserProfile } from './utils/firebaseService';

const urlParams = new URLSearchParams(window.location.search);

declare global {
  interface Window {
    updateDiscordActivity?: (details: string, state?: string) => void;
  }
}
const isDiscordPlatform = urlParams.has('frame_id') || urlParams.has('instance_id') || window.location.search.includes('platform=') || window.location.hostname.includes('discordsays.com');
const SERVER_URL = isDiscordPlatform
    ? window.location.origin + '/server'
    : (import.meta.env.VITE_SERVER_URL || 
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          ? 'http://localhost:3001'
          : window.location.origin + '/server'));

type AppState = 'MENU' | 'LOADING_SP' | 'LOADING_GAME' | 'GAME' | 'LOADING_MP' | 'MP_SELECTION' | 'LOBBY';

interface NameTagItem {
  name: string;
  x: number;
  y: number;
  visible: boolean;
}

const NameTagsOverlay = React.memo(({ nameTags, isMobileNameTag }: { nameTags: NameTagItem[]; isMobileNameTag: boolean }) => (
  <>
    {nameTags.map((tag, i) => (
      tag.visible && (
        <div
          key={i}
          className={`absolute z-[40] pointer-events-none -translate-x-1/2 -translate-y-1/2 bg-black/80 border border-stone-800/80 ${isMobileNameTag ? 'px-2 py-0.5 text-[7px] sm:text-[8px]' : 'px-2.5 py-1 text-[8px] sm:text-[9px]'} font-black tracking-[0.25em] text-stone-200 uppercase rounded-lg shadow-2xl select-none transition-opacity duration-150`}
          style={{ left: `${tag.x}%`, top: `${tag.y}%` }}
        >
          {tag.name}
        </div>
      )
    ))}
  </>
));

export default function App() {
  const spGame = useGameLogic();
  const mp = useMultiplayer();
  const [appState, setAppState] = useState<AppState>('MENU');
  const [initialRoomId, setInitialRoomId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room');
  });
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => getCurrentUserProfile());
  const lastTotalWins = useRef(0);
  const lastHoverRef = useRef<{ target: AimTarget; targetId?: string; time: number }>({ target: 'OPPONENT', time: 0 });
  const lastSyncBroadcastRef = useRef(0);
  const gameStartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioInitializedRef = useRef(false);

  // Refs for latest game/multiplayer state inside long-lived socket & round callbacks
  const spGameRef = useRef(spGame);
  spGameRef.current = spGame;
  const mpRoomRef = useRef(mp.room);
  mpRoomRef.current = mp.room;
  const mpPlayerIdRef = useRef(mp.playerId);
  mpPlayerIdRef.current = mp.playerId;
  const appStateRef = useRef(appState);
  appStateRef.current = appState;

  useEffect(() => {
    return () => {
      if (gameStartTimeoutRef.current) {
        clearTimeout(gameStartTimeoutRef.current);
        gameStartTimeoutRef.current = null;
      }
    };
  }, []);

  // Ping the server to wake it up in case it's asleep on Hugging Face
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${SERVER_URL}/health`, { signal: controller.signal }).then((res) => {
      console.log("[Wakeup] Server response:", res.status);
    }).catch((err) => {
      if (err?.name !== 'AbortError') {
        console.log("[Wakeup] Server wake-up ping attempted:", err.message);
      }
    });
    return () => controller.abort();
  }, []);

  // Propagate real-time avatar / profile edits to active multiplayer rooms & chat
  useEffect(() => {
    const handleProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      const latestProfile = detail?.profile || getCurrentUserProfile();
      setCurrentUser(latestProfile);

      let avatarUrl = typeof detail?.avatarUrl === 'string' ? detail.avatarUrl : undefined;
      let avatarStyle = typeof detail?.avatarStyle === 'string' ? detail.avatarStyle : undefined;
      let avatarSeed = typeof detail?.avatarSeed === 'string' ? detail.avatarSeed : undefined;
      let displayName = typeof detail?.displayName === 'string' ? detail.displayName : undefined;

      if (avatarUrl === undefined && avatarStyle === undefined && avatarSeed === undefined && latestProfile) {
        avatarUrl = typeof latestProfile.avatarUrl === 'string' ? latestProfile.avatarUrl : undefined;
        avatarStyle = typeof latestProfile.avatarStyle === 'string' ? latestProfile.avatarStyle : undefined;
        avatarSeed = typeof (latestProfile as any).avatarSeed === 'string' ? (latestProfile as any).avatarSeed : undefined;
        displayName = typeof latestProfile.displayName === 'string' ? latestProfile.displayName : undefined;
      }

      if (mp.isConnected && (avatarUrl !== undefined || avatarStyle !== undefined || avatarSeed !== undefined || displayName !== undefined)) {
        mp.updatePlayerAvatar(mpRoomRef.current?.id || '', {
          avatarUrl,
          avatarStyle,
          avatarSeed,
          displayName
        });
      }
    };

    const handleAuthChanged = () => {
      setCurrentUser(getCurrentUserProfile());
    };

    window.addEventListener('bugshot_profile_updated', handleProfileUpdated);
    window.addEventListener('bugshot_auth_state_changed', handleAuthChanged);
    return () => {
      window.removeEventListener('bugshot_profile_updated', handleProfileUpdated);
      window.removeEventListener('bugshot_auth_state_changed', handleAuthChanged);
    };
  }, [mp.isConnected, mp.updatePlayerAvatar]);

  // Enable VirtualKeyboard overlaysContent if available
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'virtualKeyboard' in navigator) {
      // @ts-ignore
      navigator.virtualKeyboard.overlaysContent = true;
    }
  }, []);

  // Try to initialize audio ASAP (will only succeed if browser allows)
  useEffect(() => {
    audioManager.initialize().then(() => {
      // If successful, ensure menu music starts immediately without waiting for state update cycle
      audioManager.playMusic('menu');
    }).catch(() => { });
  }, []);

  // Preload all 3D GLB models immediately on mount to cache them in memory
  useEffect(() => {
    preloadAllModels().catch((err) => {
      console.error("[Preloader] Failed to preload 3D models:", err);
    });
  }, []);

  // Handle direct url invite link joining if name is already cached AND user is logged in
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    if (roomId && /^[0-9]{4}$/.test(roomId)) {
      const loggedInUser = localStorage.getItem('aadish_roulette_logged_in_user');
      const cachedName = localStorage.getItem('aadish_roulette_name');
      if (loggedInUser && cachedName && cachedName.trim().length > 0) {
        spGame.setPlayerName(cachedName.trim());
        setAppState('LOADING_MP');
        mp.connect(cachedName.trim());
      }
    }
  }, []);

  // --- ORIENTATION CHECK (strict horizontal enforcement from first paint) ---
  const checkIsPortraitLocked = useCallback(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    const isDiscord =
      params.has('frame_id') ||
      params.has('instance_id') ||
      window.location.search.includes('platform=') ||
      window.location.hostname.includes('discordsays.com');
    if (isDiscord) return false;
    const isPortrait = window.innerHeight > window.innerWidth;
    const hasTouch =
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
      'ontouchstart' in window ||
      (navigator.maxTouchPoints || 0) > 0;
    const isCompactViewport = window.innerWidth < 1024;
    return isPortrait && (hasTouch || isCompactViewport);
  }, []);

  const [showRotateWarning, setShowRotateWarning] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    const isDiscord =
      params.has('frame_id') ||
      params.has('instance_id') ||
      window.location.search.includes('platform=') ||
      window.location.hostname.includes('discordsays.com');
    if (isDiscord) return false;
    const isPortrait = window.innerHeight > window.innerWidth;
    const hasTouch =
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
      'ontouchstart' in window ||
      (navigator.maxTouchPoints || 0) > 0;
    return isPortrait && (hasTouch || window.innerWidth < 1024);
  });
  const [isMobileNameTag, setIsMobileNameTag] = useState(false);

  const lockLandscapeFullscreen = useCallback(async () => {
    try {
      const docEl = document.documentElement as any;
      if (!document.fullscreenElement && docEl?.requestFullscreen) {
        await docEl.requestFullscreen().catch(() => {});
      } else if (!(document as any).webkitFullscreenElement && docEl?.webkitRequestFullscreen) {
        docEl.webkitRequestFullscreen();
      }
    } catch {}
    try {
      const orientation = (screen as any)?.orientation;
      if (orientation && typeof orientation.lock === 'function') {
        await orientation.lock('landscape').catch(() => {});
      }
    } catch {}
    setShowRotateWarning(checkIsPortraitLocked());
  }, [checkIsPortraitLocked]);

  useEffect(() => {
    const updateMobileTagState = () => {
      if (typeof window === 'undefined') return;
      const isMobile = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : window.innerWidth < 950;
      setIsMobileNameTag(isMobile || window.innerWidth < 950);
    };

    updateMobileTagState();
    window.addEventListener('resize', updateMobileTagState);
    return () => window.removeEventListener('resize', updateMobileTagState);
  }, []);

  // --- DISCORD SDK HANDSHAKE ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isDiscord = params.has('frame_id') || params.has('instance_id') || window.location.search.includes('platform=') || window.location.hostname.includes('discordsays.com');

    if (isDiscord && params.has('frame_id')) {
      const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
      if (!clientId) {
        console.error("[Discord] VITE_DISCORD_CLIENT_ID environment variable is missing!");
        return;
      }
      console.log(`[Discord] Initializing SDK with client ID: ${clientId}`);
      try {
        const discordSdk = new DiscordSDK(clientId);
        let isAuthenticated = false;
        const sessionStartTime = Date.now();

      const initDiscord = async () => {
        try {
          await discordSdk.ready();
          console.log("[Discord] SDK is ready!");

          // 1. Authorize with scope permissions
          const { code } = await discordSdk.commands.authorize({
            client_id: clientId,
            response_type: "code",
            state: "",
            prompt: "none",
            scope: ["identify", "rpc.activities.write"],
          });

          // 2. Exchange code on backend server
          const tokenRes = await fetch(`${SERVER_URL}/api/token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code })
          });

          if (!tokenRes.ok) {
            throw new Error(`Token exchange failed: ${tokenRes.status} ${tokenRes.statusText}`);
          }

          const { access_token } = await tokenRes.json();

          // 3. Authenticate
          await discordSdk.commands.authenticate({
            access_token,
          });

          isAuthenticated = true;
          console.log("[Discord] SDK authenticated successfully!");

          // Register global updater function
          window.updateDiscordActivity = async (details: string, state?: string) => {
            if (!isAuthenticated) return;
            try {
              await discordSdk.commands.setActivity({
                activity: {
                  type: 0, // Playing
                  details: details.substring(0, 127),
                  state: state ? state.substring(0, 127) : "",
                  assets: {
                    large_image: "banner",
                    large_text: "Bugshot Roulette",
                    small_image: "favicon",
                    small_text: "A Deadly Game of Chance"
                  },
                  timestamps: {
                    start: sessionStartTime
                  }
                }
              });
            } catch (err) {
              console.error("[Discord] Failed to update setActivity:", err);
            }
          };

          // Set initial menu status
          window.updateDiscordActivity("In Main Menu", "Preparing to bind soul...");

        } catch (err) {
          console.error("[Discord] SDK authorization/authentication failed:", err);
        }
      };

      initDiscord();
      } catch (err) {
        console.error("[Discord] SDK constructor initialization failed:", err);
      }
    }
  }, []);

  useEffect(() => {
    const syncOrientation = () => {
      setShowRotateWarning(checkIsPortraitLocked());
    };

    syncOrientation();

    // Attempt immediate passive landscape lock when supported (installed PWA / fullscreen)
    try {
      const orientation = (screen as any)?.orientation;
      if (orientation && typeof orientation.lock === 'function') {
        orientation.lock('landscape').catch(() => {});
      }
    } catch {}

    const mql = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(orientation: portrait)') : null;
    window.addEventListener('resize', syncOrientation);
    window.addEventListener('orientationchange', syncOrientation);
    if (mql) {
      if (mql.addEventListener) mql.addEventListener('change', syncOrientation);
      else if ((mql as any).addListener) (mql as any).addListener(syncOrientation);
    }

    return () => {
      window.removeEventListener('resize', syncOrientation);
      window.removeEventListener('orientationchange', syncOrientation);
      if (mql) {
        if (mql.removeEventListener) mql.removeEventListener('change', syncOrientation);
        else if ((mql as any).removeListener) (mql as any).removeListener(syncOrientation);
      }
    };
  }, [checkIsPortraitLocked]);

  // For loot overlay
  const effectiveShowLootOverlay = spGame.showLootOverlay;
  const effectiveReceivedItems = spGame.receivedItems as import('./types').ItemType[];

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [abortedByName, setAbortedByName] = useState<string | null>(null);
  const [nameTags, setNameTags] = useState<{ name: string, x: number, y: number, visible: boolean }[]>([]);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isScoreboardOpen, setIsScoreboardOpen] = useState(false);
  const [showPerformancePopup, setShowPerformancePopup] = useState(false);
  const [detectedLowFps, setDetectedLowFps] = useState(0);

  const [settings, setSettings] = useState<GameSettings>(() => {
    const saved = localStorage.getItem('aadish_roulette_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Always reset debug mode on fresh session
        parsed.debugMode = false;
        return parsed;
      } catch (e) { }
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    localStorage.setItem('aadish_roulette_settings', JSON.stringify(settings));
    audioManager.updateVolumes(settings);

  }, [settings]);

  // Handle Music Logic
  useEffect(() => {
    if (appState === 'MENU') {
      audioManager.playMusic('menu');
    } else if (appState === 'GAME') {
      const phase = spGame.gameState.phase;
      if (phase === 'GAME_OVER') {
        const isMultiWin = spGame.gameState.winner === 'PLAYER' && (spGame.gameState.isThreePlayer || spGame.gameState.isFourPlayer);
        if (isMultiWin) {
          audioManager.playJackpotIntro();
        } else {
          audioManager.playMusic('endscreen');
        }
      } else if (phase === 'INTRO' || phase === 'BOOT') {
        audioManager.playMusic('menu');
      } else {
        audioManager.playMusic('gameplay');
      }
    }
  }, [appState, spGame.gameState.phase, spGame.gameState.winner, spGame.gameState.isThreePlayer, spGame.gameState.isFourPlayer]);

  const [isHardModeSelected, setIsHardModeSelected] = useState(false);
  const pendingSplitConfigRef = useRef<LocalSplitConfig | null>(null);
  const lastSplitConfigRef = useRef<LocalSplitConfig | null>(null);

  // Verified tactical stickers list (preloaded lazily without blind HTTP HEAD probing)
  const stickersList = useMemo(() => [...TACTICAL_STICKERS], []);
  const stickersPreloadedRef = useRef(false);
  useEffect(() => {
    if ((appState !== 'LOADING_MP' && appState !== 'LOBBY') || stickersPreloadedRef.current) return;
    const timer = setTimeout(() => {
      stickersPreloadedRef.current = true;
      TACTICAL_STICKERS.forEach((stk) => {
        const img = new Image();
        img.src = `/sticker/${stk}`;
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [appState]);

  // Dealer AI only for singleplayer (disabled in Multiplayer & Local Split)
  useDealerAI({
    gameState: spGame.gameState,
    dealer: spGame.dealer,
    player: spGame.player,
    knownShell: spGame.knownShell,
    animState: spGame.animState,
    fireShot: spGame.fireShot,
    processItemEffect: spGame.processItemEffect,
    setDealer: spGame.setDealer,
    setPlayer: spGame.setPlayer,
    setTargetAim: spGame.setAimTarget,
    setCameraView: spGame.setCameraView,
    setOverlayText: spGame.setOverlayText,
    isMultiplayer: Boolean(spGame.gameState.isMultiplayer || spGame.gameState.isLocalSplit),
    isProcessing: spGame.isProcessing,
    setIsProcessing: spGame.setIsProcessing,
    selectTarotCard: spGame.selectTarotCard
  });

  const handleResetSettings = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  const handleBootComplete = useCallback(() => {
    spGameRef.current.setGamePhase('INTRO');
    audioManager.playMusic('menu');
  }, []);

  const handleStartSP = useCallback((name: string, hardMode: boolean = false) => {
    pendingSplitConfigRef.current = null;
    setIsHardModeSelected(hardMode);
    if (name) spGameRef.current.setPlayerName(name);

    audioManager.stopMusic();
    setAppState('LOADING_SP');
  }, []);

  const handleStartLocalSplit = useCallback((config: LocalSplitConfig) => {
    pendingSplitConfigRef.current = config;
    lastSplitConfigRef.current = config;
    setIsHardModeSelected(false);
    spGameRef.current.setPlayerName(config.player1Name);
    // Pre-flag isLocalSplit before ThreeScene mounts during LOADING_SP so dual dealer.glb avatars spawn immediately
    spGameRef.current.setGameState(prev => ({
      ...prev,
      isLocalSplit: true,
      isMultiplayer: false,
      isThreePlayer: false,
      isFourPlayer: false,
      player1Name: config.player1Name,
      opponentName: config.player2Name,
      localSplitConfig: config,
    }));
    audioManager.stopMusic();
    setAppState('LOADING_SP');
  }, []);

  const handleStartMP = useCallback((name: string) => {
    pendingSplitConfigRef.current = null;
    spGameRef.current.setPlayerName(name);
    setAppState('LOADING_MP');
    mp.connect(name);
  }, [mp.connect]);

  // Broadcast local actions to server
  const handleFireShot = useCallback(async (target: TurnOwner) => {
    const game = spGameRef.current;
    const currentRoom = mpRoomRef.current;
    const currentPlayerId = mpPlayerIdRef.current;
    if (game.gameState.phase !== 'PLAYER_TURN' && game.gameState.phase !== 'DEALER_TURN' && game.gameState.phase !== 'PLAYER3_TURN' && game.gameState.phase !== 'RESOLVING') return;
    const isSplitHumanDealer = Boolean(game.gameState.isLocalSplit) && game.gameState.turnOwner === 'DEALER';
    if (game.gameState.turnOwner !== 'PLAYER' && !isSplitHumanDealer) return;
    if (game.isProcessing) return;

    const activeShooter: TurnOwner = isSplitHumanDealer ? 'DEALER' : 'PLAYER';
    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    const isMultiPlayerGame = game.gameState.isThreePlayer || game.gameState.isFourPlayer;
    const playersList = currentRoom?.players || [];
    const myId = currentPlayerId || '';
    const opponentId = playersList.find((p: any) => p.id !== myId)?.id;

    if (isMultiPlayerGame) {
      const myIndex = playersList.findIndex((p: any) => p.id === myId);
      const playerCount = playersList.length;

      let targetPlayerId = myId;
      if (target === 'DEALER') targetPlayerId = playersList[(myIndex + 2) % playerCount]?.id || myId;
      else if (target === 'PLAYER3') targetPlayerId = playersList[(myIndex + 1) % playerCount]?.id || myId;
      else if (target === 'PLAYER4') targetPlayerId = playersList[(myIndex + 3) % playerCount]?.id || myId;

      const intendedAim: AimTarget = target === 'PLAYER'
        ? 'SELF'
        : (target === 'PLAYER3' ? 'LEFT' : (target === 'PLAYER4' ? 'RIGHT' : 'OPPONENT'));
      if (isMobile && game.aimTarget !== intendedAim) {
        game.setAimTarget(intendedAim);
        game.setCameraView('GUN');
        if (currentRoom) {
          mp.sendImmediateAction(currentRoom.id, { type: 'HOVER_TARGET', target: intendedAim, targetId: targetPlayerId });
        }
        return;
      }

      if (currentRoom) {
        mp.sendImmediateAction(currentRoom.id, { type: 'SHOOT', shooterId: myId, targetId: targetPlayerId, target });
      }
      await game.fireShot('PLAYER', target);
      return;
    }

    const intendedAim: AimTarget = target === activeShooter ? 'SELF' : 'OPPONENT';
    const hoverTargetId = target === 'PLAYER' ? myId : opponentId;

    if (isMobile && game.aimTarget !== intendedAim) {
      game.setAimTarget(intendedAim);
      game.setCameraView('GUN');
      
      if (appStateRef.current === 'GAME' && game.gameState.isMultiplayer && currentRoom) {
        mp.sendImmediateAction(currentRoom.id, { type: 'HOVER_TARGET', target: intendedAim, targetId: hoverTargetId });
      }
      return;
    }

    if (appStateRef.current === 'GAME' && game.gameState.isMultiplayer && currentRoom) {
      mp.sendImmediateAction(currentRoom.id, { type: 'SHOOT', shooter: 'PLAYER', target, targetId: hoverTargetId });
    }
    await game.fireShot(activeShooter, target);
  }, [mp.sendImmediateAction]);

  const handleUseItem = useCallback(async (index: number, targetPlayerId?: string) => {
    const game = spGameRef.current;
    const currentRoom = mpRoomRef.current;
    const currentPlayerId = mpPlayerIdRef.current;
    if (appStateRef.current === 'GAME' && game.gameState.isMultiplayer) {
      if (game.gameState.turnOwner !== 'PLAYER') return;
      const item = game.player.items[index];
      
      let deckCards: string[] | undefined;
      let jackpotOutcome: 'JACKPOT' | 'NORMAL' | 'LOSE' | undefined;
      let crushIndex: number | undefined;
      let contractLoot: string[] | undefined;
      let phoneFutureIndex: number | undefined;

      const isThreePlayer = game.gameState.isThreePlayer;

      if (item === 'DECK_CARD') {
        const allTarotNames = [
          'The Magician', 'The Hanged Man', 'The Hermit', 'The Moon', 'Judgment',
          'Wheel of Fortune', 'The Sun', 'Death', 'The Tower', 'The Fool', 'Justice', 'Temperance'
        ];
        const shuffled = [...allTarotNames].sort(() => Math.random() - 0.5);
        deckCards = shuffled.slice(0, 6);
      } else if (item === 'JACKPOT') {
        jackpotOutcome = resolveJackpotOutcome();
        if (jackpotOutcome === 'JACKPOT' && currentRoom) {
          mp.sendMessage(currentRoom.id, '[STICKER]:sticker9.gif');
        }
      } else if (item === 'CRUSHER') {
        if (isThreePlayer) {
          const playersList = currentRoom?.players || [];
          const myId = currentPlayerId || '';
          
          const resolveTargetOwner = (targetId: string, localPlayerId: string, players: any[]): TurnOwner => {
            if (targetId === localPlayerId) return 'PLAYER';
            const myIndex = players.findIndex(p => p.id === localPlayerId);
            const size = players.length;
            if (myIndex === -1) return 'DEALER';
            const frontOpponent = players[(myIndex + 2) % size];
            const leftOpponent = players[(myIndex + 1) % size];
            const rightOpponent = size >= 4 ? players[(myIndex + 3) % size] : null;
            
            if (frontOpponent && targetId === frontOpponent.id) return 'DEALER';
            if (leftOpponent && targetId === leftOpponent.id) return 'PLAYER3';
            if (rightOpponent && targetId === rightOpponent.id) return 'PLAYER4';
            return 'DEALER';
          };

          const targetOwner = targetPlayerId ? resolveTargetOwner(targetPlayerId, myId, playersList) : 'DEALER';
          const targetState = targetOwner === 'PLAYER3' ? game.player3 : (targetOwner === 'PLAYER4' ? game.player4 : game.dealer);
          if (targetState && targetState.items.length > 0) {
            crushIndex = Math.floor(Math.random() * targetState.items.length);
          }
        } else {
          if (game.dealer.items.length > 0) {
            crushIndex = Math.floor(Math.random() * game.dealer.items.length);
          }
        }
      } else if (item === 'CONTRACT') {
        const activeCharms = game.player.luckycharmsUsed || 0;
        const highTier = ['CHOKE', 'CIGS', 'SAW', 'GLASS', 'ADRENALINE'];
        const lowTier = ['BEER', 'PHONE', 'INVERTER', 'BIG_INVERTER', 'CUFFS'];
        const highWeight = 5 + (10 * activeCharms);
        const pool: string[] = [];
        highTier.forEach(i => {
          for (let w = 0; w < highWeight; w++) pool.push(i);
        });
        lowTier.forEach(i => pool.push(i));
        const item1 = pool[Math.floor(Math.random() * pool.length)];
        const item2 = pool[Math.floor(Math.random() * pool.length)];
        contractLoot = [item1, item2];
      } else if (item === 'PHONE') {
        const checkLimit = game.gameState.chamber.length;
        const current = game.gameState.currentShellIndex;
        const available = [];
        for (let i = current + 2; i < checkLimit; i++) {
          available.push(i);
        }
        if (available.length > 0) {
          phoneFutureIndex = available[Math.floor(Math.random() * available.length)];
        }
      }

      if (currentRoom) {
        mp.sendAction(currentRoom.id, {
          type: 'USE_ITEM',
          item,
          index,
          deckCards,
          jackpotOutcome,
          crushIndex,
          contractLoot,
          phoneFutureIndex,
          targetPlayerId
        });
      }
      await game.usePlayerItem(index, deckCards, jackpotOutcome, crushIndex, contractLoot as any, phoneFutureIndex, targetPlayerId);
    } else {
      await game.usePlayerItem(index, undefined, undefined, undefined, undefined, undefined, targetPlayerId);
    }
  }, [mp.sendAction, mp.sendMessage]);

  const handleCardClick = useCallback(async (index: number) => {
    const game = spGameRef.current;
    const currentRoom = mpRoomRef.current;
    if (appStateRef.current === 'GAME' && game.gameState.isMultiplayer) {
      if (game.gameState.turnOwner !== 'PLAYER') return;
      
      const cards = game.gameState.deckCards;
      const chosenCard = cards ? cards[index] : null;
      const cardRandoms: any = {};

      if (chosenCard) {
        if (chosenCard.name === 'The Magician') {
          const filteredItems = ACTIVE_ITEMS;
          cardRandoms.magicianItem = filteredItems[Math.floor(Math.random() * filteredItems.length)];
        } else if (chosenCard.name === 'Judgment') {
          cardRandoms.judgmentSuccess = Math.random() < 0.5;
        } else if (chosenCard.name === 'The Moon') {
          const oppItems = game.dealer.items;
          const stealableIndices = [];
          for (let i = 0; i < oppItems.length; i++) {
            if (oppItems[i] !== null && oppItems[i] !== 'TOTEM' && oppItems[i] !== 'JACKPOT') {
              stealableIndices.push(i);
            }
          }
          if (stealableIndices.length > 0) {
            cardRandoms.moonIndex = stealableIndices[Math.floor(Math.random() * stealableIndices.length)];
          }
        } else if (chosenCard.name === 'Death') {
          const myItems = game.player.items;
          const destructibleIndices = [];
          for (let i = 0; i < myItems.length; i++) {
            if (myItems[i] !== null) {
              destructibleIndices.push(i);
            }
          }
          if (destructibleIndices.length > 0) {
            cardRandoms.deathIndex = destructibleIndices[Math.floor(Math.random() * destructibleIndices.length)];
          }
        } else if (chosenCard.name === 'The Tower') {
          const oppItems = game.dealer.items;
          const destructibleIndices = [];
          for (let i = 0; i < oppItems.length; i++) {
            if (oppItems[i] !== null && oppItems[i] !== 'TOTEM') {
              destructibleIndices.push(i);
            }
          }
          if (destructibleIndices.length > 0) {
            cardRandoms.towerIndex = destructibleIndices[Math.floor(Math.random() * destructibleIndices.length)];
          }
        } else if (chosenCard.name === 'Wheel of Fortune') {
          const chamber = [...game.gameState.chamber];
          const idx = game.gameState.currentShellIndex;
          const remaining = chamber.slice(idx);
          if (remaining.length > 0) {
            const shuffledRemaining = [...remaining].sort(() => Math.random() - 0.5);
            for (let i = 0; i < shuffledRemaining.length; i++) {
              chamber[idx + i] = shuffledRemaining[i];
            }
            cardRandoms.wheelChamber = chamber;
          }
        }
      }

      if (currentRoom) {
        mp.sendAction(currentRoom.id, { type: 'SELECT_CARD', index, cardRandoms });
      }
      await game.selectTarotCard(index, cardRandoms);
    } else {
      await game.selectTarotCard(index);
    }
  }, [mp.sendAction]);

  const handlePickupGun = useCallback(() => {
    const game = spGameRef.current;
    const currentRoom = mpRoomRef.current;
    const activeOwner: TurnOwner = (game.gameState.isLocalSplit && game.gameState.turnOwner === 'DEALER') ? 'DEALER' : 'PLAYER';
    if (appStateRef.current === 'GAME' && game.gameState.isMultiplayer && currentRoom) {
      if (game.gameState.turnOwner !== 'PLAYER') return;
      mp.sendAction(currentRoom.id, { type: 'PICKUP_GUN' });
    }
    game.pickupGun(activeOwner);
  }, [mp.sendAction]);

  const handleStealItem = useCallback((index: number) => {
    const game = spGameRef.current;
    const currentRoom = mpRoomRef.current;
    if (game.isProcessing) return;
    if (game.gameState.phase !== 'STEALING') return;

    const activeOwner: TurnOwner = (game.gameState.isLocalSplit && game.gameState.turnOwner === 'DEALER') ? 'DEALER' : 'PLAYER';
    if (appStateRef.current === 'GAME' && game.gameState.isMultiplayer && currentRoom) {
      if (game.gameState.turnOwner !== 'PLAYER') return;
      mp.sendAction(currentRoom.id, { type: 'STEAL_ITEM', index });
    }
    game.stealItem(index, activeOwner);
  }, [mp.sendAction]);

  const handleHoverTarget = useCallback((target: AimTarget, targetId?: string) => {
    const game = spGameRef.current;
    const currentRoom = mpRoomRef.current;
    game.setAimTarget(target);
    if (appStateRef.current === 'GAME' && game.gameState.isMultiplayer && currentRoom) {
      if (game.gameState.turnOwner === 'PLAYER') {
        const now = Date.now();
        const last = lastHoverRef.current;
        if (last.target === target && last.targetId === targetId && now - last.time < 50) return;
        lastHoverRef.current = { target, targetId, time: now };
        mp.sendImmediateAction(currentRoom.id, { type: 'HOVER_TARGET', target, targetId });
      }
    }
  }, [mp.sendImmediateAction]);

  // Listen for remote actions
  useEffect(() => {
    if (appState === 'GAME' && spGame.gameState.isMultiplayer) {
      mp.setOnAction(async ({ playerId, action }) => {
        const game = spGameRef.current;
        const currentRoom = mpRoomRef.current;
        const myId = mpPlayerIdRef.current || '';
        if (playerId !== myId) {
          console.log('Received remote action:', action);

          const isMultiplayerSeat = game.gameState.isThreePlayer || game.gameState.isFourPlayer;
          const playersList = currentRoom?.players || [];

          const resolveTargetOwner = (targetPlayerId: string, localPlayerId: string, players: any[]): TurnOwner => {
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
              if (targetIndex === (myIndex + 2) % 4) return 'DEALER';
              if (targetIndex === (myIndex + 1) % 4) return 'PLAYER3';
              if (targetIndex === (myIndex + 3) % 4) return 'PLAYER4';
              return 'DEALER';
            }

            return 'DEALER';
          };

          const getPlayerSetter = (owner: TurnOwner) => {
            if (owner === 'PLAYER') return game.setPlayer;
            if (owner === 'PLAYER3') return game.setPlayer3;
            if (owner === 'PLAYER4') return game.setPlayer4;
            return game.setDealer;
          };

          if (isMultiplayerSeat) {
            const relSender = resolveTargetOwner(playerId, myId, playersList);
            switch (action.type) {
              case 'SHOOT': {
                const relTarget = resolveTargetOwner(action.targetId, myId, playersList);
                game.fireShot(relSender, relTarget);
                break;
              }
              case 'USE_ITEM': {
                const senderSetter = getPlayerSetter(relSender);
                senderSetter(d => {
                  const newItems = [...d.items];
                  const idx = action.index !== undefined ? action.index : newItems.indexOf(action.item);
                  if (idx !== -1) {
                    newItems.splice(idx, 1);
                  }
                  return { ...d, items: newItems };
                });
                await game.processItemEffect(relSender, action.item, action.deckCards, action.jackpotOutcome, action.crushIndex, action.contractLoot, action.phoneFutureIndex, action.targetPlayerId, false);
                break;
              }
              case 'PICKUP_GUN':
                game.pickupGun(relSender);
                break;
              case 'STEAL_ITEM':
                game.stealItem(action.index, relSender);
                break;
              case 'HOVER_TARGET': {
                let aim: AimTarget = action.target;
                const relTarget = action.targetId ? resolveTargetOwner(action.targetId, myId, playersList) : null;

                if (relSender === 'PLAYER3') {
                  if (relTarget === 'PLAYER3') aim = 'LEFT';
                  else if (relTarget === 'PLAYER') aim = 'SELF';
                  else if (relTarget === 'DEALER') aim = 'OPPONENT';
                  else if (relTarget === 'PLAYER4') aim = 'RIGHT';
                  else if (action.target === 'SELF') aim = 'LEFT';
                  else if (action.target === 'LEFT') aim = 'SELF';
                  else aim = 'OPPONENT';
                } else if (relSender === 'PLAYER4') {
                  if (relTarget === 'PLAYER4') aim = 'RIGHT';
                  else if (relTarget === 'PLAYER') aim = 'SELF';
                  else if (relTarget === 'DEALER') aim = 'OPPONENT';
                  else if (relTarget === 'PLAYER3') aim = 'LEFT';
                  else if (action.target === 'SELF') aim = 'RIGHT';
                  else aim = 'OPPONENT';
                } else if (relSender === 'DEALER') {
                  if (relTarget === 'DEALER') aim = 'SELF';
                  else if (relTarget === 'PLAYER') aim = 'OPPONENT';
                  else if (relTarget === 'PLAYER3') aim = 'LEFT';
                  else if (relTarget === 'PLAYER4') aim = 'RIGHT';
                  else if (action.target === 'SELF') aim = 'OPPONENT';
                  else if (action.target === 'OPPONENT') aim = 'SELF';
                }
                game.setAimTarget(aim);
                break;
              }
              case 'DEBUG_SYNC_THREE_PLAYER':
              case 'SYNC_THREE_PLAYER_STATE': {
                const senderIndex = playersList.findIndex((p: any) => p.id === playerId);
                if (senderIndex !== -1) {
                  const size = playersList.length;
                  const absoluteStates: any[] = [];
                  absoluteStates[senderIndex] = action.playerState;

                  if (size >= 4) {
                    absoluteStates[(senderIndex + 1) % 4] = action.player3State;
                    absoluteStates[(senderIndex + 2) % 4] = action.dealerState;
                    absoluteStates[(senderIndex + 3) % 4] = action.player4State;
                  } else {
                    absoluteStates[(senderIndex + 1) % 3] = action.player3State;
                    absoluteStates[(senderIndex + 2) % 3] = action.dealerState;
                  }
                  
                  const myIndex = playersList.findIndex((p: any) => p.id === myId);
                  if (myIndex !== -1) {
                    const myState = absoluteStates[myIndex];
                    let frontState = null;
                    let leftState = null;
                    let rightState = null;

                    if (size >= 4) {
                      frontState = absoluteStates[(myIndex + 2) % 4];
                      leftState = absoluteStates[(myIndex + 1) % 4];
                      rightState = absoluteStates[(myIndex + 3) % 4];
                    } else {
                      frontState = absoluteStates[(myIndex + 2) % 3];
                      leftState = absoluteStates[(myIndex + 1) % 3];
                    }
                    
                    if (myState) game.setPlayer(myState);
                    if (frontState) game.setDealer(frontState);
                    if (leftState) game.setPlayer3(leftState);
                    if (rightState) game.setPlayer4(rightState);

                    if (action.gameState) {
                      const relTurnOwner = resolveTargetOwner(action.gameState.turnOwnerId || action.gameState.turnOwner, myId, playersList);
                      const relWinner = action.gameState.winnerId ? resolveTargetOwner(action.gameState.winnerId, myId, playersList) : action.gameState.winner;
                      let nextPhase = action.gameState.phase;
                      if (action.gameState.phase === 'PLAYER_TURN' || action.gameState.phase === 'DEALER_TURN' || action.gameState.phase === 'PLAYER3_TURN' || action.gameState.phase === 'PLAYER4_TURN') {
                        nextPhase = relTurnOwner === 'PLAYER' ? 'PLAYER_TURN' : (relTurnOwner === 'PLAYER3' ? 'PLAYER3_TURN' : (relTurnOwner === 'PLAYER4' ? 'PLAYER4_TURN' : 'DEALER_TURN'));
                      }
                      game.setGameState(prev => {
                        const targetPhase = (prev.phase === 'STEALING' && prev.turnOwner === 'PLAYER') ? 'STEALING' : nextPhase;
                        return {
                          ...prev,
                          ...action.gameState,
                          localPlayerId: prev.localPlayerId,
                          opponentName: prev.opponentName,
                          multiplayerState: prev.multiplayerState,
                          turnOwner: relTurnOwner,
                          phase: targetPhase,
                          winner: relWinner
                        };
                      });
                    }
                  }
                }
                break;
              }
              case 'SYNC_THREE_PLAYER_ROUND': {
                const myIndex = playersList.findIndex((p: any) => p.id === myId);
                if (myIndex !== -1) {
                  const size = playersList.length;
                  const myItems = action[`items${myIndex}`] || [];
                  let frontItems = [];
                  let leftItems = [];
                  let rightItems = [];

                  if (size >= 4) {
                    frontItems = action[`items${(myIndex + 2) % 4}`] || [];
                    leftItems = action[`items${(myIndex + 1) % 4}`] || [];
                    rightItems = action[`items${(myIndex + 3) % 4}`] || [];
                  } else {
                    frontItems = action[`items${(myIndex + 2) % 3}`] || [];
                    leftItems = action[`items${(myIndex + 1) % 3}`] || [];
                  }

                  const nextHp = action.hp;

                  if (action.resetItems) {
                    game.setPlayer(p => ({ ...p, hp: nextHp, maxHp: nextHp, items: myItems }));
                    game.setDealer(d => ({ ...d, hp: nextHp, maxHp: nextHp, items: frontItems }));
                    game.setPlayer3(p3 => ({ ...p3, hp: nextHp, maxHp: nextHp, items: leftItems }));
                    if (size >= 4) {
                      game.setPlayer4(p4 => ({ ...p4, hp: nextHp, maxHp: nextHp, items: rightItems }));
                    }
                  } else {
                    game.setPlayer3(p3 => ({ ...p3, items: [...p3.items, ...leftItems].slice(0, 8) }));
                    if (size >= 4) {
                      game.setPlayer4(p4 => ({ ...p4, items: [...p4.items, ...rightItems].slice(0, 8) }));
                    }
                  }

                  if (action.threePlayerWins) {
                    game.setGameState(prev => ({ ...prev, threePlayerWins: action.threePlayerWins }));
                  }
                  if (action.fourPlayerWins) {
                    game.setGameState(prev => ({ ...prev, fourPlayerWins: action.fourPlayerWins }));
                  }

                  const relTurnOwner = resolveTargetOwner(action.nextTurnOwnerId, myId, playersList);
                  game.setOverlayText(action.resetItems ? `ROUND ${action.roundNum || 1}` : 'RELOADING NEW BATCH...');

                  game.startRound(
                      action.resetItems || false,
                      false,
                      undefined,
                      action.chamber,
                      action.resetItems ? myItems : [...game.player.items, ...myItems].slice(0, 8),
                      action.resetItems ? frontItems : [...game.dealer.items, ...frontItems].slice(0, 8),
                      relTurnOwner,
                      action.hp,
                      undefined,
                      action.resetItems ? leftItems : [...game.player3.items, ...leftItems].slice(0, 8),
                      action.resetItems ? rightItems : [...game.player4.items, ...rightItems].slice(0, 8)
                  );
                }
                break;
              }
            }
            return;
          }

          switch (action.type) {
            case 'SHOOT': {
              const targetOwner = action.targetId && currentRoom?.players
                ? resolveTargetOwner(action.targetId, myId, currentRoom.players)
                : (action.target === 'PLAYER' ? 'PLAYER' : 'DEALER');
              game.setAimTarget(targetOwner === 'PLAYER' ? 'SELF' : 'OPPONENT');
              game.fireShot('DEALER', targetOwner);
              break;
            }
            case 'USE_ITEM':
              game.setDealer(d => {
                const newItems = [...d.items];
                const idx = action.index !== undefined ? action.index : newItems.indexOf(action.item);
                if (idx !== -1) {
                  newItems.splice(idx, 1);
                }
                return { ...d, items: newItems };
              });
              await game.processItemEffect('DEALER', action.item, action.deckCards, action.jackpotOutcome, action.crushIndex, action.contractLoot, action.phoneFutureIndex);
              break;
            case 'SELECT_CARD':
              game.selectTarotCard(action.index, action.cardRandoms);
              break;
            case 'PICKUP_GUN':
              game.pickupGun('DEALER');
              break;
            case 'STEAL_ITEM':
              game.stealItem(action.index, 'DEALER');
              break;
            case 'HOVER_TARGET': {
              let remoteAim: AimTarget = action.target;
              if (action.targetId && currentRoom?.players) {
                const relTarget = resolveTargetOwner(action.targetId, myId, currentRoom.players);
                remoteAim = relTarget === 'DEALER' ? 'SELF' : 'OPPONENT';
              }
              game.setAimTarget(remoteAim);
              break;
            }
            case 'SYNC_ROUND': {
              const iAmHost = myId === (currentRoom?.hostId || '');
              game.setOverlayText(action.resetItems ? `ROUND ${(action.roundNum || 1)}` : 'RELOADING NEW BATCH...');
              const pItems = iAmHost ? action.hostItems : action.clientItems;
              const dItems = iAmHost ? action.clientItems : action.hostItems;
              const clientNextTurn = action.nextTurnOwner === 'PLAYER' ? 'DEALER' : 'PLAYER';
              // @ts-ignore
              await game.startRound(action.resetItems || false, false, undefined, action.chamber, pItems, dItems, clientNextTurn, action.hp);
              break;
            }
            case 'DEBUG_SYNC_PLAYER':
              game.setDealer(action.player);
              break;
            case 'DEBUG_SYNC_PLAYER_MODEL': {
              // Transient model override from a remote dev client — do not persist
              game.setGameState(prev => {
                const mpState = (prev.multiplayerState as any) || {};
                const debugKey = action.playerId ?? (action.playerIndex !== undefined ? action.playerIndex : undefined);
                const nextMpState = {
                  ...mpState,
                  debugPlayerModels: {
                    ...((mpState as any).debugPlayerModels || {}),
                    ...(debugKey !== undefined ? { [debugKey]: action.modelKey } : {})
                  }
                };
                return { ...prev, multiplayerState: nextMpState } as any;
              });
              break;
            }
            case 'DEBUG_SYNC_DEALER':
              game.setPlayer(action.dealer);
              break;
            case 'DEBUG_SYNC_GAMESTATE': {
              const invGameState = { ...action.gameState };
              if (action.gameState.turnOwner) {
                invGameState.turnOwner = action.gameState.turnOwner === 'PLAYER' ? 'DEALER' : 'PLAYER';
              }
              if (action.gameState.phase) {
                if (action.gameState.phase === 'PLAYER_TURN') invGameState.phase = 'DEALER_TURN';
                else if (action.gameState.phase === 'DEALER_TURN') invGameState.phase = 'PLAYER_TURN';
              }
              if (action.gameState.winner) {
                invGameState.winner = action.gameState.winner === 'PLAYER' ? 'DEALER' : 'PLAYER';
              }
              game.setGameState(prev => ({
                ...prev,
                ...invGameState,
                localPlayerId: prev.localPlayerId,
                multiplayerState: prev.multiplayerState,
                opponentName: prev.opponentName,
                isMultiplayer: prev.isMultiplayer,
                isThreePlayer: prev.isThreePlayer,
                isFourPlayer: prev.isFourPlayer,
                roomSettings: prev.roomSettings
              }));
              break;
            }
            case 'SYNC_MP_GAME_OVER': {
              const resolvedWinner = myId === currentRoom?.hostId
                ? action.winner
                : (action.winner === 'PLAYER' ? 'DEALER' : 'PLAYER');

              game.setGameState(prev => ({
                ...prev,
                winner: resolvedWinner,
                phase: 'GAME_OVER',
                multiModeState: action.multiModeState || prev.multiModeState
              }));
              break;
            }
            case 'SYNC_STATE': {
              // Deep sync if host tells us the ground truth
              // CRITICAL: We must invert the perspective for the remote player
              const invertedGameState = { ...action.gameState };
              if (action.gameState.turnOwner) {
                invertedGameState.turnOwner = action.gameState.turnOwner === 'PLAYER' ? 'DEALER' : 'PLAYER';
              }
              if (action.gameState.phase) {
                if (action.gameState.phase === 'PLAYER_TURN') invertedGameState.phase = 'DEALER_TURN';
                else if (action.gameState.phase === 'DEALER_TURN') invertedGameState.phase = 'PLAYER_TURN';
              }
              if (action.gameState.winner) {
                invertedGameState.winner = action.gameState.winner === 'PLAYER' ? 'DEALER' : 'PLAYER';
              }

              // Correct opponentName sync: opponent for client is host
              const host = currentRoom?.players?.find((p: any) => p.id === currentRoom.hostId);
              invertedGameState.opponentName = host ? host.name : 'OPPONENT';

              game.syncState({
                player: action.player2State, // Remote's player 2 (our local player)
                dealer: action.player1State, // Remote's player 1 (host / our dealer)
                gameState: invertedGameState
              });
              break;
            }
          }
        }
      });
      return () => {
        mp.setOnAction(() => {});
      };
    }
  }, [appState, spGame.gameState.isMultiplayer, mp.setOnAction]);

  useEffect(() => {
    if (mp.isConnected && appState === 'LOADING_MP') {
      if (initialRoomId && /^[0-9]{4}$/.test(initialRoomId)) {
        mp.joinRoom(initialRoomId, spGameRef.current.playerName);
        window.history.replaceState({}, document.title, window.location.pathname);
        setInitialRoomId(null);
      } else {
        setAppState('MP_SELECTION');
      }
    }
  }, [mp.isConnected, appState, initialRoomId, mp.joinRoom]);

  useEffect(() => {
    if (mp.room && (appState === 'MP_SELECTION' || appState === 'LOADING_MP')) {
      setAppState('LOBBY');
    } else if (appState === 'LOBBY' && !mp.room) {
      setAppState('MP_SELECTION');
    }
  }, [mp.room, appState]);

  useEffect(() => {
    if (!mp.isConnected || !mp.socket) return;
    const activeSocket = mp.socket;

    const handleGameStarted = ({ room, gameData }: { room: any, gameData: any }) => {
      console.log('Multiplayer game starting...', room, gameData);
      const game = spGameRef.current;
      const myId = mpPlayerIdRef.current || '';
      const playerCount = room.players?.length || 2;
      const isMulti = playerCount >= 3;
      const iAmHost = myId === room.hostId;

      const resolveTargetOwner = (targetPlayerId: string, localPlayerId: string, players: any[]): TurnOwner => {
        if (targetPlayerId === localPlayerId) return 'PLAYER';
        const myIndex = players.findIndex(p => p.id === localPlayerId);
        const size = players.length;
        if (myIndex === -1) return 'DEALER';
        const frontOpponent = players[(myIndex + 2) % size];
        const leftOpponent = players[(myIndex + 1) % size];
        const rightOpponent = size >= 4 ? players[(myIndex + 3) % size] : null;
        
        if (frontOpponent && targetPlayerId === frontOpponent.id) return 'DEALER';
        if (leftOpponent && targetPlayerId === leftOpponent.id) return 'PLAYER3';
        if (rightOpponent && targetPlayerId === rightOpponent.id) return 'PLAYER4';
        return 'DEALER';
      };

      if (isMulti) {
        const myIndex = room.players.findIndex((p: any) => p.id === myId);
        const myItems = gameData[`items${myIndex}`] || [];
        const frontItems = gameData[`items${(myIndex + 2) % playerCount}`] || [];
        const leftItems = gameData[`items${(myIndex + 1) % playerCount}`] || [];
        const rightItems = playerCount >= 4 ? gameData[`items${(myIndex + 3) % playerCount}`] : [];

        const frontOpponent = room.players[(myIndex + 2) % playerCount];
        const opponentName = frontOpponent ? frontOpponent.name : 'OPPONENT';

        const initialTurnOwnerId = room.players[0].id;
        const initialTurnOwner = resolveTargetOwner(initialTurnOwnerId, myId, room.players);

        setAppState('LOADING_GAME');

        if (gameStartTimeoutRef.current) clearTimeout(gameStartTimeoutRef.current);
        gameStartTimeoutRef.current = setTimeout(() => {
          gameStartTimeoutRef.current = null;
          const latestGame = spGameRef.current;
          latestGame.setPlayer3({ hp: gameData.hpOverride, maxHp: gameData.hpOverride, items: leftItems, isHandcuffed: false, isSawedActive: false });
          if (playerCount >= 4) {
            latestGame.setPlayer4({ hp: gameData.hpOverride, maxHp: gameData.hpOverride, items: rightItems, isHandcuffed: false, isSawedActive: false });
          }
          latestGame.startGame(
            latestGame.playerName,
            false,
            true,
            opponentName,
            initialTurnOwner,
            gameData.chamber,
            myItems,
            frontItems,
            gameData.hpOverride,
            room.settings,
            leftItems,
            rightItems
          );

          latestGame.setGameState(prev => ({
              ...prev,
              isThreePlayer: playerCount === 3,
              isFourPlayer: playerCount === 4,
              localPlayerId: mpPlayerIdRef.current || myId,
              turnOwner: initialTurnOwner,
              multiplayerState: room
            }));
          }, 100);
        return;
      }

      const opponent = room.players.find((p: any) => p.id !== myId);
      const opponentName = opponent ? opponent.name : 'OPPONENT';

      const chamberOverride = gameData.chamber;
      const pItemsOverride = iAmHost ? gameData.hostItems : gameData.clientItems;
      const dItemsOverride = iAmHost ? gameData.clientItems : gameData.hostItems;

      let initialTurnOwner: import('./types').TurnOwner = 'PLAYER';
      if (gameData.hostStarts) {
        initialTurnOwner = iAmHost ? 'PLAYER' : 'DEALER';
      } else {
        initialTurnOwner = iAmHost ? 'DEALER' : 'PLAYER';
      }

      setAppState('LOADING_GAME');

      if (gameStartTimeoutRef.current) clearTimeout(gameStartTimeoutRef.current);
      gameStartTimeoutRef.current = setTimeout(() => {
        gameStartTimeoutRef.current = null;
        const latestGame = spGameRef.current;
        latestGame.startGame(
          latestGame.playerName,
          false, // hardMode
          true, // isMultiplayer
          opponentName,
          initialTurnOwner,
          chamberOverride,
          pItemsOverride,
          dItemsOverride,
          gameData.hpOverride, // Apply HP from settings
          room.settings
        );
        latestGame.setGameState(prev => ({
          ...prev,
          localPlayerId: mpPlayerIdRef.current || myId,
          multiplayerState: room
        }));
      }, 100);
    };

    const handleMatchReset = () => {
      console.log('Multiplayer match reset by host, returning to lobby...');
      if (gameStartTimeoutRef.current) {
        clearTimeout(gameStartTimeoutRef.current);
        gameStartTimeoutRef.current = null;
      }
      lastTotalWins.current = 0;
      setAbortedByName(null);
      setNameTags([]);
      spGameRef.current.resetGame(true); // Reset game states cleanly
      setAppState('LOBBY');   // Route back to lobby view
    };

    const handleKicked = () => {
      if (gameStartTimeoutRef.current) {
        clearTimeout(gameStartTimeoutRef.current);
        gameStartTimeoutRef.current = null;
      }
      setAbortedByName(null);
      setNameTags([]);
      setAppState('MP_SELECTION');
    };

    const handleMatchAborted = ({ abortedBy }: { abortedBy: string }) => {
      console.log(`Multiplayer match aborted: ${abortedBy} disconnected.`);
      setAbortedByName(abortedBy);
    };

    activeSocket.on('gameStarted', handleGameStarted);
    activeSocket.on('matchReset', handleMatchReset);
    activeSocket.on('kicked', handleKicked);
    activeSocket.on('matchAborted', handleMatchAborted);

    return () => {
      activeSocket.off('gameStarted', handleGameStarted);
      activeSocket.off('matchReset', handleMatchReset);
      activeSocket.off('kicked', handleKicked);
      activeSocket.off('matchAborted', handleMatchAborted);
    };
  }, [mp.isConnected, mp.socket]);

  // Shared utility: Generate a randomized chamber and item batches for multiplayer rounds
  const generateMPBatch = useCallback((settings: any, playerCount: number, hostCharms: number = 0, clientCharms: number = 0) => {
    const total = randomInt(2, 8);
    const maxLives = Math.floor(total / 2);
    let lives = randomInt(1, maxLives);
    if (lives < maxLives && Math.random() > 0.4) lives = maxLives;
    const blanks = total - lives;

    const chamber = [...Array(lives).fill('LIVE'), ...Array(blanks).fill('BLANK')] as ShellType[];
    for (let i = chamber.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [chamber[i], chamber[j]] = [chamber[j], chamber[i]];
    }

    let itemsCount = settings.itemsPerShipment;
    if (settings.itemsPerShipment === 9) {
      // Weighted roll: 1 (5%), 2 (25%), 3 (25%), 4 (20%), 5 (15%), 6 (7%), 7 (2.5%), 8 (0.5%)
      const r = Math.random();
      if (r < 0.05) itemsCount = 1;
      else if (r < 0.30) itemsCount = 2;
      else if (r < 0.55) itemsCount = 3;
      else if (r < 0.75) itemsCount = 4;
      else if (r < 0.90) itemsCount = 5;
      else if (r < 0.97) itemsCount = 6;
      else if (r < 0.995) itemsCount = 7;
      else itemsCount = 8;
    }
    const hostItems = generateLootBatch(itemsCount, false, false, 4, [], hostCharms, 4, 4, settings, playerCount);
    const clientItems = generateLootBatch(itemsCount, false, false, 4, [], clientCharms, 4, 4, settings, playerCount);

    return { chamber, hostItems, clientItems, lives, blanks };
  }, []);

  const generateMultiPlayerBatch = useCallback((settings: any, playerCharms: number[], playerCount: number) => {
      const total = randomInt(2, 8);
      const maxLives = Math.floor(total / 2);
      let lives = randomInt(1, maxLives);
      if (lives < maxLives && Math.random() > 0.4) lives = maxLives;
      const blanks = total - lives;

      const chamber: ShellType[] = [];
      for (let i = 0; i < lives; i++) chamber.push('LIVE');
      for (let i = 0; i < blanks; i++) chamber.push('BLANK');
      for (let i = chamber.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [chamber[i], chamber[j]] = [chamber[j], chamber[i]];
      }

      const itemsCount = settings.itemsPerShipment || 2;
      const lootBatches: any[] = [];
      for (let i = 0; i < playerCount; i++) {
        lootBatches.push(generateLootBatch(itemsCount, false, false, 4, [], playerCharms[i] || 0, 4, 4, settings, playerCount));
      }

      return { chamber, lootBatches, lives, blanks };
  }, []);

  const handleStartMPGame = useCallback(() => {
    const currentRoom = mpRoomRef.current;
    const currentPlayerId = mpPlayerIdRef.current;
    if (currentRoom && currentPlayerId === currentRoom.hostId) {
      const settings = currentRoom.settings || { rounds: 3, hp: 2, itemsPerShipment: 2 };
      const playerCount = currentRoom?.players?.length || 2;
      const isMulti = playerCount >= 3;

      if (isMulti) {
        const { chamber, lootBatches } = generateMultiPlayerBatch(settings, Array(playerCount).fill(0), playerCount);
        const hpVal = settings.hp === 9 ? randomInt(2, 8) : settings.hp;
        const gameData: any = {
          isThreePlayer: playerCount === 3,
          isFourPlayer: playerCount === 4,
          chamber,
          hpOverride: hpVal
        };
        for (let i = 0; i < playerCount; i++) {
          gameData[`items${i}`] = lootBatches[i];
        }
        lastTotalWins.current = 0;
        mp.startGame(currentRoom.id, gameData);
      } else {
        const { chamber, hostItems, clientItems } = generateMPBatch(settings, playerCount, 0, 0);
        const hpVal = settings.hp === 9 ? randomInt(2, 8) : settings.hp;
        const hostStarts = Math.random() < 0.5;
        const gameData = {
          chamber,
          hostItems,
          clientItems,
          hostStarts,
          hpOverride: hpVal
        };
        lastTotalWins.current = 0;
        mp.startGame(currentRoom.id, gameData);
      }
    }
  }, [generateMPBatch, generateMultiPlayerBatch, mp.startGame]);

  // Sync subsequent rounds
  useEffect(() => {
    if (!spGame.gameState.isMultiplayer) return;

    spGame.setOnBatchEnd((keepTurn: boolean) => {
      const game = spGameRef.current;
      const currentRoom = mpRoomRef.current;
      const myId = mpPlayerIdRef.current || '';
      if (!currentRoom) return;

      if (myId === currentRoom.hostId) {
        const settings = currentRoom.settings || { rounds: 3, hp: 2, itemsPerShipment: 2 };
        const playerCount = currentRoom?.players?.length || 2;
        const isMulti = playerCount >= 3;

        if (isMulti) {
          console.log(`Batch end detected (HOST, ${playerCount}-Player) - Generating new batch... keepTurn:`, keepTurn);
          const p0Charms = game.player.luckycharmsUsed || 0;
          const p1Charms = game.dealer.luckycharmsUsed || 0;
          const p2Charms = game.player3?.luckycharmsUsed || 0;
          const p3Charms = game.player4?.luckycharmsUsed || 0;

          const { chamber, lootBatches, lives, blanks } = generateMultiPlayerBatch(settings, [p0Charms, p1Charms, p2Charms, p3Charms], playerCount);
          
          const mPlayers = currentRoom.players;
          const myIndex = mPlayers.findIndex((p: any) => p.id === myId);

          let currentTurnOwnerId = myId;
          if (game.gameState.turnOwner === 'DEALER') currentTurnOwnerId = mPlayers[(myIndex + 2) % playerCount].id;
          else if (game.gameState.turnOwner === 'PLAYER3') currentTurnOwnerId = mPlayers[(myIndex + 1) % playerCount].id;
          else if (game.gameState.turnOwner === 'PLAYER4') currentTurnOwnerId = mPlayers[(myIndex + 3) % playerCount].id;

          const syncAction: any = {
            type: 'SYNC_THREE_PLAYER_ROUND',
            chamber,
            nextTurnOwnerId: currentTurnOwnerId,
            resetItems: false,
            hp: undefined
          };
          for (let i = 0; i < playerCount; i++) {
            syncAction[`items${i}`] = lootBatches[i];
          }

          mp.sendImmediateAction(currentRoom.id, syncAction);
          mp.sendMessage(currentRoom.id, `SYSTEM: NEW BATCH REPLENISHED - ${lives} LIVE, ${blanks} BLANK`);
          game.setOverlayText('RELOADING NEW BATCH...');

          const myItems = syncAction[`items${myIndex}`] || [];
          const frontItems = syncAction[`items${(myIndex + 2) % playerCount}`] || [];
          const leftItems = syncAction[`items${(myIndex + 1) % playerCount}`] || [];
          const rightItems = playerCount >= 4 ? syncAction[`items${(myIndex + 3) % playerCount}`] : [];

          game.setPlayer3(p3 => ({ ...p3, items: [...p3.items, ...leftItems].slice(0, 8) }));
          if (playerCount >= 4) {
            game.setPlayer4(p4 => ({ ...p4, items: [...p4.items, ...rightItems].slice(0, 8) }));
          }
          game.startRound(
            false,
            false,
            undefined,
            chamber,
            [...game.player.items, ...myItems].slice(0, 8),
            [...game.dealer.items, ...frontItems].slice(0, 8),
            game.gameState.turnOwner,
            undefined,
            undefined,
            leftItems,
            rightItems
          );
          return;
        }

        console.log("Batch end detected (HOST) - Generating new batch... keepTurn:", keepTurn);
        const hostCharms = game.player.luckycharmsUsed || 0;
        const clientCharms = game.dealer.luckycharmsUsed || 0;
        const { chamber, hostItems, clientItems, lives, blanks } = generateMPBatch(settings, playerCount, hostCharms, clientCharms);

        const lastWasHost = game.gameState.turnOwner === 'PLAYER';
        const nextStarts = keepTurn ? lastWasHost : !lastWasHost;

        const currentTotalWins = (game.gameState.multiModeState?.playerWins || 0) + (game.gameState.multiModeState?.opponentWins || 0);
        const isNewRound = currentTotalWins > lastTotalWins.current;
        lastTotalWins.current = currentTotalWins;

        const hpVal = isNewRound ? (settings.hp === 9 ? randomInt(2, 8) : settings.hp) : undefined;

        const syncAction = {
          type: 'SYNC_ROUND',
          chamber,
          hostItems,
          clientItems,
          nextTurnOwner: nextStarts ? 'PLAYER' : 'DEALER',
          resetItems: isNewRound,
          hp: hpVal,
          roundNum: currentTotalWins + 1
        };

        mp.sendImmediateAction(currentRoom.id, syncAction);
        mp.sendMessage(currentRoom.id, isNewRound ? `SYSTEM: ROUND ${currentTotalWins + 1} STARTED!` : `SYSTEM: NEW BATCH REPLENISHED - ${lives} LIVE, ${blanks} BLANK`);
        game.setOverlayText(isNewRound ? `ROUND ${currentTotalWins + 1}` : 'RELOADING NEW BATCH...');
        game.startRound(isNewRound, false, undefined, chamber, hostItems, clientItems, nextStarts ? 'PLAYER' : 'DEALER', hpVal);
      } else {
        console.log("Batch end detected (CLIENT) - Waiting for host sync...");
        game.setOverlayText('WAITING FOR HOST...');
      }
    });

    spGame.setOnMPRoundEnd(async (winner: TurnOwner, pWinArg?: number, oWinArg?: number) => {
      const game = spGameRef.current;
      const currentRoom = mpRoomRef.current;
      const myId = mpPlayerIdRef.current || '';
      if (!currentRoom) return;

      const isHost = myId === currentRoom.hostId;
      const playerCount = currentRoom?.players?.length || 2;
      const isMulti = playerCount >= 3;

      if (isMulti) {
        const myIndex = currentRoom.players.findIndex((p: any) => p.id === myId);
        let winnerIndex = myIndex;
        if (winner === 'DEALER') winnerIndex = (myIndex + 2) % playerCount;
        else if (winner === 'PLAYER3') winnerIndex = (myIndex + 1) % playerCount;
        else if (winner === 'PLAYER4') winnerIndex = (myIndex + 3) % playerCount;

        const winnerPlayerId = currentRoom.players[winnerIndex].id;
        const currentWins = (playerCount === 4 ? game.gameState.fourPlayerWins : game.gameState.threePlayerWins) || Array(playerCount).fill(0);
        const nextWins = [...currentWins];
        nextWins[winnerIndex] = (nextWins[winnerIndex] || 0) + 1;

        const settings = currentRoom.settings || { rounds: 3, hp: 4 };
        const winsNeeded = Math.ceil(settings.rounds / 2) || 1;

        if (nextWins[winnerIndex] >= winsNeeded) {
          if (isHost) {
            mp.sendImmediateAction(currentRoom.id, {
              type: 'SYNC_THREE_PLAYER_STATE',
              playerState: game.player,
              dealerState: game.dealer,
              player3State: game.player3,
              player4State: game.player4,
              gameState: {
                ...game.gameState,
                winnerId: winnerPlayerId,
                threePlayerWins: playerCount === 3 ? nextWins : undefined,
                fourPlayerWins: playerCount === 4 ? nextWins : undefined,
                phase: 'GAME_OVER'
              }
            });
          }
          game.setGameState(prev => ({
            ...prev,
            winnerId: winnerPlayerId,
            winner,
            threePlayerWins: playerCount === 3 ? nextWins : undefined,
            fourPlayerWins: playerCount === 4 ? nextWins : undefined,
            phase: 'GAME_OVER'
          }));
          return;
        }

        if (isHost) {
          const { chamber, lootBatches } = generateMultiPlayerBatch(settings, Array(playerCount).fill(0), playerCount);
          const hpVal = settings.hp === 9 ? randomInt(2, 8) : settings.hp;
          const nextRoundNum = nextWins.reduce((a, b) => a + b, 0) + 1;

          const syncAction: any = {
            type: 'SYNC_THREE_PLAYER_ROUND',
            chamber,
            nextTurnOwnerId: winnerPlayerId,
            resetItems: true,
            hp: hpVal,
            roundNum: nextRoundNum,
            threePlayerWins: playerCount === 3 ? nextWins : undefined,
            fourPlayerWins: playerCount === 4 ? nextWins : undefined
          };
          for (let i = 0; i < playerCount; i++) {
            syncAction[`items${i}`] = lootBatches[i];
          }

          mp.sendImmediateAction(currentRoom.id, syncAction);
          mp.sendMessage(currentRoom.id, `SYSTEM: ROUND ${nextRoundNum} STARTED!`);

          const myItems = syncAction[`items${myIndex}`];
          const frontItems = syncAction[`items${(myIndex + 2) % playerCount}`];
          const leftItems = syncAction[`items${(myIndex + 1) % playerCount}`];
          const rightItems = playerCount >= 4 ? syncAction[`items${(myIndex + 3) % playerCount}`] : [];

          game.setPlayer({ hp: hpVal, maxHp: hpVal, items: myItems, isHandcuffed: false, isSawedActive: false });
          game.setDealer({ hp: hpVal, maxHp: hpVal, items: frontItems, isHandcuffed: false, isSawedActive: false });
          game.setPlayer3({ hp: hpVal, maxHp: hpVal, items: leftItems, isHandcuffed: false, isSawedActive: false });
          if (playerCount >= 4) {
            game.setPlayer4({ hp: hpVal, maxHp: hpVal, items: rightItems, isHandcuffed: false, isSawedActive: false });
          }

          game.setGameState(prev => ({
            ...prev,
            threePlayerWins: playerCount === 3 ? nextWins : undefined,
            fourPlayerWins: playerCount === 4 ? nextWins : undefined
          }));

          game.setOverlayText(`ROUND ${nextRoundNum}`);
          await game.startRound(
            true,
            false,
            undefined,
            chamber,
            myItems,
            frontItems,
            winner,
            hpVal,
            undefined,
            leftItems,
            rightItems
          );
        } else {
          console.log("Client waiting for next round host sync...");
          game.setOverlayText('WAITING FOR HOST...');
        }
        return;
      }

      const pWin = pWinArg !== undefined ? pWinArg : ((game.gameState.multiModeState?.playerWins || 0) + (winner === 'PLAYER' ? 1 : 0));
      const oWin = oWinArg !== undefined ? oWinArg : ((game.gameState.multiModeState?.opponentWins || 0) + (winner === 'PLAYER' ? 0 : 1));
      const currentTotalWins = pWin + oWin;
      const nextRoundNum = currentTotalWins + 1;

      const mSettings = currentRoom.settings || { rounds: 3, hp: 2, itemsPerShipment: 2 };
      const winsNeeded = Math.ceil(mSettings.rounds / 2) || 1;

      // If match is over, don't start a new round
      if (pWin >= winsNeeded || oWin >= winsNeeded) {
        if (isHost) {
          mp.sendImmediateAction(currentRoom.id, {
            type: 'SYNC_MP_GAME_OVER',
            winner,
            multiModeState: { playerWins: pWin, opponentWins: oWin }
          });
        }

        const resolvedWinner = isHost
          ? winner
          : (winner === 'PLAYER' ? 'DEALER' : 'PLAYER');

        game.setGameState(prev => ({
          ...prev,
          winner: resolvedWinner,
          phase: 'GAME_OVER',
          multiModeState: { playerWins: pWin, opponentWins: oWin }
        }));
        return;
      }

      if (isHost) {
        const settings = currentRoom.settings || { rounds: 3, hp: 2, itemsPerShipment: 2 };
        const { chamber, hostItems, clientItems } = generateMPBatch(settings, playerCount, 0, 0);

        const hpVal = settings.hp === 9 ? randomInt(2, 8) : settings.hp;
        // Alternate starting turn for the next round
        const lastTurnOwner = game.gameState.turnOwner;
        const nextStarts = lastTurnOwner === 'PLAYER' ? 'DEALER' : 'PLAYER';

        lastTotalWins.current = currentTotalWins;

        const syncAction = {
          type: 'SYNC_ROUND',
          chamber,
          hostItems,
          clientItems,
          nextTurnOwner: nextStarts,
          resetItems: true,
          hp: hpVal,
          roundNum: nextRoundNum
        };

        mp.sendImmediateAction(currentRoom.id, syncAction);
        mp.sendMessage(currentRoom.id, `SYSTEM: ROUND ${nextRoundNum} STARTED!`);

        game.setOverlayText(`ROUND ${nextRoundNum}`);
        await game.startRound(true, false, undefined, chamber, hostItems, clientItems, nextStarts, hpVal, { playerWins: pWin, opponentWins: oWin });
      } else {
        console.log("Client waiting for next round host sync...");
        game.setOverlayText('WAITING FOR HOST...');
      }
    });
  }, [spGame.gameState.isMultiplayer, spGame.setOnBatchEnd, spGame.setOnMPRoundEnd, mp.sendImmediateAction, mp.sendMessage, generateMPBatch, generateMultiPlayerBatch]);

  const onLoadingComplete = useCallback(() => {
    const currentAppState = appStateRef.current;
    if (currentAppState === 'LOADING_SP') {
      // Only mutate settings if a debug head model override was actually active (avoids re-initing ThreeScene)
      setSettings(prev => (prev.debugHeadModel === 'DEFAULT' ? prev : { ...prev, debugHeadModel: 'DEFAULT' }));
      if (pendingSplitConfigRef.current) {
        const splitConfig = pendingSplitConfigRef.current;
        pendingSplitConfigRef.current = null;
        spGameRef.current.startLocalSplitGame(splitConfig);
      } else {
        spGameRef.current.startGame(spGameRef.current.playerName, isHardModeSelected);
      }
      setAppState('GAME');
    } else if (currentAppState === 'LOADING_GAME') {
      setAppState('GAME');
    }
  }, [isHardModeSelected]);

  const getAssetLoadProgress = useCallback(() => {
    return Math.round((audioManager.getAudioLoadingProgress() + getGLBLoadingProgress()) / 2);
  }, []);

  const handleBackToMenu = useCallback(() => {
    if (gameStartTimeoutRef.current) {
      clearTimeout(gameStartTimeoutRef.current);
      gameStartTimeoutRef.current = null;
    }
    setAbortedByName(null);
    setNameTags([]);
    mp.disconnect();
    mp.clearError();
    setAppState('MENU');
    spGameRef.current.resetGame(true);
  }, [mp.disconnect, mp.clearError]);

  useEffect(() => {
    if (appState === 'MENU') {
      mp.clearError();
    }
  }, [appState, mp.clearError]);

  // Sync multiplayerState and localPlayerId in gameState with mp.room dynamically
  useEffect(() => {
    if (appState === 'GAME' && mp.room) {
      spGameRef.current.setGameState(prev => {
        const nextLocalPlayerId = mp.playerId || prev.localPlayerId || '';
        if (prev.multiplayerState === mp.room && prev.localPlayerId === nextLocalPlayerId) return prev;
        return {
          ...prev,
          localPlayerId: nextLocalPlayerId,
          multiplayerState: mp.room
        };
      });
    }
  }, [mp.room, appState, mp.playerId]);

  // Sync state broadcast from host to keep clients in sync
  // Throttled to at most once per 350ms to prevent spam during rapid item-use chains
  const broadcastHostSync = useCallback((force = false) => {
    const game = spGameRef.current;
    const currentRoom = mpRoomRef.current;
    const myId = mpPlayerIdRef.current;
    if (appStateRef.current !== 'GAME' || !game.gameState.isMultiplayer || !currentRoom || currentRoom.hostId !== myId) return;
    if (game.isProcessing || game.gameState.phase === 'RESOLVING' || game.gameState.phase === 'GAME_OVER') return;

    const now = Date.now();
    if (!force && now - lastSyncBroadcastRef.current < 350) return;
    lastSyncBroadcastRef.current = now;

    const playerCount = currentRoom?.players?.length || 2;
    const isMulti = playerCount >= 3;
    if (isMulti) {
      const myIndex = currentRoom?.players ? currentRoom.players.findIndex((p: any) => p.id === myId) : -1;
      let turnOwnerIndex = myIndex;
      if (myIndex !== -1 && currentRoom?.players) {
        if (game.gameState.turnOwner === 'DEALER') turnOwnerIndex = (myIndex + 2) % playerCount;
        else if (game.gameState.turnOwner === 'PLAYER3') turnOwnerIndex = (myIndex + 1) % playerCount;
        else if (game.gameState.turnOwner === 'PLAYER4') turnOwnerIndex = (myIndex + 3) % playerCount;
      }
      const turnOwnerId = currentRoom?.players && turnOwnerIndex !== -1 ? currentRoom.players[turnOwnerIndex]?.id : '';

      mp.sendImmediateAction(currentRoom.id, {
        type: 'SYNC_THREE_PLAYER_STATE',
        playerState: game.player,
        dealerState: game.dealer,
        player3State: game.player3,
        player4State: game.player4,
        gameState: {
          ...game.gameState,
          turnOwnerId
        }
      });
    } else {
      mp.sendImmediateAction(currentRoom.id, {
        type: 'SYNC_STATE',
        player1State: game.player,
        player2State: game.dealer,
        gameState: game.gameState
      });
    }
  }, [mp.sendImmediateAction]);

  useEffect(() => {
    broadcastHostSync();
  // Include item content (joined) so debug item changes trigger a broadcast immediately
  }, [spGame.player.hp, spGame.dealer.hp, spGame.player3?.hp, spGame.player4?.hp, spGame.gameState.phase, spGame.gameState.turnOwner, spGame.gameState.winner, spGame.isProcessing, spGame.player.items.join(','), spGame.dealer.items.join(','), spGame.player3?.items?.join(','), spGame.player4?.items?.join(','), broadcastHostSync]);

  useEffect(() => {
    mp.setOnFullSyncRequest(() => broadcastHostSync(true));
  }, [mp.setOnFullSyncRequest, broadcastHostSync]);

  // --- DISCORD RICH PRESENCE UPDATER ---
  useEffect(() => {
    if (!window.updateDiscordActivity) return;

    try {
      if (appState === 'MENU') {
        window.updateDiscordActivity("In Main Menu", "Awaiting the next challenger...");
      } else if (appState === 'MP_SELECTION') {
        window.updateDiscordActivity("Browsing Multiplayer", "Hunting for a worthy opponent...");
      } else if (appState === 'LOBBY') {
        const roomObj = mp.room as any;
        const roomName = roomObj?.name || "Room";
        const isHost = roomObj?.hostId === mp.playerId;
        const playerCount = roomObj?.players?.length || 1;
        const allReady = roomObj?.players?.every((p: any) => p.ready);
        window.updateDiscordActivity(
          `Lobby: ${roomName}`,
          isHost
            ? `Host // ${playerCount}/2 Players ${allReady ? '// All Ready!' : ''}`
            : `Waiting // ${playerCount}/2 Players`
        );
      } else if (appState === 'GAME') {
        const phase = spGame.gameState.phase;

        if (phase === 'GAME_OVER') {
          // Show win/loss result
          const playerWon = spGame.gameState.winner === 'PLAYER';
          if (spGame.gameState.isMultiplayer && mp.room) {
            const roomObj = mp.room as any;
            const opponent = roomObj.players?.find((p: any) => p.id !== mp.playerId);
            const opponentName = opponent?.name || "Opponent";
            window.updateDiscordActivity(
              playerWon ? "🏆 Victory!" : "💀 Defeated",
              `VS ${opponentName} // ${playerWon ? 'Survived the game' : 'Fell in battle'}`
            );
          } else {
            const round = spGame.gameState.isHardMode
              ? (spGame.gameState.hardModeState?.round || 1)
              : (spGame.gameState.normalModeState?.round || 1);
            const modeText = spGame.gameState.isHardMode ? "Hard Mode" : "Normal";
            window.updateDiscordActivity(
              playerWon ? "🏆 Defeated the Dealer" : "💀 The Dealer Won",
              `${modeText} // Round ${round}`
            );
          }
        } else if (spGame.gameState.isMultiplayer && mp.room) {
          // Multiplayer in-game
          const roomObj = mp.room as any;
          const opponent = roomObj.players?.find((p: any) => p.id !== mp.playerId);
          const opponentName = opponent?.name || "Opponent";
          const hp = spGame.player.hp;
          const maxHp = spGame.player.maxHp;
          const isMyTurn = spGame.gameState.turnOwner === 'PLAYER';
          const shellsLeft = spGame.gameState.chamber.length - spGame.gameState.currentShellIndex;
          const roundState = spGame.gameState.multiModeState;
          const scoreText = roundState ? `${roundState.playerWins}-${roundState.opponentWins}` : '';

          window.updateDiscordActivity(
            `VS ${opponentName} ${scoreText ? `(${scoreText})` : ''}`,
            `${isMyTurn ? '🔫 My Turn' : '⏳ Opponent\'s Turn'} // HP: ${hp}/${maxHp} // ${shellsLeft} shells left`
          );
        } else {
          // Singleplayer in-game
          const round = spGame.gameState.isHardMode
            ? (spGame.gameState.hardModeState?.round || 1)
            : (spGame.gameState.normalModeState?.round || 1);
          const hp = spGame.player.hp;
          const maxHp = spGame.player.maxHp;
          const modeText = spGame.gameState.isHardMode ? "Hard Mode" : "Normal";
          const isMyTurn = spGame.gameState.turnOwner === 'PLAYER';
          const shellsLeft = spGame.gameState.chamber.length - spGame.gameState.currentShellIndex;
          const hardState = spGame.gameState.hardModeState;
          const normalState = spGame.gameState.normalModeState;
          const scoreText = hardState 
            ? ` (${hardState.playerWins}-${hardState.dealerWins})` 
            : (normalState ? ` (${normalState.playerWins}-${normalState.dealerWins})` : '');

          window.updateDiscordActivity(
            `${modeText} — Round ${round}${scoreText}`,
            `${isMyTurn ? '🔫 My Turn' : '⏳ Dealer\'s Turn'} // HP: ${hp}/${maxHp} // ${shellsLeft} shells`
          );
        }
      } else if (appState === 'LOADING_MP') {
        window.updateDiscordActivity("Connecting...", "Establishing multiplayer link...");
      } else if (appState === 'LOADING_SP' || appState === 'LOADING_GAME') {
        window.updateDiscordActivity("Loading Match", "Preparing the chamber...");
      }
    } catch (err) {
      console.error("[Discord RPC] Error updating status:", err);
    }
  }, [
    appState,
    mp.room,
    mp.playerId,
    spGame.gameState.roundCount,
    spGame.gameState.hardModeState?.round,
    spGame.gameState.hardModeState?.playerWins,
    spGame.gameState.hardModeState?.dealerWins,
    spGame.gameState.multiModeState?.playerWins,
    spGame.gameState.multiModeState?.opponentWins,
    spGame.player.hp,
    spGame.player.maxHp,
    spGame.gameState.isHardMode,
    spGame.gameState.isMultiplayer,
    spGame.gameState.phase,
    spGame.gameState.turnOwner,
    spGame.gameState.winner,
    spGame.gameState.currentShellIndex
  ]);

  const handleRootInteraction = useCallback(() => {
    if (!audioInitializedRef.current) {
      audioInitializedRef.current = true;
      audioManager.initialize().catch(() => {
        audioInitializedRef.current = false;
      });
    }
  }, []);

  const handleGunClick = useCallback(() => {}, []);

  const handleLowPerformance = useCallback((fps: number) => {
    if (sessionStorage.getItem('aadish_roulette_perf_warning_shown') === 'true') return;
    try {
      sessionStorage.setItem('aadish_roulette_perf_warning_shown', 'true');
    } catch (e) {
      console.warn("sessionStorage failed:", e);
    }
    setDetectedLowFps(Math.round(fps));
    setShowPerformancePopup(true);
  }, []);

  const handleUpdateNameTags = useCallback((tags: NameTagItem[]) => {
    if (appStateRef.current === 'GAME' && (spGameRef.current.gameState.isMultiplayer || spGameRef.current.gameState.isLocalSplit)) {
      setNameTags(tags.map(t => ({ ...t })));
    }
  }, []);

  const handleOpenSettings = useCallback(() => setIsSettingsOpen(true), []);
  const handleCloseSettings = useCallback(() => setIsSettingsOpen(false), []);
  const handleOpenGuide = useCallback(() => setIsGuideOpen(true), []);
  const handleCloseGuide = useCallback(() => setIsGuideOpen(false), []);
  const handleOpenScoreboard = useCallback(() => setIsScoreboardOpen(true), []);
  const handleCloseScoreboard = useCallback(() => setIsScoreboardOpen(false), []);

  const handleResetGameProp = useCallback((toMenu: boolean) => {
    const game = spGameRef.current;
    const currentRoom = mpRoomRef.current;
    const myId = mpPlayerIdRef.current;
    if (game.gameState.isMultiplayer) {
      if (toMenu) {
        if (gameStartTimeoutRef.current) {
          clearTimeout(gameStartTimeoutRef.current);
          gameStartTimeoutRef.current = null;
        }
        setAbortedByName(null);
        setNameTags([]);
        mp.disconnect();
        game.resetGame(true);
        setAppState('MENU');
      } else if (currentRoom && myId === currentRoom.hostId) {
        mp.resetRoomState(currentRoom.id);
      }
    } else if (game.gameState.isLocalSplit) {
      if (toMenu) {
        pendingSplitConfigRef.current = null;
        setNameTags([]);
        setAppState('MENU');
        game.resetGame(true);
      } else if (lastSplitConfigRef.current) {
        pendingSplitConfigRef.current = lastSplitConfigRef.current;
        setAppState('LOADING_SP');
      } else {
        setNameTags([]);
        setAppState('MENU');
        game.resetGame(true);
      }
    } else {
      if (toMenu) {
        pendingSplitConfigRef.current = null;
        setNameTags([]);
        setAppState('MENU');
        game.resetGame(true);
      } else {
        setAppState('LOADING_SP');
        game.resetGame(false, false);
      }
    }
  }, [mp.disconnect, mp.resetRoomState]);

  const handleSendChatMessage = useCallback((text: string) => {
    const roomId = mpRoomRef.current?.id;
    if (roomId) mp.sendMessage(roomId, text);
  }, [mp.sendMessage]);

  const handleLobbyUpdateSettings = useCallback((s: any) => {
    const roomId = mpRoomRef.current?.id;
    if (roomId) mp.updateSettings(roomId, s);
  }, [mp.updateSettings]);

  const handleLobbyReadyUp = useCallback((r: boolean) => {
    const roomId = mpRoomRef.current?.id;
    if (roomId) mp.readyUp(roomId, r);
  }, [mp.readyUp]);

  const handleLobbyKick = useCallback((targetPlayerId: string) => {
    const roomId = mpRoomRef.current?.id;
    if (roomId) mp.kickPlayer(roomId, targetPlayerId);
  }, [mp.kickPlayer]);

  const handleLobbyJoinRoom = useCallback((code: string) => {
    mp.joinRoom(code, spGameRef.current.playerName);
  }, [mp.joinRoom]);

  const handleQuickJoin = useCallback(() => {
    mp.quickJoin(spGameRef.current.playerName);
  }, [mp.quickJoin]);

  const handleCreateRoom = useCallback(() => {
    mp.createRoom(spGameRef.current.playerName);
  }, [mp.createRoom]);

  const handleJoinRoom = useCallback((code: string) => {
    mp.joinRoom(code, spGameRef.current.playerName);
  }, [mp.joinRoom]);

  const handleRetryLoadingMP = useCallback(() => {
    if (appStateRef.current === 'LOADING_MP') {
      mp.connect(spGameRef.current.playerName || 'Operator');
    }
  }, [mp.connect]);

  const handleExitToMenuFromSettings = useCallback(() => {
    setIsSettingsOpen(false);
    const game = spGameRef.current;
    if (!game.gameState.isMultiplayer && appStateRef.current === 'GAME' && game.gameState.phase !== 'INTRO' && game.gameState.phase !== 'BOOT') {
      setNameTags([]);
      game.resetGame(true);
      setAppState('MENU');
    }
  }, []);

  const handleSyncDebugState = useCallback((type: any, state: any) => {
    const game = spGameRef.current;
    const currentRoom = mpRoomRef.current;
    const myId = mpPlayerIdRef.current;
    if (appStateRef.current === 'GAME' && game.gameState.isMultiplayer && currentRoom) {
      if (type === 'MULTIPLAYER_MODEL') {
        mp.sendImmediateAction(currentRoom.id, { type: 'DEBUG_SYNC_PLAYER_MODEL', playerId: state.playerId, playerIndex: state.playerIndex, modelKey: state.modelKey });
        return;
      }

      const playerCount = currentRoom?.players?.length || 2;
      const isMulti = playerCount >= 3;
      if (isMulti) {
        // Key names match the receiver: playerState/dealerState/player3State/player4State
        mp.sendImmediateAction(currentRoom.id, {
          type: 'DEBUG_SYNC_THREE_PLAYER',
          senderId: myId,
          playerState: type === 'PLAYER' ? state : game.player,
          dealerState: type === 'DEALER' ? state : game.dealer,
          player3State: type === 'PLAYER3' ? state : game.player3,
          player4State: type === 'PLAYER4' ? state : game.player4,
          gameState: type === 'GAMESTATE' ? state : game.gameState
        });
      } else {
        if (type === 'PLAYER') {
          mp.sendImmediateAction(currentRoom.id, { type: 'DEBUG_SYNC_PLAYER', player: state });
        } else if (type === 'DEALER') {
          mp.sendImmediateAction(currentRoom.id, { type: 'DEBUG_SYNC_DEALER', dealer: state });
        } else if (type === 'GAMESTATE') {
          mp.sendImmediateAction(currentRoom.id, { type: 'DEBUG_SYNC_GAMESTATE', gameState: state });
        }
      }
    }
  }, [mp.sendImmediateAction]);

  const matchData = useMemo(() => {
    if (spGame.gameState.isLocalSplit) {
      const p1Name = spGame.gameState.player1Name || spGame.playerName || 'PLAYER 1';
      const p2Name = spGame.gameState.opponentName || 'PLAYER 2';
      const p1Won = spGame.gameState.winner === 'PLAYER';
      return {
        ...spGame.matchStats,
        isMultiplayer: true,
        isLocalSplit: true,
        result: p1Won ? 'WIN' : 'LOSS',
        mpPlayers: [
          {
            name: p1Name,
            id: 'local-split-p1',
            isHost: true,
            isMe: true,
            result: p1Won ? ('WIN' as const) : ('LOSS' as const),
          },
          {
            name: p2Name,
            id: 'local-split-p2',
            isHost: false,
            isMe: false,
            result: p1Won ? ('LOSS' as const) : ('WIN' as const),
          }
        ]
      };
    }
    if (spGame.gameState.isMultiplayer && mp.room) {
      return {
        ...spGame.matchStats,
        isMultiplayer: true,
        result: spGame.gameState.winner === 'PLAYER' || (spGame.gameState.winner === null && spGame.gameState.turnOwner === 'PLAYER')
          ? 'WIN'
          : 'LOSS',
        mpPlayers: mp.room.players.map((p: any) => {
          const isMe = p.id === mp.playerId;
          const isHost = p.id === mp.room.hostId;
          const activeOpponentId = mp.playerId === mp.room.hostId
            ? (mp.room.players.find((pl: any) => pl.id !== mp.room.hostId)?.id || '')
            : mp.room.hostId;
          
          let playerResult: 'WIN' | 'LOSS' | 'SPECTATED' = 'SPECTATED';
          if (isMe) {
            playerResult = spGame.gameState.winner === 'PLAYER' ? 'WIN' : 'LOSS';
          } else if (p.id === activeOpponentId) {
            playerResult = spGame.gameState.winner === 'PLAYER' ? 'LOSS' : 'WIN';
          }
          
          return {
            name: p.name,
            id: p.id,
            isHost,
            isMe,
            result: playerResult
          };
        })
      };
    }
    return spGame.matchStats;
  }, [spGame.gameState.isLocalSplit, spGame.gameState.player1Name, spGame.gameState.opponentName, spGame.playerName, spGame.gameState.isMultiplayer, spGame.gameState.winner, spGame.gameState.turnOwner, spGame.matchStats, mp.room, mp.playerId]);

  const isPotatoMode = isUltraPerf(settings);

  return (
    <div
      className={`relative w-full h-[100dvh] bg-black overflow-hidden select-none crt text-stone-200 cursor-crosshair animate-in fade-in duration-1000 ${spGame.gameState.isHardMode ? 'hardmode-scanline' : ''} ${isPotatoMode ? 'ultra-perf' : ''}`}
      style={{ height: '100dvh' }}
      onClick={handleRootInteraction}
      onKeyDown={handleRootInteraction}
    >
      {!isPotatoMode && appState !== 'MP_SELECTION' && appState !== 'LOBBY' && appState !== 'LOADING_MP' && (
        <>
          <div className="crt-overlay opacity-[0.15] pointer-events-none" />
          <div className="vhs-static" />
        </>
      )}

      {spGame.gameState.isHardMode && (
        <div className="absolute inset-0 z-[60] pointer-events-none bg-red-900/[0.02] mix-blend-color-burn animate-pulse" />
      )}

      {/* PWA Update & Seamless Refresh HUD */}
      <UpdateNotification isGameActive={appState === 'GAME'} />

      <div
        id="rotate-warning"
        className={`fixed inset-0 z-[99999] flex-col items-center justify-center bg-black ${!isDiscordPlatform ? 'portrait-guard' : ''} ${showRotateWarning ? 'active flex opacity-100 pointer-events-auto' : 'hidden opacity-0 pointer-events-none'}`}
      >
        <div className="warning-card max-w-xs w-[88vw] p-6 rounded-2xl border-2 border-red-700/70 bg-stone-950 text-center space-y-5 shadow-[0_0_50px_rgba(220,38,38,0.25)]">
          <div className="relative inline-flex items-center justify-center">
            <RotateCw size={48} className="text-red-500 animate-[spin_3s_linear_infinite]" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black tracking-[0.25em] text-red-500 uppercase">ROTATE DEVICE</h1>
            <p className="text-[11px] font-mono font-bold tracking-[0.2em] text-stone-400 uppercase leading-relaxed">
              STRICT HORIZONTAL (LANDSCAPE) MODE REQUIRED
            </p>
          </div>
          <div className="w-16 h-1 mx-auto bg-gradient-to-r from-transparent via-red-700/70 to-transparent" />
          <button
            type="button"
            onClick={lockLandscapeFullscreen}
            className="w-full min-h-[44px] py-3 px-4 bg-red-900/40 hover:bg-red-800/60 border border-red-600/80 text-red-200 hover:text-white font-mono font-black text-[10px] tracking-[0.22em] uppercase rounded-xl active:scale-95 transition-all cursor-pointer"
          >
            LOCK LANDSCAPE & FULLSCREEN
          </button>
        </div>
      </div>

      {(appState === 'GAME' || appState === 'LOADING_SP' || appState === 'LOADING_GAME') && (
        <ThreeScene
          isSawed={spGame.player.isSawedActive || spGame.dealer.isSawedActive}
          isChokeActive={spGame.player.isChokeActive || spGame.dealer.isChokeActive}
          isPlayerCuffed={spGame.player.isHandcuffed}
          knownShell={spGame.knownShell}
          onGunClick={handleGunClick}
          aimTarget={spGame.aimTarget}
          cameraView={spGame.cameraView}
          animState={spGame.animState}
          turnOwner={spGame.gameState.turnOwner}
          settings={settings}
          isHardMode={spGame.gameState.isHardMode}
          player={spGame.player}
          dealer={spGame.dealer}
          player3={spGame.player3}
          player4={spGame.player4}
          gameState={spGame.gameState}
          onCardClick={handleCardClick}
          onLowPerformance={handleLowPerformance}
          isPaused={false}
          onUpdateNameTags={handleUpdateNameTags}
        />
      )}

      {/* UI Overlay */}
      <GameUI
        playerName={spGame.playerName}
        gameState={spGame.gameState}
        player={spGame.player}
        dealer={spGame.dealer}
        player3={spGame.player3}
        player4={spGame.player4}
        logs={spGame.logs}
        overlayText={spGame.overlayText}
        overlayColor={spGame.overlayColor}
        showBlood={spGame.showBlood}
        showFlash={spGame.showFlash}
        showFlashbang={spGame.showFlashbang}
        showLootOverlay={spGame.showLootOverlay}
        receivedItems={spGame.receivedItems as any}
        opponentReceivedItems={spGame.opponentReceivedItems as any}
        triggerHeal={spGame.animState.triggerHeal}
        triggerDrink={spGame.animState.triggerDrink}
        knownShell={spGame.knownShell}
        cameraView={spGame.cameraView}
        aimTarget={spGame.aimTarget}
        isProcessing={spGame.isProcessing}
        isRecovering={spGame.animState.playerHit || spGame.animState.playerRecovering || spGame.animState.dealerDropping || spGame.animState.dealerRecovering}
        settings={settings}
        onStartGame={handleStartSP}
        onResetGame={handleResetGameProp}
        onFireShot={handleFireShot}
        onUseItem={handleUseItem}
        onHoverTarget={handleHoverTarget}
        onPickupGun={handlePickupGun}
        onOpenSettings={handleOpenSettings}
        onOpenGuide={handleOpenGuide}
        onOpenScoreboard={handleOpenScoreboard}
        onUpdateName={spGame.setPlayerName}
        onStealItem={handleStealItem}
        onBootComplete={handleBootComplete}
        matchData={matchData}
        onStartMultiplayer={handleStartMP}
        onStartLocalSplit={handleStartLocalSplit}
        isMultiplayer={spGame.gameState.isMultiplayer}
        messages={mp.messages}
        onSendMessage={handleSendChatMessage}
        mpGameState={mp.room}
        mpMyPlayerId={mp.playerId}
        stickers={stickersList}
        hideIntro={appState !== 'MENU'}
      />

      {appState === 'LOBBY' && mp.room && (
        <div className="absolute inset-0 z-[110] flex flex-col bg-stone-950 overflow-hidden lobby-three-cols-container">
          <div className="w-full flex-1 flex flex-row gap-0 min-h-0 overflow-hidden">
            {/* Lobby View */}
            <div className="h-full min-h-0 flex lobby-main-view">
              <MultiplayerLobby
                room={mp.room}
                playerId={mp.playerId!}
                onUpdateSettings={handleLobbyUpdateSettings}
                onReadyUp={handleLobbyReadyUp}
                onStartGame={handleStartMPGame}
                onKick={handleLobbyKick}
                onJoinRoom={handleLobbyJoinRoom}
                onBack={handleBackToMenu}
              />
            </div>
            
            {/* Chat View */}
            <div className="h-full min-h-0 flex border-l border-stone-900 lobby-chat-view">
              <ChatBox
                messages={mp.messages}
                onSendMessage={handleSendChatMessage}
                playerName={spGame.playerName}
                stickers={stickersList}
                onJoinRoom={handleLobbyJoinRoom}
                players={mp.room.players}
                currentUser={currentUser}
              />
            </div>
          </div>
        </div>
      )}

      {appState === 'MP_SELECTION' && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/80 p-4 md:p-10 animate-in fade-in duration-300 overflow-hidden">
          <MultiplayerSelection
            playerName={spGame.playerName}
            getActiveRooms={mp.getActiveRooms}
            onQuickJoin={handleQuickJoin}
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            onBack={handleBackToMenu}
            error={mp.error}
            clearError={mp.clearError}
            isConnecting={mp.isConnecting}
          />
        </div>
      )}

      {(appState === 'LOADING_SP' || appState === 'LOADING_GAME' || appState === 'LOADING_MP') && (
        <div className="absolute inset-0 z-[100]">
          <LoadingScreen
            onComplete={onLoadingComplete}
            text={appState === 'LOADING_GAME' ? "BREACHING BUNKER TABLE..." : appState === 'LOADING_MP' ? (mp.connectionStatus || "HIJACKING ENCLAVE RELAY...") : (pendingSplitConfigRef.current ? "INITIALIZING LOCAL SPLIT DUEL..." : "HACKING YOUR DEVICE...")}
            duration={appState === 'LOADING_GAME' ? 850 : appState === 'LOADING_MP' ? 850 : 1100}
            onBack={handleBackToMenu}
            error={appState === 'LOADING_MP' ? mp.error : null}
            onRetry={handleRetryLoadingMP}
            showClose={appState === 'LOADING_MP'}
            getProgress={(appState === 'LOADING_GAME' || appState === 'LOADING_SP') ? getAssetLoadProgress : undefined}
          />
        </div>
      )}

      {isScoreboardOpen && (
        <Scoreboard
          onClose={handleCloseScoreboard}
        />
      )}

      {isSettingsOpen && (
        <SettingsMenu
          settings={settings}
          onUpdateSettings={setSettings}
          onClose={handleCloseSettings}
          onResetDefaults={handleResetSettings}
          isMultiplayer={spGame.gameState.isMultiplayer}
          showExitToMenu={true}
          onExitToMenu={handleExitToMenuFromSettings}
        />
      )}

      {/* Server Offline / Disconnected during match overlay */}
      {appState === 'GAME' && spGame.gameState.isMultiplayer && !mp.isConnected && (
        <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-stone-950 border-2 border-red-600/50 shadow-[0_0_50px_rgba(239,68,68,0.15)] rounded-2xl p-6 text-center space-y-6 relative overflow-hidden">
            {/* CRT scanlines effect */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-stone-950/20 via-transparent to-stone-950/20" />
            
            <div className="space-y-2">
              <div className="inline-flex items-center justify-center p-3 bg-red-950/30 border border-red-500/30 rounded-full text-red-500 animate-pulse">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-wifi-off">
                  <line x1="1" y1="1" x2="23" y2="23"/>
                  <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.5"/>
                  <path d="M5 12.5a10.94 10.94 0 0 1 5.83-2.84"/>
                  <path d="M12 5a18.9 18.9 0 0 1 7.72 2.22"/>
                  <path d="M4.28 7.22A18.95 18.95 0 0 1 12 5"/>
                </svg>
              </div>
              <h2 className="text-lg font-black text-red-500 tracking-[0.2em] uppercase">LINK DISCONNECTED</h2>
              <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest leading-relaxed">
                THE CORRIDOR CONNECTION WAS TERMINATED. SERVER IS OFFLINE OR YOUR CONNECTION FAILED.
              </p>
            </div>

            <button
              onClick={() => {
                audioManager.playSound('click');
                handleBackToMenu();
              }}
              className="w-full bg-stone-900 hover:bg-stone-850 border border-stone-800 hover:border-red-500/50 rounded-xl py-3 text-[10px] font-black tracking-[0.25em] text-stone-400 hover:text-red-400 uppercase active:scale-95 transition-all duration-150 cursor-pointer shadow-lg"
            >
              RETURN TO DECK
            </button>
          </div>
        </div>
      )}

      {showPerformancePopup && (
        <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-stone-950 border-2 border-amber-600/50 shadow-[0_0_50px_rgba(245,158,11,0.15)] rounded-2xl p-6 text-center space-y-6 relative overflow-hidden">
            {/* CRT scanlines effect */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-stone-950/20 via-transparent to-stone-950/20" />
            
            <div className="space-y-2">
              <div className="inline-flex items-center justify-center p-3 bg-amber-950/30 border border-amber-500/30 rounded-full text-amber-500 animate-pulse">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-gauge">
                  <path d="m12 14 4-4"/>
                  <path d="M3.34 19a10 10 0 1 1 17.32 0"/>
                </svg>
              </div>
              <h2 className="text-lg font-black text-amber-500 tracking-[0.2em] uppercase">PERFORMANCE WARNING</h2>
              <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest leading-relaxed">
                {settings.ultraPerformance ? (
                  `SYSTEM DETECTED LOW FRAME RATE (${detectedLowFps} FPS) EVEN IN POTATO MODE. CONSIDER CLOSING OTHER APPS.`
                ) : settings.balancedPerformance ? (
                  `SYSTEM DETECTED LOW FRAME RATE (${detectedLowFps} FPS) WHILE IN BALANCED MODE. PLEASE SWITCH TO POTATO PROFILE TO OPTIMIZE.`
                ) : (
                  `SYSTEM DETECTED LOW FRAME RATE (${detectedLowFps} FPS). ADJUST GRAPHICS PROFILE TO IMPROVE GAMEPLAY FLUIDITY.`
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {!settings.balancedPerformance && !settings.ultraPerformance && (
                <button
                  type="button"
                  onClick={() => {
                    setSettings((prev) => ({
                      ...prev,
                      ultraPerformance: false,
                      balancedPerformance: true,
                    }));
                    setShowPerformancePopup(false);
                  }}
                  className="w-full py-3 bg-amber-950/25 border border-amber-700/50 hover:bg-amber-900/40 text-amber-400 font-black text-[10px] sm:text-xs tracking-[0.2em] uppercase rounded-xl transition-all active:scale-[0.98] cursor-pointer"
                >
                  SWITCH TO BALANCED PROFILE
                </button>
              )}
              
              {!settings.ultraPerformance && (
                <button
                  type="button"
                  onClick={() => {
                    setSettings((prev) => ({
                      ...prev,
                      ultraPerformance: true,
                      balancedPerformance: false,
                    }));
                    setShowPerformancePopup(false);
                  }}
                  className="w-full py-3 bg-orange-950/25 border border-orange-700/50 hover:bg-orange-900/40 text-orange-400 font-black text-[10px] sm:text-xs tracking-[0.2em] uppercase rounded-xl transition-all active:scale-[0.98] cursor-pointer"
                >
                  SWITCH TO POTATO PROFILE
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowPerformancePopup(false)}
              className="px-6 py-2 border border-stone-800 text-stone-500 hover:text-white hover:bg-stone-900 font-black text-[9px] tracking-[0.2em] uppercase rounded-lg transition-all active:scale-95 cursor-pointer block mx-auto"
            >
              DISMISS
            </button>
          </div>
        </div>
      )}

      {settings.debugMode && appState === 'GAME' && spGame.gameState.phase !== 'BOOT' && spGame.gameState.phase !== 'INTRO' && (() => {
        if (!spGame.gameState.isMultiplayer) return true;
        try {
          const loggedInUser = localStorage.getItem('aadish_roulette_logged_in_user');
          if (loggedInUser) {
            const u = JSON.parse(loggedInUser);
            if (u.username?.toLowerCase() === (import.meta.env.VITE_DEV_USERNAME || 'aadish').toLowerCase()) {
              return true;
            }
          }
        } catch (e) {}
        return spGame.playerName.toLowerCase() === 'aadish';
      })() && (
        <DebugOverlay
          gameState={spGame.gameState}
          player={spGame.player}
          dealer={spGame.dealer}
          player3={spGame.player3}
          player4={spGame.player4}
          setPlayer={spGame.setPlayer}
          setDealer={spGame.setDealer}
          setPlayer3={spGame.setPlayer3}
          setPlayer4={spGame.setPlayer4}
          setGameState={spGame.setGameState}
          settings={settings}
          setSettings={setSettings}
          selectTarotCard={spGame.selectTarotCard}
          setCameraView={spGame.setCameraView}
          processItemEffect={spGame.processItemEffect}
          onSyncDebugState={handleSyncDebugState}
        />
      )}

      {abortedByName && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-stone-950 border-2 border-red-800/80 shadow-[0_0_50px_rgba(239,68,68,0.25)] rounded-2xl p-6 text-center space-y-6 relative overflow-hidden">
            {/* Scanlines visual */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-stone-950/20 via-transparent to-stone-950/20" />
            
            <div className="space-y-4">
              <div className="inline-flex items-center justify-center p-3 bg-red-950/30 border border-red-500/30 rounded-full text-red-500 animate-bounce">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-user-x">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <line x1="17" x2="22" y1="8" y2="13"/>
                  <line x1="22" x2="17" y1="8" y2="13"/>
                </svg>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-red-500 tracking-[0.2em] uppercase">CONNECTION TERMINATED</h2>
              <p className="text-xs sm:text-sm text-stone-400 font-bold uppercase tracking-wider leading-relaxed">
                {abortedByName.toUpperCase()} has left the bunker. The current match has been aborted.
              </p>
            </div>
            
            <button
              onClick={() => {
                audioManager.playSound('click');
                setAbortedByName(null);
                setNameTags([]);
                spGameRef.current.resetGame(true);
                setAppState('LOBBY');
              }}
              className="w-full py-3 bg-red-900/20 hover:bg-red-900 border border-red-800 text-red-500 hover:text-white font-black text-xs sm:text-sm tracking-[0.35em] uppercase rounded-xl transition-all active:scale-95 cursor-pointer shadow-lg shadow-red-950/50"
            >
              Return to Lobby
            </button>
          </div>
        </div>
      )}

      {/* Immediate Player Disconnection Overlay */}
      {appState === 'GAME' && mp.room?.players?.some((p: any) => p.disconnected) && (
        <div className="fixed inset-0 z-[250] flex flex-col items-center justify-center bg-black/85 backdrop-blur-md pointer-events-auto animate-in fade-in duration-300">
          <div className="text-center p-8 bg-stone-900 border border-red-500/30 rounded-2xl max-w-md w-full shadow-2xl animate-pulse">
            <div className="mb-4 inline-block p-4 rounded-full bg-red-950/40 border border-red-500/20 text-red-500">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-spin duration-1000">
                <line x1="2" x2="5" y1="12" y2="12" />
                <line x1="19" x2="22" y1="12" y2="12" />
                <line x1="12" x2="12" y1="2" y2="5" />
                <line x1="12" x2="12" y1="19" y2="22" />
                <line x1="4.93" x2="7.05" y1="4.93" y2="7.05" />
                <line x1="16.95" x2="19.07" y1="16.95" y2="19.07" />
                <line x1="2" x2="22" y1="2" y2="22" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-red-500 tracking-[0.2em] uppercase mb-2">LINK INTERRUPTED</h2>
            <p className="text-stone-300 text-sm font-bold uppercase tracking-widest leading-relaxed">
              {(mp.room.players.find((p: any) => p.disconnected)?.name || 'ANOTHER OPERATOR').toUpperCase()} lost connection.
            </p>
            <p className="text-stone-500 text-xs mt-4 uppercase tracking-widest font-black">
              Attempting reconnection (25s grace)...
            </p>
          </div>
        </div>
      )}

      {/* Tutorial Guide Modal */}
      {isGuideOpen && (
        <TutorialGuide onClose={handleCloseGuide} />
      )}

      {/* Crisp HTML Player Name Tags (Multiplayer & Local Split) */}
      {appState === 'GAME' && (spGame.gameState.isMultiplayer || spGame.gameState.isLocalSplit) && nameTags.length > 0 && (
        <NameTagsOverlay nameTags={nameTags} isMobileNameTag={isMobileNameTag} />
      )}
    </div>
  );
}
