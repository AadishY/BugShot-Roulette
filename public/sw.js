const CACHE_NAME = 'bugshot-roulette-v10';

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

        if (start >= total || end >= total) {
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

// Install event - Pre-cache critical assets with allSettled and skip waiting immediately
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing new version:', CACHE_NAME);
    // Skip waiting so the new worker activates immediately without waiting for existing tabs to close
    self.skipWaiting();

    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            console.log('[Service Worker] Pre-caching critical game assets for offline PWA operation...');
            const results = await Promise.allSettled(
                CRITICAL_ASSETS.map(async (url) => {
                    try {
                        const response = await fetch(url, { cache: 'reload' });
                        if (response.ok || response.type === 'opaque') {
                            await cache.put(url, response);
                        }
                    } catch (err) {
                        console.warn(`[Service Worker] Pre-cache skipped for ${url}:`, err.message);
                    }
                })
            );
            const successCount = results.filter((r) => r.status === 'fulfilled').length;
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
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Purging obsolete cache store:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );

            // Take control of all pages within scope immediately
            await self.clients.claim();
            console.log('[Service Worker] Clients claimed. Broadcasting UPDATE_AVAILABLE...');

            // Notify open window clients that a fresh update has taken control
            const clients = await self.clients.matchAll({ type: 'window' });
            clients.forEach((client) => {
                client.postMessage({
                    type: 'UPDATE_AVAILABLE',
                    version: CACHE_NAME,
                    timestamp: Date.now()
                });
            });
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

// Fetch event - Cache-First for static assets, Stale-While-Revalidate for unhashed media, Fast-Network-First for navigation
self.addEventListener('fetch', (event) => {
    // Only handle GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    const url = new URL(event.request.url);

    // Skip non-HTTP protocols (e.g. chrome-extension://)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return;
    }

    // Bypass real-time socket connections, live backend endpoints, and Firebase auth/firestore APIs
    if (
        url.pathname.includes('/socket.io') ||
        url.pathname.includes('ws') ||
        (url.hostname.includes('localhost') && url.port === '3001') ||
        url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/redis') ||
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('identitytoolkit.googleapis.com') ||
        url.hostname.includes('securetoken.googleapis.com') ||
        url.hostname.includes('firestore.googleapis.com')
    ) {
        return;
    }

    // 1. SPA Navigation requests (HTML documents)
    const isNavigation = event.request.mode === 'navigate' ||
        (event.request.headers.get('accept') || '').includes('text/html');

    if (isNavigation) {
        event.respondWith(
            (async () => {
                // Try fast network first (2000ms timeout) so new builds are caught, but offline loads instantly
                try {
                    const networkPromise = fetch(event.request);
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Navigation timeout')), 2000)
                    );

                    const networkResponse = await Promise.race([networkPromise, timeoutPromise]);
                    if (networkResponse && networkResponse.status === 200) {
                        const clone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return networkResponse;
                } catch {
                    // Offline or slow network: instantly serve cached HTML shell
                    const cachedIndex = (await caches.match(event.request)) ||
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

    // 2. Immutable Vite build chunks (/assets/*.js, /assets/*.css) - Pure Cache-First
    const isHashedAsset = url.pathname.startsWith('/assets/') &&
        url.pathname.match(/\.[a-f0-9_-]+\.(js|css|wasm)$/i);

    if (isHashedAsset) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) return cached;
                return fetch(event.request).then((netRes) => {
                    if (netRes && netRes.status === 200) {
                        const clone = netRes.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return netRes;
                });
            })
        );
        return;
    }

    // 3. Audio requests with Range Header support (seeking and mobile playback)
    const isAudio = url.pathname.match(/\.(mp3|wav|ogg)$/i);
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
                    if (netResponse && (netResponse.status === 200 || netResponse.status === 206)) {
                        const clone = netResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return netResponse;
                } catch {
                    // Return silent audio buffer to prevent unhandled playback rejection
                    return new Response(new ArrayBuffer(0), {
                        status: 200,
                        headers: { 'Content-Type': 'audio/mpeg' }
                    });
                }
            })()
        );
        return;
    }

    // 4. Static media assets (3D GLBs, Draco WASM, textures, fonts, stickers, favicons, CDN avatars)
    const isStaticAsset =
        url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|glb|gltf|wasm|bin|js|css|woff|woff2|ico|json)$/i) ||
        url.host.includes('fonts.gstatic.com') ||
        url.host.includes('fonts.googleapis.com') ||
        url.host.includes('api.dicebear.com') ||
        url.host.includes('avatars.githubusercontent.com');

    if (isStaticAsset) {
        event.respondWith(
            caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
                // Background network fetch to revalidate cache
                const fetchPromise = fetch(event.request)
                    .then((networkResponse) => {
                        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
                            const clone = networkResponse.clone();
                            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                        }
                        return networkResponse;
                    })
                    .catch(() => null);

                // If in cache, return immediately for sub-millisecond load speed
                if (cachedResponse) {
                    fetchPromise.catch(() => {});
                    return cachedResponse;
                }

                // If not in cache, wait for network
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
