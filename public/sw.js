const CACHE_NAME = 'bugshot-roulette-v12';
const RUNTIME_CACHE = 'bugshot-roulette-runtime-v12';

// Critical core assets to pre-cache on install for 100% offline singleplayer capability
const CRITICAL_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/image/logo.webp',
    '/image/banner.webp',
    '/image/banner mobile.webp',
    '/image/favicon/favicon.ico',
    '/image/favicon/favicon-16x16.png',
    '/image/favicon/favicon-32x32.png',
    '/image/favicon/android-chrome-192x192.png',
    '/image/favicon/android-chrome-512x512.png',
    '/image/favicon/apple-touch-icon.png',
    '/image/favicon/site.webmanifest',
    // 3D GLB Models
    '/head/dealer.glb',
    '/head/aspdealer.glb',
    '/head/yuvrajdealer.glb',
    '/head/yashdealer.glb',
    '/head/aadishdealer.glb',
    // Draco Decoders (Root & glTF)
    '/draco/draco_decoder.wasm',
    '/draco/draco_decoder.js',
    '/draco/draco_wasm_wrapper.js',
    '/draco/gltf/draco_decoder.wasm',
    '/draco/gltf/draco_decoder.js',
    '/draco/gltf/draco_wasm_wrapper.js',
    // Sound FX & BGM
    '/sound/menu.mp3',
    '/sound/gameplay.mp3',
    '/sound/endscreen.mp3',
    '/sound/blankshellshoot.wav',
    '/sound/liveshellshoot.mp3',
    '/sound/crusher.mp3',
    '/sound/grab1.ogg',
    // Item Animation Sounds
    '/sound/AnimationSounds/Standing.mp3',
    '/sound/AnimationSounds/droping.mp3',
    '/sound/AnimationSounds/checkhandcuffs.mp3',
    '/sound/AnimationSounds/handcuffed.mp3',
    '/sound/AnimationSounds/adrenaline.mp3',
    '/sound/AnimationSounds/beer.mp3',
    '/sound/AnimationSounds/cig.mp3',
    '/sound/AnimationSounds/glass.mp3',
    '/sound/AnimationSounds/inverter.mp3',
    '/sound/AnimationSounds/BigInverter.mp3',
    '/sound/AnimationSounds/phone.mp3',
    '/sound/AnimationSounds/saw.mp3',
    '/sound/AnimationSounds/Choke.mp3',
    '/sound/AnimationSounds/remote.mp3',
    '/sound/AnimationSounds/BloodContract.mp3',
    '/sound/AnimationSounds/luckcharm.mp3',
    '/sound/AnimationSounds/flashbang.mp3',
    '/sound/AnimationSounds/Totem.mp3',
    '/sound/AnimationSounds/mirror.mp3',
    '/sound/AnimationSounds/cards.mp3',
    '/sound/AnimationSounds/slotmachine.mp3',
    '/sound/AnimationSounds/jackpot.mp3',
    '/sound/AnimationSounds/jackpotloop.mp3',
    // Stickers
    '/sticker/sticker1.webp',
    '/sticker/sticker2.webp',
    '/sticker/sticker3.webp',
    '/sticker/sticker4.gif',
    '/sticker/sticker5.webp',
    '/sticker/sticker6.webp',
    '/sticker/sticker7.webp',
    '/sticker/sticker8.webp',
    '/sticker/sticker9.gif',
    '/sticker/sticker10.webp',
    '/sticker/sticker11.gif',
    '/sticker/sticker12.webp',
    '/sticker/sticker13.webp',
    '/sticker/sticker14.webp',
    '/sticker/sticker15.webp',
    '/sticker/sticker16.gif',
    '/sticker/sticker17.gif',
    '/sticker/sticker18.gif',
    '/sticker/sticker19.gif',
    '/sticker/sticker20.gif',
    '/sticker/sticker21.gif',
    '/sticker/sticker22.gif',
    '/sticker/sticker23.webp',
    '/sticker/sticker24.gif',
    '/sticker/sticker25.gif',
    '/sticker/sticker26.webp'
];

// Batch pre-cache fetches to avoid saturating mobile network connections during install
async function precacheInBatches(cache, urls, batchSize = 6) {
    let successCount = 0;
    for (let i = 0; i < urls.length; i += batchSize) {
        const batch = urls.slice(i, i + batchSize);
        const results = await Promise.allSettled(
            batch.map(async (url) => {
                const response = await fetch(url, { cache: 'reload' });
                if (response && (response.status === 200 || response.type === 'opaque')) {
                    await cache.put(url, response);
                    return true;
                }
                return false;
            })
        );
        successCount += results.filter((r) => r.status === 'fulfilled' && r.value).length;
    }
    return successCount;
}

