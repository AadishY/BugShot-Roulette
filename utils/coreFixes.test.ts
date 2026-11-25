import test from 'node:test';
import assert from 'node:assert/strict';

import { generateRandomAvatar, DICEBEAR_STYLES } from './dicebear.ts';
import {
    shouldAllowUpdateReload,
    recordUpdateReload,
    UPDATE_RELOAD_COOLDOWN_MS,
    UPDATE_RELOAD_STORAGE_KEY
} from './updateGuard.ts';
import { getGraphicsPresetConfig, detectSoftwareWebGL } from './three/graphicsConfig.ts';
import { computeDetailedStats, formatDurationCompact } from './statsAnalytics.ts';
import {
    easeInOutCubic,
    easeInOutSine,
    createIdleSplitCameraTransition,
    beginSplitCameraTransition,
    stepSplitCameraTransition,
    SPLIT_ORBIT_LATERAL_ARC,
    SPLIT_ORBIT_VERTICAL_LIFT,
    SPLIT_ORBIT_MAX_BANK_ROLL,
} from './three/splitCameraTransition.ts';
import {
    stripHeavySyncGameState,
    computeSyncFingerprint,
    compactOfflineActionQueue,
} from './syncOptimizer.ts';
import { SocketBatcher } from './socketOptimizer.ts';
import { resolveMenuBadgeMode, computeMenuScaleMetrics } from './menuLayout.ts';
import {
    MENU_LAUNCH_DURATION_MS,
    LOADING_EXIT_DURATION_MS,
    GAME_REVEAL_DURATION_MS,
    resolveTransitionDelay,
    shouldTriggerGameReveal,
} from './cinematicTransition.ts';
import {
    isExperimentalTurnActive,
    getExperimentalSelfTarget,
    getExperimentalAimTarget,
    resolveExperimentalActionFromHit,
    getExperimentalHoverLabel,
} from './three/experimentalAim.ts';
import {
    generateLootBatch,
    getMultiplayerDefaultWeights,
    getSplitMultiplayerRoomSettings,
} from './game/inventory.ts';

class MemoryStorage {
    private map = new Map<string, string>();
    getItem(key: string): string | null {
        return this.map.has(key) ? this.map.get(key)! : null;
    }
    setItem(key: string, value: string): void {
        this.map.set(key, value);
    }
    removeItem(key: string): void {
        this.map.delete(key);
    }
}

test('generateRandomAvatar assigns unique randomized styles & seeds across new accounts', () => {
    const validStyles = new Set<string>(DICEBEAR_STYLES.map((s) => s.id));
    const seenUrls = new Set<string>();
    const seenStyles = new Set<string>();

    for (let i = 0; i < 30; i++) {
        const av = generateRandomAvatar();
        assert.ok(validStyles.has(av.style), `Unexpected avatar style: ${av.style}`);
        assert.ok(av.seed.length >= 6, 'Seed should have high entropy');
        assert.ok(av.url.includes(`api.dicebear.com/10.x/${av.style}/svg`), `Invalid DiceBear URL: ${av.url}`);
        seenUrls.add(av.url);
        seenStyles.add(av.style);
    }

    assert.equal(seenUrls.size, 30, 'All 30 newly generated avatars must be unique');
    assert.ok(seenStyles.size >= 3, 'Random avatars should spread across multiple DiceBear styles');
});

test('update reload guard enforces strictly single reload per update cycle', () => {
    const storage = new MemoryStorage();
    const t0 = 1_700_000_000_000;

    // First reload is allowed
    assert.equal(shouldAllowUpdateReload(storage, 'sw-v12', t0), true);
    recordUpdateReload(storage, 'sw-v12', t0);
    assert.ok(storage.getItem(UPDATE_RELOAD_STORAGE_KEY));

    // Second & third reloads within cooldown must be blocked
    assert.equal(shouldAllowUpdateReload(storage, 'sw-v12', t0 + 1_500), false);
    assert.equal(shouldAllowUpdateReload(storage, 'sw-v12', t0 + 30_000), false);
    assert.equal(shouldAllowUpdateReload(storage, 'sw-v12', t0 + UPDATE_RELOAD_COOLDOWN_MS - 1), false);
    // Even slightly after base cooldown, same workerKey stays suppressed within 4x window
    assert.equal(shouldAllowUpdateReload(storage, 'sw-v12', t0 + UPDATE_RELOAD_COOLDOWN_MS + 100), false);

    // After cooldown expires, a NEW worker version reload is permitted again
    assert.equal(shouldAllowUpdateReload(storage, 'sw-v13', t0 + UPDATE_RELOAD_COOLDOWN_MS + 100), true);
});

