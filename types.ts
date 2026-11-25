import type * as THREE from 'three';
import type { GameStats, MatchStats } from './utils/statsManager';
import type { DicebearStyle } from './utils/dicebear';
import type { SplitItemRule, LocalSplitConfig } from './utils/splitMode';

export type { SplitItemRule, LocalSplitConfig };

export type TarotCardName =
  | 'The Magician'
  | 'The Hanged Man'
  | 'The Hermit'
  | 'The Moon'
  | 'Judgment'
  | 'Wheel of Fortune'
  | 'The Sun'
  | 'Death'
  | 'The Tower'
  | 'The Fool'
  | 'Justice'
  | 'Temperance';

export interface TarotCard {
  name: TarotCardName;
  power: string;
}

export type ItemType =
  | 'GLASS'
  | 'BEER'
  | 'CIGS'
  | 'CUFFS'
  | 'SAW'
  | 'PHONE'
  | 'INVERTER'
  | 'ADRENALINE'
  | 'CHOKE'
  | 'REMOTE'
  | 'BIG_INVERTER'
  | 'CONTRACT'
  | 'LUCKYCHARM'
  | 'FLASHBANG'
  | 'CRUSHER'
  | 'TOTEM'
  | 'MIRROR'
  | 'DECK_CARD'
  | 'JACKPOT';

export type ShellType = 'LIVE' | 'BLANK';
export type TurnOwner = 'PLAYER' | 'DEALER' | 'PLAYER3' | 'PLAYER4';
export type CameraView =
  | 'PLAYER'
  | 'DEALER'
  | 'GUN'
  | 'TABLE'
  | 'STEAL_UI'
  | 'DEALER_GUN'
  | 'PLAYER3_GUN'
  | 'PLAYER4_GUN';
export type AimTarget = 'OPPONENT' | 'SELF' | 'IDLE' | 'CHOOSING' | 'LEFT' | 'RIGHT';
export type PlayerModelKey = 'DEFAULT' | 'YASH' | 'YUVRAJ' | 'ASP' | 'AADISH';

export interface GameState {
  phase:
    | 'BOOT'
    | 'INTRO'
    | 'LOAD'
    | 'PLAYER_TURN'
    | 'DEALER_TURN'
    | 'PLAYER3_TURN'
    | 'PLAYER4_TURN'
    | 'RESOLVING'
    | 'GAME_OVER'
    | 'LOOTING'
    | 'STEALING'
    | 'CARD_SELECT';
  turnOwner: TurnOwner;
  winner: TurnOwner | null;
  chamber: ShellType[];
  currentShellIndex: number;
  liveCount: number;
  blankCount: number;
  lastTurnWasSkipped?: boolean;
  roundCount: number;
  isHardMode: boolean;
  isMultiplayer?: boolean;
  isLocalSplit?: boolean;
  localSplitConfig?: LocalSplitConfig;
  player1Name?: string;
  isThreePlayer?: boolean;
  isFourPlayer?: boolean;
  opponentName?: string;
  localPlayerId?: string;
  multiplayerState?: MultiplayerGameState;
  hardModeState?: {
    round: number;
    playerWins: number;
    dealerWins: number;
  };
  normalModeState?: {
    round: number;
    playerWins: number;
    dealerWins: number;
  };
  roomSettings?: RoomSettings;
  multiModeState?: {
    playerWins: number;
    opponentWins: number;
  };
  isDebugUsed?: boolean;
  deckCards?: TarotCard[];
  selectedCardIndex?: number | null;
  adrenalineTargetOwner?: TurnOwner;
  winnerId?: string;
  threePlayerWins?: number[];
  fourPlayerWins?: number[];
}

export interface MultiplayerGameState {
  players: MultiplayerPlayer[];
  hostId: string;
  roomId: string;
  settings: RoomSettings;
  turnIndex: number;
  debugPlayerModels?: Record<string, PlayerModelKey>;
}

export interface MultiplayerPlayer extends PlayerState {
  id: string;
  name: string;
  color: string;
  ready: boolean;
  model?: PlayerModelKey;
  disconnected?: boolean;
  playerId?: string;
  avatarUrl?: string;
  avatarStyle?: DicebearStyle;
  isDeveloper?: boolean;
  isHost?: boolean;
  result?: 'WIN' | 'LOSS' | 'SPECTATED';
}

export interface RoomSettings {
  rounds: number;
  hp: number;
  itemsPerShipment: number;
  itemRule?: SplitItemRule;
  isAdvanced?: boolean;
  itemWeights?: Record<string, number>;
  isPrivate?: boolean;
  roomName?: string;
  name?: string;
  maxPlayers?: number;
}