// Helper: Handle HTTP 206 Partial Content for Audio Range Requests (Safari & Chrome mobile seeking)
async function handleRangeRequest(request, cachedResponse) {
    const rangeHeader = request.headers.get('range');
    if (!rangeHeader) return cachedResponse;

    try {
        const arrayBuffer = await cachedResponse.arrayBuffer();
        const bytesMatch = rangeHeader.match(/bytes=(\d+)-(\d+)?/);
        if (!bytesMatch) return cachedResponse;

        const total = arrayBuffer.byteLength;
        const start = parseInt(bytesMatch[1], 10);
        const end = bytesMatch[2] ? parseInt(bytesMatch[2], 10) : total - 1;

        if (isNaN(start) || isNaN(end) || start < 0 || end < start || start >= total || end >= total) {
            return new Response('', {
                status: 416,
                headers: { 'Content-Range': `bytes */${total}` }
            });
        }

        const slicedBuffer = arrayBuffer.slice(start, end + 1);
        return new Response(slicedBuffer, {
            status: 206,
            statusText: 'Partial Content',
            headers: {
                'Content-Type': cachedResponse.headers.get('Content-Type') || 'audio/mpeg',
                'Content-Range': `bytes ${start}-${end}/${total}`,
                'Content-Length': String(slicedBuffer.byteLength),
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'public, max-age=604800'
            }
        });
    } catch {
        return cachedResponse;
    }
}

// Install event - Pre-cache critical assets cleanly; skipWaiting immediately only on first install
// so active gameplay tabs aren't disrupted mid-session unless user/menu accepts update via SKIP_WAITING.
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing new version:', CACHE_NAME);
    if (!self.registration.active) {
        self.skipWaiting();
    }

    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            console.log('[Service Worker] Pre-caching critical game assets for offline PWA operation...');
            const successCount = await precacheInBatches(cache, CRITICAL_ASSETS, 6);
            console.log(`[Service Worker] Critical asset caching cycle complete: ${successCount}/${CRITICAL_ASSETS.length} assets ready.`);
        })
    );
});

// Activate event - Claim open clients and purge obsolete cache stores
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activating version:', CACHE_NAME);
    event.waitUntil(
        (async () => {
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
                        console.log('[Service Worker] Purging obsolete cache store:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );

            await self.clients.claim();
            console.log('[Service Worker] Clients claimed for version:', CACHE_NAME);
        })()
    );
});

// Message event - Listen for manual SKIP_WAITING, update requests, or version inquiries
self.addEventListener('message', (event) => {
    if (event.data) {
        if (event.data.type === 'SKIP_WAITING') {
            self.skipWaiting();
        } else if (event.data.type === 'CHECK_FOR_UPDATE') {
            self.registration.update().catch(() => {});
        } else if (event.data.type === 'GET_VERSION') {
            if (event.ports && event.ports[0]) {
                event.ports[0].postMessage({ version: CACHE_NAME });
            }
        }
    }
});