test('graphics preset config aggressively optimizes LOW and BALANCED presets and handles software WebGL', () => {
    const pcEnv = { isMobile: false, isTablet: false, isAndroid: false, isSoftwareGl: false, nativeDpr: 2 };
    const mobEnv = { isMobile: true, isTablet: false, isAndroid: true, isSoftwareGl: false, nativeDpr: 3 };
    const swEnv = { isMobile: false, isTablet: false, isAndroid: false, isSoftwareGl: true, nativeDpr: 2 };

    const lowPc = getGraphicsPresetConfig('low', pcEnv);
    const lowMob = getGraphicsPresetConfig('low', mobEnv);
    const balPc = getGraphicsPresetConfig('balanced', pcEnv);
    const balMob = getGraphicsPresetConfig('balanced', mobEnv);
    const highPc = getGraphicsPresetConfig('high', pcEnv);
    const potatoPc = getGraphicsPresetConfig('potato', pcEnv);
    const highSw = getGraphicsPresetConfig('high', swEnv);

    // LOW must disable shadows, dust, fog sprites, envMap, and synchronous compile
    assert.equal(lowPc.shadowMapEnabled, false);
    assert.equal(lowPc.useLambertEnv, true);
    assert.equal(lowPc.enableDust, false);
    assert.equal(lowPc.fogSpriteCount, 0);
    assert.equal(lowPc.skipSyncCompile, true);
    assert.ok(lowMob.maxPixelRatio <= 0.85, 'Mobile LOW pixel ratio must stay <= 0.85');

    // BALANCED must use throttled shadows, Lambert env materials, and compact shadow maps
    assert.equal(balPc.useLambertEnv, true);
    assert.equal(balPc.shadowAutoUpdate, false);
    assert.ok(balPc.shadowRefreshInterval >= 2, 'BALANCED must throttle shadow map refresh');
    assert.ok(balMob.shadowMapSize <= 256, 'Mobile BALANCED shadow map must stay <= 256');
    assert.equal(balMob.fogSpriteCount, 0);

    // POTATO uses MeshBasicMaterial and lowest pixel ratio
    assert.equal(potatoPc.useBasicEnv, true);
    assert.equal(potatoPc.shadowMapEnabled, false);
    assert.ok(potatoPc.maxPixelRatio < lowPc.maxPixelRatio);

    // HIGH keeps rich lighting & shadows on real GPU
    assert.equal(highPc.shadowMapEnabled, true);
    assert.equal(highPc.useLambertEnv, false);
    assert.ok(highPc.fogSpriteCount >= 4);

    // Software WebGL (SwiftShader) forces ultra-safe settings even on HIGH
    assert.equal(highSw.shadowMapEnabled, false);
    assert.equal(highSw.antialias, false);
    assert.ok(highSw.maxPixelRatio <= 1);
    assert.equal(
        detectSoftwareWebGL({ RENDERER: 0x1F01, getExtension: () => null, getParameter: () => 'Google SwiftShader' } as any),
        true
    );
    assert.equal(
        detectSoftwareWebGL({ RENDERER: 0x1F01, getExtension: () => null, getParameter: () => 'ANGLE (NVIDIA GeForce RTX 4080)' } as any),
        false
    );
});

test('computeDetailedStats calculates full career breakdown, streaks, ratios, and combat rank', () => {
    const detailed = computeDetailedStats(
        {
            wins: 18,
            losses: 6,
            totalRounds: 72,
            shotsFired: 100,
            shotsHit: 76,
            selfShots: 4,
            damageDealt: 120,
            itemsUsed: 45,
            highestRound: 5,
            totalPlaytime: 4320,
            matchHistory: [
                {
                    result: 'WIN',
                    roundsSurvived: 4,
                    damageDealt: 10,
                    damageTaken: 4,
                    totalScore: 2800,
                    isHardMode: true,
                    itemsUsed: { SAW: 3, CIGS: 2 }
                },
                {
                    result: 'WIN',
                    roundsSurvived: 5,
                    damageDealt: 12,
                    damageTaken: 3,
                    totalScore: 2100,
                    isMultiplayer: true,
                    itemsUsed: { SAW: 2, BEER: 1 }
                },
                {
                    result: 'LOSS',
                    roundsSurvived: 2,
                    damageDealt: 4,
                    damageTaken: 6,
                    totalScore: 450,
                    itemsUsed: { CIGS: 1 }
                },
                {
                    result: 'WIN',
                    roundsSurvived: 3,
                    damageDealt: 8,
                    damageTaken: 2,
                    totalScore: 1650,
                    itemsUsed: { SAW: 1 }
                },
                {
                    result: 'WIN',
                    roundsSurvived: 3,
                    damageDealt: 9,
                    damageTaken: 3,
                    totalScore: 1700,
                    itemsUsed: { GLASS: 2 }
                },
                {
                    result: 'WIN',
                    roundsSurvived: 3,
                    damageDealt: 7,
                    damageTaken: 2,
                    totalScore: 1600,
                    itemsUsed: { CIGS: 1 }
                }
            ]
        },
        { hardModeWins: 6 }
    );

    assert.equal(detailed.totalMatches, 24);
    assert.equal(detailed.winRate, 75);
    assert.equal(detailed.accuracy, 76);
    assert.equal(detailed.shotsMissed, 24);
    assert.equal(detailed.damageTaken, 20);
    assert.equal(detailed.damageRatio, '6.00');
    assert.equal(detailed.avgDamagePerMatch, 5);
    assert.equal(detailed.mostUsedItem, 'SAW');
    assert.equal(detailed.mostUsedItemCount, 6);
    assert.equal(detailed.currentStreak, 2);
    assert.equal(detailed.bestStreak, 3);
    assert.equal(detailed.bestScore, 2800);
    assert.equal(detailed.hardModeWins, 6);
    assert.equal(detailed.mpMatches, 1);
    assert.equal(detailed.mpWins, 1);
    assert.equal(detailed.soloMatches, 4);
    assert.equal(detailed.soloWins, 3);
    assert.equal(detailed.formattedPlaytime, '1h 12m');
    assert.equal(detailed.combatRank.tier, 'S');
    assert.equal(formatDurationCompact(95), '1m');
    assert.equal(formatDurationCompact(35), '35s');
});

