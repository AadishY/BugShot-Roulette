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
        const dracoAny = _dracoLoader as unknown as { setWorkerLimit?: (limit: number) => void; workerLimit?: number };
        if (typeof dracoAny.setWorkerLimit === 'function') {
            dracoAny.setWorkerLimit(isMobileUA ? 1 : 2);
        } else if ('workerLimit' in dracoAny) {
            dracoAny.workerLimit = isMobileUA ? 1 : 2;
        }
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

// Bounded concurrency queue to avoid memory/CPU spikes on mobile during parallel GLB + Draco decoding
const isMobileUA = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const MAX_CONCURRENT_LOADS = isMobileUA ? 2 : 3;

// Warm Draco decoder eagerly on browser startup
if (typeof window !== 'undefined') {
    getDracoLoader();
}

interface InflightLoadRecord {
    promise: Promise<GLTF>;
    epoch: number;
    cancelled: boolean;
}

interface QueuedLoadTask {
    run: () => void;
    cancel: () => void;
}

// Cache-first resolved assets & deduplicated in-flight promises
const resolvedCache = new Map<string, GLTF>();
const inflightLoads = new Map<string, InflightLoadRecord>();
const gltfProgress = new Map<string, number>();

let cacheEpoch = 0;
let activeLoads = 0;
const loadQueue: QueuedLoadTask[] = [];

const pumpQueue = () => {
    while (activeLoads < MAX_CONCURRENT_LOADS && loadQueue.length > 0) {
        const next = loadQueue.shift();
        if (next) next.run();
    }
};

const enqueueLoad = <T>(task: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
        let settled = false;
        const entry: QueuedLoadTask = {
            run: () => {
                if (settled) return;
                activeLoads++;
                task()
                    .then(
                        (val) => {
                            settled = true;
                            resolve(val);
                        },
                        (err) => {
                            settled = true;
                            reject(err);
                        }
                    )
                    .finally(() => {
                        activeLoads = Math.max(0, activeLoads - 1);
                        pumpQueue();
                    });
            },
            cancel: () => {
                if (settled) return;
                settled = true;
                reject(new Error('GLB load cancelled'));
            }
        };

        if (activeLoads < MAX_CONCURRENT_LOADS) {
            entry.run();
        } else {
            loadQueue.push(entry);
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
        if ('buffers' in parser) parser.buffers = null;
        if ('bufferViews' in parser) parser.bufferViews = null;
        if ('images' in parser) parser.images = null;
        if ('input' in parser) parser.input = null;
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

        if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
            try { (obj as THREE.SkinnedMesh).skeleton?.dispose?.(); } catch {}
        }

        if (obj instanceof THREE.InstancedMesh) {
            try { obj.dispose(); } catch {}
        }

        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
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

const MAX_CACHED_GLBS = Math.max(PRELOAD_MODEL_PATHS.length + 3, isMobileUA ? 8 : 16);

const getPreloadedUrlSet = () => {
    const urls = new Set<string>();
    for (const p of PRELOAD_MODEL_PATHS) {
        urls.add(resolveAssetPath(p));
    }
    return urls;
};

const enforceCacheBounds = (protectedUrl?: string) => {
    if (resolvedCache.size <= MAX_CACHED_GLBS) return;
    const preloadedUrls = getPreloadedUrlSet();

    // First evict oldest non-preloaded entries
    for (const key of Array.from(resolvedCache.keys())) {
        if (resolvedCache.size <= MAX_CACHED_GLBS) return;
        if (key === protectedUrl || preloadedUrls.has(key)) continue;
        releaseGLBCacheEntry(key);
    }

    // Fallback if cache still exceeds cap (e.g. only preloaded entries exist)
    for (const key of Array.from(resolvedCache.keys())) {
        if (resolvedCache.size <= MAX_CACHED_GLBS) return;
        if (key === protectedUrl) continue;
        releaseGLBCacheEntry(key);
    }
};

export const getPreloadedGLB = (url: string): Promise<GLTF> => {
    const cached = resolvedCache.get(url);
    if (cached) {
        // Refresh LRU recency
        resolvedCache.delete(url);
        resolvedCache.set(url, cached);
        gltfProgress.set(url, 100);
        return Promise.resolve(cached);
    }

    const inflight = inflightLoads.get(url);
    if (inflight && !inflight.cancelled) {
        return inflight.promise;
    }

    gltfProgress.set(url, 0);
    const loadEpoch = cacheEpoch;
    const record: InflightLoadRecord = {
        promise: null as unknown as Promise<GLTF>,
        epoch: loadEpoch,
        cancelled: false
    };

    const promise = enqueueLoad<GLTF>(() => {
        if (record.cancelled || record.epoch !== cacheEpoch) {
            return Promise.reject(new Error(`GLB load cancelled: ${url}`));
        }

        // Re-check resolved cache in case another caller resolved while queued
        const alreadyResolved = resolvedCache.get(url);
        if (alreadyResolved) {
            resolvedCache.delete(url);
            resolvedCache.set(url, alreadyResolved);
            gltfProgress.set(url, 100);
            return Promise.resolve(alreadyResolved);
        }

        const loader = getGLTFLoader();
        return new Promise<GLTF>((resolve, reject) => {
            loader.load(
                url,
                (gltf) => {
                    if (record.cancelled || record.epoch !== cacheEpoch) {
                        releaseGLTFParserBuffers(gltf);
                        disposeGLTFSceneResources(gltf);
                        if (inflightLoads.get(url) === record) {
                            inflightLoads.delete(url);
                        }
                        reject(new Error(`GLB load cancelled: ${url}`));
                        return;
                    }

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
                    enforceCacheBounds(url);
                    if (inflightLoads.get(url) === record) {
                        inflightLoads.delete(url);
                    }
                    gltfProgress.set(url, 100);
                    resolve(gltf);
                },
                (xhr) => {
                    if (record.cancelled || record.epoch !== cacheEpoch) return;
                    if (xhr.total > 0) {
                        const percent = (xhr.loaded / xhr.total) * 100;
                        gltfProgress.set(url, Math.min(percent, 99));
                    }
                },
                (err) => {
                    if (inflightLoads.get(url) === record) {
                        inflightLoads.delete(url);
                    }
                    if (!record.cancelled && record.epoch === cacheEpoch) {
                        console.warn(`Failed to load GLB: ${url}`, err);
                        gltfProgress.set(url, 100); // Do not block loader progress on network or parser errors
                    }
                    reject(err);
                }
            );
        });
    });

    record.promise = promise;
    inflightLoads.set(url, record);
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
    const inflight = inflightLoads.get(url);
    if (inflight) {
        inflight.cancelled = true;
        inflightLoads.delete(url);
    }
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
    cacheEpoch++;
    resolvedCache.forEach((gltf) => {
        disposeGLTFSceneResources(gltf);
    });
    resolvedCache.clear();
    inflightLoads.forEach((record) => {
        record.cancelled = true;
    });
    inflightLoads.clear();
    gltfProgress.clear();
    const pendingTasks = loadQueue.splice(0, loadQueue.length);
    for (const task of pendingTasks) {
        task.cancel();
    }
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
