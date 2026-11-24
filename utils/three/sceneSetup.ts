import * as THREE from 'three';
import { SceneContext } from '../../types';
import { getDeviceType } from '../gameUtils';
import { getGraphicsPreset, isUltraPerf, isBalancedPerf, isLowPerf, isHighPerf } from '../../constants';
import { setupLighting, createTable, createGunModel, createDealerModel, createPlayerAvatar, createProjectiles, createEnvironment, createDust, createBeerCan, createCigarette, createSaw, createHandcuffs, createMagnifyingGlass, createPhone, createInverter, createAdrenaline, createRemote, createBigInverter, createContract, createLuckycharm, createFlashbang, createCrusher, createTotem, createMirror, createTarotCard, createJackpotMachine } from '../threeHelpers';


export const cleanScene = (scene: THREE.Scene) => {
    if (scene.userData?._removeContextListeners) {
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

    // Clean scene background and environment if textures
    if (scene.background && (scene.background as any) instanceof THREE.Texture) {
        disposeResource(scene.background);
    }
    if (scene.environment && (scene.environment as any) instanceof THREE.Texture) {
        disposeResource(scene.environment);
    }

    scene.clear();
    scene.userData = {};
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
    const camera = new THREE.PerspectiveCamera(props.settings.fov || defaultFov, width / height, 0.1, 100);
    
    // Position camera instantly at its starting view location to avoid gliding from afar in the grey fog at startup
    const initialCamPos = new THREE.Vector3(0, 3.8, 12); // Default player view
    const pSwayX = 0;
    const pSwayY = 0;
    if (props.cameraView === 'TABLE') {
        initialCamPos.set(0, 10, 4);
    } else if (props.cameraView === 'DEALER_GUN') {
        initialCamPos.set(pSwayX * 0.5 - 4, 3 + pSwayY * 0.2, 5);
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
    camera.position.copy(initialCamPos);

    // Pre-calculate initial look-at coordinates so camera initializes pointing at the correct target immediately
    const initialLookAt = new THREE.Vector3(0, 2, -5);
    if (props.cameraView === 'TABLE') {
        initialLookAt.set(0, 0, 0);
    } else if (props.cameraView === 'DEALER_GUN') {
        initialLookAt.set(-0.5, 2, -6);
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
    // Preset 1: Potato ('potato') - Flat shading, zero shadows, linear tone mapping, bare minimum
    // Preset 2: Low ('low') - Fast with preserved processing: ACES tone mapping, fog, subtle lights & materials
    // Preset 3: Balanced ('balanced') - Solid 60fps target, PCF shadows, crisp lighting
    // Preset 4: High ('high') - Rich PBR materials, PCFSoft shadows, full lighting & reflections
    const preset = getGraphicsPreset(props.settings);
    const isPotato = preset === 'potato';
    const isLow = preset === 'low';
    const isBalanced = preset === 'balanced';
    const isHigh = preset === 'high';
    const isUltra = false;

    const isLowEndDevice = (isMobile && (isAndroid || width < 600 || pixelRatio < 2 || (typeof navigator !== 'undefined' && navigator.hardwareConcurrency < 6))) || isPotato;

    // Android Mobile GPU optimization (Adreno and Mali architectures):
    const shaderPrecision: 'highp' | 'mediump' | 'lowp' = isAndroid
        ? (isPotato ? 'lowp' : 'mediump')
        : (isHigh ? 'highp' : (isBalanced || isLow ? 'mediump' : 'lowp'));

    const renderer = new THREE.WebGLRenderer({
        antialias: isHigh && !isMobile && !isAndroid,
        powerPreference: 'high-performance',
        alpha: false,
        stencil: false,
        depth: true,
        precision: shaderPrecision
    });

    // Mobile Optimization: Crisp rendering while ensuring high performance
    let mobilePixelScale = 2.0; // Default mobile
    if (isMobile) {
        mobilePixelScale = isPotato ? 4.8 : (isLow ? 3.2 : (isBalanced ? 2.4 : 1.6));
    } else if (isTablet) {
        mobilePixelScale = isPotato ? 3.6 : (isLow ? 2.6 : (isBalanced ? 2.0 : 1.4));
    }

    // Desktop pixel scale
    const desktopBaseScale = isPotato ? 4.2 : (isLow ? 3.0 : (isBalanced ? 2.4 : 1.8));
    const basePixelScale = (isMobile || isTablet) ? mobilePixelScale : desktopBaseScale;
    const debugHeadModel = props.settings.debugHeadModel ?? 'DEFAULT';
    const isCustomDebugHead = debugHeadModel !== 'DEFAULT';
    const pixelScale = isCustomDebugHead ? Math.max(1.0, basePixelScale * 0.45) : basePixelScale;

    // Clamped DPR per preset:
    let maxPixelRatio = 1.0;
    if (isAndroid) {
        switch (preset) {
            case 'potato':
                maxPixelRatio = Math.min(pixelRatio, 0.75);
                break;
            case 'low':
                maxPixelRatio = Math.min(pixelRatio, 0.88);
                break;
            case 'balanced':
                maxPixelRatio = Math.min(pixelRatio, 1.0);
                break;
            case 'high':
                maxPixelRatio = Math.min(pixelRatio, 1.25);
                break;
        }
    } else {
        switch (preset) {
            case 'potato':
                maxPixelRatio = Math.min(pixelRatio, 0.85);
                break;
            case 'low':
                maxPixelRatio = Math.min(pixelRatio, 0.95);
                break;
            case 'balanced':
                maxPixelRatio = Math.min(pixelRatio, 1.1);
                break;
            case 'high':
                maxPixelRatio = Math.min(pixelRatio, 1.6);
                break;
        }
    }

    renderer.setPixelRatio(maxPixelRatio);
    scene.userData.basePixelRatio = maxPixelRatio;
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

    // Shadow Map configuration per preset:
    switch (preset) {
        case 'potato':
            renderer.shadowMap.enabled = false;
            renderer.shadowMap.autoUpdate = false;
            break;
        case 'low':
            renderer.shadowMap.enabled = !isMobile && !isAndroid;
            renderer.shadowMap.autoUpdate = !isMobile && !isAndroid;
            renderer.shadowMap.type = THREE.PCFShadowMap;
            break;
        case 'balanced':
            renderer.shadowMap.enabled = !isAndroid;
            renderer.shadowMap.autoUpdate = !isAndroid;
            renderer.shadowMap.type = THREE.PCFShadowMap;
            break;
        case 'high':
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.autoUpdate = true;
            renderer.shadowMap.type = isAndroid ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
            break;
    }

    // Tone mapping
    renderer.toneMapping = isPotato
        ? THREE.LinearToneMapping
        : THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isPotato ? 1.0 : (isLow ? 1.45 : (isBalanced ? 1.6 : 1.85));

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
        // Invalidate cached textures and materials so WebGL GPU handles are properly re-allocated
        scene.traverse((obj: any) => {
            if (obj.isMesh && obj.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach((m: any) => {
                    const textureKeys = ['map', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'bumpMap', 'displacementMap', 'envMap'];
                    textureKeys.forEach((key) => {
                        if (m[key] && m[key].isTexture) {
                            m[key].needsUpdate = true;
                        }
                    });
                    m.needsUpdate = true;
                });
            }
        });
        try {
            renderer.compile(scene, camera);
            renderer.render(scene, camera);
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
    const dustParticles = isPotato ? null : createDust(scene, isMobile, false);
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
        scene.add(card);
        itemDeckCards.push(card);
    }

    const itemLight = new THREE.PointLight(0xffffee, 0, 25);
    itemLight.position.set(0, 5, -12);
    scene.add(itemLight);

    const itemsGroup = { itemBeer, itemCigs, itemSaw, itemCuffs, itemGlass, itemPhone, itemInverter, itemAdrenaline, itemRemote, itemBigInverter, itemContract, itemLuckycharm, itemFlashbang, itemCrusher, itemTotem, itemMirror, itemJackpot, itemLight };


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

    // Add click listeners to Gun
    gunGroup.children.forEach(c => {
        c.userData.type = 'GUN';
    });

    // Particles scaled per preset:
    // Preset 1 (Potato): minimal particles (10) for maximum FPS
    // Preset 2 (Low): preserved particles (18 on mobile, 25 on PC)
    // Preset 3 (Balanced): solid 60fps (22 on mobile, 35 on PC)
    // Preset 4 (High): full particles (45 on Android, 75 on PC)
    const isMobileOrAndroid = isMobile || isAndroid;
    const particleCount = isHigh
        ? (isAndroid ? 45 : 75)
        : (isBalanced ? (isMobileOrAndroid ? 22 : 35) : (isLow ? (isMobileOrAndroid ? 18 : 25) : 10));
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

    const sparkCount = isUltra ? (isAndroid ? 40 : 80) : (isHigh ? (isAndroid ? 30 : 50) : (isBalanced ? (isMobileOrAndroid ? 15 : 25) : 10));
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