import {
    isValidDMContactUsername,
    upsertDMContactList,
    mergeDMContacts
} from './dmContacts.ts';
import { computeGameOverSummary } from './gameOverSummary.ts';
import {
    ODD_MATCH_OPTIONS,
    SPLIT_HP_MIN,
    SPLIT_HP_MAX,
    SPLIT_ITEMS_MIN,
    SPLIT_ITEMS_MAX,
    normalizeOddMatches,
    getSplitWinsNeeded,
    sanitizeSplitConfig,
    resolveSplitSetupConfig,
    getSplitItemAmountForMatch,
    pickRandomStartingTurn,
    resolveSplitWinnerName,
    buildLocalSplitMatchPlayers
} from './splitMode.ts';

test('DM contact persistence keeps sent & received chats sorted and deduplicated', () => {
    assert.equal(isValidDMContactUsername('shadow'), true);
    assert.equal(isValidDMContactUsername('global_broadcast'), false);
    assert.equal(isValidDMContactUsername(''), false);

    let list = upsertDMContactList([], {
        username: 'Shadow',
        displayName: 'ShadowOps',
        lastMessage: 'yo ready?',
        lastTimestamp: 1000,
        lastSender: 'me'
    });
    list = upsertDMContactList(list, {
        username: 'Ghost',
        displayName: 'GhostX',
        lastMessage: 'join room',
        lastTimestamp: 2000,
        lastSender: 'Ghost'
    });
    // Updating existing contact case-insensitively moves it to top without duplicating
    list = upsertDMContactList(list, {
        username: 'shadow',
        lastMessage: 'on my way',
        lastTimestamp: 3000,
        lastSender: 'me'
    });

    assert.equal(list.length, 2);
    assert.equal(list[0].username, 'shadow');
    assert.equal(list[0].displayName, 'ShadowOps');
    assert.equal(list[0].lastMessage, 'on my way');
    assert.equal(list[1].username, 'ghost');

    const merged = mergeDMContacts({
        friends: [{ username: 'ghost', displayName: 'GhostX', avatarUrl: '', playerId: 'p-ghost' }],
        recentDMs: list,
        unreadBySender: { viper: 1 },
        currentUsername: 'me',
        resolveContact: (username, fallback) => ({
            username,
            displayName: fallback?.displayName || username,
            avatarUrl: fallback?.avatarUrl || '',
            playerId: ''
        })
    });
    assert.equal(merged.length, 3);
    assert.ok(merged.some(c => c.username === 'shadow' && c.lastMessage === 'on my way'));
    assert.ok(merged.some(c => c.username === 'ghost' && c.isFriend === true));
    assert.ok(merged.some(c => c.username === 'viper'));
});

test('splitMode helpers enforce odd matches, item rules, sanitization, and random starter', () => {
    assert.deepEqual([...ODD_MATCH_OPTIONS], [1, 3, 5, 7, 9]);
    assert.equal(normalizeOddMatches(1), 1);
    assert.equal(normalizeOddMatches(2), 3);
    assert.equal(normalizeOddMatches(4), 5);
    assert.equal(normalizeOddMatches(12), 9);
    assert.equal(normalizeOddMatches(0), 1);

    assert.equal(getSplitWinsNeeded(1), 1);
    assert.equal(getSplitWinsNeeded(3), 2);
    assert.equal(getSplitWinsNeeded(5), 3);
    assert.equal(getSplitWinsNeeded(7), 4);
    assert.equal(getSplitWinsNeeded(9), 5);

    const cfgNone = sanitizeSplitConfig({ player1Name: '  ', player2Name: 'Sam', itemRule: 'NONE', itemsPerShipment: 6, totalMatches: 4, startingHp: 99 });
    assert.equal(cfgNone.player1Name, 'PLAYER 1');
    assert.equal(cfgNone.player2Name, 'SAM');
    assert.equal(cfgNone.totalMatches, 5);
    assert.equal(cfgNone.startingHp, 6);
    assert.equal(cfgNone.itemsPerShipment, 0);
    assert.equal(getSplitItemAmountForMatch(cfgNone, 1), 0);
    assert.equal(getSplitItemAmountForMatch(cfgNone, 2), 0);

    const cfgFrom2 = sanitizeSplitConfig({ player1Name: 'Alex', player2Name: 'Sam', itemRule: 'FROM_ROUND_2', itemsPerShipment: 4, totalMatches: 3, startingHp: 4 });
    assert.equal(getSplitItemAmountForMatch(cfgFrom2, 1), 0);
    assert.equal(getSplitItemAmountForMatch(cfgFrom2, 2), 4);
    assert.equal(getSplitItemAmountForMatch(cfgFrom2, 3), 4);

    const cfgFrom1 = sanitizeSplitConfig({ player1Name: 'Alex', player2Name: 'Sam', itemRule: 'FROM_ROUND_1', itemsPerShipment: 3, totalMatches: 3, startingHp: 4 });
    assert.equal(getSplitItemAmountForMatch(cfgFrom1, 1), 3);
    assert.equal(getSplitItemAmountForMatch(cfgFrom1, 2), 3);

    // Same-name guard ensures P2 gets a distinct name
    const cfgDup = sanitizeSplitConfig({ player1Name: 'Alex', player2Name: 'alex', itemRule: 'FROM_ROUND_1', itemsPerShipment: 2, totalMatches: 1, startingHp: 4 });
    assert.equal(cfgDup.player1Name, 'ALEX');
    assert.equal(cfgDup.player2Name, 'ALEX II');

    assert.equal(pickRandomStartingTurn(() => 0.1), 'PLAYER');
    assert.equal(pickRandomStartingTurn(() => 0.9), 'DEALER');
    assert.equal(resolveSplitWinnerName('PLAYER', 'ALEX', 'SAM'), 'ALEX');
    assert.equal(resolveSplitWinnerName('DEALER', 'ALEX', 'SAM'), 'SAM');
});

