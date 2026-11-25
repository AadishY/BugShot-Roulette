import * as THREE from 'three';
import { getGraphicsPreset } from '../../types';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getPreloadedGLB } from './glbPreloader';

type DebugHeadModel = 'DEFAULT' | 'YASH' | 'YUVRAJ' | 'ASP' | 'AADISH';

const SMOOTH_HEAD_MODELS = new Set<DebugHeadModel>(['ASP', 'YUVRAJ', 'AADISH']);
const isAndroidDevice = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

// Reusable scratch objects to eliminate GC allocations during GLB bounding calculations
const _scratchBox3 = new THREE.Box3();
const _scratchSizeVec3 = new THREE.Vector3();
const _modelCenterVec3 = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Per-model configuration — adjust scale/position here for each GLB
// ---------------------------------------------------------------------------

interface ModelConfig {
    path: string;
    scale: number;                 // overall scale multiplier
    positionOffset: THREE.Vector3; // applied after bounding-box centering
}

const resolveAssetPath = (assetPath: string) => {
    const normalized = assetPath.replace(/^\/+/, '');
    return `${import.meta.env.BASE_URL}${normalized}`;
};

const MODEL_CONFIGS: Record<DebugHeadModel, ModelConfig> = {
    DEFAULT: {
        path: 'head/dealer.glb',
        scale: 2.4,
        positionOffset: new THREE.Vector3(0, -5., -24.50),
    },
    ASP: {
        path: 'head/aspdealer.glb',
        scale: 2.5 ,
        positionOffset: new THREE.Vector3(0, -2.8, -17.50),
    },
    YUVRAJ: {
        path: 'head/yuvrajdealer.glb',
        scale: 2.4,
        positionOffset: new THREE.Vector3(0, -2.8, -16.9),
    },
    YASH: {
        path: 'head/yashdealer.glb',
        scale: 2.4,
        positionOffset: new THREE.Vector3(0, -2.8, -17.83),
    },
    AADISH: {
        path: 'head/aadishdealer.glb',
        scale: 2.5 ,
        positionOffset: new THREE.Vector3(0, -2.8, -17.70),
    },
};

// ---------------------------------------------------------------------------
// O(1) mesh-name filter using a Set instead of chained .includes() calls
// ---------------------------------------------------------------------------
const HIDDEN_NAME_FRAGMENTS = new Set([
    'smoke','bg','background','wall','floor','room',
    'collider','bbox','helper','camera','light','lamp',
    'stage','backdrop','env','environment','grid','ground',
    'ceil','ceiling',
]);

const shouldHideByName = (name: string): boolean => {
    const lower = name.toLowerCase();
    for (const frag of HIDDEN_NAME_FRAGMENTS) {
        if (lower.includes(frag)) return true;
    }
    return false;
};

const setTextureQuality = (texture: THREE.Texture | null | undefined, isColor = false, useNearest = false) => {
    if (!texture) return;
    const tex = texture as THREE.Texture & { colorSpace?: THREE.ColorSpace; encoding?: THREE.TextureEncoding };
    tex.generateMipmaps = !useNearest;
    tex.minFilter = useNearest ? THREE.NearestFilter : (tex.generateMipmaps ? THREE.LinearMipMapLinearFilter : THREE.LinearFilter);
    tex.magFilter = useNearest ? THREE.NearestFilter : THREE.LinearFilter;
    // On Android Adreno/Mali, clamp anisotropy to 1 to eliminate memory bandwidth stalls from 8x over-sampling
    tex.anisotropy = isAndroidDevice ? 1 : Math.max(tex.anisotropy || 1, 8);
    tex.needsUpdate = true;
    const texAny = tex as any;
    if (isColor) {
        if ('colorSpace' in tex) {
            tex.colorSpace = THREE.SRGBColorSpace;
        } else {
            texAny.encoding = THREE.sRGBEncoding;
        }
    } else {
        if ('colorSpace' in tex) {
            tex.colorSpace = THREE.LinearSRGBColorSpace;
        } else {
            texAny.encoding = THREE.LinearEncoding;
        }
    }
};