// Fetch event - Network-First for HTML/navigation, Cache-First for immutable hashed Vite chunks & audio, SWR for static media
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return;
    }

    const url = new URL(event.request.url);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return;
    }

    // Never intercept Service Worker script itself, live sockets, backend APIs, or auth/DB endpoints
    if (
        url.pathname === '/sw.js' ||
        url.pathname.includes('/socket.io') ||
        url.pathname.includes('ws') ||
        (url.hostname.includes('localhost') && url.port === '3001') ||
        url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/redis') ||
        url.hostname.includes('hf.space') ||
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('firebaseapp.com') ||
        url.hostname.includes('identitytoolkit.googleapis.com') ||
        url.hostname.includes('securetoken.googleapis.com') ||
        url.hostname.includes('firestore.googleapis.com')
    ) {
        return;
    }

    // 1. SPA Navigation requests (HTML documents) - Always validate with server when online (cache: 'no-cache')
    const isNavigation = event.request.mode === 'navigate' ||
        (event.request.headers.get('accept') || '').includes('text/html');

    if (isNavigation) {
        event.respondWith(
            (async () => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2500);

                try {
                    const networkResponse = await fetch(event.request, {
                        cache: 'no-cache',
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);

                    if (networkResponse && networkResponse.status === 200) {
                        const clone = networkResponse.clone();
                        const indexClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, clone).catch(() => {});
                            if (url.pathname === '/' || url.pathname === '/index.html') {
                                cache.put('/index.html', indexClone).catch(() => {});
                            }
                        });
                    }
                    return networkResponse;
                } catch {
                    clearTimeout(timeoutId);
                    const cachedIndex = (await caches.match(event.request, { ignoreSearch: true })) ||
                        (await caches.match('/index.html')) ||
                        (await caches.match('/'));
                    if (cachedIndex) return cachedIndex;

                    return new Response('Offline Protocol Engaged', {
                        status: 503,
                        headers: { 'Content-Type': 'text/plain' }
                    });
                }
            })()
        );
        return;
    }

    // 2. Immutable Vite content-hashed build chunks (/assets/name-HASH.js|css|wasm|woff2) - Pure Cache-First
    const isHashedAsset = url.pathname.startsWith('/assets/') &&
        /[-.][A-Za-z0-9_-]{6,}\.(js|css|wasm|woff2?|png|webp|svg)$/i.test(url.pathname);

    if (isHashedAsset) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) return cached;
                return fetch(event.request).then((netRes) => {
                    if (netRes && netRes.status === 200) {
                        const clone = netRes.clone();
                        caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, clone).catch(() => {}));
                    }
                    return netRes;
                });
            })
        );
        return;
    }

    // 3. Audio requests with Range Header support (seeking and mobile playback)
    const isAudio = /\.(mp3|wav|ogg)$/i.test(url.pathname);
    if (isAudio) {
        event.respondWith(
            (async () => {
                const cachedResponse = await caches.match(event.request, { ignoreSearch: true });
                if (cachedResponse) {
                    if (event.request.headers.has('range')) {
                        return handleRangeRequest(event.request, cachedResponse);
                    }
                    return cachedResponse;
                }
                try {
                    const netResponse = await fetch(event.request);
                    if (netResponse && netResponse.status === 200) {
                        const clone = netResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone).catch(() => {}));
                    }
                    return netResponse;
                } catch {
                    return new Response(new ArrayBuffer(0), {
                        status: 200,
                        headers: { 'Content-Type': 'audio/mpeg' }
                    });
                }
            })()
        );
        return;
    }

    // 4. Static media & runtime assets (3D GLBs, Draco WASM, textures, fonts, stickers, favicons, CDN avatars)
    const isStaticAsset =
        /\.(png|jpg|jpeg|gif|webp|svg|glb|gltf|wasm|bin|js|css|woff|woff2|ico|json)$/i.test(url.pathname) ||
        url.host.includes('fonts.gstatic.com') ||
        url.host.includes('fonts.googleapis.com') ||
        url.host.includes('api.dicebear.com') ||
        url.host.includes('avatars.githubusercontent.com');

    if (isStaticAsset) {
        const isUnhashedMutable = /\.(json|js|css)$/i.test(url.pathname) && !url.pathname.startsWith('/assets/');
        // CRITICAL: Never ignore query strings for query-parameterized endpoints (e.g. DiceBear ?seed=..., Google Fonts)
        const shouldIgnoreSearch =
            url.origin === self.location.origin &&
            !url.search &&
            !url.host.includes('api.dicebear.com') &&
            !url.host.includes('fonts.googleapis.com');

        event.respondWith(
            caches.match(event.request, shouldIgnoreSearch ? { ignoreSearch: true } : undefined).then((cachedResponse) => {
                const fetchPromise = fetch(
                    event.request,
                    isUnhashedMutable ? { cache: 'no-cache' } : undefined
                )
                    .then((networkResponse) => {
                        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
                            const clone = networkResponse.clone();
                            const targetCache = url.origin === self.location.origin ? CACHE_NAME : RUNTIME_CACHE;
                            caches.open(targetCache).then((cache) => cache.put(event.request, clone).catch(() => {}));
                        }
                        return networkResponse;
                    })
                    .catch(() => null);

                if (cachedResponse) {
                    // For unhashed mutable config/scripts (manifest.json, draco glue), SWR validates in background
                    fetchPromise.catch(() => {});
                    return cachedResponse;
                }

                return fetchPromise.then((netRes) => {
                    if (netRes) return netRes;
                    return new Response('Asset Offline', {
                        status: 408,
                        headers: { 'Content-Type': 'text/plain' }
                    });
                });
            })
        );
        return;
    }

    // 5. Default network-first fallback
    event.respondWith(
        fetch(event.request).catch(async () => {
            const cached = await caches.match(event.request);
            if (cached) return cached;
            return new Response('Offline', { status: 503 });
        })
    );
});