test('computeGameOverSummary handles null safety, solo wins, and Local Split series winners', () => {
    const safeNull = computeGameOverSummary('PLAYER', null, false, false);
    assert.equal(safeNull.title, 'VICTORY');
    assert.equal(safeNull.accuracy, 0);

    const splitSummary = computeGameOverSummary(
        'DEALER',
        {
            shotsFired: 10,
            shotsHit: 7,
            damageDealt: 8,
            damageTaken: 4,
            roundsSurvived: 3,
            totalScore: 1450,
            itemsUsed: { SAW: 2, GLASS: 1 },
            result: 'LOSS'
        },
        false,
        false,
        {
            isLocalSplit: true,
            player1Name: 'ALEX',
            player2Name: 'SAM',
            player1Wins: 1,
            player2Wins: 2,
            totalMatches: 3
        }
    );
    assert.equal(splitSummary.title, 'SAM WINS!');
    assert.equal(splitSummary.winnerName, 'SAM');
    assert.ok(splitSummary.subtitle.includes('ALEX 1 - 2 SAM'));
    assert.equal(splitSummary.accuracy, 70);
    assert.equal(splitSummary.totalItemsUsed, 3);
});

test('resolveSplitSetupConfig handles slider bounds and per-option random flags deterministically', () => {
    // Low RNG picks minimum values (NONE rule, 1 match, min HP, 0 items since NONE)
    const lowRand = resolveSplitSetupConfig(
        { player1Name: 'P1', player2Name: 'P2', itemRule: 'FROM_ROUND_1', totalMatches: 5, startingHp: 4, itemsPerShipment: 4 },
        { itemRule: true, totalMatches: true, startingHp: true, itemsPerShipment: true },
        () => 0.0
    );
    assert.equal(lowRand.itemRule, 'NONE');
    assert.equal(lowRand.totalMatches, ODD_MATCH_OPTIONS[0]);
    assert.equal(lowRand.startingHp, SPLIT_HP_MIN);
    assert.equal(lowRand.itemsPerShipment, 0);

    // High RNG picks maximum values (FROM_ROUND_1, 9 matches, max HP, max items)
    const highRand = resolveSplitSetupConfig(
        { player1Name: 'P1', player2Name: 'P2', itemRule: 'NONE', totalMatches: 1, startingHp: 2, itemsPerShipment: 1 },
        { itemRule: true, totalMatches: true, startingHp: true, itemsPerShipment: true },
        () => 0.99
    );
    assert.equal(highRand.itemRule, 'FROM_ROUND_1');
    assert.equal(highRand.totalMatches, ODD_MATCH_OPTIONS[ODD_MATCH_OPTIONS.length - 1]);
    assert.equal(highRand.startingHp, SPLIT_HP_MAX);
    assert.equal(highRand.itemsPerShipment, SPLIT_ITEMS_MAX);

    // Non-random flags preserve explicit slider values
    const fixed = resolveSplitSetupConfig(
        { player1Name: 'Alpha', player2Name: 'Beta', itemRule: 'FROM_ROUND_2', totalMatches: 7, startingHp: 5, itemsPerShipment: 6 },
        { itemRule: false, totalMatches: false, startingHp: false, itemsPerShipment: false },
        () => 0.5
    );
    assert.equal(fixed.itemRule, 'FROM_ROUND_2');
    assert.equal(fixed.totalMatches, 7);
    assert.equal(fixed.startingHp, 5);
    assert.equal(fixed.itemsPerShipment, 6);
    assert.ok(fixed.itemsPerShipment >= SPLIT_ITEMS_MIN && fixed.itemsPerShipment <= SPLIT_ITEMS_MAX);
});

