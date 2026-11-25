import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

let _dracoLoader: DRACOLoader | null = null;
let _gltfLoader: GLTFLoader | null = null;

const TEXTURE_KEYS = [
    'map',
    'alphaMap',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'emissiveMap',
    'aoMap',
    'bumpMap',
    'displacementMap',
    'envMap',
    'lightMap'
] as const;

const getDracoLoader = (): DRACOLoader => {
    if (!_dracoLoader) {
        _dracoLoader = new DRACOLoader();
        _dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
        _dracoLoader.preload(); // Warm WASM decoder so first GLB decode doesn't stall
    }
    return _dracoLoader;
};

const getGLTFLoader = (): GLTFLoader => {
    if (!_gltfLoader) {
        _gltfLoader = new GLTFLoader();
        _gltfLoader.setDRACOLoader(getDracoLoader());
    }
    return _gltfLoader;
};

// Warm Draco decoder eagerly on browser startup
if (typeof window !== 'undefined') {
    getDracoLoader();
}

// Cache-first resolved assets & deduplicated in-flight promises
const resolvedCache = new Map<string, GLTF>();
const inflightLoads = new Map<string, Promise<GLTF>>();
const gltfProgress = new Map<string, number>();

// Bounded concurrency queue to avoid memory/CPU spikes on mobile during parallel GLB + Draco decoding
const isMobileUA = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const MAX_CONCURRENT_LOADS = isMobileUA ? 2 : 3;
let activeLoads = 0;
const loadQueue: Array<() => void> = [];

const pumpQueue = () => {
    while (activeLoads < MAX_CONCURRENT_LOADS && loadQueue.length > 0) {
        const next = loadQueue.shift();
        if (next) next();
    }
};

const enqueueLoad = <T>(task: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
        const run = () => {
            activeLoads++;
            task()
                .then(resolve, reject)
                .finally(() => {
                    activeLoads = Math.max(0, activeLoads - 1);
                    pumpQueue();
                });
        };

        if (activeLoads < MAX_CONCURRENT_LOADS) {
            run();
        } else {
            loadQueue.push(run);
        }
    });
};

/**
 * Release raw GLB ArrayBuffers, parser JSON AST, and intermediate caches retained by GLTFLoader's parser
 * after geometries and textures have been parsed into Three.js objects.
 */
const releaseGLTFParserBuffers = (gltf: GLTF) => {
    const parser = (gltf as any)?.parser;
    if (!parser) return;

    try {
        parser.cache?.removeAll?.();
    } catch {}
    try {
        parser.associations?.clear?.();
    } catch {}
    try {
        if (parser.extensions && typeof parser.extensions === 'object') {
            for (const extKey of Object.keys(parser.extensions)) {
                const ext = parser.extensions[extKey];
                if (ext && typeof ext === 'object') {
                    if ('body' in ext) ext.body = null;
                    if ('content' in ext) ext.content = null;
                    if ('dracoLoader' in ext) ext.dracoLoader = null;
                    if ('parser' in ext) ext.parser = null;
                }
                delete parser.extensions[extKey];
            }
        }
    } catch {}
    try {
        parser.nodeCache = {};
        parser.json = null;
        parser.fileLoader = null;
        parser.textureLoader = null;
    } catch {}

    (gltf as any).parser = null;
};

