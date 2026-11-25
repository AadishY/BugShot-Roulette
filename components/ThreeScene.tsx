import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CameraView, TurnOwner, AimTarget, AnimationState, GameSettings, SceneContext, PlayerState, GameState, PlayerModelKey, getGraphicsPreset } from '../types';

import { updateScene } from '../utils/sceneLogic';
import { initThreeScene, cleanScene, getPresetPixelScale, getPresetMaxPixelRatio } from '../utils/three/sceneSetup';

interface ThreeSceneProps {
    isSawed: boolean;
    isChokeActive?: boolean;
    isPlayerCuffed?: boolean;
    onGunClick: () => void;
    aimTarget: AimTarget;
    cameraView: CameraView;
    animState: AnimationState;
    turnOwner: TurnOwner;
    settings: GameSettings;
    knownShell?: any;
    isHardMode?: boolean;
    player: PlayerState;
    dealer: PlayerState;
    player3?: PlayerState;
    player4?: PlayerState;
    gameState: GameState;
    onCardClick?: (index: number) => void;
    onLowPerformance?: (fps: number) => void;
    isPaused?: boolean;
    onUpdateNameTags?: (tags: { name: string, x: number, y: number, visible: boolean }[]) => void;
    dealerModel?: PlayerModelKey;
}

interface NameTagItem {
    name: string;
    x: number;
    y: number;
    visible: boolean;
}

const createTagPool = (size: number): NameTagItem[] => {
    const list: NameTagItem[] = [];
    for (let i = 0; i < size; i++) {
        list.push({ name: '', x: 0, y: 0, visible: false });
    }
    return list;
};

const getCachedHead = (scene: THREE.Scene, cacheKey: string, groupName: string): THREE.Object3D | null => {
    if (scene.userData[cacheKey] === undefined) {
        const group = scene.getObjectByName(groupName);
        scene.userData[cacheKey] = group?.getObjectByName('HEAD') || null;
    }
    return scene.userData[cacheKey] as THREE.Object3D | null;
};

const projectHeadTag = (
    head: THREE.Object3D | null,
    label: string,
    camera: THREE.Camera,
    worldPos: THREE.Vector3,
    bbox3: THREE.Box3,
    target: NameTagItem
): boolean => {
    if (!head) return false;
    head.getWorldPosition(worldPos);
    if (head.userData._headTagOffset === undefined) {
        bbox3.setFromObject(head);
        if (bbox3.isEmpty()) {
            head.userData._headTagOffset = 2.4;
        } else {
            const topY = bbox3.max.y;
            const headHeight = bbox3.max.y - bbox3.min.y;
            head.userData._headTagOffset = (topY - worldPos.y) + Math.max(0.08, headHeight * 0.08);
        }
    }
    worldPos.y += head.userData._headTagOffset;
    worldPos.project(camera);
    target.name = label;
    target.x = (worldPos.x * 0.5 + 0.5) * 100;
    target.y = Math.min(100, (worldPos.y * -0.5 + 0.5) * 100 + 7);
    target.visible = worldPos.z <= 1.0;
    return true;
};

const syncResolution = (container: HTMLDivElement, sceneContext: SceneContext, settings: GameSettings) => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;

    const scene = sceneContext.scene;
    const renderer = sceneContext.renderer;
    const camera = sceneContext.camera;

    // Save settings back to scene userData so they are readable in updates
    scene.userData.settings = settings;

    const preset = getGraphicsPreset(settings);
    const nativeDpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

    if (scene.userData._lastResolutionPreset !== preset) {
        scene.userData._lastResolutionPreset = preset;
        scene.userData.dynamicPixelRatioScale = 1.0;
        scene.userData.performanceMode = false;
    }

    const pxScale = getPresetPixelScale(settings, width);
    const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
    const isSoftwareGl = !!scene.userData.isSoftwareGl;
    const maxPixelRatio = getPresetMaxPixelRatio(preset, nativeDpr, isAndroid, isSoftwareGl);

    scene.userData.basePixelRatio = maxPixelRatio;
    const dynamicScale = scene.userData.dynamicPixelRatioScale ?? 1.0;
    const minDpr = isAndroid ? 0.55 : 0.65;
    const effectivePixelRatio = isSoftwareGl ? 1 : Math.max(minDpr, Math.min(maxPixelRatio, maxPixelRatio * dynamicScale));
    renderer.setPixelRatio(effectivePixelRatio);
    renderer.setSize(width / pxScale, height / pxScale, false);
    renderer.domElement.style.imageRendering = 'auto';
    renderer.domElement.style.touchAction = 'none';

    const aspect = width / height;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
};