export interface ChatMessage {
  sender: string;
  color: string;
  text: string;
  timestamp: number;
}

export type AppState =
  | 'MENU'
  | 'LOADING_SP'
  | 'LOADING_GAME'
  | 'GAME'
  | 'LOADING_MP'
  | 'MP_SELECTION'
  | 'LOBBY';

export interface PlayerState {
  hp: number;
  maxHp: number;
  items: ItemType[];
  isHandcuffed: boolean;
  isSawedActive: boolean;
  isAdrenalineActive?: boolean;
  isChokeActive?: boolean;
  luckycharmsUsed?: number;
  isFlashbanged?: boolean;
  lastTurnItemsUsed?: ItemType[];
  currentTurnItemsUsed?: ItemType[];
  jackpotImmunityShots?: number;
  hasJackpotWinActive?: boolean;
}

export interface LogEntry {
  id: number;
  text: string;
  type: 'neutral' | 'danger' | 'safe' | 'info' | 'dealer';
}

export interface AnimationState {
  triggerRecoil: number;
  triggerRack: number;
  triggerSparks: number;
  triggerHeal: number;
  triggerDrink: number;
  triggerCuff: number;
  triggerGlass: number;
  triggerPhone: number;
  triggerInverter: number;
  triggerAdrenaline: number;
  triggerChoke: number;
  triggerRemote: number;
  triggerBigInverter: number;
  triggerContract: number;
  triggerLuckycharm: number;
  triggerFlashbang: number;
  triggerCrusher: number;
  triggerTotem: number;
  triggerMirror: number;
  triggerDeckCard: number;
  triggerJackpot: number;
  jackpotResult?: 'JACKPOT' | 'NORMAL' | 'LOSE' | null;
  totemTarget?: TurnOwner | null;
  isSawing: boolean;
  ejectedShellColor: 'red' | 'blue' | 'red+red' | 'red+blue' | 'blue+red' | 'blue+blue';
  muzzleFlashIntensity: number;
  isLiveShot: boolean;
  dealerHit: boolean;
  dealerDropping: boolean;
  playerHit: boolean;
  playerRecovering: boolean;
  dealerRecovering: boolean;
  player3Hit?: boolean;
  player3Dropping?: boolean;
  player3Recovering?: boolean;
  player4Hit?: boolean;
  player4Dropping?: boolean;
  player4Recovering?: boolean;
}

export interface GameSettings {
  pixelScale: number;
  brightness: number;
  uiScale: number;
  fov: number;
  musicVolume: number;
  sfxVolume: number;
  debugMode?: boolean;
  debugHeadModel?: PlayerModelKey;
  debugPlayer1Model?: PlayerModelKey;
  debugPlayerModels?: {
    DEALER?: PlayerModelKey;
    PLAYER3?: PlayerModelKey;
    PLAYER4?: PlayerModelKey;
  };
  graphicsMode?: 'ultra' | 'high' | 'balanced' | 'low' | 'potato';
  ultraPerformance?: boolean;
  balancedPerformance?: boolean;
  experimentalDirectAim?: boolean;
  orientationMode?: 'auto' | 'vertical';
}

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  gunGroup: THREE.Group;
  muzzleFlash: THREE.Group;
  muzzleLight: THREE.PointLight;
  roomRedLight: THREE.PointLight;
  bulbLight: THREE.PointLight;
  gunLight: THREE.PointLight;
  bulletMesh: THREE.Mesh;
  dealerGroup: THREE.Group;
  shellCasing: THREE.Mesh;
  shellCasings?: THREE.Mesh[];
  shellVelocities?: THREE.Vector3[];
  nextShellIndex?: number;
  mouse: THREE.Vector2;
  raycaster: THREE.Raycaster;
  barrelMesh: THREE.Mesh;
  shortBarrelMesh?: THREE.Mesh;
  sawCut?: THREE.Mesh | THREE.Group;
  pumpMesh: THREE.Mesh | THREE.Group;
  magTube: THREE.Mesh | THREE.Group;
  shortMagTube?: THREE.Mesh | THREE.Group;
  sight?: THREE.Mesh | THREE.Group;
  sSight?: THREE.Mesh | THREE.Group;
  chokeMesh?: THREE.Mesh | THREE.Group;
  bloodParticles: THREE.Points;
  sparkParticles: THREE.Points;
  dustParticles: THREE.Points | null;
  baseLights: { light: THREE.Light; baseIntensity: number }[];
  underLight?: THREE.PointLight;
  ejectedShells?: THREE.Group[];
  itemsGroup?: {
    itemBeer: THREE.Group;
    itemCigs: THREE.Group;
    itemSaw: THREE.Group;
    itemCuffs: THREE.Group;
    itemGlass: THREE.Group;
    itemPhone: THREE.Group;
    itemInverter: THREE.Group;
    itemAdrenaline: THREE.Group;
    itemRemote: THREE.Group;
    itemBigInverter: THREE.Group;
    itemContract: THREE.Group;
    itemLuckycharm: THREE.Group;
    itemFlashbang: THREE.Group;
    itemCrusher: THREE.Group;
    itemTotem: THREE.Group;
    itemMirror: THREE.Group;
    itemJackpot: THREE.Group;
    itemLight: THREE.PointLight;
  };
  itemDeckCards?: THREE.Group[];
}

