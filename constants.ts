import { ItemType, GameSettings } from './types';

export const MAX_HP = 4;
export const MAX_ITEMS = 8;

export const ITEMS: ItemType[] = ['GLASS', 'BEER', 'CIGS', 'CUFFS', 'SAW', 'PHONE', 'INVERTER', 'ADRENALINE', 'CHOKE', 'REMOTE', 'BIG_INVERTER', 'CONTRACT', 'LUCKYCHARM', 'FLASHBANG', 'CRUSHER', 'TOTEM', 'MIRROR', 'DECK_CARD', 'JACKPOT'];

export const ACTIVE_ITEMS: ItemType[] = ITEMS.filter(i => i !== 'REMOTE');

export const ITEM_DESCRIPTIONS: Record<ItemType, string> = {
  'GLASS': 'BREAK TO REVEAL CURRENT SHELL',
  'BEER': 'RACK THE SHOTGUN (EJECT SHELL)',
  'CIGS': 'RECOVER 1 HEALTH POINT',
  'CUFFS': 'SKIP OPPONENT\'S NEXT TURN',
  'SAW': 'DOUBLE DAMAGE (CURRENT TURN)',
  'PHONE': 'REVEAL A FUTURE SHELL',
  'INVERTER': 'SWITCH CURRENT SHELL (LIVE <-> BLANK)',
  'ADRENALINE': 'STEAL AND USE OPPONENT ITEM',
  'CHOKE': 'FIRE 2 SHELLS AT ONCE',
  'REMOTE': 'CYCLE CHAMBER (SWAP CURRENT & NEXT)',
  'BIG_INVERTER': 'INVERT POLARITY OF ALL SHELLS',
  'CONTRACT': 'SACRIFICE 1HP FOR 2 ITEMS',
  'LUCKYCHARM': 'BOOSTS NEXT SHIPMENT ITEMS LUCK',
  'FLASHBANG': 'PREVENTS OPPONENT ITEM USAGE ON NEXT TURN',
  'CRUSHER': 'DESTROY 1 RANDOM ITEM FROM OPPONENTS INVENTORY',
  'TOTEM': '[PASSIVE] SURVIVE AT 1 HP ON LETHAL DAMAGE',
  'MIRROR': 'COPY ALL ITEM EFFECTS USED BY OPPONENT ON PREVIOUS TURN',
  'DECK_CARD': 'DRAW 1 OF 6 TAROT CARDS FOR ACTIVE & PASSIVE EFFECTS',
  'JACKPOT': 'SPIN THE SLOT MACHINE FOR BULLET IMMUNITY (UP TO 3 SHOTS)'
};

export const isMobileOrNarrowScreen = (): boolean => {
  if (typeof window === 'undefined') return false;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
  const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(ua);
  const isTouch = typeof navigator !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
  const isNarrow = typeof window !== 'undefined' && window.innerWidth < 768;
  return isMobileUA || (isTouch && isNarrow) || isNarrow;
};

export const getDefaultGraphicsMode = (): 'low' | 'balanced' => {
  return isMobileOrNarrowScreen() ? 'low' : 'balanced';
};

export const getInitialSettings = (): GameSettings => {
  const isMobile = isMobileOrNarrowScreen();
  
  if (isMobile) {
    return {
      pixelScale: 3.5,
      brightness: 1.0,
      uiScale: 0.50,
      fov: 60,
      musicVolume: 0.5,
      sfxVolume: 0.5,
      debugMode: false,
      debugHeadModel: 'DEFAULT',
      debugPlayer1Model: 'DEFAULT',
      graphicsMode: 'low',
      ultraPerformance: false,
      balancedPerformance: true,
      experimentalDirectAim: false
    };
  } else {
    // PC / Desktop
    return {
      pixelScale: 3.0,
      brightness: 1.0,
      uiScale: 0.8,
      fov: 60,
      musicVolume: 0.5,
      sfxVolume: 1.0,
      debugMode: false,
      debugHeadModel: 'DEFAULT',
      debugPlayer1Model: 'DEFAULT',
      graphicsMode: 'balanced',
      ultraPerformance: false,
      balancedPerformance: true,
      experimentalDirectAim: false
    };
  }
};

export const DEFAULT_SETTINGS: GameSettings = getInitialSettings();

export const GAME_VERSION = '2.3.0';
export const ANNOUNCEMENT_VERSION = '1';