test('splitCameraTransition easing curves provide smooth S-curve acceleration and deceleration', () => {
    assert.equal(easeInOutCubic(-0.5), 0);
    assert.equal(easeInOutCubic(0), 0);
    assert.equal(easeInOutCubic(0.5), 0.5);
    assert.equal(easeInOutCubic(1), 1);
    assert.equal(easeInOutCubic(1.5), 1);

    assert.equal(easeInOutSine(0), 0);
    assert.ok(Math.abs(easeInOutSine(0.5) - 0.5) < 1e-12);
    assert.equal(easeInOutSine(1), 1);

    // Symmetry check: f(1 - t) == 1 - f(t)
    for (const t of [0.1, 0.25, 0.35]) {
        assert.ok(Math.abs(easeInOutCubic(1 - t) - (1 - easeInOutCubic(t))) < 1e-12);
        assert.ok(Math.abs(easeInOutSine(1 - t) - (1 - easeInOutSine(t))) < 1e-12);
    }

    // Smooth ease-in/out: initial 10% delta & final 10% delta are much gentler than mid-arc 10% delta
    const startDelta = easeInOutCubic(0.1) - easeInOutCubic(0.0);
    const midDelta = easeInOutCubic(0.55) - easeInOutCubic(0.45);
    const endDelta = easeInOutCubic(1.0) - easeInOutCubic(0.9);
    assert.ok(startDelta < midDelta * 0.2, `Expected gentle ease-in (${startDelta} vs ${midDelta})`);
    assert.ok(endDelta < midDelta * 0.2, `Expected cushioned ease-out (${endDelta} vs ${midDelta})`);
});

test('stepSplitCameraTransition smoothly orbits from current pose to target seat with zero discontinuity and spike protection', () => {
    const state = createIdleSplitCameraTransition('A');
    const outPos: [number, number, number] = [0, 0, 0];
    const outLook: [number, number, number] = [0, 0, 0];

    // Begin mid-aim from Seat A shoulder offset toward Seat B default POV
    const fromPos: [number, number, number] = [2.5, 3.0, 9.0];
    const fromLook: [number, number, number] = [0, 1.5, -14];
    const targetPos: [number, number, number] = [0, 3.8, -12];
    const targetLook: [number, number, number] = [0, 1.5, 2];

    beginSplitCameraTransition(state, fromPos, fromLook, 'A', 'B', 1.0);
    assert.equal(state.active, true);

    // Frame at dt=0 must start seamlessly at exact fromPos & fromLook (no hard cut)
    const startStep = stepSplitCameraTransition(state, targetPos, targetLook, 0, outPos, outLook);
    assert.equal(startStep.active, true);
    assert.deepEqual(outPos, fromPos);
    assert.deepEqual(outLook, fromLook);
    assert.equal(startStep.bankRoll, 0);

    // Advance smoothly to midpoint (0.5s in 0.05s increments)
    let midStep = startStep;
    for (let i = 0; i < 10; i++) {
        midStep = stepSplitCameraTransition(state, targetPos, targetLook, 0.05, outPos, outLook);
    }
    assert.equal(midStep.active, true);
    assert.ok(Math.abs(midStep.progress - 0.5) < 1e-9);
    // At t=0.5, lateral swing (+X) and vertical lift (+Y) peak cleanly around the table
    assert.ok(
        Math.abs(outPos[0] - (1.25 + SPLIT_ORBIT_LATERAL_ARC)) < 1e-6,
        `Unexpected midpoint X: ${outPos[0]}`
    );
    assert.ok(
        Math.abs(outPos[1] - (3.4 + SPLIT_ORBIT_VERTICAL_LIFT)) < 1e-6,
        `Unexpected midpoint Y: ${outPos[1]}`
    );
    assert.ok(Math.abs(midStep.bankRoll + SPLIT_ORBIT_MAX_BANK_ROLL) < 1e-6);

    // Frame spike protection: a huge dt=5.0 gets clamped to 0.1s so it never teleports to finish in 1 frame
    const spikedStep = stepSplitCameraTransition(state, targetPos, targetLook, 5.0, outPos, outLook);
    assert.equal(spikedStep.active, true);
    assert.ok(Math.abs(spikedStep.progress - 0.6) < 1e-9);

    // Advance remaining 0.4s to settle cleanly at Seat B
    let endStep = spikedStep;
    for (let i = 0; i < 8; i++) {
        endStep = stepSplitCameraTransition(state, targetPos, targetLook, 0.05, outPos, outLook);
    }
    assert.equal(endStep.active, false);
    assert.equal(state.fromSeat, 'B');
    assert.equal(endStep.bankRoll, 0);
    assert.ok(Math.abs(outPos[0] - targetPos[0]) < 1e-6);
    assert.ok(Math.abs(outPos[1] - targetPos[1]) < 1e-6);
    assert.ok(Math.abs(outPos[2] - targetPos[2]) < 1e-6);
    assert.ok(Math.abs(outLook[0] - targetLook[0]) < 1e-6);
    assert.ok(Math.abs(outLook[1] - targetLook[1]) < 1e-6);
    assert.ok(Math.abs(outLook[2] - targetLook[2]) < 1e-6);
});