const configureDealerMaterialEffects = (material: THREE.MeshStandardMaterial, options: { pixelate?: boolean; blur?: boolean; } = {}) => {
    if ((material as any).userData?.__dealerMaterialEffects) return;
    material.onBeforeCompile = (shader) => {
        shader.uniforms.dealerBlurStrength = { value: options.blur ? 0.12 : 0.0 };
        shader.uniforms.pixelationSteps = { value: options.pixelate ? 22.0 : 1.0 };
        shader.uniforms.pixelationAmount = { value: options.pixelate ? 0.18 : 0.0 };
        shader.fragmentShader = `uniform float dealerBlurStrength;\nuniform float pixelationSteps;\nuniform float pixelationAmount;\n${shader.fragmentShader}`;
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <output_fragment>',
            `
    vec3 blurredLight = outgoingLight;
    #ifdef USE_MAP
        vec3 mapBlur = texture2D(map, vUv).rgb;
        mapBlur += texture2D(map, vUv + vec2(0.002, 0.0)).rgb;
        mapBlur += texture2D(map, vUv + vec2(-0.002, 0.0)).rgb;
        mapBlur += texture2D(map, vUv + vec2(0.0, 0.002)).rgb;
        mapBlur += texture2D(map, vUv + vec2(0.0, -0.002)).rgb;
        blurredLight = mapBlur * 0.2;
    #endif
    if (dealerBlurStrength > 0.0) {
        outgoingLight = mix(outgoingLight, blurredLight, dealerBlurStrength);
    }
    if (pixelationAmount > 0.0) {
        vec3 pixelated = floor(outgoingLight * pixelationSteps) / pixelationSteps;
        outgoingLight = mix(outgoingLight, pixelated, pixelationAmount);
    }
    #include <output_fragment>`
        );
    };
    material.userData = material.userData || {};
    material.userData.__dealerMaterialEffects = true;
};