/**
 * Verified tactical sticker asset manifest.
 * Maps all existing WebP and GIF stickers in public/sticker/ cleanly without blind probing or 404 warnings.
 */
export const TACTICAL_STICKERS: readonly string[] = [
  'sticker1.webp',
  'sticker2.webp',
  'sticker3.webp',
  'sticker4.gif',
  'sticker5.webp',
  'sticker6.webp',
  'sticker7.webp',
  'sticker8.webp',
  'sticker9.gif',
  'sticker10.webp',
  'sticker11.gif',
  'sticker12.webp',
  'sticker13.webp',
  'sticker14.webp',
  'sticker15.webp',
  'sticker16.gif',
  'sticker17.gif',
  'sticker18.gif',
  'sticker19.gif',
  'sticker20.gif',
  'sticker21.gif',
  'sticker22.gif',
  'sticker23.webp',
  'sticker24.gif',
  'sticker25.gif',
  'sticker26.webp'
] as const;

// Re-export graphics helpers for convenient access
export {
  getGraphicsPreset,
  isPresetPotato,
  isPresetLow,
  isPresetBalanced,
  isPresetHigh,
  isPresetUltra,
  isUltraPerf,
  isLowPerf,
  isBalancedPerf,
  isHighPerf
} from './types';
export type { GraphicsPresetTier } from './types';

export type ChangelogTag = 'NEW' | 'ADDED' | 'UPDATED' | 'IMPROVED' | 'FIXED' | 'OPTIMIZED' | 'SECURITY' | 'SYSTEM';

export interface ChangelogItem {
  tag: ChangelogTag;
  title?: string;
  description: string;
}

export interface ChangelogRelease {
  version: string;
  date: string;
  title: string;
  highlight?: boolean;
  items: ChangelogItem[];
}

