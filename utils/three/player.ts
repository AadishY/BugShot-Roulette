import * as THREE from 'three';
import { getGraphicsPreset } from '../../types';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getPreloadedGLB } from './glbPreloader';

type PlayerModelKey = 'DEFAULT' | 'AADISH' | 'ASP' | 'YASH' | 'YUVRAJ';

const SMOOTH_HEAD_MODELS = new Set<PlayerModelKey>(['ASP', 'YUVRAJ', 'AADISH']);
const isAndroidDevice = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

// Reusable scratch objects to eliminate GC allocations during GLB bounding calculations
const _scratchBox3 = new THREE.Box3();
const _scratchSizeVec3 = new THREE.Vector3();
const _modelCenterVec3 = new THREE.Vector3();

interface PlayerModelConfig {
    path: string;
    scale: number;
    positionOffset: THREE.Vector3;
}

const resolveAssetPath = (assetPath: string) => {
    const normalized = assetPath.replace(/^\/+/, '');
    return `${import.meta.env.BASE_URL}${normalized}`;
};

const PLAYER_MODEL_CONFIGS: Record<PlayerModelKey, PlayerModelConfig> = {
    DEFAULT: {
        path: 'head/dealer.glb',
        scale: 2.2,
        positionOffset: new THREE.Vector3(0, 0.5, -7.03),
    },
    ASP: {
        path: 'head/aspdealer.glb',
        scale: 2.25,
        positionOffset: new THREE.Vector3(0, 3.5, 0.03),  // dealer: -7.4 + 4.5 offset
    },
    YUVRAJ: {
        path: 'head/yuvrajdealer.glb',
        scale: 2,
        positionOffset: new THREE.Vector3(0, 3.5, 0.3),  // dealer: -6.0 + 4.5 offset
    },
    YASH: {
        path: 'head/yashdealer.glb',
        scale: 2.1,
        positionOffset: new THREE.Vector3(0, 3.5, 0.1), // dealer: -7.5 + 4.5 offset
    },
    AADISH: {
        path: 'head/aadishdealer.glb',
        scale: 2.1,
        positionOffset: new THREE.Vector3(0, 3.8, 0.019), // dealer: -5.65 + 4.5 offset
    },
};


const HIDDEN_NAME_FRAGMENTS = new Set([
    'smoke','bg','background','wall','floor','room',
    'collider','bbox','helper','camera','light','lamp',
    'stage','backdrop','env','environment','grid','ground','ceil','ceiling',
    // NOTE: 'plane' intentionally excluded — body mesh nodes are often named Plane001/Plane002
]);

const shouldHideByName = (name: string): boolean => {
    const lower = name.toLowerCase();
    for (const frag of HIDDEN_NAME_FRAGMENTS) {
        if (lower.includes(frag)) return true;
    }
    return false;
};

