import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const _dracoLoader = new DRACOLoader();
_dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
_dracoLoader.preload(); // Fetch & compile WASM decoder eagerly so first GLB decode doesn't stall

const gltfCache = new Map<string, Promise<GLTF>>();
const gltfProgress = new Map<string, number>();

export const PRELOAD_MODEL_PATHS = [
    'head/dealer.glb',
    'head/aspdealer.glb',
    'head/yuvrajdealer.glb',
    'head/yashdealer.glb',
    'head/aadishdealer.glb'
];

export const resolveAssetPath = (assetPath: string) => {
    const normalized = assetPath.replace(/^\/+/, '');
    return `${import.meta.env.BASE_URL}${normalized}`;
};

export const getPreloadedGLB = (url: string): Promise<GLTF> => {
    if (!gltfCache.has(url)) {
        const loader = new GLTFLoader();
        loader.setDRACOLoader(_dracoLoader);
        gltfProgress.set(url, 0);
        const promise = new Promise<GLTF>((resolve, reject) => {
            loader.load(
                url,
                (gltf) => {
                    // Tag all meshes, materials, geometries, and textures as cached assets
                    // to prevent scene cleanup logic (cleanScene) from disposing them.
                    gltf.scene.traverse((obj) => {
                        obj.userData = obj.userData || {};
                        obj.userData.isCachedAsset = true;

                        if (obj instanceof THREE.Mesh) {
                            if (obj.geometry) {
                                obj.geometry.userData = obj.geometry.userData || {};
                                obj.geometry.userData.isCachedAsset = true;
                            }
                            if (obj.material) {
                                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                                mats.forEach((mat) => {
                                    mat.userData = mat.userData || {};
                                    mat.userData.isCachedAsset = true;
                                    
                                    const matWithMaps = mat as any;
                                    const textureKeys = ['map', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'bumpMap', 'displacementMap', 'envMap'];
                                    textureKeys.forEach((key) => {
                                        if (matWithMaps[key] && matWithMaps[key] instanceof THREE.Texture) {
                                            const tex = matWithMaps[key] as THREE.Texture;
                                            tex.userData = tex.userData || {};
                                            tex.userData.isCachedAsset = true;
                                            // On Android, clamp anisotropy to 1 to reduce texture cache misses & memory bus pressure on Adreno/Mali GPUs
                                            if (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)) {
                                                tex.anisotropy = 1;
                                            }
                                            // When mipmaps aren't required, set minFilter to LinearFilter to conserve texture memory
                                            if (!tex.generateMipmaps) {
                                                tex.minFilter = THREE.LinearFilter;
                                            }
                                        }
                                    });
                                });
                            }
                        }
                    });
                    gltfProgress.set(url, 100);
                    resolve(gltf);
                },
                (xhr) => {
                    if (xhr.total > 0) {
                        const percent = (xhr.loaded / xhr.total) * 100;
                        gltfProgress.set(url, Math.min(percent, 99));
                    }
                },
                (err) => {
                    console.warn(`Failed to load GLB: ${url}`, err);
                    gltfProgress.set(url, 100); // Do not block loader progress on network or parser errors
                    reject(err);
                }
            );
        });
        gltfCache.set(url, promise);
    }
    return gltfCache.get(url)!;
};

export const preloadAllModels = (): Promise<GLTF[]> => {
    const promises = PRELOAD_MODEL_PATHS.map((path) => getPreloadedGLB(resolveAssetPath(path)));
    return Promise.all(promises);
};

export const getGLBLoadingProgress = (): number => {
    if (PRELOAD_MODEL_PATHS.length === 0) return 100;
    let totalProgress = 0;
    PRELOAD_MODEL_PATHS.forEach((path) => {
        const url = resolveAssetPath(path);
        totalProgress += gltfProgress.get(url) || 0;
    });
    return Math.round(totalProgress / PRELOAD_MODEL_PATHS.length);
};

export const clearGLBCache = () => {
    gltfCache.forEach((promise) => {
        promise.then((gltf) => {
            gltf.scene.traverse((obj) => {
                if (obj instanceof THREE.Mesh) {
                    if (obj.geometry) {
                        try { obj.geometry.dispose(); } catch (e) {}
                    }
                    if (obj.material) {
                        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                        mats.forEach((m) => {
                            try { m.dispose(); } catch (e) {}
                        });
                    }
                }
            });
        }).catch(() => {});
    });
    gltfCache.clear();
    gltfProgress.clear();
};