test('syncOptimizer strips heavy room mirrors, fingerprints changes, and compacts offline queues cleanly', () => {
    const rawGameState = {
        round: 2,
        phase: 'PLAYER_TURN',
        turnOwner: 'PLAYER',
        chamber: ['LIVE', 'BLANK'],
        multiplayerState: { id: '1234', messages: Array.from({ length: 50 }, (_, i) => ({ id: i, text: 'msg' })) },
        localSplitConfig: { player1Name: 'A', player2Name: 'B' },
    };

    const compact = stripHeavySyncGameState(rawGameState);
    assert.equal('multiplayerState' in compact, false);
    assert.equal('localSplitConfig' in compact, false);
    assert.equal(compact.round, 2);
    assert.deepEqual(compact.chamber, ['LIVE', 'BLANK']);

    const p1 = { hp: 4, maxHp: 4, items: ['GLASS', 'SAW'], isHandcuffed: false };
    const p2 = { hp: 3, maxHp: 4, items: ['BEER'], isHandcuffed: true };
    const fpA = computeSyncFingerprint({ type: 'SYNC_STATE', player1State: p1, player2State: p2, gameState: compact });
    const fpSame = computeSyncFingerprint({ type: 'SYNC_STATE', player1State: { ...p1 }, player2State: { ...p2 }, gameState: { ...compact } });
    const fpChanged = computeSyncFingerprint({ type: 'SYNC_STATE', player1State: { ...p1, hp: 3 }, player2State: p2, gameState: compact });
    assert.equal(fpA, fpSame);
    assert.notEqual(fpA, fpChanged);

    const compacted = compactOfflineActionQueue([
        { roomId: '1001', action: { type: 'HOVER_TARGET', target: 'SELF' } },
        { roomId: '1001', action: { type: 'USE_ITEM', index: 0 } },
        { roomId: '1001', action: { type: 'HOVER_TARGET', target: 'OPPONENT' } },
        { roomId: '1001', action: { type: 'SYNC_STATE', v: 1 } },
        { roomId: '1001', action: { type: 'SHOOT', target: 'DEALER' } },
        { roomId: '1001', action: { type: 'SYNC_STATE', v: 2 } },
    ]);
    assert.equal(compacted.length, 4);
    assert.deepEqual(
        compacted.map(q => q.action.type),
        ['USE_ITEM', 'HOVER_TARGET', 'SHOOT', 'SYNC_STATE']
    );
    assert.equal(compacted[1].action.target, 'OPPONENT');
    assert.equal(compacted[3].action.v, 2);

    // SocketBatcher coalesces overwrite packets while keeping non-overwrite packets intact
    const flushed: any[][] = [];
    const batcher = new SocketBatcher(10, 500, (actions) => flushed.push(actions));
    batcher.queue('gameAction', { roomId: '1001', action: { type: 'HOVER_TARGET', target: 'SELF' } });
    batcher.queue('gameAction', { roomId: '1001', action: { type: 'HOVER_TARGET', target: 'OPPONENT' } });
    batcher.queue('gameAction', { roomId: '1001', action: { type: 'SYNC_STATE', v: 1 } });
    batcher.queue('gameAction', { roomId: '1001', action: { type: 'SYNC_STATE', v: 2 } });
    batcher.flush();
    assert.equal(flushed.length, 1);
    assert.equal(flushed[0].length, 2);
    assert.equal(flushed[0][0].data.action.target, 'OPPONENT');
    assert.equal(flushed[0][1].data.action.v, 2);
    batcher.clear();
});

test('menuLayout preserves corner badges on Android landscape (>=500px) and inline mode on narrow portrait (<500px)', () => {
    assert.equal(resolveMenuBadgeMode(390), 'INLINE');
    assert.equal(resolveMenuBadgeMode(499), 'INLINE');
    assert.equal(resolveMenuBadgeMode(500), 'CORNER');
    assert.equal(resolveMenuBadgeMode(640), 'CORNER');

    const portrait = computeMenuScaleMetrics({
        viewportW: 390,
        viewportH: 660,
        measuredW: 360,
        measuredH: 590,
        isCompact: false,
        isMobileUA: true,
        hasTouch: true,
    });
    assert.equal(portrait.badgeMode, 'INLINE');
    assert.ok(portrait.scale > 0.4 && portrait.scale <= 1.0);
    assert.ok(portrait.safeCenterWidth * portrait.scale <= 390);

    const androidLandscape = computeMenuScaleMetrics({
        viewportW: 568,
        viewportH: 320,
        measuredW: 380,
        measuredH: 520,
        isCompact: true,
        isMobileUA: true,
        hasTouch: true,
    });
    assert.equal(androidLandscape.badgeMode, 'CORNER');
    assert.ok(androidLandscape.safeCenterWidth >= 340);
    assert.ok(androidLandscape.scale >= 0.4 && androidLandscape.scale <= 1.0);

    const desktop = computeMenuScaleMetrics({
        viewportW: 1440,
        viewportH: 900,
        measuredW: 400,
        measuredH: 520,
        isCompact: false,
        isMobileUA: false,
        hasTouch: false,
    });
    assert.equal(desktop.badgeMode, 'CORNER');
    assert.ok(desktop.scale >= 0.75 && desktop.scale <= 1.12);
});

