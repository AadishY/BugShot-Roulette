import * as THREE from 'three';
import { SceneContext, GraphicsPresetTier } from '../../types';
import { getDeviceType } from '../gameUtils';
import { getGraphicsPreset } from '../../constants';
import { detectSoftwareWebGL, getGraphicsPresetConfig, GraphicsPresetProfile } from './graphicsConfig';
import { computeResponsiveCameraFov, computePortraitCameraZAdjust } from './portraitCamera';
import { setupLighting, createTable, createGunModel, createDealerModel, createPlayerAvatar, createProjectiles, createEnvironment, createDust, createBunkerEnvTexture, createBeerCan, createCigarette, createSaw, createHandcuffs, createMagnifyingGlass, createPhone, createInverter, createAdrenaline, createRemote, createBigInverter, createContract, createLuckycharm, createFlashbang, createCrusher, createTotem, createMirror, createTarotCard, createJackpotMachine, optimizeItemForPreset } from '../threeHelpers';

export const getPresetPixelScale = (settings: any, width: number): number => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
    const isMobileUA = /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua);
    const isTabletUA = /ipad|tablet|playbook|silk/i.test(ua) || (ua.includes('macintosh') && typeof document !== 'undefined' && 'ontouchend' in document);
    const hasTouch = typeof window !== 'undefined' && ('ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0));

    let isMob = false;
    let isTab = false;
    if (isTabletUA || (width >= 768 && width <= 1024 && hasTouch)) {
        isTab = true;
    } else if (isMobileUA || (width < 768 && hasTouch)) {
        isMob = true;
    }

    const preset = getGraphicsPreset(settings);
    let mobilePixelScale = 2.5;
    if (isMob) {
        mobilePixelScale = preset === 'potato' ? 4.6 : (preset === 'low' ? 3.3 : (preset === 'balanced' ? 2.5 : 1.85));
    } else if (isTab) {
        mobilePixelScale = preset === 'potato' ? 3.8 : (preset === 'low' ? 2.8 : (preset === 'balanced' ? 2.15 : 1.6));
    }
    mobilePixelScale = Math.max(mobilePixelScale, settings?.pixelScale || 0);

    const desktopProfileMin = preset === 'potato' ? 4.0 : (preset === 'low' ? 2.8 : (preset === 'balanced' ? 2.3 : 1.7));
    const desktopPixelScale = settings?.pixelScale || 2.3;
    const desktopBaseScale = Math.max(desktopProfileMin, desktopPixelScale);

    const baseScale = (isMob || isTab) ? mobilePixelScale : desktopBaseScale;
    return Math.max(1.0, baseScale * 0.45);
};

export const getPresetMaxPixelRatio = (preset: GraphicsPresetTier, nativeDpr: number, isAndroid: boolean, isSoftwareGl: boolean = false): number => {
    if (isSoftwareGl) return 1;
    const isMobile = isAndroid || (typeof window !== 'undefined' && window.innerWidth < 900 && ('ontouchstart' in window || navigator.maxTouchPoints > 0));
    const profile = getGraphicsPresetConfig(preset, {
        isMobile,
        isAndroid,
        nativeDpr,
        isSoftwareGl: false
    });
    return profile.maxPixelRatio;
};

export const cleanScene = (scene: THREE.Scene) => {
    scene.userData = scene.userData || {};
    scene.userData._disposed = true;
    if (scene.userData._removeContextListeners) {
        try {
            scene.userData._removeContextListeners();
        } catch (e) {}
    }

    const disposedResources = new Set<any>();

    const disposeResource = (resource: any) => {
        if (!resource || disposedResources.has(resource)) return;
        if (resource.userData?.isCachedAsset) return; // Skip cached assets to avoid corruption
        disposedResources.add(resource);
        try {
            if (typeof resource.dispose === 'function') {
                resource.dispose();
            }
        } catch (e) {
            // Ignore disposal errors from transient or already-released resources.
        }
    };

    const disposeMaterial = (material: THREE.Material | THREE.Material[]) => {
        const materials = Array.isArray(material) ? material : [material];

        materials.forEach((mat) => {
            if (!mat || disposedResources.has(mat)) return;
            if (mat.userData?.isCachedAsset) return; // Keep cached materials alive

            const materialWithMaps = mat as THREE.Material & Record<string, any>;
            const textureKeys = [
                'map', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap',
                'emissiveMap', 'aoMap', 'bumpMap', 'displacementMap', 'envMap',
                'lightMap', 'specularMap'
            ];

            textureKeys.forEach((key) => {
                const tex = materialWithMaps[key];
                if (tex instanceof THREE.Texture) {
                    if (tex.userData?.isCachedAsset) return; // Keep cached textures alive
                    disposeResource(tex);
                }
            });

            // Dispose uniform textures if ShaderMaterial
            if ((mat as THREE.ShaderMaterial).uniforms) {
                const uniforms = (mat as THREE.ShaderMaterial).uniforms;
                Object.values(uniforms).forEach((u: any) => {
                    if (u?.value instanceof THREE.Texture) {
                        if (!u.value.userData?.isCachedAsset) {
                            disposeResource(u.value);
                        }
                    }
                });
            }

            disposeResource(mat);
        });
    };

    const objects: THREE.Object3D[] = [];
    scene.traverse((object) => objects.push(object));

    objects.forEach((object) => {
        if (object.parent) {
            object.parent.remove(object);
        }

        const anyObj = object as any;
        if (anyObj.geometry) {
            disposeResource(anyObj.geometry);
        }
        if (anyObj.material) {
            disposeMaterial(anyObj.material);
        }

        if (anyObj.isLight && anyObj.shadow) {
            if (anyObj.shadow.map) {
                if (anyObj.shadow.map.texture) {
                    disposeResource(anyObj.shadow.map.texture);
                }
                disposeResource(anyObj.shadow.map);
            }
        }

        if (anyObj.skeleton && typeof anyObj.skeleton.dispose === 'function') {
            try {
                anyObj.skeleton.dispose();
            } catch (e) {}
        }
    });

    // Clean scene background, environment, and fog
    if (scene.background && (scene.background as any) instanceof THREE.Texture) {
        disposeResource(scene.background);
    }
    if (scene.environment && (scene.environment as any) instanceof THREE.Texture) {
        disposeResource(scene.environment);
    }
    scene.background = null;
    scene.environment = null;
    scene.fog = null;

    scene.clear();
    scene.userData = { _disposed: true };
    disposedResources.clear();
};