// ---------------------------------------------------------------------------
// Main export
// By default 'DEFAULT' (dealer.glb) is used.
// Pass a different DebugHeadModel via the debug settings to switch models.
// ---------------------------------------------------------------------------
export const createDealerModel = (scene: THREE.Scene, debugHeadModel: DebugHeadModel = 'DEFAULT') => {
    // Check if dealer already exists
    const existingDealer = scene.getObjectByName('DEALER');
    if (existingDealer) return existingDealer as THREE.Group;

    const dealerGroup = new THREE.Group();
    dealerGroup.name = 'DEALER';

    const settings = scene.userData.settings || {};
    const preset = getGraphicsPreset(settings);
    const isPotato = preset === 'potato';
    const isLow = preset === 'low';
    const isBalanced = preset === 'balanced';
    const isHigh = preset === 'high';
    const isMobile = scene.userData.isMobile || false;
    const isAndroid = scene.userData.isAndroid || false;
    const shouldCastShadow = isHigh || (isBalanced && !isMobile) || (isLow && !isAndroid && !isMobile);
    const isCustomModel = debugHeadModel !== 'DEFAULT';
    const isSmoothHead = SMOOTH_HEAD_MODELS.has(debugHeadModel);

    // Resolve per-model config (fallback to DEFAULT if key is unknown)
    const config: ModelConfig = MODEL_CONFIGS[debugHeadModel] ?? MODEL_CONFIGS.DEFAULT;

    // Placeholder so look-at code never crashes before load completes
    const dummyHead = new THREE.Group();
    dummyHead.name = 'HEAD';
    dealerGroup.add(dummyHead);

    // Load the selected GLB from cache asynchronously
    getPreloadedGLB(resolveAssetPath(config.path))
        .then((gltf) => {
            if (scene.userData._disposed) return;
            const model = clone(gltf.scene) as THREE.Group;

            dealerGroup.remove(dummyHead);

            model.traverse((obj: THREE.Object3D) => {
                // Suppress embedded lights / cameras / helpers
                if (obj instanceof THREE.Light || obj instanceof THREE.Camera || (obj as any).isHelper) {
                    obj.visible = false;
                    if ('intensity' in obj) (obj as any).intensity = 0;
                    return;
                }

                if (shouldHideByName(obj.name)) {
                    obj.visible = false;
                    return;
                }

                // Only hide clearly background-like meshes. The dealer body can be
                // large, so keep the threshold high enough to avoid removing the main model.
                if (obj instanceof THREE.Mesh && obj.geometry) {
                    try {
                        _scratchBox3.setFromObject(obj);
                        _scratchBox3.getSize(_scratchSizeVec3);
                        const isVeryLarge = _scratchSizeVec3.x > 16 || _scratchSizeVec3.y > 16 || _scratchSizeVec3.z > 16;
                        const isFlatPlane = (_scratchSizeVec3.x > 12 && _scratchSizeVec3.y < 1.5) || (_scratchSizeVec3.z > 12 && _scratchSizeVec3.y < 1.5);
                        if ((isVeryLarge || isFlatPlane) && /bg|background|wall|floor|room|stage|backdrop|env|environment|plane/i.test(obj.name)) {
                            console.warn(`[GLB-HIDE] Dealer GLB "${config.path}" hiding mesh`, obj.name || '(unnamed)', `size=${_scratchSizeVec3.x.toFixed(2)}x${_scratchSizeVec3.y.toFixed(2)}x${_scratchSizeVec3.z.toFixed(2)}`);
                            obj.visible = false;
                            return;
                        }
                    } catch (e) {
                        // If bounding calc fails, continue without hiding
                    }
                }

                if (obj instanceof THREE.Mesh) {
                    obj.castShadow = shouldCastShadow;
                    obj.receiveShadow = false;

                    if (obj.material) {
                        const mats: THREE.Material[] = Array.isArray(obj.material)
                            ? obj.material
                            : [obj.material];
                        const clonedMats: THREE.Material[] = new Array(mats.length);

                        for (let mi = 0; mi < mats.length; mi++) {
                            // Clone material per scene instance so preset mutations never corrupt shared GLB cache
                            const mat = mats[mi].clone();
                            if (mat.userData) {
                                delete mat.userData.isCachedAsset;
                            }
                            clonedMats[mi] = mat;

                            const m = mat as THREE.MeshStandardMaterial;
                            const isDefaultHead = !isCustomModel;

                            if (!isPotato) {
                                setTextureQuality(m.map, true, false);
                                setTextureQuality(m.normalMap, false, false);
                                setTextureQuality(m.roughnessMap, false, false);
                                setTextureQuality((m as any).aoMap, false, false);
                                setTextureQuality((m as any).emissiveMap, true, false);
                                setTextureQuality((m as any).metalnessMap, false, false);
                                setTextureQuality((m as any).bumpMap, false, false);
                                setTextureQuality((m as any).displacementMap, false, false);
                            }

                            if (m.transparent || m.opacity < 0.9) {
                                m.depthWrite = false;
                            }

                            if (m instanceof THREE.MeshStandardMaterial) {
                                m.toneMapped = true;
                                m.side = THREE.DoubleSide;
                                m.roughness = m.roughnessMap ? Math.min(m.roughness, 0.85) : 0.68;
                                m.metalness = 0.0;
                                m.envMapIntensity = isHigh ? 1.2 : (isBalanced ? 0.85 : (isLow ? 0.45 : 0.15));
                                if (m.emissive) m.emissive.setHex(0x0a0704);
                                m.emissiveIntensity = isPotato ? 0.14 : 0.18;
                                m.fog = !isPotato;
                                if (m.color) {
                                    m.color.setHex(0xffffff);
                                }
                                if (m.normalScale) {
                                    m.normalScale.setScalar(isPotato ? 0 : (isLow ? 0.45 : (isBalanced ? 0.65 : 0.95)));
                                }
                                if (isDefaultHead && !isPotato) {
                                    configureDealerMaterialEffects(m, { pixelate: true, blur: !isLow });
                                }

                                if (isPotato) {
                                    m.normalMap = null;
                                    m.bumpMap = null;
                                    m.roughnessMap = null;
                                    m.metalnessMap = null;
                                    m.aoMap = null;
                                    m.lightMap = null;
                                    m.emissiveMap = null;
                                }

                                m.needsUpdate = true;
                            }
                        }
                        obj.material = Array.isArray(obj.material) ? clonedMats : clonedMats[0];
                    }
                }
            });

            // Name as HEAD so look-at animations target it
            model.name = 'HEAD';
            dealerGroup.add(model);

            // Bust the stale HEAD cache — sceneLogic caches dealerGroup.getObjectByName('HEAD')
            // on the first frame, which at that point is still the dummy placeholder. Clearing it
            // here forces a fresh lookup now that the real model is in the scene.
            delete scene.userData.cachedHeadGroup;

            // Face lighting rig — differs by model type
            if (isCustomModel) {
                // 3-point lighting rig tuned for ACESFilmic @ ~1.8x exposure
                // Warm key light from upper-left — main skin illumination
                const keyLight = new THREE.PointLight(0xfff5e0, isPotato ? 1.2 : 3.2, 10);
                keyLight.position.set(-1.2, 3.2, 2.2);
                keyLight.name = 'KEY_LIGHT';
                model.add(keyLight);

                // Cool blue-grey fill from the right — opens shadows without flattening
                const fillLight = new THREE.PointLight(0xc8d8ff, isPotato ? 0.4 : 0.9, 9);
                fillLight.position.set(1.8, 1.5, 1.6);
                fillLight.name = 'FILL_LIGHT';
                model.add(fillLight);

                // Under-chin warm fill — eliminates harsh dark jaw shadow at camera angle
                const chinLight = new THREE.PointLight(0xffeedd, isPotato ? 0.2 : 0.5, 5);
                chinLight.position.set(0, 0.2, 2.5);
                chinLight.name = 'CHIN_LIGHT';
                model.add(chinLight);

                // Warm rim from behind — edge separation on hair / shoulders
                if (!isPotato) {
                    const rimLight = new THREE.PointLight(0xffe8b0, 0.8, 7);
                    rimLight.position.set(0, 2.5, -2.5);
                    rimLight.name = 'RIM_LIGHT';
                    model.add(rimLight);
                }
            } else {
                // Default dealer: original pulsed red face light
                const faceLight = new THREE.PointLight(0xff0000, isPotato ? 0 : 2.0, 5);
                faceLight.position.set(0, 2.2, 1.25);
                faceLight.name = 'FACE_LIGHT';
                model.add(faceLight);
            }

            // Apply per-model scale.
            model.scale.setScalar(config.scale);

            // Center the GLB using its bounding box so the dealer stays visible in the scene (using scratch objects)
            _scratchBox3.setFromObject(model);
            _scratchBox3.getCenter(_modelCenterVec3);
            model.position.x = -_modelCenterVec3.x + config.positionOffset.x;
            model.position.y = -_scratchBox3.min.y + config.positionOffset.y;
            model.position.z = -_modelCenterVec3.z + config.positionOffset.z;

            // Keep the loaded model fully visible by avoiding any large group-level offset.
            dealerGroup.position.set(0, 0, 0);
        })
        .catch((error) => {
            console.warn(`[Dealer] Failed to load GLB "${config.path}":`, error);
        });

    // Group-level transform (identical for all models)
    dealerGroup.position.set(0, 3.0, -8);
    dealerGroup.scale.set(0.9, 0.9, 0.9);

    scene.add(dealerGroup);
    return dealerGroup;
};