export interface SceneProps {
  isSawed: boolean;
  isChokeActive?: boolean;
  aimTarget: AimTarget;
  cameraView: CameraView;
  animState: AnimationState;
  turnOwner: TurnOwner;
  isPlayerCuffed?: boolean;
  settings: GameSettings;
  knownShell: ShellType | null;
  isHardMode?: boolean;
  targetPlayerId?: string;
  gameState: GameState;
  player: PlayerState;
  dealer: PlayerState;
}

export interface ChokeResult {
  triggered: boolean;
  shell1: ShellType;
  shell2: ShellType;
  damage: number;
}

export interface CardRandoms {
  magicianItem?: ItemType;
  judgmentSuccess?: boolean;
  moonIndex?: number;
  deathIndex?: number;
  towerIndex?: number;
  wheelChamber?: ShellType[];
}

// Re-export stats manager types for centralized type access
export type { GameStats, MatchStats };

export type GraphicsPresetTier = 'potato' | 'low' | 'balanced' | 'high';

/**
 * Resolves the active graphics preset into one of 4 standardized tiers:
 * - 'potato': Preset 1 (Potato) - Bare minimum, flat shading, zero shadows, linear tone mapping, maximum FPS for low-end devices.
 * - 'low': Preset 2 (Low) - Lightweight performance with preserved processing: ACES tone mapping, fog, subtle lights & materials.
 * - 'balanced': Preset 3 (Balanced) - Crisp 60 FPS target, PCF shadows, good lighting, optimized particles.
 * - 'high': Preset 4 (High) - Rich PBR materials, PCFSoft shadows, full lighting & reflections, smooth particles.
 */
export const getGraphicsPreset = (s?: Partial<GameSettings> | null): GraphicsPresetTier => {
  if (!s) return 'balanced';
  if (s.graphicsMode === 'high' || s.graphicsMode === 'ultra') return 'high';
  if (s.graphicsMode === 'balanced') return 'balanced';
  if (s.graphicsMode === 'low') return 'low';
  if (s.graphicsMode === 'potato') return 'potato';
  if (s.ultraPerformance === true) return 'potato';
  if (s.balancedPerformance === true) return 'balanced';
  return 'balanced';
};

// Explicit preset predicates
export const isPresetPotato = (s?: Partial<GameSettings> | null): boolean =>
  getGraphicsPreset(s) === 'potato';
export const isPresetLow = (s?: Partial<GameSettings> | null): boolean =>
  getGraphicsPreset(s) === 'low';
export const isPresetBalanced = (s?: Partial<GameSettings> | null): boolean =>
  getGraphicsPreset(s) === 'balanced';
export const isPresetHigh = (s?: Partial<GameSettings> | null): boolean =>
  getGraphicsPreset(s) === 'high';
export const isPresetUltra = (s?: Partial<GameSettings> | null): boolean =>
  getGraphicsPreset(s) === 'high'; // Backward-compatible alias (Ultra merged into High)

// Graphics mode helper functions (backward compatible aliases)
export const isUltraPerf = (s?: Partial<GameSettings> | null): boolean =>
  isPresetPotato(s);
export const isLowPerf = (s?: Partial<GameSettings> | null): boolean =>
  isPresetPotato(s) || isPresetLow(s);
export const isBalancedPerf = (s?: Partial<GameSettings> | null): boolean =>
  getGraphicsPreset(s) === 'balanced' || getGraphicsPreset(s) === 'low' || getGraphicsPreset(s) === 'potato';
export const isHighPerf = (s?: Partial<GameSettings> | null): boolean =>
  getGraphicsPreset(s) === 'high';