test('cinematicTransition resolves timings and reveal triggers across menu, loading, and game states', () => {
    assert.ok(MENU_LAUNCH_DURATION_MS > 0);
    assert.ok(LOADING_EXIT_DURATION_MS > 0);
    assert.ok(GAME_REVEAL_DURATION_MS > 0);

    assert.equal(resolveTransitionDelay(MENU_LAUNCH_DURATION_MS, false), MENU_LAUNCH_DURATION_MS);
    assert.equal(resolveTransitionDelay(MENU_LAUNCH_DURATION_MS, true), 0);
    assert.equal(resolveTransitionDelay(-25, false), 0);

    assert.equal(shouldTriggerGameReveal('LOADING_SP', 'GAME'), true);
    assert.equal(shouldTriggerGameReveal('LOADING_MP', 'MP_SELECTION'), true);
    assert.equal(shouldTriggerGameReveal('LOADING_MP', 'LOBBY'), true);
    assert.equal(shouldTriggerGameReveal('GAME', 'GAME'), false);
    assert.equal(shouldTriggerGameReveal('MENU', 'LOADING_SP'), false);
});

test('experimentalAim maps gun pickup, front opponent shots, 3P/4P targets, and bottom-of-table self shots', () => {
    assert.equal(
        isExperimentalTurnActive({ phase: 'PLAYER_TURN', turnOwner: 'PLAYER', isProcessing: false, isRecovering: false }),
        true
    );
    assert.equal(
        isExperimentalTurnActive({ phase: 'PLAYER_TURN', turnOwner: 'DEALER', isLocalSplit: false }),
        false
    );
    assert.equal(
        isExperimentalTurnActive({ phase: 'PLAYER_TURN', turnOwner: 'DEALER', isLocalSplit: true }),
        true
    );
    assert.equal(
        isExperimentalTurnActive({ phase: 'DEALER_TURN', turnOwner: 'DEALER', isLocalSplit: true }),
        true
    );
    assert.equal(
        isExperimentalTurnActive({ phase: 'PLAYER_TURN', turnOwner: 'PLAYER', isProcessing: true }),
        false
    );
    assert.equal(
        isExperimentalTurnActive({ phase: 'GAME_OVER', turnOwner: 'PLAYER' }),
        false
    );

    assert.equal(getExperimentalSelfTarget(false, 'PLAYER'), 'PLAYER');
    assert.equal(getExperimentalSelfTarget(true, 'DEALER'), 'DEALER');

    // Before grabbing gun: only gun mesh picks up gun
    assert.deepEqual(
        resolveExperimentalActionFromHit({ isGunHeld: false, turnOwner: 'PLAYER', hitTag: 'GUN' }),
        { type: 'PICKUP_GUN' }
    );
    assert.equal(
        resolveExperimentalActionFromHit({ isGunHeld: false, turnOwner: 'PLAYER', hitTag: 'FRONT_OPPONENT' }),
        null
    );

    // Holding gun (SP / MP / Split Seat A): front shoots DEALER, bottom of table shoots PLAYER
    assert.deepEqual(
        resolveExperimentalActionFromHit({ isGunHeld: true, turnOwner: 'PLAYER', hitTag: 'FRONT_OPPONENT' }),
        { type: 'SHOOT', target: 'DEALER' }
    );
    assert.deepEqual(
        resolveExperimentalActionFromHit({ isGunHeld: true, turnOwner: 'PLAYER', hitTag: 'TABLE_BOTTOM_A' }),
        { type: 'SHOOT', target: 'PLAYER' }
    );
    assert.deepEqual(
        resolveExperimentalActionFromHit({ isGunHeld: true, turnOwner: 'PLAYER', hitTag: 'TABLE_SURFACE', ndcY: -0.5 }),
        { type: 'SHOOT', target: 'PLAYER' }
    );
    assert.equal(
        resolveExperimentalActionFromHit({ isGunHeld: true, turnOwner: 'PLAYER', hitTag: 'TABLE_SURFACE', ndcY: 0.1, tableHitLocalZ: 0.2 }),
        null
    );
    assert.deepEqual(
        resolveExperimentalActionFromHit({ isGunHeld: true, turnOwner: 'PLAYER', hitTag: 'PLAYER3' }),
        { type: 'SHOOT', target: 'PLAYER3' }
    );

    // Holding gun (Split Seat B): front shoots PLAYER, bottom B shoots DEALER
    assert.deepEqual(
        resolveExperimentalActionFromHit({ isGunHeld: true, isLocalSplit: true, turnOwner: 'DEALER', hitTag: 'FRONT_OPPONENT' }),
        { type: 'SHOOT', target: 'PLAYER' }
    );
    assert.deepEqual(
        resolveExperimentalActionFromHit({ isGunHeld: true, isLocalSplit: true, turnOwner: 'DEALER', hitTag: 'TABLE_BOTTOM_B' }),
        { type: 'SHOOT', target: 'DEALER' }
    );

    assert.equal(getExperimentalHoverLabel({ type: 'PICKUP_GUN' }, false, 'PLAYER', 'Dealer'), 'GRAB SHOTGUN');
    assert.equal(getExperimentalHoverLabel({ type: 'SHOOT', target: 'PLAYER' }, false, 'PLAYER', 'Dealer'), 'SHOOT YOURSELF');
    assert.equal(getExperimentalHoverLabel({ type: 'SHOOT', target: 'DEALER' }, false, 'PLAYER', 'Dealer'), 'SHOOT DEALER');
    assert.equal(getExperimentalHoverLabel({ type: 'SHOOT', target: 'DEALER' }, true, 'DEALER', 'Player 1'), 'SHOOT YOURSELF');

    // Live 3D gun aiming target mapping while holding gun
    assert.equal(getExperimentalAimTarget({ type: 'SHOOT', target: 'DEALER' }, false, 'PLAYER', true), 'OPPONENT');
    assert.equal(getExperimentalAimTarget({ type: 'SHOOT', target: 'PLAYER' }, false, 'PLAYER', true), 'SELF');
    assert.equal(getExperimentalAimTarget({ type: 'SHOOT', target: 'PLAYER3' }, false, 'PLAYER', true), 'LEFT');
    assert.equal(getExperimentalAimTarget({ type: 'SHOOT', target: 'PLAYER4' }, false, 'PLAYER', true), 'RIGHT');
    assert.equal(getExperimentalAimTarget({ type: 'SHOOT', target: 'PLAYER' }, true, 'DEALER', true), 'OPPONENT');
    assert.equal(getExperimentalAimTarget({ type: 'SHOOT', target: 'DEALER' }, true, 'DEALER', true), 'SELF');
    assert.equal(getExperimentalAimTarget(null, false, 'PLAYER', true), 'CHOOSING');
    assert.equal(getExperimentalAimTarget(null, false, 'PLAYER', false), 'IDLE');
});

