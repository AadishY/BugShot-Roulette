import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { getDeviceType } from '../../utils/gameUtils';
import { detectSoftwareWebGL } from '../../utils/three/graphicsConfig';

interface ShellInstanceData {
    x: number;
    y: number;
    z: number;
    rx: number;
    ry: number;
    rz: number;
    scale: number;
    speed: number;
    rotX: number;
    rotY: number;
    rotZ: number;
    drift: number;
    driftSpeed: number;
    driftOffset: number;
}

interface ShellBackgroundProps {
    active?: boolean;
}

const isReducedMotionPreferred = (): boolean => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

const isLowPerfDeviceOrSetting = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        const raw = localStorage.getItem('aadish_roulette_settings');
        if (raw) {
            const s = JSON.parse(raw);
            if (s?.ultraPerformance || s?.graphicsMode === 'potato' || s?.graphicsMode === 'low') {
                return true;
            }
        }
    } catch {}
    return false;
};

const ShellBackground: React.FC<ShellBackgroundProps> = React.memo(({ active = true }) => {
    const activeRef = useRef(active);
    const modalPausedRef = useRef(false);
    const isRunningRef = useRef(false);
    const startAnimateRef = useRef<(() => void) | null>(null);
    const stopLoopRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        activeRef.current = active;
        if (!active) {
            stopLoopRef.current?.();
        } else if (!modalPausedRef.current && !document.hidden && !isRunningRef.current && startAnimateRef.current) {
            startAnimateRef.current();
        }
    }, [active]);

    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<{
        scene: THREE.Scene;
        camera: THREE.PerspectiveCamera;
        renderer: THREE.WebGLRenderer;
        disposables: { dispose: () => void }[];
        renderStatic: () => void;
    } | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;
        let disposed = false;
        let frameId: number | null = null;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let resizeRafId: number | null = null;
        let resizeTimeoutId: ReturnType<typeof setTimeout> | null = null;
        let resizeObserver: ResizeObserver | null = null;
        let contextLostHandler: ((e: Event) => void) | null = null;

        let lastWidth = 0;
        let lastHeight = 0;
        let lastPixelScale = 0;

        const canRunLoop = () =>
            !disposed && activeRef.current && !modalPausedRef.current && !document.hidden;

        const computePixelScale = (
            isSoftwareGl: boolean,
            isLowEnd: boolean,
            isMob: boolean,
            isTab: boolean
        ) => {
            if (isSoftwareGl) return 6.0;
            if (isLowEnd) return 5.2;
            if (isMob) return 4.5;
            return isTab ? 4.0 : 4.0;
        };

        const initThree = () => {
            if (disposed || sceneRef.current) return;

            const width = container.clientWidth;
            const height = container.clientHeight;
            if (width === 0 || height === 0) return;

            const device = getDeviceType();
            const isMob = device === 'mobile';
            const isTab = device === 'tablet';
            const isLowPerf = isLowPerfDeviceOrSetting();
            const hwCores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 8) : 8;
            const devMem = typeof navigator !== 'undefined' ? ((navigator as unknown as { deviceMemory?: number }).deviceMemory || 8) : 8;
            const isLowEnd = isLowPerf || (isMob && (width < 600 || (window.devicePixelRatio || 1) < 2 || hwCores <= 4 || devMem <= 3));
            const reducedMotion = isReducedMotionPreferred();

            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x000000);
            scene.fog = new THREE.Fog(0x000000, 7, 28);

            const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 80);
            camera.position.set(0, 0, 15);

            // alpha: false & depth: true, stencil: false for minimal mobile GPU bandwidth
            const renderer = new THREE.WebGLRenderer({
                antialias: false,
                powerPreference: isMob ? 'low-power' : 'default',
                precision: isLowEnd ? 'lowp' : 'mediump',
                alpha: false,
                stencil: false
            });

            contextLostHandler = (e: Event) => {
                e.preventDefault();
                stopLoop();
            };
            renderer.domElement.addEventListener('webglcontextlost', contextLostHandler, false);

            const isSoftwareGl = detectSoftwareWebGL(renderer.getContext());
            const shellCount = isLowPerf
                ? 6
                : isLowEnd
                    ? 7
                    : isSoftwareGl
                        ? 8
                        : isMob
                            ? 10
                            : isTab
                                ? 14
                                : 22;

            const pixelScale = computePixelScale(isSoftwareGl, isLowEnd, isMob, isTab);
            lastWidth = width;
            lastHeight = height;
            lastPixelScale = pixelScale;

            renderer.setSize(
                Math.max(1, Math.floor(width / pixelScale)),
                Math.max(1, Math.floor(height / pixelScale)),
                false
            );
            renderer.domElement.style.position = 'absolute';
            renderer.domElement.style.left = '0';
            renderer.domElement.style.top = '0';
            renderer.domElement.style.width = '100.5%';
            renderer.domElement.style.height = '100.5%';
            renderer.domElement.style.imageRendering = 'pixelated';
            renderer.setPixelRatio(1);
            container.appendChild(renderer.domElement);

            // Ultra-light 2-light rig paired with MeshLambertMaterial (10x cheaper than PBR + 5 lights)
            const ambientLight = new THREE.AmbientLight(0x2a1a1a, 2.2);
            scene.add(ambientLight);

            const keyLight = new THREE.DirectionalLight(0xfff0dd, 3.2);
            keyLight.position.set(4, 18, 12);
            scene.add(keyLight);

            // Two InstancedMeshes total => 2 draw calls regardless of shellCount
            const radialSegments = isLowEnd || isSoftwareGl ? 6 : 8;
            const bodyGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.45, radialSegments, 1);
            const baseGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.1, radialSegments, 1);
            // Bake brass cap offset directly into geometry so both instances share one transform matrix
            baseGeo.translate(0, -0.22, 0);

            const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
            const baseMat = new THREE.MeshLambertMaterial({ color: 0xd4a428 });

            const bodyInstanced = new THREE.InstancedMesh(bodyGeo, bodyMat, shellCount);
            const baseInstanced = new THREE.InstancedMesh(baseGeo, baseMat, shellCount);
            bodyInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            baseInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            bodyInstanced.frustumCulled = false;
            baseInstanced.frustumCulled = false;

            const liveColor = new THREE.Color(0xc81e1e);
            const blankColor = new THREE.Color(0x3b4860);

            const shells: ShellInstanceData[] = [];
            const spawnWidth = isMob ? (width < height ? 11 : 14) : 46;
            const dummy = new THREE.Object3D();

            for (let i = 0; i < shellCount; i++) {
                const isLive = Math.random() > 0.4;
                bodyInstanced.setColorAt(i, isLive ? liveColor : blankColor);

                const x = (Math.random() - 0.5) * spawnWidth;
                const y = Math.random() * 40 - 20;
                const z = Math.random() * 18 - 10;
                const depthFactor = (z + 10) / 18;
                const scale = (isMob ? 2.4 : 1.7) + depthFactor * 2.2 + Math.random() * 1.2;
                const rotMult = device === 'pc' ? 0.24 : 0.14;

                const s: ShellInstanceData = {
                    x,
                    y,
                    z,
                    rx: Math.random() * 6.28,
                    ry: Math.random() * 6.28,
                    rz: Math.random() * 6.28,
                    scale,
                    speed: 0.04 + Math.random() * 0.1,
                    rotX: (Math.random() - 0.5) * rotMult,
                    rotY: (Math.random() - 0.5) * rotMult,
                    rotZ: (Math.random() - 0.5) * rotMult,
                    drift: Math.random() * 3.5,
                    driftSpeed: 0.5 + Math.random() * 1.3,
                    driftOffset: Math.random() * 10
                };
                shells.push(s);

                dummy.position.set(s.x, s.y, s.z);
                dummy.rotation.set(s.rx, s.ry, s.rz);
                dummy.scale.setScalar(s.scale);
                dummy.updateMatrix();
                bodyInstanced.setMatrixAt(i, dummy.matrix);
                baseInstanced.setMatrixAt(i, dummy.matrix);
            }

            if (bodyInstanced.instanceColor) {
                bodyInstanced.instanceColor.needsUpdate = true;
            }
            bodyInstanced.instanceMatrix.needsUpdate = true;
            baseInstanced.instanceMatrix.needsUpdate = true;

            scene.add(bodyInstanced);
            scene.add(baseInstanced);

            const renderStatic = () => {
                if (disposed) return;
                camera.lookAt(0, 0, 0);
                renderer.render(scene, camera);
            };

            const disposables: { dispose: () => void }[] = [
                bodyGeo,
                baseGeo,
                bodyMat,
                baseMat,
                bodyInstanced,
                baseInstanced,
                ambientLight,
                keyLight
            ];
            sceneRef.current = { scene, camera, renderer, disposables, renderStatic };

            if (reducedMotion) {
                renderStatic();
                return;
            }

            // Cap FPS cleanly for buttery menu responsiveness & minimal battery/GPU heat
            const targetFps = isSoftwareGl ? 12 : isMob || isLowPerf ? 24 : 30;
            const frameIntervalMs = 1000 / targetFps;
            let lastRenderTime = performance.now();

            const scheduleNext = () => {
                if (!canRunLoop()) {
                    isRunningRef.current = false;
                    return;
                }
                if (isSoftwareGl) {
                    timeoutId = setTimeout(() => {
                        timeoutId = null;
                        if (!canRunLoop()) {
                            isRunningRef.current = false;
                            return;
                        }
                        frameId = requestAnimationFrame(animate);
                    }, Math.round(frameIntervalMs));
                } else {
                    frameId = requestAnimationFrame(animate);
                }
            };

            const animate = (time: number) => {
                frameId = null;
                if (!canRunLoop() || isReducedMotionPreferred()) {
                    isRunningRef.current = false;
                    return;
                }

                const elapsed = time - lastRenderTime;
                if (elapsed < frameIntervalMs) {
                    scheduleNext();
                    return;
                }

                const dt = Math.min(elapsed / 1000, 0.1);
                lastRenderTime = time;
                const t = time * 0.001;
                const dt60 = dt * 60;

                camera.position.x = Math.sin(t * 0.45) * 1.2;
                camera.position.y = Math.cos(t * 0.28) * 0.8;
                camera.lookAt(0, 0, 0);

                for (let i = 0; i < shellCount; i++) {
                    const s = shells[i];
                    s.y -= s.speed * dt60;
                    s.x += Math.sin(t * s.driftSpeed + s.driftOffset) * (s.drift * 0.009) * dt60;
                    s.rx += s.rotX * dt60;
                    s.ry += s.rotY * dt60;
                    s.rz += s.rotZ * dt60;

                    if (s.y < -24) {
                        s.y = 24;
                        s.x = (Math.random() - 0.5) * spawnWidth;
                        s.z = Math.random() * 18 - 10;
                    }

                    dummy.position.set(s.x, s.y, s.z);
                    dummy.rotation.set(s.rx, s.ry, s.rz);
                    dummy.scale.setScalar(s.scale);
                    dummy.updateMatrix();
                    bodyInstanced.setMatrixAt(i, dummy.matrix);
                    baseInstanced.setMatrixAt(i, dummy.matrix);
                }

                bodyInstanced.instanceMatrix.needsUpdate = true;
                baseInstanced.instanceMatrix.needsUpdate = true;

                renderer.render(scene, camera);
                scheduleNext();
            };

            startAnimateRef.current = () => {
                if (isReducedMotionPreferred()) return;
                lastRenderTime = performance.now();
                if (!isRunningRef.current && canRunLoop()) {
                    isRunningRef.current = true;
                    frameId = requestAnimationFrame(animate);
                }
            };

            if (canRunLoop()) {
                startAnimateRef.current();
            }
        };

        const applyResize = () => {
            resizeRafId = null;
            if (disposed || !container || !sceneRef.current) return;
            const w = container.clientWidth;
            const h = container.clientHeight;
            if (w === 0 || h === 0) return;

            const device = getDeviceType();
            const isMob = device === 'mobile';
            const isTab = device === 'tablet';
            const isLowPerf = isLowPerfDeviceOrSetting();
            const hwCores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 8) : 8;
            const devMem = typeof navigator !== 'undefined' ? ((navigator as unknown as { deviceMemory?: number }).deviceMemory || 8) : 8;
            const isLowEnd = isLowPerf || (isMob && (w < 600 || (window.devicePixelRatio || 1) < 2 || hwCores <= 4 || devMem <= 3));
            const isSoftwareGl = detectSoftwareWebGL(sceneRef.current.renderer.getContext());
            const pxScale = computePixelScale(isSoftwareGl, isLowEnd, isMob, isTab);

            if (w === lastWidth && h === lastHeight && pxScale === lastPixelScale) {
                return;
            }
            lastWidth = w;
            lastHeight = h;
            lastPixelScale = pxScale;

            sceneRef.current.camera.aspect = w / h;
            sceneRef.current.camera.updateProjectionMatrix();
            sceneRef.current.renderer.setSize(
                Math.max(1, Math.floor(w / pxScale)),
                Math.max(1, Math.floor(h / pxScale)),
                false
            );
            sceneRef.current.renderer.domElement.style.width = '100.5%';
            sceneRef.current.renderer.domElement.style.height = '100.5%';

            // Keep static frame visible when resizing under reducedMotion or paused state
            if (!isRunningRef.current && activeRef.current && !document.hidden) {
                sceneRef.current.renderStatic();
            }
        };

        const handleResize = () => {
            if (disposed) return;
            if (resizeTimeoutId !== null) {
                clearTimeout(resizeTimeoutId);
            }
            resizeTimeoutId = setTimeout(() => {
                resizeTimeoutId = null;
                if (disposed || resizeRafId !== null) return;
                resizeRafId = requestAnimationFrame(applyResize);
            }, 120);
        };

        const stopLoop = () => {
            if (frameId !== null) {
                cancelAnimationFrame(frameId);
                frameId = null;
            }
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            isRunningRef.current = false;
        };
        stopLoopRef.current = stopLoop;

        const handleVisibilityChange = () => {
            if (document.hidden || modalPausedRef.current || !activeRef.current) {
                stopLoop();
            } else if (startAnimateRef.current && !isRunningRef.current) {
                startAnimateRef.current();
            }
        };

        const handleMenuModalState = (e: Event) => {
            const isOpen = Boolean((e as CustomEvent<{ open?: boolean }>).detail?.open);
            modalPausedRef.current = isOpen;
            if (isOpen) {
                stopLoop();
            } else if (canRunLoop() && startAnimateRef.current && !isRunningRef.current) {
                startAnimateRef.current();
            }
        };

        let initRafId: number | null = null;
        if (container.clientWidth > 0 && container.clientHeight > 0) {
            initRafId = requestAnimationFrame(() => {
                initRafId = null;
                initThree();
            });
        }

        resizeObserver = new ResizeObserver(() => {
            if (disposed) return;
            if (sceneRef.current) {
                handleResize();
            } else if (container.clientWidth > 0 && container.clientHeight > 0) {
                initThree();
            }
        });
        resizeObserver.observe(container);

        window.addEventListener('resize', handleResize);
        window.addEventListener('bugshot_menu_modal_state', handleMenuModalState);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            disposed = true;
            if (initRafId !== null) cancelAnimationFrame(initRafId);
            stopLoop();
            stopLoopRef.current = null;
            if (resizeTimeoutId !== null) {
                clearTimeout(resizeTimeoutId);
                resizeTimeoutId = null;
            }
            if (resizeRafId !== null) {
                cancelAnimationFrame(resizeRafId);
                resizeRafId = null;
            }
            startAnimateRef.current = null;
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('bugshot_menu_modal_state', handleMenuModalState);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (resizeObserver) {
                resizeObserver.disconnect();
                resizeObserver = null;
            }
            if (sceneRef.current) {
                if (contextLostHandler) {
                    try {
                        sceneRef.current.renderer.domElement.removeEventListener('webglcontextlost', contextLostHandler, false);
                    } catch {}
                    contextLostHandler = null;
                }
                sceneRef.current.disposables.forEach((d) => {
                    try { d.dispose(); } catch {}
                });
                try {
                    sceneRef.current.scene.clear();
                    if (sceneRef.current.renderer.renderLists) {
                        sceneRef.current.renderer.renderLists.dispose();
                    }
                    sceneRef.current.renderer.dispose();
                    const gl = sceneRef.current.renderer.getContext();
                    if (gl && typeof gl.isContextLost === 'function' && !gl.isContextLost()) {
                        sceneRef.current.renderer.forceContextLoss();
                    }
                    sceneRef.current.renderer.domElement.remove();
                } catch {}
                sceneRef.current = null;
            }
            container.innerHTML = '';
        };
    }, []);

    return (
        <div
            ref={containerRef}
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 0 }}
        />
    );
});

ShellBackground.displayName = 'ShellBackground';

export default ShellBackground;