export const initThreeScene = (container: HTMLElement, props: any): SceneContext | null => {
    const width = container.clientWidth;
    const height = container.clientHeight;

    if (width === 0 || height === 0) return null;

    const scene = new THREE.Scene();
    // Visible dark background - NOT black so you can always see something
    scene.background = new THREE.Color(0x151210);

    const defaultFov = 85;
    const initAspect = width / height;
    const baseInitFov = props.settings.fov || defaultFov;
    const effectiveInitFov = computeResponsiveCameraFov(baseInitFov, initAspect, props.aimTarget === 'SELF');
    const camera = new THREE.PerspectiveCamera(effectiveInitFov, initAspect, 0.1, 100);
    
    // Position camera instantly at its starting view location to avoid gliding from afar in the grey fog at startup
    const isSplitMode = Boolean(props.gameState?.isLocalSplit);
    const isSplitSeatB = isSplitMode && props.turnOwner === 'DEALER';
    const initialCamPos = new THREE.Vector3(0, 3.8, isSplitSeatB ? -12 : 12);
    const pSwayX = 0;
    const pSwayY = 0;
    if (props.cameraView === 'TABLE') {
        initialCamPos.set(0, 10, isSplitSeatB ? -4 : 4);
    } else if (props.cameraView === 'DEALER_GUN' && !isSplitMode) {
        initialCamPos.set(pSwayX * 0.5 - 4, 3 + pSwayY * 0.2, 5);
    } else if (isSplitSeatB) {
        if (props.aimTarget === 'SELF') {
            initialCamPos.set(0, 2.3, -10.2);
        } else if (props.aimTarget === 'OPPONENT') {
            initialCamPos.set(-2.5, 3.0, -9);
        } else {
            initialCamPos.set(0, 3.8, -12);
        }
    } else if (props.turnOwner === 'DEALER') {
        if (props.aimTarget === 'OPPONENT') {
            initialCamPos.set(pSwayX * 0.1, 1.0 + pSwayY * 0.1, 3.5);
        } else {
            initialCamPos.set(pSwayX, 4 + pSwayY, 11);
        }
    } else if (props.turnOwner === 'PLAYER') {
        if (props.aimTarget === 'SELF') {
            initialCamPos.set(0, 2.3, 10.2);
        } else if (props.aimTarget === 'OPPONENT') {
            initialCamPos.set(2.5 + pSwayX * 0.1, 3.0 + pSwayY * 0.1, 9);
        } else {
            initialCamPos.set(pSwayX * 0.5, 3.8 + pSwayY, 12);
        }
    }
    const initPortraitPull = computePortraitCameraZAdjust(initAspect, props.aimTarget || 'IDLE', props.cameraView || 'PLAYER', props.gameState?.phase || 'LOAD');
    if (initPortraitPull > 0) {
        if (props.cameraView === 'TABLE') {
            initialCamPos.y += initPortraitPull * 0.75;
        }
        initialCamPos.z += isSplitSeatB ? -initPortraitPull : initPortraitPull;
    }
    camera.position.copy(initialCamPos);

    // Pre-calculate initial look-at coordinates so camera initializes pointing at the correct target immediately
    const initialLookAt = new THREE.Vector3(0, 1.5, isSplitSeatB ? 2 : -2);
    if (props.cameraView === 'TABLE') {
        initialLookAt.set(0, 0, 0);
    } else if (props.cameraView === 'DEALER_GUN' && !isSplitMode) {
        initialLookAt.set(-0.5, 2, -6);
    } else if (isSplitSeatB) {
        if (props.aimTarget === 'SELF') {
            initialLookAt.set(0, 1.8, -8.5);
        } else if (props.aimTarget === 'OPPONENT') {
            initialLookAt.set(0, 1.5, 14);
        } else {
            initialLookAt.set(0, 1.5, 2);
        }
    } else if (props.turnOwner === 'DEALER') {
        if (props.aimTarget === 'OPPONENT') {
            initialLookAt.set(-0.5, 2.5, -8);
        } else {
            initialLookAt.set(0, 2, -14);
        }
    } else if (props.turnOwner === 'PLAYER') {
        if (props.aimTarget === 'SELF') {
            initialLookAt.set(0, 1.8, 8.5);
        } else if (props.aimTarget === 'OPPONENT') {
            initialLookAt.set(0, 1.5, -14);
        } else {
            initialLookAt.set(0, 1.5, -2);
        }
    }
    camera.lookAt(initialLookAt);
    scene.userData._curLookAt = initialLookAt.clone();
    scene.userData._targetCamPos = initialCamPos.clone();

    // Device Detection & Optimization Profiles
    const device = getDeviceType();
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobile = device === 'mobile';
    const isTablet = device === 'tablet';
    const isAndroid = userAgent.includes('android');
    const pixelRatio = window.devicePixelRatio || 1;

    // 4 Standardized Graphics Presets:
    // Preset 1: Potato ('potato') - Ultra-fast barebones playable, zero shadows, linear tone mapping
    // Preset 2: Low ('low') - Real atmospheric lighting, bunker fog, subtle contrast & shadows, fast on Android
    // Preset 3: Balanced ('balanced') - Rich 60fps default with sharp key/fill, PCF shadows, specular metal/wood
    // Preset 4: High ('high') - Cinematic ACESFilmic, warm/cool rims, crisp shadows, volumetric dust/muzzle & reflections
    const preset = getGraphicsPreset(props.settings);
    const isPotato = preset === 'potato';

    const initialProfile: GraphicsPresetProfile = getGraphicsPresetConfig(preset, {
        isMobile,
        isTablet,
        isAndroid,
        nativeDpr: pixelRatio,
        isSoftwareGl: false
    });

    const renderer = new THREE.WebGLRenderer({
        antialias: initialProfile.antialias,
        powerPreference: 'high-performance',
        alpha: false,
        stencil: false,
        depth: true,
        precision: initialProfile.shaderPrecision
    });

    const isSoftwareGl = detectSoftwareWebGL(renderer.getContext());
    const graphicsProfile: GraphicsPresetProfile = isSoftwareGl
        ? getGraphicsPresetConfig(preset, {
            isMobile,
            isTablet,
            isAndroid,
            nativeDpr: pixelRatio,
            isSoftwareGl: true
        })
        : initialProfile;

    const isLowEndDevice = isSoftwareGl || (isMobile && (isAndroid || width < 600 || pixelRatio < 2 || (typeof navigator !== 'undefined' && navigator.hardwareConcurrency < 6))) || isPotato;

    const pixelScale = getPresetPixelScale(props.settings, width);
    const maxPixelRatio = graphicsProfile.maxPixelRatio;

    renderer.setPixelRatio(maxPixelRatio);
    scene.userData.basePixelRatio = maxPixelRatio;
    scene.userData._lastResolutionPreset = preset;
    scene.userData.graphicsProfile = graphicsProfile;
    scene.userData.isSoftwareGl = isSoftwareGl;
    renderer.setSize(width / pixelScale, height / pixelScale, false);

    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.userSelect = 'none';
    (renderer.domElement.style as any).webkitUserSelect = 'none';
    (renderer.domElement.style as any).webkitTouchCallout = 'none';
    renderer.domElement.style.imageRendering = 'auto';

    const rendererProps = renderer as any;
    if ('outputColorSpace' in rendererProps) {
        rendererProps.outputColorSpace = THREE.SRGBColorSpace;
    } else if ('outputEncoding' in rendererProps) {
        rendererProps.outputEncoding = THREE.sRGBEncoding;
    }
    rendererProps.physicallyCorrectLights = true;

    // Shadow Map configuration driven by graphicsProfile (LOW & POTATO disable shadow passes completely; BALANCED refreshes every 2nd frame)
    renderer.shadowMap.enabled = graphicsProfile.shadowMapEnabled;
    renderer.shadowMap.autoUpdate = graphicsProfile.shadowAutoUpdate;
    if (graphicsProfile.shadowMapEnabled) {
        renderer.shadowMap.type = graphicsProfile.useSoftShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
        renderer.shadowMap.needsUpdate = true;
    }

    // Tone mapping & exposure stored per preset so render loop respects it
    renderer.toneMapping = graphicsProfile.toneMapping === 'linear'
        ? THREE.LinearToneMapping
        : THREE.ACESFilmicToneMapping;
    const baseExposure = graphicsProfile.baseExposure;
    renderer.toneMappingExposure = baseExposure;
    scene.userData.baseExposure = baseExposure;

    // Smooth bunker reflections for metal & wood (PC Balanced & High only)
    scene.environment = graphicsProfile.enableEnvMap ? createBunkerEnvTexture() : null;

    scene.userData.isMobile = isMobile;
    scene.userData.isAndroid = isAndroid;
    scene.userData.isLowEndDevice = isLowEndDevice;
    scene.userData.settings = props.settings; // Make settings accessible to other scripts
    scene.userData.multiplayerDebugModels = props.gameState?.multiplayerState?.debugPlayerModels || {};

    container.appendChild(renderer.domElement);

    // Resilient WebGL Context Loss & Recovery Handling
    const handleContextLost = (event: Event) => {
        event.preventDefault(); // REQUIRED by WebGL specification so browser can restore context
        console.warn('[Three] WebGL context lost. Pausing rendering and awaiting restoration...');
        scene.userData.isContextLost = true;
    };

    const handleContextRestored = () => {
        console.info('[Three] WebGL context restored. Re-establishing WebGL state...');
        scene.userData.isContextLost = false;
        renderer.resetState();
        if (renderer.shadowMap.enabled) {
            renderer.shadowMap.needsUpdate = true;
        }
        if (scene.environment instanceof THREE.Texture) {
            scene.environment.needsUpdate = true;
        }
        if (scene.background instanceof THREE.Texture) {
            scene.background.needsUpdate = true;
        }
        const textureKeys = ['map', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'bumpMap', 'displacementMap', 'envMap'];
        scene.traverse((obj: any) => {
            if ((obj.isMesh || obj.isSprite || obj.isPoints) && obj.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                for (let mi = 0; mi < mats.length; mi++) {
                    const m = mats[mi];
                    if (!m) continue;
                    for (let ki = 0; ki < textureKeys.length; ki++) {
                        const tex = m[textureKeys[ki]];
                        if (tex && tex.isTexture) {
                            tex.needsUpdate = true;
                        }
                    }
                    m.needsUpdate = true;
                }
            }
        });
        try {
            if (!renderer.getContext().isContextLost()) {
                renderer.compile(scene, camera);
                renderer.render(scene, camera);
            }
        } catch (e) {
            console.warn('[Three] Render warmup after context restore:', e);
        }
    };

    renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored, false);

    scene.userData._removeContextListeners = () => {
        renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
        renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
    };

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const lights = setupLighting(scene, props.settings);
    // ... lights setup array ...
    const baseLights = [
        { light: lights.bulbLight, baseIntensity: lights.bulbLight?.intensity },
        { light: lights.gunSpot, baseIntensity: lights.gunSpot?.intensity },
        { light: lights.mainSpotlight, baseIntensity: lights.mainSpotlight?.intensity },
        { light: lights.tableGlow, baseIntensity: lights.tableGlow?.intensity },
        { light: lights.rimLight, baseIntensity: lights.rimLight?.intensity },
        { light: lights.fillLight, baseIntensity: lights.fillLight?.intensity },
        { light: lights.ambient, baseIntensity: lights.ambient?.intensity },
        { light: lights.bgRim, baseIntensity: lights.bgRim?.intensity },
        { light: lights.dealerRim, baseIntensity: lights.dealerRim?.intensity },
        { light: lights.underLight, baseIntensity: lights.underLight?.intensity }
    ].filter(bl => bl.light) as { light: THREE.Light, baseIntensity: number }[];

    createEnvironment(scene, isMobile, isPotato);
    const dustParticles = graphicsProfile.enableDust ? createDust(scene, isMobile, false) : null;
    createTable(scene, isPotato);

    const { gunGroup, barrelMesh, shortBarrelMesh, sawCut, muzzleFlash, pump, magTube, shortMagTube, chokeMesh, sight, sSight } = createGunModel(scene);
    gunGroup.position.set(0, -0.8, 2);
    gunGroup.rotation.set(0, Math.PI / 2, 0);
    gunGroup.userData.targetPos = new THREE.Vector3(0, -0.8, 2);
    gunGroup.userData.targetRot = new THREE.Euler(0, Math.PI / 2, 0);

    // Gun Light
    const gunLight = new THREE.PointLight(0xffeebb, 0, 15);
    gunLight.position.set(0, 0.5, 0);
    gunGroup.add(gunLight);

    // Items
    const itemBeer = createBeerCan(); itemBeer.visible = false; scene.add(itemBeer);
    const itemCigs = createCigarette(); itemCigs.visible = false; scene.add(itemCigs);
    const itemSaw = createSaw(); itemSaw.visible = false; scene.add(itemSaw);
    const itemCuffs = createHandcuffs(); itemCuffs.visible = false; scene.add(itemCuffs);
    const itemGlass = createMagnifyingGlass(); itemGlass.visible = false; scene.add(itemGlass);
    const itemPhone = createPhone(); itemPhone.visible = false; scene.add(itemPhone);
    const itemInverter = createInverter(); itemInverter.visible = false; scene.add(itemInverter);
    const itemAdrenaline = createAdrenaline(); itemAdrenaline.visible = false; scene.add(itemAdrenaline);
    const itemRemote = createRemote(); itemRemote.visible = false; scene.add(itemRemote);
    const itemBigInverter = createBigInverter(); itemBigInverter.visible = false; scene.add(itemBigInverter);
    const itemContract = createContract(); itemContract.visible = false; scene.add(itemContract);
    const itemLuckycharm = createLuckycharm(); itemLuckycharm.visible = false; scene.add(itemLuckycharm);
    const itemFlashbang = createFlashbang(); itemFlashbang.visible = false; scene.add(itemFlashbang);
    const itemCrusher = createCrusher(); itemCrusher.visible = false; scene.add(itemCrusher);
    const itemTotem = createTotem(); itemTotem.visible = false; scene.add(itemTotem);
    const itemMirror = createMirror(); itemMirror.visible = false; scene.add(itemMirror);
    const itemJackpot = createJackpotMachine(); itemJackpot.visible = false; scene.add(itemJackpot);

    const itemDeckCards: THREE.Group[] = [];
    for (let i = 0; i < 6; i++) {
        const card = createTarotCard('Death');
        card.visible = false;
        optimizeItemForPreset(card, preset);
        scene.add(card);
        itemDeckCards.push(card);
    }

    const itemLight = new THREE.PointLight(0xffffee, 0, 25);
    itemLight.position.set(0, 5, -12);
    scene.add(itemLight);

    const itemsGroup = { itemBeer, itemCigs, itemSaw, itemCuffs, itemGlass, itemPhone, itemInverter, itemAdrenaline, itemRemote, itemBigInverter, itemContract, itemLuckycharm, itemFlashbang, itemCrusher, itemTotem, itemMirror, itemJackpot, itemLight };
    const itemGroups = [itemBeer, itemCigs, itemSaw, itemCuffs, itemGlass, itemPhone, itemInverter, itemAdrenaline, itemRemote, itemBigInverter, itemContract, itemLuckycharm, itemFlashbang, itemCrusher, itemTotem, itemMirror, itemJackpot];
    for (let i = 0; i < itemGroups.length; i++) {
        optimizeItemForPreset(itemGroups[i], preset);
    }


    // Multiplayer vs Singleplayer representation
    const isMP = props.gameState?.isMultiplayer;
    const isThreePlayer = props.gameState?.isThreePlayer;
    const isFourPlayer = props.gameState?.isFourPlayer;
    let dealerGroup: THREE.Group;
    let player3Group: THREE.Group | undefined;
    let player4Group: THREE.Group | undefined;

    // ---------------------------------------------------------------------------
    // Player head-model assignment for multiplayer.
    // Debug-selected models take priority. Defaults are stable per player ID,
    // so the same player keeps the same custom head across scene resets.
    // ---------------------------------------------------------------------------
    type PlayerModelKey = 'DEFAULT' | 'AADISH' | 'ASP' | 'YASH' | 'YUVRAJ';
    const ALL_PLAYER_MODELS: PlayerModelKey[] = ['AADISH', 'ASP', 'YASH', 'YUVRAJ'];

    const stableHash = (value: string) => {
        let hash = 0;
        for (let i = 0; i < value.length; i++) {
            hash = ((hash << 5) - hash) + value.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    };

    const getDefaultModelForPlayer = (playerId?: string, seat: 'dealer' | 'front' | 'left' | 'right' = 'front') => {
        if (!playerId) return 'AADISH' as PlayerModelKey;
        const key = `${seat}:${playerId}`;
        return ALL_PLAYER_MODELS[stableHash(key) % ALL_PLAYER_MODELS.length];
    };

    const roomDebugModels = props.gameState?.multiplayerState?.debugPlayerModels || {};
    const getModelForSeat = (seat: 'dealer' | 'front' | 'left' | 'right', playerIndex: number, playerId?: string) => {
        if (playerId && Object.prototype.hasOwnProperty.call(roomDebugModels, playerId)) {
            return roomDebugModels[playerId] as PlayerModelKey;
        }
        if (Object.prototype.hasOwnProperty.call(roomDebugModels, playerIndex)) {
            return roomDebugModels[playerIndex] as PlayerModelKey;
        }
        if (playerId && props.gameState?.multiplayerState?.players) {
            const playerInRoom = props.gameState.multiplayerState.players.find((p: any) => p.id === playerId);
            if (playerInRoom && playerInRoom.model) {
                return playerInRoom.model as PlayerModelKey;
            }
        }
        return getDefaultModelForPlayer(playerId, seat);
    };

    if (isFourPlayer && props.gameState?.multiplayerState?.players) {
        const players = props.gameState.multiplayerState.players;
        const myId = props.gameState.localPlayerId || '';
        const myIndex = players.findIndex((p: any) => p.id === myId);

        if (myIndex !== -1) {
            const frontOpponent = players[(myIndex + 2) % 4];
            const leftOpponent  = players[(myIndex + 1) % 4];
            const rightOpponent = players[(myIndex + 3) % 4];

            // Front player -> DEALER
            const frontIndex = players.findIndex((p: any) => p.id === frontOpponent?.id);
            const leftIndex = players.findIndex((p: any) => p.id === leftOpponent?.id);
            const rightIndex = players.findIndex((p: any) => p.id === rightOpponent?.id);

            dealerGroup = createPlayerAvatar(scene, new THREE.Vector3(0, -4.5, -8), Math.PI,
                frontOpponent ? frontOpponent.name : 'OPPONENT 1', 4, 4, getModelForSeat('dealer', frontIndex, frontOpponent?.id));
            dealerGroup.name = 'DEALER';

            // Left player -> PLAYER3
            player3Group = createPlayerAvatar(scene, new THREE.Vector3(-8, -4.5, -2), Math.PI / 2,
                leftOpponent ? leftOpponent.name : 'OPPONENT 2', 4, 4, getModelForSeat('left', leftIndex, leftOpponent?.id));
            player3Group.name = 'PLAYER3';
            scene.userData.player3Side = 'left';

            // Right player -> PLAYER4
            player4Group = createPlayerAvatar(scene, new THREE.Vector3(8, -4.5, -2), -Math.PI / 2,
                rightOpponent ? rightOpponent.name : 'OPPONENT 3', 4, 4, getModelForSeat('right', rightIndex, rightOpponent?.id));
            player4Group.name = 'PLAYER4';
            scene.userData.player4Side = 'right';
        } else {
            dealerGroup = createPlayerAvatar(scene, new THREE.Vector3(0, -4.5, -8), Math.PI,
                'OPPONENT 1', 4, 4, getDefaultModelForPlayer(undefined, 'dealer'));
            dealerGroup.name = 'DEALER';
        }

        // Greatly reduce fog so realistic head scans are clearly visible in multiplayer
        if (scene.fog instanceof THREE.FogExp2) scene.fog.density = 0.003;

    } else if (isThreePlayer && props.gameState?.multiplayerState?.players) {
        const players = props.gameState.multiplayerState.players;
        const myId = props.gameState.localPlayerId || '';
        const myIndex = players.findIndex((p: any) => p.id === myId);

        if (myIndex !== -1) {
            const frontOpponent = players[(myIndex + 2) % 3];
            const sideOpponent  = players[(myIndex + 1) % 3];
            const sidePos = myIndex === 1 ? 'right' : 'left';

            // Front player -> DEALER
            const frontIndex = players.findIndex((p: any) => p.id === frontOpponent?.id);
            const sideIndex = players.findIndex((p: any) => p.id === sideOpponent?.id);

            dealerGroup = createPlayerAvatar(scene, new THREE.Vector3(0, -4.5, -8), Math.PI,
                frontOpponent.name, 4, 4, getModelForSeat('dealer', frontIndex, frontOpponent?.id));
            dealerGroup.name = 'DEALER';

            // Side player -> PLAYER3
            const sideX   = sidePos === 'left' ? -8 : 8;
            const sideRot = sidePos === 'left' ? Math.PI / 2 : -Math.PI / 2;
            player3Group = createPlayerAvatar(scene, new THREE.Vector3(sideX, -4.5, -2), sideRot,
                sideOpponent.name, 4, 4, getModelForSeat('left', sideIndex, sideOpponent?.id));
            player3Group.name = 'PLAYER3';
            scene.userData.player3Side = sidePos;
        } else {
            dealerGroup = createPlayerAvatar(scene, new THREE.Vector3(0, -4.5, -8), Math.PI,
                'OPPONENT 1', 4, 4, getDefaultModelForPlayer(undefined, 'dealer'));
            dealerGroup.name = 'DEALER';
        }

        if (scene.fog instanceof THREE.FogExp2) scene.fog.density = 0.003;

    } else if (isMP) {
        const opponentName = props.gameState?.opponentName || 'OPPONENT';
        const remotePlayer = props.gameState?.multiplayerState?.players?.find((p: any) => p.id !== props.gameState?.localPlayerId);
        const remoteIndex = props.gameState?.multiplayerState?.players?.findIndex((p: any) => p.id === remotePlayer?.id) ?? -1;
        dealerGroup = createPlayerAvatar(scene, new THREE.Vector3(0, -4.5, -8), Math.PI,
            opponentName, 4, 4, getModelForSeat('dealer', remoteIndex, remotePlayer?.id));
        dealerGroup.name = 'DEALER'; // Keep 'DEALER' for animation logic compatibility

        if (scene.fog instanceof THREE.FogExp2) scene.fog.density = 0.003;

    } else if (props.gameState?.isLocalSplit) {
        const splitHp = props.gameState.localSplitConfig?.startingHp ?? 4;
        const player1Name = props.gameState.player1Name || 'PLAYER 1';
        const player2Name = props.gameState.opponentName || 'PLAYER 2';
        const p1Model = props.settings?.debugPlayer1Model ?? 'DEFAULT';
        const p2Model = props.settings?.debugHeadModel ?? 'DEFAULT';

        // Seat B (-Z): Player 2 facing +Z
        dealerGroup = createPlayerAvatar(
            scene,
            new THREE.Vector3(0, -4.5, -8),
            Math.PI,
            player2Name,
            splitHp,
            splitHp,
            p2Model
        );
        dealerGroup.name = 'DEALER';
        dealerGroup.visible = !isSplitSeatB;

        // Seat A (+Z): Player 1 facing -Z
        const localPlayer1Group = createPlayerAvatar(
            scene,
            new THREE.Vector3(0, -4.5, 8),
            0,
            player1Name,
            splitHp,
            splitHp,
            p1Model
        );
        localPlayer1Group.name = 'LOCAL_PLAYER1';
        localPlayer1Group.visible = isSplitSeatB;
        scene.userData.cachedLocalPlayer1Group = localPlayer1Group;

        if (scene.fog instanceof THREE.FogExp2) scene.fog.density = 0.003;

    } else {
        dealerGroup = createDealerModel(scene, props.settings?.debugHeadModel ?? 'DEFAULT');

        // Greatly reduce global fog density for non-default head scans so they aren't obscured
        if (props.settings?.debugHeadModel && props.settings.debugHeadModel !== 'DEFAULT') {
            if (scene.fog instanceof THREE.FogExp2) {
                scene.fog.density = 0.003;
            }
        }
    }
    const playerAvatars: THREE.Group[] = [];

    const { bulletMesh: bMesh, shellCasing, shellCasings, shellVelocities } = createProjectiles(scene);
    // Pre-allocate bullet velocity scratch vector so no allocations occur during gun recoil / shot
    bMesh.userData.velocity = new THREE.Vector3();

    // Add click listeners to Gun & invisible collider hitboxes for Experimental Direct 3D Aiming
    const expHitboxMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false
    });

    gunGroup.traverse((c) => {
        c.userData.type = 'GUN';
        c.userData.experimentalTarget = 'GUN';
    });
    const gunHitbox = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.0, 16.5), expHitboxMat);
    gunHitbox.name = 'EXP_GUN_HITBOX';
    gunHitbox.position.set(0, 0.3, 2.2);
    gunHitbox.castShadow = false;
    gunHitbox.receiveShadow = false;
    gunHitbox.userData.type = 'GUN';
    gunHitbox.userData.experimentalTarget = 'GUN';
    gunGroup.add(gunHitbox);

    const expOpponents: THREE.Object3D[] = [];
    const attachOpponentHitbox = (
        group: THREE.Group | undefined,
        tag: 'FRONT_OPPONENT' | 'LOCAL_PLAYER1' | 'PLAYER3' | 'PLAYER4',
        size: [number, number, number],
        offset: [number, number, number]
    ) => {
        if (!group) return;
        group.userData.experimentalTarget = tag;
        const hitbox = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), expHitboxMat);
        hitbox.name = `EXP_HITBOX_${tag}`;
        hitbox.position.set(offset[0], offset[1], offset[2]);
        hitbox.castShadow = false;
        hitbox.receiveShadow = false;
        hitbox.userData.experimentalTarget = tag;
        group.add(hitbox);
        expOpponents.push(hitbox, group);
    };

    const usesAvatarHitbox = Boolean(isMP || props.gameState?.isLocalSplit);
    if (usesAvatarHitbox) {
        attachOpponentHitbox(dealerGroup, 'FRONT_OPPONENT', [5.6, 9.5, 5.6], [0, 6.0, 0]);
    } else {
        // Singleplayer Dealer GLB shifts offset in child mesh toward z ~ -16.5 relative to dealerGroup
        attachOpponentHitbox(dealerGroup, 'FRONT_OPPONENT', [7.2, 9.5, 9.0], [0, 1.2, -15.5]);
    }
    attachOpponentHitbox(scene.userData.cachedLocalPlayer1Group as THREE.Group | undefined, 'LOCAL_PLAYER1', [5.6, 9.5, 5.6], [0, 6.0, 0]);
    attachOpponentHitbox(player3Group, 'PLAYER3', [5.6, 9.5, 5.6], [0, 6.0, 0]);
    attachOpponentHitbox(player4Group, 'PLAYER4', [5.6, 9.5, 5.6], [0, 6.0, 0]);

    const tableBottomA = new THREE.Mesh(new THREE.BoxGeometry(20, 1.6, 8.2), expHitboxMat);
    tableBottomA.name = 'EXP_TABLE_BOTTOM_A';
    tableBottomA.position.set(0, -0.5, 5.0);
    tableBottomA.userData.experimentalTarget = 'TABLE_BOTTOM_A';
    scene.add(tableBottomA);

    const tableBottomB = new THREE.Mesh(new THREE.BoxGeometry(20, 1.6, 8.2), expHitboxMat);
    tableBottomB.name = 'EXP_TABLE_BOTTOM_B';
    tableBottomB.position.set(0, -0.5, -5.0);
    tableBottomB.userData.experimentalTarget = 'TABLE_BOTTOM_B';
    scene.add(tableBottomB);

    const tableGroupObj = scene.getObjectByName('TABLE_GROUP');
    if (tableGroupObj) {
        tableGroupObj.userData.experimentalTarget = 'TABLE_SURFACE';
        tableGroupObj.traverse((child) => {
            child.userData.experimentalTarget = 'TABLE_SURFACE';
        });
    }

    scene.userData.experimentalTargetRegistry = {
        opponents: expOpponents,
        tables: [tableBottomA, tableBottomB, ...(tableGroupObj ? [tableGroupObj] : [])]
    };

    // Particles scaled per preset:
    // Preset 1 (Potato): minimal particles (10) for maximum FPS
    // Preset 2 (Low): preserved particles (18 on mobile, 25 on PC)
    // Preset 3 (Balanced): solid 60fps (22 on mobile, 35 on PC)
    // Preset 4 (High): full particles (45 on Android, 75 on PC)
    const particleCount = graphicsProfile.bloodParticleCount;
    const particles = new THREE.BufferGeometry();
    const pPositions = new Float32Array(particleCount * 3);
    const pVelocities = new Float32Array(particleCount * 3);
    const pColors = new Float32Array(particleCount * 3);
    // Initialize off-screen and set varying colors
    for (let i = 0; i < particleCount; i++) {
        pPositions[i * 3] = 9999;
        pPositions[i * 3 + 1] = 9999;
        pPositions[i * 3 + 2] = 9999;

        // Varies from deep burgundy to rust-crimson
        pColors[i * 3] = 0.45 + Math.random() * 0.45;     // Red
        pColors[i * 3 + 1] = 0.02 + Math.random() * 0.06;  // Green
        pColors[i * 3 + 2] = 0.02 + Math.random() * 0.04;  // Blue
    }

    particles.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    particles.setAttribute('velocity', new THREE.BufferAttribute(pVelocities, 3));
    particles.setAttribute('color', new THREE.BufferAttribute(pColors, 3));

    const pMat = new THREE.PointsMaterial({
        vertexColors: true,
        size: isMobile ? 1.2 : 1.8,
        transparent: true,
        opacity: 0.95,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.NormalBlending
    });
    const bloodParticles = new THREE.Points(particles, pMat);
    // Don't frustrate culling
    bloodParticles.frustumCulled = false;
    scene.add(bloodParticles);

    const sparkCount = graphicsProfile.sparkParticleCount;
    const sparkGeo = new THREE.BufferGeometry();
    const sPos = new Float32Array(sparkCount * 3);
    const sVel = new Float32Array(sparkCount * 3);
    for (let i = 0; i < sparkCount * 3; i++) sPos[i] = 9999;
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    sparkGeo.setAttribute('velocity', new THREE.BufferAttribute(sVel, 3));
    const sMat = new THREE.PointsMaterial({ color: 0xffffcc, size: 0.3, transparent: true, opacity: 1, blending: THREE.AdditiveBlending });
    const sparkParticles = new THREE.Points(sparkGeo, sMat);
    sparkParticles.frustumCulled = false;
    scene.add(sparkParticles);

    return {
        scene,
        camera,
        renderer,
        raycaster,
        mouse,
        gunGroup,
        dealerGroup,
        itemsGroup,
        shellCasing,
        bulletMesh: bMesh,
        bloodParticles,
        sparkParticles,
        dustParticles,
        bulbLight: lights.bulbLight,
        gunLight,
        underLight: lights.underLight,
        muzzleFlash,
        baseLights,
        shellCasings,
        shellVelocities,
        barrelMesh,
        shortBarrelMesh,
        sawCut,
        pumpMesh: pump,
        magTube,
        shortMagTube,
        sight,
        sSight,
        chokeMesh,
        muzzleLight: lights.muzzleLight,
        roomRedLight: lights.roomRedLight,
        nextShellIndex: 0,
        itemDeckCards
    };
};