test('buildLocalSplitMatchPlayers saves Player 2 name anonymously without any opponent ID', () => {
    const roster = buildLocalSplitMatchPlayers('alice', 'bob', 'DEALER');
    assert.equal(roster.length, 2);
    assert.equal(roster[0].name, 'ALICE');
    assert.equal(roster[0].isHost, true);
    assert.equal(roster[0].isMe, true);
    assert.equal(roster[0].result, 'LOSS');
    assert.equal(roster[1].name, 'BOB');
    assert.equal(roster[1].isAnonymous, true);
    assert.equal(roster[1].isHost, false);
    assert.equal(roster[1].isMe, false);
    assert.equal(roster[1].result, 'WIN');
    assert.equal('id' in roster[1], false);
    assert.equal('playerId' in roster[1], false);
    assert.equal('username' in roster[1], false);
});

test('Totem stays rare and Split MP uses strict 2-player multiplayer probability weights', () => {
    const mp2Weights = getMultiplayerDefaultWeights(2);
    const totalWeight = Object.values(mp2Weights).reduce((acc, w) => acc + w, 0);
    const totemProb = (mp2Weights.TOTEM || 0) / totalWeight;
    assert.ok(totemProb > 0 && totemProb <= 0.01, `Expected rare Totem rate <= 1%, got ${totemProb}`);

    // Split MP room settings always strip custom advanced weights and preserve 2P multiplayer behavior
    const splitSettings = getSplitMultiplayerRoomSettings({
        localSplitConfig: {
            player1Name: 'P1',
            player2Name: 'P2',
            itemRule: 'FROM_ROUND_1',
            itemsPerShipment: 4,
            totalMatches: 3,
            startingHp: 4,
        },
        roomSettings: {
            rounds: 3,
            hp: 4,
            itemsPerShipment: 4,
            isAdvanced: true,
            itemWeights: { TOTEM: 100 },
        },
    });
    assert.equal(splitSettings.isAdvanced, false);
    assert.equal(splitSettings.itemWeights, undefined);

    // Monte Carlo check: 3,000 items rolled via Split MP settings & SP Normal should keep TOTEM < 2%
    let splitTotemCount = 0;
    let spTotemCount = 0;
    const sampleBatches = 750; // 750 * 4 = 3,000 items
    for (let i = 0; i < sampleBatches; i++) {
        const splitBatch = generateLootBatch(4, false, false, 4, [], 0, 4, 4, splitSettings, 2);
        splitTotemCount += splitBatch.filter((item) => item === 'TOTEM').length;

        const spBatch = generateLootBatch(4, false, false, 4, [], 0, 4, 4, undefined, 2);
        spTotemCount += spBatch.filter((item) => item === 'TOTEM').length;
    }
    const splitTotemRate = splitTotemCount / (sampleBatches * 4);
    const spTotemRate = spTotemCount / (sampleBatches * 4);
    assert.ok(splitTotemRate < 0.02, `Split MP Totem rate unexpectedly high: ${splitTotemRate}`);
    assert.ok(spTotemRate < 0.02, `SP Normal Totem rate unexpectedly high: ${spTotemRate}`);
});