export const CHANGELOG: ChangelogRelease[] = [
  {
    version: '2.3.0',
    date: 'November 25, 2026',
    title: 'Split Multiplayer, Sync Engine & Pre-Release Polish',
    highlight: true,
    items: [
      {
        tag: 'NEW',
        title: 'Local Split Multiplayer (Pass-and-Play)',
        description: 'Play 2-player matches on a single device with custom names, odd-match series, health & item sliders, per-option Random toggles, shared shipments, turn handoff banners, and smooth eased camera swaps.'
      },
      {
        tag: 'OPTIMIZED',
        title: 'Multiplayer Sync & Connection Performance',
        description: 'Trimmed redundant room data from live state sync packets, added trailing-edge state sync, coalesced rapid aim/hover traffic, and hardened reconnect queue compaction.'
      },
      {
        tag: 'IMPROVED',
        title: 'Menu, Hard Mode & Match Polish',
        description: 'Rebalanced main menu buttons, streamlined Hard Mode confirmation, restored compact Leaderboard rows, and upgraded match-over summaries.'
      }
    ]
  },
  {
    version: '2.2.0',
    date: 'November 19, 2026',
    title: 'Engine 4-Mode Graphics, Grandmaster AI & System Overhaul',
    items: [
      {
        tag: 'NEW',
        title: '⚡ 4th Graphics Mode: LOW Profile with Ambient Lighting',
        description: 'Introduced an optimized 4th graphics tier positioned between Balanced and Potato. Designed for low-spec devices and mobile browsers, it disables expensive real-time shadows, post-processing filters, and secondary lights while preserving essential Lambert ambient lighting (0.35 intensity) and primary spotlighting so 3D objects, guns, and dealer faces remain clearly visible without pitch-black darkening.'
      },
      {
        tag: 'NEW',
        title: '🧠 Complete Dealer AI Overhaul & Deductive Shell Awareness',
        description: 'Complete strategic overhaul of dealer decision logic. Features 100% mathematical certainty deduction from chamber live/blank ratios, proactive Magnifying Glass intel gathering before committing key assets, lethal Saw executions, Handcuff turn denial locks, Choke double-barrel bursts, Remote chamber manipulation, and strategic Inverter live-to-blank conversion to bypass player Jackpot bullet immunity while retaining turn control.'
      },
      {
        tag: 'IMPROVED',
        title: '📱 Mobile Responsive Design Overhaul & 40px+ Touch Targets',
        description: 'Comprehensive mobile and tablet layout enhancement. Interactive controls across ChatBox, Inventory slots, SettingsMenu toggles, and modal dialogues now feature 40px+ minimum touch footprints with native safe-area inset (env(safe-area-inset-*)) awareness, adaptive portrait/landscape orientation handling, and touch debounce to prevent accidental misfires.'
      },
      {
        tag: 'ADDED',
        title: '👥 Upstash to Firebase Firestore Full Cloud Migration',
        description: 'Transitioned the entire persistence layer from legacy Upstash Redis to Google Firebase Firestore. Includes an automated 1-click Migration Modal for legacy players, cross-device career and leaderboard data sync, custom DiceBear SVG avatar seeds, deterministic cryptographic player tags (@CODENAME#XXXX), and secure self-service password reset & email update flows.'
      },
      {
        tag: 'OPTIMIZED',
        title: '🌐 SEO, Geo Meta Tags, Robots.txt & LLM Directives',
        description: 'Upgraded search engine visibility and crawler intelligence with comprehensive OpenGraph previews, Twitter summary cards, Schema.org Game JSON-LD structured schemas, ISO geographic targeting (IN/Global), robots.txt / sitemap.xml crawler routing, and public llms.txt & llms-full.txt context endpoints for AI model ingestion.'
      },
      {
        tag: 'SECURITY',
        title: '🛡️ Open Source Governance, Security Policy & Legal Docs',
        description: 'Standardized repository integrity and community standards with formal SECURITY.md vulnerability disclosure procedures, Contributor Covenant CODE_OF_CONDUCT.md, CONTRIBUTING.md architecture guidelines, and MIT LICENSE terms for open-source safety.'
      }
    ]
  },
  {
    version: '2.1.0',
    date: 'September 27, 2026',
    title: 'Cloud Accounts, Player Avatars & Leaderboard 2.0',
    items: [
      {
        tag: 'NEW',
        title: 'Firebase Cloud Security',
        description: 'Upgraded telemetry, user authentication, and match data sync to Firebase Cloud, ensuring cross-device persistence.'
      },
      {
        tag: 'ADDED',
        title: 'Custom DiceBear Avatars',
        description: 'Choose and generate stylized 8-bit, adventurer, bottts, and persona avatars with custom seeds directly from the player profile dossier.'
      },
      {
        tag: 'ADDED',
        title: 'Deterministic Player IDs',
        description: 'Every agent is assigned an identifiable cryptographic tag (@CODENAME#XXXX) displayed across leaderboards and battle reports.'
      },
      {
        tag: 'UPDATED',
        title: 'Leaderboard Podium & Dossier',
        description: 'Gold, silver, and bronze gradient highlight banners for the top 3 combatants, plus direct profile inspection that smoothly returns to leaderboard.'
      },
      {
        tag: 'IMPROVED',
        title: 'Multiplayer Roster Summaries',
        description: 'Deployed agent cards in match summaries now render custom avatars, host/self indicators, and deterministic agent tags.'
      }
    ]
  },
  {
    version: '1.5.0',
    date: 'July 2, 2026',
    title: 'Sticker UX, Responsive UI & Player Models',
    items: [
      {
        tag: 'ADDED',
        title: 'Sticker Pack Support',
        description: 'New sticker pack support for lobby and in-game chat, including expressive reactions and animated flair for multiplayer sessions.'
      },
      {
        tag: 'ADDED',
        title: 'Player Model Selection',
        description: 'Expanded player model selection with fresh visual variants for a more personalized match experience.'
      },
      {
        tag: 'IMPROVED',
        title: 'Responsive Menu Scaling',
        description: 'Responsive menu and HUD scaling across mobile, tablet, and desktop for cleaner layouts and better usability.'
      },
      {
        tag: 'UPDATED',
        title: 'Interface Consistency',
        description: 'Visual polish for sticker delivery, player avatar presentation, and overall interface consistency in the main menu.'
      }
    ]
  },
  {
    version: '1.4.3',
    date: 'June 27, 2026',
    title: 'Performance Profiles & Turn Keeping Fixes',
    items: [
      {
        tag: 'ADDED',
        title: 'Tactical Stickers',
        description: 'Send animated WebP/GIF stickers in the lobby and inline chat. Pinned jackpot immunity sticker is automatically triggered and displayed during gameplay.'
      },
      {
        tag: 'ADDED',
        title: 'GPU Thermal Throttling',
        description: 'Automatically caps rendering to 24 FPS in all menu and lobby states, and utilizes Linear Tone Mapping in Balanced performance modes to decrease mobile device heat.'
      },
      {
        tag: 'FIXED',
        title: 'Mobile Pointing Toggles',
        description: 'Reworked dual-target pointing on touch screens, requiring a clear selection confirmation tap instead of instantly firing.'
      },
      {
        tag: 'FIXED',
        title: 'Turn Retaining on Last Shell',
        description: 'In multiplayer, if a player shoots themselves with a blank on the last shell in the chamber, they now correctly retain their turn for the next batch.'
      }
    ]
  },
  {
    version: '1.4.2',
    date: 'June 22, 2026',
    title: 'Server Performance & Memory Leaks Cleanups',
    items: [
      {
        tag: 'OPTIMIZED',
        title: 'Stateless Throttling Engine',
        description: 'Replaced per-connection background intervals with high-frequency timestamp differential calculations, reducing server memory allocation loads.'
      },
      {
        tag: 'OPTIMIZED',
        title: 'Allocation Pools',
        description: 'Moved join logic handlers outside the connection events closure scope to minimize dynamic javascript stack overheads.'
      },
      {
        tag: 'ADDED',
        title: 'Seamless Link Recovery',
        description: 'Reconnecting players using duplicate identities overwrite obsolete socket descriptors cleanly, avoiding ghost nodes in active rooms.'
      },
      {
        tag: 'UPDATED',
        title: 'Resource GC Safeguard',
        description: 'Room memory collector ejects lingering socket connections upon purging inactive rooms, and React layout hooks clear initial check timers to prevent leak states.'
      }
    ]
  },
  {
    version: '1.4.1',
    date: 'June 22, 2026',
    title: 'Crash Prevention & Connection Stability',
    items: [
      {
        tag: 'ADDED',
        title: 'Crash & Freeze Protection',
        description: 'Listens for mid-game opponent disconnect alerts to instantly clear variables and cleanly redirect survivors back to the room lobby.'
      },
      {
        tag: 'ADDED',
        title: 'Fallback Long-Polling Transport',
        description: 'Socket connections now seamlessly fall back to polling transport when WebSockets are blocked by proxies.'
      },
      {
        tag: 'OPTIMIZED',
        title: 'Code Deduplication',
        description: 'Extracted room configuration builders on the server and cache configuration loading hooks on the client.'
      },
      {
        tag: 'UPDATED',
        title: 'Server Spec Diagnostic Labels',
        description: 'Diagnostics screen correctly formats RANDOM attribute markers to "RNDM" instead of absolute sentinel integers.'
      }
    ]
  },
  {
    version: '1.4.0',
    date: 'June 21, 2026',
    title: 'Final Polish & Multiplayer Optimizations',
    items: [
      {
        tag: 'ADDED',
        title: 'Multiplayer Manual Section',
        description: 'Reorganized the Tactical Manual and added a Multiplayer overview section with item page pagination adjustments.'
      },
      {
        tag: 'OPTIMIZED',
        title: 'Visual Performance Optimizations',
        description: 'Auto-disables GPU-heavy CRT and scanline overlay animations during active multiplayer window configurations to boost FPS.'
      },
      {
        tag: 'UPDATED',
        title: 'Chatarea Status Indicator',
        description: 'In-game chat boxes now present an informative label identifying system-wide messaging nodes and join notices.'
      }
    ]
  },
  {
    version: '1.3.0',
    date: 'June 21, 2026',
    title: 'Multiplayer Settings & Performance Update',
    items: [
      {
        tag: 'ADDED',
        title: 'RANDOM Lobby Settings',
        description: 'Default starting health and items per shipment are set to RANDOM (value 9) on lobby entrance.'
      },
      {
        tag: 'ADDED',
        title: 'Advanced Settings Auto-Disable',
        description: 'Keeps Advanced Configuration toggled off initially when creating or joining rooms.'
      },
      {
        tag: 'UPDATED',
        title: 'Full Selection Layout Scaling',
        description: 'Locks stable horizontal three-column layout deck on mobile viewports with no cards wrapping.'
      },
      {
        tag: 'OPTIMIZED',
        title: 'Background WebGL Rendering',
        description: 'Pauses animation tick loops and hides container element completely when selection/lobby screens are active.'
      }
    ]
  },
  {
    version: '1.2.1',
    date: 'June 20, 2026',
    title: 'Calibration & Smart AI Update',
    items: [
      {
        tag: 'ADDED',
        title: 'Smart Dealer AI Jackpot Counters',
        description: 'Hard Mode Dealer avoids wasting Saw (90% chance) and uses Inverter (85% chance) on known live shells to flip them to blank and keep turn. Normal Mode has 70% chance to avoid wasting Saw.'
      },
      {
        tag: 'ADDED',
        title: 'Tactile Potato Mode Inventory',
        description: 'Slots slide up by -8px on hover/select and show distinct solid amber border outlines.'
      },
      {
        tag: 'UPDATED',
        title: 'Dealer Peeking Rates',
        description: 'Increased Hard Mode Dealer peeking rates to 70% supernatural intuition and 90% optimal Tarot card selection.'
      },
      {
        tag: 'OPTIMIZED',
        title: 'Dynamic Quality Profile Syncing',
        description: 'Quality changes automatically re-compile WebGL materials and update shadow maps.'
      }
    ]
  },
  {
    version: '1.2.0',
    date: 'June 20, 2026',
    title: 'Tarot Deck & Items Update',
    items: [
      {
        tag: 'ADDED',
        title: 'Tarot Card Deck (DECK_CARD)',
        description: 'Draw 1 of 6 active/passive Tarot cards for game-altering tactical decisions.'
      },
      {
        tag: 'ADDED',
        title: 'New Tactical Items',
        description: 'Lucky Charm, Flashbang, Crusher, Totem, Mirror and Tarot Cards added to shipment pools.'
      },
      {
        tag: 'UPDATED',
        title: 'Mirror 3D Model',
        description: 'Redesigned the Mirror model to be a handle-free gold ornate oval hand-mirror.'
      },
      {
        tag: 'UPDATED',
        title: 'Card Balance Adjustments',
        description: 'Hermit card ends turn instantly; Judgment converted shell probability adjusted to 50%.'
      },
      {
        tag: 'FIXED',
        title: 'Debug Tarot Animations',
        description: 'Tarot Card cheats in debug panel now correctly trigger fanning and flip-reveal animations.'
      }
    ]
  },
  {
    version: '1.1.3',
    date: 'June 15, 2026',
    title: 'Mobile & Stats Polish',
    items: [
      {
        tag: 'ADDED',
        title: 'Debug Mode with Cheats',
        description: 'Debug Mode with cheat options (automatically disables career stats and leaderboard submission).'
      },
      {
        tag: 'FIXED',
        title: 'Mobile Responsive Scaling',
        description: 'Responsive mobile layout scaling for career & login views.'
      },
      {
        tag: 'FIXED',
        title: 'Mobile Guide Tuning',
        description: 'Menu clipping fixes and manual guide scroll tuning on mobile.'
      },
      {
        tag: 'OPTIMIZED',
        title: 'Historical Date Display',
        description: 'Career matches now display accurate historical local dates.'
      }
    ]
  },
  {
    version: '1.1.1',
    date: 'June 15, 2026',
    title: 'Calibration & Polish',
    items: [
      {
        tag: 'ADDED',
        title: 'Ultra Performance Profile',
        description: 'Ultra Performance mode profile (no shadows, flat UI, 60FPS lock).'
      },
      {
        tag: 'ADDED',
        title: 'Glassmorphic HUD Panels',
        description: 'Redesigned glassmorphic Live/Blank count start panels.'
      },
      {
        tag: 'ADDED',
        title: 'High-Fidelity Shell Icons',
        description: 'Dynamic high-fidelity shell icons in main HUD indicators.'
      },
      {
        tag: 'FIXED',
        title: 'Round Start Stutters',
        description: 'Eliminated micro-stutters by cleaning up setups at round starts.'
      },
      {
        tag: 'OPTIMIZED',
        title: 'Lighting Performance',
        description: 'Lighting performance adjustments and menu box scalability.'
      }
    ]
  },
  {
    version: '1.1.0',
    date: 'June 14, 2026',
    title: 'System Calibration & Redesign',
    items: [
      {
        tag: 'ADDED',
        title: 'Cyber Login Console',
        description: 'Redesigned cyber-themed login console & thematic quote header.'
      },
      {
        tag: 'ADDED',
        title: 'Smart Device Presets',
        description: 'Smart default presets automatically mapped for PC versus Mobile hardware.'
      },
      {
        tag: 'ADDED',
        title: 'Grid Overflow Fixes',
        description: 'Fixed items overflow grids on mobile landscape layouts.'
      },
      {
        tag: 'OPTIMIZED',
        title: 'Leaderboard Ranks',
        description: 'Detailed player rank indicators on podium leaderboard.'
      },
      {
        tag: 'OPTIMIZED',
        title: 'Visual Polish',
        description: 'Neon hover borders and smooth button click transitions.'
      }
    ]
  }
];