const disposeGLTFSceneResources = (gltf: GLTF) => {
    if (!gltf?.scene) return;
    const disposedGeos = new Set<THREE.BufferGeometry>();
    const disposedMats = new Set<THREE.Material>();
    const disposedTexs = new Set<THREE.Texture>();

    gltf.scene.traverse((obj) => {
        if (obj.userData) delete obj.userData.isCachedAsset;

        if (obj instanceof THREE.Mesh) {
            if (obj.geometry && !disposedGeos.has(obj.geometry)) {
                disposedGeos.add(obj.geometry);
                if (obj.geometry.userData) delete obj.geometry.userData.isCachedAsset;
                try { obj.geometry.dispose(); } catch {}
            }
            if (obj.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach((mat) => {
                    if (!mat) return;
                    const matAny = mat as any;
                    TEXTURE_KEYS.forEach((key) => {
                        const tex = matAny[key];
                        if (tex instanceof THREE.Texture && !disposedTexs.has(tex)) {
                            disposedTexs.add(tex);
                            if (tex.userData) delete tex.userData.isCachedAsset;
                            try { tex.dispose(); } catch {}
                        }
                    });
                    if (!disposedMats.has(mat)) {
                        disposedMats.add(mat);
                        if (mat.userData) delete mat.userData.isCachedAsset;
                        try { mat.dispose(); } catch {}
                    }
                });
            }
        }
    });
};

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
    const cached = resolvedCache.get(url);
    if (cached) {
        gltfProgress.set(url, 100);
        return Promise.resolve(cached);
    }

    const inflight = inflightLoads.get(url);
    if (inflight) {
        return inflight;
    }

    gltfProgress.set(url, 0);

    const promise = enqueueLoad<GLTF>(() => {
        // Re-check resolved cache in case another caller resolved while queued
        const alreadyResolved = resolvedCache.get(url);
        if (alreadyResolved) {
            gltfProgress.set(url, 100);
            return Promise.resolve(alreadyResolved);
        }

        const loader = getGLTFLoader();
        return new Promise<GLTF>((resolve, reject) => {
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
                                    TEXTURE_KEYS.forEach((key) => {
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

                    // Drop raw binary ArrayBuffer & parser metadata so we don't hold duplicate memory
                    releaseGLTFParserBuffers(gltf);

                    resolvedCache.set(url, gltf);
                    inflightLoads.delete(url);
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
                    inflightLoads.delete(url);
                    gltfProgress.set(url, 100); // Do not block loader progress on network or parser errors
                    reject(err);
                }
            );
        });
    });

    inflightLoads.set(url, promise);
    return promise;
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
        totalProgress += gltfProgress.get(url) ?? (resolvedCache.has(url) ? 100 : 0);
    });
    return Math.round(totalProgress / PRELOAD_MODEL_PATHS.length);
};

export const releaseGLBCacheEntry = (url: string) => {
    const cached = resolvedCache.get(url);
    if (cached) {
        disposeGLTFSceneResources(cached);
        resolvedCache.delete(url);
    }
    inflightLoads.delete(url);
    gltfProgress.delete(url);
};

/**
 * Evict GLB models not in `keepUrls` (useful on mode switch or low-memory mobile cleanup).
 */
export const evictUnusedGLBs = (keepUrls: string[] = []) => {
    const keepSet = new Set(keepUrls);
    for (const url of Array.from(resolvedCache.keys())) {
        if (!keepSet.has(url)) {
            releaseGLBCacheEntry(url);
        }
    }
};

export const disposeDracoLoader = () => {
    if (_dracoLoader) {
        try {
            _dracoLoader.dispose();
        } catch {}
        _dracoLoader = null;
    }
    _gltfLoader = null;
};

export const clearGLBCache = () => {
    resolvedCache.forEach((gltf) => {
        disposeGLTFSceneResources(gltf);
    });
    resolvedCache.clear();
    inflightLoads.clear();
    gltfProgress.clear();
    loadQueue.length = 0;
};

/**
 * Full cleanup helper for unmount or major mode transitions.
 */
export const cleanupGLBPreloader = (options?: { disposeDraco?: boolean; keepUrls?: string[] }) => {
    if (options?.keepUrls && options.keepUrls.length > 0) {
        evictUnusedGLBs(options.keepUrls);
    } else {
        clearGLBCache();
    }
    if (options?.disposeDraco) {
        disposeDracoLoader();
    }
};

export const getGLBCacheStats = () => ({
    cachedCount: resolvedCache.size,
    inflightCount: inflightLoads.size,
    queuedCount: loadQueue.length
});