const setTextureQuality = (texture: THREE.Texture | null | undefined, isColor = false) => {
    if (!texture) return;
    const tex = texture as THREE.Texture & { colorSpace?: THREE.ColorSpace; encoding?: THREE.TextureEncoding };
    tex.minFilter = tex.generateMipmaps ? THREE.LinearMipMapLinearFilter : THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
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

// Shared loader removed in favor of glbPreloader caching system

export const createPlayerAvatar = (scene: THREE.Scene, position: THREE.Vector3, rotationY: number, name: string, hp: number = 4, maxHp: number = 4, modelKey: PlayerModelKey = 'DEFAULT') => {
    const avatarGroup = new THREE.Group();
    avatarGroup.name = 'PLAYER_' + name;
    avatarGroup.position.copy(position);

    // Match the dealer-facing orientation used by the singleplayer model.
    // The multiplayer seats pass in a world-space rotation, but the GLB itself
    // needs an extra 180° correction so it faces the table correctly.
    avatarGroup.rotation.y = rotationY + Math.PI;

    const settings = scene.userData.settings || {};
    const preset = getGraphicsPreset(settings);
    const isPotato = preset === 'potato';
    const isLow = preset === 'low';
    const isBalanced = preset === 'balanced';
    const isHigh = preset === 'high';
    const isMobile = scene.userData.isMobile || false;
    const isAndroid = scene.userData.isAndroid || false;
    const shouldCastShadow = isHigh || (isBalanced && !isMobile) || (isLow && !isAndroid && !isMobile);
    const isSmoothHead = SMOOTH_HEAD_MODELS.has(modelKey);
    const config = PLAYER_MODEL_CONFIGS[modelKey] ?? PLAYER_MODEL_CONFIGS.DEFAULT;

    const placeholderGroup = new THREE.Group();
    placeholderGroup.name = 'BODY_PLACEHOLDER';
    avatarGroup.add(placeholderGroup);

    getPreloadedGLB(resolveAssetPath(config.path))
        .then((gltf) => {
            if (scene.userData._disposed) return;
            const model = clone(gltf.scene as THREE.Group);
            model.traverse((obj: THREE.Object3D) => {
                if (obj instanceof THREE.Light || obj instanceof THREE.Camera || (obj as any).isHelper) {
                    obj.visible = false;
                    if ('intensity' in obj) (obj as any).intensity = 0;
                    return;
                }

                if (shouldHideByName(obj.name)) {
                    obj.visible = false;
                    return;
                }

                // Only hide obviously background-like meshes. The default dealer model
                // can have a large body mesh, so keep the threshold high enough to avoid
                // hiding the main head geometry.
                if (obj instanceof THREE.Mesh && obj.geometry) {
                    try {
                        _scratchBox3.setFromObject(obj);
                        _scratchBox3.getSize(_scratchSizeVec3);
                        const isVeryLarge = _scratchSizeVec3.x > 16 || _scratchSizeVec3.y > 16 || _scratchSizeVec3.z > 16;
                        const isFlatPlane = (_scratchSizeVec3.x > 12 && _scratchSizeVec3.y < 1.5) || (_scratchSizeVec3.z > 12 && _scratchSizeVec3.y < 1.5);
                        if ((isVeryLarge || isFlatPlane) && /bg|background|wall|floor|room|stage|backdrop|env|environment|plane/i.test(obj.name)) {
                            console.warn(`[GLB-HIDE] Player GLB "${config.path}" hiding mesh`, obj.name || '(unnamed)', `size=${_scratchSizeVec3.x.toFixed(2)}x${_scratchSizeVec3.y.toFixed(2)}x${_scratchSizeVec3.z.toFixed(2)}`);
                            obj.visible = false;
                            return;
                        }
                    } catch (e) {
                        // ignore errors computing bounds
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

                            if (!isPotato) {
                                setTextureQuality(m.map, true);
                                setTextureQuality(m.normalMap, false);
                                setTextureQuality(m.roughnessMap, false);
                                setTextureQuality((m as any).aoMap, false);
                                setTextureQuality((m as any).emissiveMap, true);
                                setTextureQuality((m as any).metalnessMap, false);
                                setTextureQuality((m as any).bumpMap, false);
                                setTextureQuality((m as any).displacementMap, false);
                            }

                            if (m.transparent || m.opacity < 0.9) {
                                m.depthWrite = false;
                            }

                            if (m instanceof THREE.MeshStandardMaterial) {
                                m.toneMapped = true;
                                m.side = THREE.DoubleSide;
                                m.roughness = m.roughnessMap ? Math.min(m.roughness, 0.85) : 0.68;
                                m.metalness = 0.0;
                                m.envMapIntensity = isHigh ? 1.35 : (isBalanced ? 0.9 : (isLow ? 0.5 : 0.25));
                                if (m.emissive) m.emissive.setHex(0x120a08); // subtle warm lift
                                m.emissiveIntensity = isPotato ? 0.16 : 0.22;
                                m.fog = !isPotato;
                                if (m.color) {
                                    m.color.setHex(0xffffff);
                                }
                                if (m.normalScale) {
                                    m.normalScale.setScalar(isPotato ? 0 : (isLow ? 0.45 : (isBalanced ? 0.65 : 0.95)));
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

            // Name the loaded player model 'HEAD' so the shared name-tag
            // projection logic can find it (ThreeScene expects a 'HEAD' node).
            model.name = 'HEAD';
            model.scale.setScalar(config.scale);

            // Match the dealer path: position the model from its bounding box and
            // leave its authored orientation intact. The parent avatar group handles
            // the seat-facing rotation (using pre-allocated scratch objects).
            _scratchBox3.setFromObject(model);
            _scratchBox3.getCenter(_modelCenterVec3);
            model.position.set(-_modelCenterVec3.x + config.positionOffset.x, -_scratchBox3.min.y + config.positionOffset.y, -_modelCenterVec3.z + config.positionOffset.z);
            model.updateMatrixWorld(true);

            avatarGroup.remove(placeholderGroup);
            avatarGroup.add(model);
        })
        .catch((error) => {
            console.warn(`[PlayerAvatar] Failed to load GLB "${config.path}":`, error);
        });

    avatarGroup.userData.playerName = name;

    scene.add(avatarGroup);
    return avatarGroup;
};