export const ThreeScene: React.FC<ThreeSceneProps> = ({
    isSawed,
    isChokeActive,
    isPlayerCuffed,
    onGunClick,
    aimTarget,
    cameraView,
    animState,
    turnOwner,
    settings,
    knownShell,
    isHardMode,
    player,
    dealer,
    player3,
    player4,
    gameState,
    onCardClick,
    onLowPerformance,
    isPaused = false,
    onUpdateNameTags,
    dealerModel,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    // Pre-allocated reusable vectors — avoids GC allocations inside gun-fire effects
    const _recoilFwd = useRef(new THREE.Vector3());
    const _muzzleFlashDir = useRef(new THREE.Vector3());
    const _sparkSpread = useRef(new THREE.Vector3());

    const propsRef = useRef({
        isSawed,
        isChokeActive,
        isPlayerCuffed,
        aimTarget,
        cameraView,
        animState,
        turnOwner,
        settings,
        knownShell,
        isHardMode: isHardMode || false,
        player,
        dealer,
        player3,
        player4,
        gameState,
        onCardClick,
        onGunClick,
        onLowPerformance,
        isPaused,
        onUpdateNameTags,
        dealerModel,
    });

    useEffect(() => {
        propsRef.current = {
            isSawed,
            isChokeActive,
            isPlayerCuffed,
            aimTarget,
            cameraView,
            animState,
            turnOwner,
            settings,
            knownShell,
            isHardMode: isHardMode || false,
            player,
            dealer,
            player3,
            player4,
            gameState,
            onCardClick,
            onGunClick,
            onLowPerformance,
            isPaused,
            onUpdateNameTags,
            dealerModel,
        };
    }, [isSawed, isChokeActive, isPlayerCuffed, aimTarget, cameraView, animState, turnOwner, settings, knownShell, isHardMode, player, dealer, player3, player4, gameState, onCardClick, onGunClick, onLowPerformance, isPaused, onUpdateNameTags, dealerModel]);

    const sceneRef = useRef<SceneContext | null>(null);
    const tagProjectionVec = useRef(new THREE.Vector3());
    const worldPositionVec = useRef(new THREE.Vector3());
    const _headBox3 = useRef(new THREE.Box3());
    const prevTagsRef = useRef<NameTagItem[]>([]);
    const _tagsScratch = useRef<NameTagItem[]>(createTagPool(8));
    const tagsOutputPool = useRef<NameTagItem[]>([]);
    const _rayIntersectsScratch = useRef<THREE.Intersection[]>([]);
    const containerRectRef = useRef<DOMRect | null>(null);



    useEffect(() => {
        if (!containerRef.current) return;

        const initThree = () => {
            if (!containerRef.current) return;

            if (sceneRef.current) {
                // Proper cleanup without forcing a context loss, which can leave the
                // next renderer initialization in an invalid state.
                cleanScene(sceneRef.current.scene);
                try {
                    sceneRef.current.renderer.dispose();
                } catch (e) {}
                if (containerRef.current.contains(sceneRef.current.renderer.domElement)) {
                    containerRef.current.removeChild(sceneRef.current.renderer.domElement);
                }
                sceneRef.current = null;
            }

            const context = initThreeScene(containerRef.current, propsRef.current);
            if (context) {
                sceneRef.current = context;
                context.renderer.domElement.style.touchAction = 'none';
                context.renderer.domElement.style.userSelect = 'none';
                (context.renderer.domElement.style as any).webkitUserSelect = 'none';
                (context.renderer.domElement.style as any).webkitTouchCallout = 'none';
                updateCameraResponsive();

                // Render an initial warmup frame; skip heavy synchronous compile on low/potato/mobile-balanced/software GL to avoid blocking clicks
                try {
                    const gl = context.renderer.getContext();
                    const profile = context.scene.userData.graphicsProfile;
                    if (gl && !gl.isContextLost()) {
                        if (!profile?.skipSyncCompile) {
                            context.renderer.compile(context.scene, context.camera);
                        }
                        context.renderer.render(context.scene, context.camera);
                    }
                } catch (e) {
                    console.warn('WebGL precompile warning:', e);
                }
            }
        };

        const userAgent = navigator.userAgent.toLowerCase();
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 900;
        const isAndroid = userAgent.includes('android');

        let frameId = 0;
        let time = 0;
        let lastTime = performance.now();
        const isLowEndMobile = isMobile && (isAndroid || window.devicePixelRatio < 2);
        let lastFrameTime = performance.now();
        let isTabVisible = true;

        let frameCount = 0;
        let fpsTimeStart = performance.now();
        const FPS_SAMPLE_COUNT = 3;
        const fpsSamples = new Float32Array(FPS_SAMPLE_COUNT);
        let fpsSampleIndex = 0;
        let fpsSampleCount = 0;
        let hasShownPerfWarning = false;
        let nameTagFrameCounter = 0;
        const nameTagUpdateInterval = 3;

        // Dynamic Performance Scaling on Mobile / Low-End Devices
        // Lightweight rolling delta measurement over the last 60 frames
        const FRAME_DELTA_HISTORY_SIZE = 60;
        const frameDeltas = new Float32Array(FRAME_DELTA_HISTORY_SIZE);
        let frameDeltaIndex = 0;
        let frameDeltaCount = 0;
        let lastAdaptiveScaleTime = performance.now();
        let dynamicPixelRatioScale = 1.0;

        const handleVisibilityChange = () => {
            if (document.hidden || document.visibilityState !== 'visible') {
                isTabVisible = false;
                if (frameId) {
                    cancelAnimationFrame(frameId);
                    frameId = 0;
                }
            } else {
                isTabVisible = true;
                lastTime = performance.now();
                lastFrameTime = performance.now();
                fpsTimeStart = performance.now();
                frameCount = 0;
                fpsSampleIndex = 0;
                fpsSampleCount = 0;
                fpsSamples.fill(0);
                frameDeltaIndex = 0;
                frameDeltaCount = 0;
                frameDeltas.fill(0);
                if (!frameId) {
                    frameId = requestAnimationFrame(animate);
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        const animate = (currentTime: number = performance.now()) => {
            if (!isMounted) return;
            const isSoftwareGl = !!sceneRef.current?.scene.userData?.isSoftwareGl;
            if (!isSoftwareGl) {
                frameId = requestAnimationFrame(animate);
            }
            if (!sceneRef.current) return;
            // Skip/pause 3D render loop when window is hidden, paused, or WebGL context is lost
            if (propsRef.current.isPaused || !isTabVisible || document.hidden || document.visibilityState !== 'visible' || sceneRef.current.scene.userData?.isContextLost || sceneRef.current.renderer.getContext().isContextLost()) {
                lastTime = currentTime;
                lastFrameTime = currentTime;
                fpsTimeStart = currentTime;
                frameCount = 0;
                if (isSoftwareGl && isMounted) {
                    swPaceTimeout = setTimeout(() => { frameId = requestAnimationFrame(animate); }, 100);
                }
                return;
            }

            const phase = propsRef.current.gameState?.phase;
            const isInMenu = phase === 'BOOT' || phase === 'INTRO' || phase === 'LOAD';

            const preset = getGraphicsPreset(propsRef.current.settings);
            // Target FPS: 24 in software GL, 30 in menu to save battery, 60 during active match
            const currentTargetFPS = isSoftwareGl ? 24 : (isInMenu ? 30 : 60);
            const currentFrameInterval = currentTargetFPS > 0 ? (1000 / currentTargetFPS) : 0;
            const shouldLimitFrame = currentTargetFPS > 0;

            // Frame Limiting Logic (Enforce based on performance settings to save battery/thermal)
            if (shouldLimitFrame) {
                const elapsed = currentTime - lastFrameTime;
                if (elapsed < currentFrameInterval) {
                    if (isSoftwareGl && isMounted) {
                        swPaceTimeout = setTimeout(() => {
                            if (isMounted) frameId = requestAnimationFrame(animate);
                        }, Math.max(8, currentFrameInterval - elapsed));
                    }
                    return;
                }
                lastFrameTime = currentTime - (elapsed % currentFrameInterval);
            } else {
                lastFrameTime = currentTime;
            }

            // FPS Detection Logic for Performance Warning (zero-allocation rolling buffer)
            frameCount++;
            const fpsElapsed = currentTime - fpsTimeStart;
            if (fpsElapsed >= 2000) {
                const currentFps = (frameCount * 1000) / fpsElapsed;
                frameCount = 0;
                fpsTimeStart = currentTime;

                fpsSamples[fpsSampleIndex] = currentFps;
                fpsSampleIndex = (fpsSampleIndex + 1) % FPS_SAMPLE_COUNT;
                if (fpsSampleCount < FPS_SAMPLE_COUNT) {
                    fpsSampleCount++;
                }

                if (fpsSampleCount === FPS_SAMPLE_COUNT) {
                    const avgFps = (fpsSamples[0] + fpsSamples[1] + fpsSamples[2]) / 3;
                    const preset = getGraphicsPreset(propsRef.current.settings);
                    const alreadyShownWarning = sessionStorage.getItem('aadish_roulette_perf_warning_shown') === 'true';
                    if (avgFps < 20 && preset !== 'potato' && !hasShownPerfWarning && !alreadyShownWarning) {
                        hasShownPerfWarning = true;
                        try {
                            sessionStorage.setItem('aadish_roulette_perf_warning_shown', 'true');
                        } catch (e) {
                            console.warn("sessionStorage failed:", e);
                        }
                        if (propsRef.current.onLowPerformance) {
                            propsRef.current.onLowPerformance(avgFps);
                        }
                    }
                }
            }

            const rawDelta = (currentTime - lastTime) / 1000;
            // Cap delta to prevent huge jumps and negative values: smooth frame times
            const delta = Math.max(0.001, Math.min(rawDelta, 0.05));
            lastTime = currentTime;

            // Rolling 60-frame delta history for lightweight dynamic FPS monitoring
            frameDeltas[frameDeltaIndex] = delta;
            frameDeltaIndex = (frameDeltaIndex + 1) % FRAME_DELTA_HISTORY_SIZE;
            if (frameDeltaCount < FRAME_DELTA_HISTORY_SIZE) {
                frameDeltaCount++;
            }

            // Dynamic FPS monitoring and adaptive pixel ratio scaling (protects Android thermals & High preset FPS)
            if (frameDeltaCount >= FRAME_DELTA_HISTORY_SIZE && (currentTime - lastAdaptiveScaleTime > 1500)) {
                let sumDelta = 0;
                for (let i = 0; i < FRAME_DELTA_HISTORY_SIZE; i++) {
                    sumDelta += frameDeltas[i];
                }
                const avgFrameTimeSec = sumDelta / FRAME_DELTA_HISTORY_SIZE;
                const dynamicFps = avgFrameTimeSec > 0 ? (1 / avgFrameTimeSec) : 60;
                const shouldAdaptFps = isMobile || isLowEndMobile || isAndroid || preset === 'potato' || preset === 'high';

                if (shouldAdaptFps && sceneRef.current) {
                    const scene = sceneRef.current.scene;
                    const renderer = sceneRef.current.renderer;
                    const baseRatio = (scene.userData.basePixelRatio as number) || 1.0;
                    const minScale = isAndroid ? (preset === 'potato' ? 0.55 : 0.62) : (preset === 'potato' ? 0.60 : 0.68);
                    const minRatio = isAndroid ? 0.55 : 0.62;
                    const downThreshold = preset === 'high' ? 44 : 34;

                    // Sync local tracker if syncResolution reset it on preset switch
                    if (scene.userData.dynamicPixelRatioScale === 1.0 && dynamicPixelRatioScale !== 1.0 && (currentTime - lastAdaptiveScaleTime > 2000)) {
                        dynamicPixelRatioScale = 1.0;
                    }

                    if (dynamicFps < downThreshold && !isInMenu) {
                        if (dynamicPixelRatioScale > minScale) {
                            dynamicPixelRatioScale = Math.max(minScale, dynamicPixelRatioScale - 0.08);
                            scene.userData.dynamicPixelRatioScale = dynamicPixelRatioScale;
                            lastAdaptiveScaleTime = currentTime;

                            const adaptedRatio = Math.max(minRatio, Math.min(baseRatio, baseRatio * dynamicPixelRatioScale));
                            renderer.setPixelRatio(adaptedRatio);
                            if (containerRef.current && containerRef.current.clientWidth > 0 && containerRef.current.clientHeight > 0) {
                                const pxScale = getPresetPixelScale(propsRef.current.settings, containerRef.current.clientWidth);
                                renderer.setSize(containerRef.current.clientWidth / pxScale, containerRef.current.clientHeight / pxScale, false);
                            }
                            scene.userData.dynamicPixelRatio = adaptedRatio;
                            scene.userData.performanceMode = true;
                        }
                    } else if (dynamicFps >= 56 && dynamicPixelRatioScale < 1.0 && (currentTime - lastAdaptiveScaleTime > 6000)) {
                        // Frame rate has stabilized well above target; smoothly recover pixel ratio without thermal ping-pong
                        dynamicPixelRatioScale = Math.min(1.0, dynamicPixelRatioScale + 0.04);
                        scene.userData.dynamicPixelRatioScale = dynamicPixelRatioScale;
                        lastAdaptiveScaleTime = currentTime;

                        const adaptedRatio = Math.max(minRatio, Math.min(baseRatio, baseRatio * dynamicPixelRatioScale));
                        renderer.setPixelRatio(adaptedRatio);
                        if (containerRef.current && containerRef.current.clientWidth > 0 && containerRef.current.clientHeight > 0) {
                            const pxScale = getPresetPixelScale(propsRef.current.settings, containerRef.current.clientWidth);
                            renderer.setSize(containerRef.current.clientWidth / pxScale, containerRef.current.clientHeight / pxScale, false);
                        }
                        scene.userData.dynamicPixelRatio = adaptedRatio;
                    }
                }
            }

            time += delta;

            const updateStart = performance.now();
            updateScene(sceneRef.current, propsRef.current, time, delta);
            const frameDuration = performance.now() - updateStart;
            const frameBudgetMs = (currentTargetFPS > 0 ? 1000 / currentTargetFPS : 16.67) * 1.2;
            if (sceneRef.current && frameDuration > frameBudgetMs) {
                sceneRef.current.scene.userData.performanceMode = true;
            } else if (sceneRef.current && frameDuration < frameBudgetMs * 0.6) {
                sceneRef.current.scene.userData.performanceMode = false;
            }

            // Smooth ceiling fan rotation inside managed render loop
            if (sceneRef.current?.scene.userData.fanGroup) {
                sceneRef.current.scene.userData.fanGroup.rotation.y += delta * 0.6;
            }

            if (sceneRef.current && propsRef.current.onUpdateNameTags) {
                const shouldReduceNameTags = !!sceneRef.current.scene.userData.performanceMode;
                if (++nameTagFrameCounter % (shouldReduceNameTags ? 4 : nameTagUpdateInterval) === 0) {
                    const { scene, camera, dealerGroup } = sceneRef.current;
                const worldPos = worldPositionVec.current;
                const bbox3 = _headBox3.current;
                const tagsList = _tagsScratch.current;

                const players = propsRef.current.gameState.multiplayerState?.players || [];
                const myId = propsRef.current.gameState.localPlayerId || '';
                const myIndex = players.findIndex((p: any) => p.id === myId);

                const dealerHead = scene.userData.cachedDealerHead || dealerGroup.getObjectByName('HEAD');
                if (!scene.userData.cachedDealerHead) scene.userData.cachedDealerHead = dealerHead;

                let tagCount = 0;
                if (propsRef.current.gameState.isLocalSplit) {
                    if (camera.position.z < -6) {
                        const localP1Head = getCachedHead(scene, 'cachedLocalPlayer1Head', 'LOCAL_PLAYER1');
                        const p1Label = propsRef.current.gameState.player1Name || 'PLAYER 1';
                        if (localP1Head && projectHeadTag(localP1Head, p1Label, camera, worldPos, bbox3, tagsList[tagCount])) {
                            tagsList[tagCount].x = Math.max(12, Math.min(88, tagsList[tagCount].x));
                            tagsList[tagCount].y = Math.max(21, Math.min(76, tagsList[tagCount].y));
                            tagCount++;
                        }
                    } else if (camera.position.z > 6) {
                        const p2Label = propsRef.current.gameState.opponentName || 'PLAYER 2';
                        if (dealerHead && projectHeadTag(dealerHead, p2Label, camera, worldPos, bbox3, tagsList[tagCount])) {
                            tagsList[tagCount].x = Math.max(12, Math.min(88, tagsList[tagCount].x));
                            tagsList[tagCount].y = Math.max(21, Math.min(76, tagsList[tagCount].y));
                            tagCount++;
                        }
                    }
                } else {
                    if (dealerHead && projectHeadTag(dealerHead, propsRef.current.gameState.opponentName || 'OPPONENT', camera, worldPos, bbox3, tagsList[tagCount])) {
                        tagCount++;
                    }

                    const player3Head = getCachedHead(scene, 'cachedPlayer3Head', 'PLAYER3');
                    let player3Name = 'OPPONENT 2';
                    if (myIndex !== -1) {
                        const size = players.length >= 4 ? 4 : 3;
                        const sideOpponent = players[(myIndex + 1) % size];
                        if (sideOpponent) player3Name = sideOpponent.name;
                    }
                    if (player3Head && projectHeadTag(player3Head, player3Name, camera, worldPos, bbox3, tagsList[tagCount])) {
                        tagCount++;
                    }

                    if (players.length >= 4) {
                        const player4Head = getCachedHead(scene, 'cachedPlayer4Head', 'PLAYER4');
                        let player4Name = 'OPPONENT 3';
                        if (myIndex !== -1) {
                            const rightOpponent = players[(myIndex + 3) % 4];
                            if (rightOpponent) player4Name = rightOpponent.name;
                        }
                        if (player4Head && projectHeadTag(player4Head, player4Name, camera, worldPos, bbox3, tagsList[tagCount])) {
                            tagCount++;
                        }
                    }
                }

                // Throttle state updates: only notify parent if tags or positions changed measurably
                let hasChanged = tagCount !== prevTagsRef.current.length;
                if (!hasChanged) {
                    for (let i = 0; i < tagCount; i++) {
                        const cur = tagsList[i];
                        const prev = prevTagsRef.current[i];
                        if (cur.name !== prev.name || cur.visible !== prev.visible || Math.abs(cur.x - prev.x) > 0.08 || Math.abs(cur.y - prev.y) > 0.08) {
                            hasChanged = true;
                            break;
                        }
                    }
                }
                if (hasChanged) {
                    const pool = tagsOutputPool.current;
                    while (pool.length < tagCount) {
                        pool.push({ name: '', x: 0, y: 0, visible: false });
                    }
                    pool.length = tagCount;
                    for (let i = 0; i < tagCount; i++) {
                        pool[i].name = tagsList[i].name;
                        pool[i].x = tagsList[i].x;
                        pool[i].y = tagsList[i].y;
                        pool[i].visible = tagsList[i].visible;
                    }
                    prevTagsRef.current = pool;
                    propsRef.current.onUpdateNameTags(pool);
                }
                }
            }

            if (isSoftwareGl && isMounted) {
                // Yield to main thread after draw on software WebGL renderers so UI stays responsive
                swPaceTimeout = setTimeout(() => {
                    if (isMounted) frameId = requestAnimationFrame(animate);
                }, Math.max(16, 40 - frameDuration));
            }
        };

        const updateCameraResponsive = () => {
            if (!containerRef.current || !sceneRef.current) return;
            containerRectRef.current = containerRef.current.getBoundingClientRect();
            syncResolution(containerRef.current, sceneRef.current, propsRef.current.settings);
        };

        let isMounted = true;
        let checkInterval: any = null;
        let touchTimeout: any = null;
        let initRafId = 0;
        let initTimer: ReturnType<typeof setTimeout> | null = null;
        let swPaceTimeout: ReturnType<typeof setTimeout> | null = null;

        const scheduleInit = () => {
            if (!isMounted || sceneRef.current) return;
            // Yield 1 animation frame + macrotask so LoadingScreen paints immediately with zero UI freeze on Start Game
            initRafId = requestAnimationFrame(() => {
                if (!isMounted || sceneRef.current) return;
                initTimer = setTimeout(() => {
                    if (!isMounted || sceneRef.current || !containerRef.current || containerRef.current.clientWidth <= 0) return;
                    initThree();
                    if (sceneRef.current) {
                        animate();
                    }
                }, 16);
            });
        };

        if (containerRef.current && containerRef.current.clientWidth > 0) {
            scheduleInit();
        } else {
            checkInterval = setInterval(() => {
                if (containerRef.current && containerRef.current.clientWidth > 0) {
                    if (!sceneRef.current) {
                        scheduleInit();
                    }
                    if (checkInterval) {
                        clearInterval(checkInterval);
                        checkInterval = null;
                    }
                }
            }, 32);
        }

        const resizeObserver = new ResizeObserver(() => {
            if (sceneRef.current) {
                updateCameraResponsive();
            } else if (containerRef.current && containerRef.current.clientWidth > 0 && !initRafId && !initTimer) {
                scheduleInit();
                if (checkInterval) {
                    clearInterval(checkInterval);
                    checkInterval = null;
                }
            }
        });
        if (containerRef.current) resizeObserver.observe(containerRef.current);

        // INPUT HANDLING - Prevent Double Firing
        let isTouchInteraction = false;

        const updateHoverIndex = () => {
            if (!sceneRef.current) return;
            const currentGameState = propsRef.current.gameState;
            const canPickCard = currentGameState.turnOwner === 'PLAYER' || (Boolean(currentGameState.isLocalSplit) && currentGameState.turnOwner === 'DEALER');
            if (currentGameState.phase === 'CARD_SELECT' && canPickCard && currentGameState.selectedCardIndex == null) {
                if (sceneRef.current.itemDeckCards) {
                    sceneRef.current.raycaster.setFromCamera(sceneRef.current.mouse, sceneRef.current.camera);
                    const intersects = _rayIntersectsScratch.current;
                    intersects.length = 0;
                    sceneRef.current.raycaster.intersectObjects(sceneRef.current.itemDeckCards, true, intersects);
                    let hoveredIdx: number | null = null;
                    if (intersects.length > 0) {
                        let parentGroup: THREE.Object3D | null = intersects[0].object;
                        while (parentGroup && !parentGroup.name.startsWith('ITEM_DECK_CARD_')) {
                            parentGroup = parentGroup.parent;
                        }
                        if (parentGroup) {
                            hoveredIdx = sceneRef.current.itemDeckCards.indexOf(parentGroup as THREE.Group);
                        }
                    }
                    sceneRef.current.scene.userData.hoveredCardIndex = hoveredIdx;
                }
            } else {
                if (sceneRef.current.scene?.userData) {
                    sceneRef.current.scene.userData.hoveredCardIndex = null;
                }
            }
        };

        const handleMouseMove = (e: MouseEvent) => {
            if (!containerRef.current || !sceneRef.current || isTouchInteraction) return;
            let rect = containerRectRef.current;
            if (!rect || rect.width === 0) {
                rect = containerRef.current.getBoundingClientRect();
                containerRectRef.current = rect;
            }
            sceneRef.current.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            sceneRef.current.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            updateHoverIndex();
        };

        const clickLock = { lastTime: 0 };
        const handleClick = (e?: MouseEvent | TouchEvent) => {
            const now = performance.now();
            if (now - clickLock.lastTime < 100) {
                return;
            }
            clickLock.lastTime = now;

            if (!sceneRef.current) return;

            const currentProps = propsRef.current;
            const currentGameState = currentProps.gameState;

            const canPickCard = currentGameState.turnOwner === 'PLAYER' || (Boolean(currentGameState.isLocalSplit) && currentGameState.turnOwner === 'DEALER');
            if (currentGameState.phase === 'CARD_SELECT' && canPickCard && currentGameState.selectedCardIndex == null) {
                const itemDeckCards = sceneRef.current.itemDeckCards;
                if (itemDeckCards && itemDeckCards.length > 0) {
                    sceneRef.current.raycaster.setFromCamera(sceneRef.current.mouse, sceneRef.current.camera);
                    const intersects = _rayIntersectsScratch.current;
                    intersects.length = 0;
                    sceneRef.current.raycaster.intersectObjects(itemDeckCards, true, intersects);
                    if (intersects.length > 0) {
                        let parentGroup: THREE.Object3D | null = intersects[0].object;
                        while (parentGroup && !parentGroup.name.startsWith('ITEM_DECK_CARD_')) {
                            parentGroup = parentGroup.parent;
                        }
                        if (parentGroup) {
                            const idx = itemDeckCards.indexOf(parentGroup as THREE.Group);
                            if (idx !== -1 && currentProps.onCardClick) {
                                currentProps.onCardClick(idx);
                            }
                        }
                    }
                }
                return;
            }

            sceneRef.current.raycaster.setFromCamera(sceneRef.current.mouse, sceneRef.current.camera);
            const gunHitTargets = sceneRef.current.gunGroup.children;
            if (gunHitTargets && gunHitTargets.length > 0) {
                const intersects = _rayIntersectsScratch.current;
                intersects.length = 0;
                sceneRef.current.raycaster.intersectObjects(gunHitTargets, true, intersects);
                if (intersects.length > 0 && intersects.some(i => i.object.userData.type === 'GUN') && currentProps.onGunClick) {
                    currentProps.onGunClick();
                }
            }
        };

        const handleTouchStart = (e: TouchEvent) => {
            isTouchInteraction = true; // Flag to ignore mouse events for a bit
            if (!containerRef.current || !sceneRef.current || e.changedTouches.length === 0) return;
            const touch = e.changedTouches[0];
            const rect = containerRef.current.getBoundingClientRect();
            containerRectRef.current = rect;
            sceneRef.current.mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
            sceneRef.current.mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
            updateHoverIndex();
        };

        const handleTouchEnd = (e: TouchEvent) => {
            // Prevent default browser click generation if we handle it here
            if (e.cancelable) e.preventDefault();
            handleClick(e);

            // Reset flag after a delay to allow mouse usage again later if needed (hybrid devices)
            if (touchTimeout) clearTimeout(touchTimeout);
            touchTimeout = setTimeout(() => {
                isTouchInteraction = false;
                touchTimeout = null;
            }, 500);
        };

        const el = containerRef.current;
        if (!el) return;

        window.addEventListener('mousemove', handleMouseMove); // Keep mouse move on window for smoother tracking
        el.addEventListener('click', handleClick);

        // Passive false so we can preventDefault
        const touchOpt = { passive: false };
        el.addEventListener('touchstart', handleTouchStart, touchOpt);
        el.addEventListener('touchend', handleTouchEnd, touchOpt);

        return () => {
            isMounted = false;
            if (initRafId) {
                cancelAnimationFrame(initRafId);
                initRafId = 0;
            }
            if (initTimer) {
                clearTimeout(initTimer);
                initTimer = null;
            }
            if (swPaceTimeout) {
                clearTimeout(swPaceTimeout);
                swPaceTimeout = null;
            }
            if (checkInterval) {
                clearInterval(checkInterval);
                checkInterval = null;
            }
            if (touchTimeout) {
                clearTimeout(touchTimeout);
                touchTimeout = null;
            }
            cancelAnimationFrame(frameId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('mousemove', handleMouseMove);
            el.removeEventListener('click', handleClick);
            el.removeEventListener('touchstart', handleTouchStart);
            el.removeEventListener('touchend', handleTouchEnd);
            resizeObserver.disconnect();
            if (sceneRef.current) {
                cleanScene(sceneRef.current.scene);
                try {
                    const renderer = sceneRef.current.renderer;
                    if (renderer.renderLists) {
                        renderer.renderLists.dispose();
                    }
                    renderer.dispose();
                } catch (e) {
                    console.warn('Error disposing renderer during cleanup:', e);
                }
                sceneRef.current = null;
            }
            if (containerRef.current) containerRef.current.innerHTML = '';
        };
    }, [
        gameState.isMultiplayer,
        gameState.isLocalSplit,
        gameState.isThreePlayer,
        gameState.multiplayerState?.players?.map(p => `${p.id}:${p.model || ''}`).join(','),
        Object.entries(gameState.multiplayerState?.debugPlayerModels || {})
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([playerId, modelKey]) => `${playerId}:${modelKey}`)
            .join(','),
        settings.graphicsMode,
        settings.ultraPerformance,
        settings.balancedPerformance,
        settings.debugHeadModel,
        isPaused,
        dealerModel
    ]); // Rebuild scene when switching SP/MP/Split, toggling perf/head override, or unpausing the game

    // Separate effect for Pixel Scale / Resolution updates (No Rebuild)
    useEffect(() => {
        if (!containerRef.current || !sceneRef.current) return;
        syncResolution(containerRef.current, sceneRef.current, settings);
    }, [settings.pixelScale, settings.graphicsMode, settings.ultraPerformance, settings.balancedPerformance]);

    // --- SYNC EFFECTS ---
    useEffect(() => {
        if (!sceneRef.current) return;
        const { sparkParticles, gunGroup } = sceneRef.current;
        gunGroup.userData.isSawing = propsRef.current.animState.isSawing;

        if (animState.triggerSparks > 0) {
            sceneRef.current.scene.userData.cameraShake = 0.6;
            const pos = sparkParticles.geometry.attributes.position.array as Float32Array;
            const vel = sparkParticles.geometry.attributes.velocity.array as Float32Array;
            const isPlayer = propsRef.current.turnOwner === 'PLAYER';
            const sparkZOffset = isPlayer ? 4.5 : -4.5; // Offset towards the side using it

            for (let i = 0; i < pos.length / 3; i++) {
                const idx = i * 3;
                pos[idx] = gunGroup.position.x + (Math.random() - 0.5) * 0.5;
                pos[idx + 1] = gunGroup.position.y + 0.3;
                pos[idx + 2] = gunGroup.position.z + (Math.random() - 0.5) * 1.5 + sparkZOffset;
                vel[idx] = (Math.random() - 0.5) * 0.8;
                vel[idx + 1] = Math.random() * 0.5;
                vel[idx + 2] = (Math.random() - 0.5) * 0.4;
            }
            sparkParticles.geometry.attributes.position.needsUpdate = true;
        }
    }, [animState.triggerSparks, animState.isSawing]);

    useEffect(() => {
        if (sceneRef.current) sceneRef.current.dealerGroup.userData.targetY = animState.dealerDropping ? -15 : null;
    }, [animState.dealerDropping]);

    useEffect(() => {
        if (animState.dealerHit && sceneRef.current) {
            const { bloodParticles } = sceneRef.current;
            const positions = bloodParticles.geometry.attributes.position.array as Float32Array;
            const velocities = bloodParticles.geometry.attributes.velocity.array as Float32Array;
            for (let i = 0; i < positions.length / 3; i++) {
                const idx = i * 3;
                positions[idx] = 0 + (Math.random() - 0.5) * 2.0;
                positions[idx + 1] = 5.5 + (Math.random() - 0.5) * 1.5;
                positions[idx + 2] = -12 + (Math.random() - 0.5) * 1.0;
                velocities[idx] = (Math.random() - 0.5) * 0.6;
                velocities[idx + 1] = (Math.random() * 0.4) + 0.1;
                velocities[idx + 2] = (Math.random() * 0.8) + 0.4;
            }
            bloodParticles.geometry.attributes.position.needsUpdate = true;
        }
    }, [animState.dealerHit]);

    useEffect(() => {
        if (animState.triggerCuff > 0 && sceneRef.current) {
            sceneRef.current.scene.userData.cameraShake = 0.8;
        }
    }, [animState.triggerCuff]);

    useEffect(() => {
        if (!sceneRef.current) return;
        if (animState.triggerDrink > 0) sceneRef.current.scene.userData.cameraShake = 0.5;
        if (animState.triggerHeal > 0) sceneRef.current.scene.userData.cameraShake = 0.3;
        if (animState.triggerRemote > 0) sceneRef.current.scene.userData.cameraShake = 0.7; // Shake on remote use
    }, [animState.triggerDrink, animState.triggerHeal, animState.triggerRemote]);

    // Variant transformations are now handled dynamically in sceneLogic.ts

    // CHOKE ATTACHMENT SYNC
    useEffect(() => {
        if (!sceneRef.current || !sceneRef.current.chokeMesh) return;
        const { chokeMesh } = sceneRef.current;

        const isVisible = propsRef.current.isChokeActive;

        // Sync choke visibility: maintains state after animation completes and hides on shot
        if (!animState.triggerChoke) {
            chokeMesh.visible = !!isVisible;
        } else {
            if (isVisible) chokeMesh.visible = true;
            else if (animState.triggerChoke > 0 && !isVisible) {
                chokeMesh.visible = false;
            }
        }

        if (isVisible) {
            // If sawed, move choke back
            if (isSawed) {
                chokeMesh.position.z = 8.4;
            } else {
                chokeMesh.position.z = 10.9;
            }
        }
    }, [propsRef.current.isChokeActive, animState.triggerChoke, isSawed]);

    useEffect(() => {
        if (!sceneRef.current) return;
        const { muzzleLight, muzzleFlash, gunGroup, roomRedLight, sparkParticles } = sceneRef.current;
        muzzleLight.intensity = animState.muzzleFlashIntensity;
        muzzleLight.position.copy(gunGroup.position);
        muzzleLight.position.y += 0.5;
        const dir = _muzzleFlashDir.current.set(0, 0, 1).applyEuler(gunGroup.rotation);
        muzzleLight.position.addScaledVector(dir, 8);
        if (animState.muzzleFlashIntensity > 0) {
            if (animState.isLiveShot) {
                muzzleFlash.visible = true;
                for (let i = 0; i < muzzleFlash.children.length; i++) {
                    const child = muzzleFlash.children[i];
                    const mat = (child as THREE.Mesh | THREE.Sprite).material as THREE.MeshBasicMaterial | THREE.SpriteMaterial;
                    if (mat) {
                        mat.opacity = child.userData?.isMuzzleGlow ? 0.78 : 1;
                        if (!child.userData?.isMuzzleGlow && mat.color) mat.color.setHex(0xff5500);
                    }
                }

                muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
                muzzleLight.color.setHex(0xffaa00);
                roomRedLight.intensity = 20 * (propsRef.current.settings.brightness || 1.0);

                const pos = sparkParticles.geometry.attributes.position.array as Float32Array;
                const vel = sparkParticles.geometry.attributes.velocity.array as Float32Array;
                const count = pos.length / 3;
                const spread = _sparkSpread.current;
                for (let i = 0; i < count && i < 60; i++) {
                    const idx = i * 3;
                    pos[idx] = muzzleLight.position.x + (Math.random() - 0.5) * 0.3;
                    pos[idx + 1] = muzzleLight.position.y + (Math.random() - 0.5) * 0.3;
                    pos[idx + 2] = muzzleLight.position.z + (Math.random() - 0.5) * 0.3;
                    spread.set(
                        (Math.random() - 0.5) * 1.0,
                        (Math.random() - 0.5) * 1.0,
                        (Math.random() - 0.5) * 1.0,
                    );
                    const speed = 1.0 + Math.random() * 2.0;
                    vel[idx] = dir.x * speed + spread.x;
                    vel[idx + 1] = dir.y * speed + spread.y;
                    vel[idx + 2] = dir.z * speed + spread.z;
                }
                sparkParticles.geometry.attributes.position.needsUpdate = true;
            } else {
                for (let i = 0; i < muzzleFlash.children.length; i++) {
                    const child = muzzleFlash.children[i] as THREE.Mesh | THREE.Sprite;
                    if (child.material) (child.material as THREE.Material).opacity = 0;
                }
                muzzleFlash.visible = false;
                muzzleLight.intensity = 0;
                // Maintain ambient red glow
                roomRedLight.intensity = 3.0 * (propsRef.current.settings.brightness || 1.0);
            }
        } else {
            let isVis = false;
            for (let i = 0; i < muzzleFlash.children.length; i++) {
                const child = muzzleFlash.children[i] as THREE.Mesh | THREE.Sprite;
                const mat = child.material as THREE.Material;
                if (mat && mat.opacity > 0) {
                    mat.opacity = Math.max(0, mat.opacity - 0.15);
                    if (mat.opacity > 0) isVis = true;
                }
            }

            if (animState.muzzleFlashIntensity === 0) {
                isVis = false;
                muzzleFlash.visible = false;
            } else {
                muzzleFlash.visible = isVis;
            }

            // Return to ambient red glow
            const targetRed = 3.0 * (propsRef.current.settings.brightness || 1.0);
            roomRedLight.intensity = THREE.MathUtils.lerp(roomRedLight.intensity, targetRed, 0.2);
            if (!isVis && muzzleFlash.visible) muzzleFlash.visible = false;
        }
    }, [animState.muzzleFlashIntensity, animState.isLiveShot]);

    useEffect(() => {
        if (animState.triggerRecoil === 0 || !sceneRef.current) return;
        const { gunGroup, bulletMesh, scene } = sceneRef.current;
        const recoilMult = animState.isLiveShot ? 1.0 : 0.3;
        // Reuse pre-allocated vector — no GC alloc on every shot
        const forward = _recoilFwd.current.set(0, 0, 1).applyEuler(gunGroup.rotation);
        gunGroup.position.sub(forward.multiplyScalar(1.5 * recoilMult));
        gunGroup.rotation.x -= 0.5 * recoilMult;
        if (animState.isLiveShot) {
            bulletMesh.visible = true;
            bulletMesh.position.copy(gunGroup.position);
            bulletMesh.position.add(forward.normalize().multiplyScalar(isSawed ? 4 : 8));
            if (!bulletMesh.userData.velocity) bulletMesh.userData.velocity = new THREE.Vector3();
            (bulletMesh.userData.velocity as THREE.Vector3).copy(forward).normalize();
        }
        scene.userData.cameraShake = animState.isLiveShot ? 1.5 : 0.2;
    }, [animState.triggerRecoil, isSawed, animState.isLiveShot]);

    useEffect(() => {
        if (animState.triggerRack === 0 || !sceneRef.current) return;
        const { shellCasings, shellVelocities, gunGroup } = sceneRef.current;
        if (!shellCasings || !shellVelocities) return;

        let colors = [animState.ejectedShellColor];
        if (animState.ejectedShellColor.includes('+')) {
            colors = animState.ejectedShellColor.split('+') as any; // 'red', 'red' etc.
        }

        colors.forEach((color, i) => {
            // Eject Shell Logic
            const nextIdx = sceneRef.current!.nextShellIndex ?? 0;
            const shell = shellCasings[nextIdx];
            const vel = shellVelocities[nextIdx];
            sceneRef.current!.nextShellIndex = (nextIdx + 1) % shellCasings.length;
            const mat = shell.material as THREE.MeshStandardMaterial;

            if (color === 'blue') {
                mat.color.setHex(0x3b82f6);
                mat.emissive.setHex(0x1e40af);
                mat.emissiveIntensity = 0.5;
            } else {
                mat.color.setHex(0xef4444);
                mat.emissive.setHex(0x991b1b);
                mat.emissiveIntensity = 0.4;
            }

            shell.scale.setScalar(2.0);
            shell.visible = true;
            const basePos = shell.userData.basePosition || { x: 0, z: 0 };

            // Offset second shell slightly if double drop
            const offsetDelay = i * 0.2;

            // Immediate position set? No, shells update in loop. 
            // Just set initial pos.
            shell.position.set(
                basePos.x + (Math.random() - 0.5) * 0.3 + i * 0.1,
                3 + i * 0.5, // Second one higher
                basePos.z + (Math.random() - 0.5) * 0.3
            );

            shell.userData.landedAt = null;
            vel.set(
                (Math.random() - 0.5) * 0.04 + (i * 0.02), // Spread x
                0.05 + Math.random() * 0.02,
                (Math.random() - 0.5) * 0.03
            );
        });

        gunGroup.rotation.x -= 0.4;

    }, [animState.triggerRack, animState.ejectedShellColor]);

    return (
        <div
            ref={containerRef}
            className="absolute inset-0 z-0 bg-neutral-950 select-none webgl-container"
            style={{
                display: isPaused ? 'none' : 'block',
                touchAction: 'none',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none'
            }}
        />
    );
};