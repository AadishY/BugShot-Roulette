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

    useEffect(() => {
        activeRef.current = active;
        if (active && !modalPausedRef.current && !document.hidden && !isRunningRef.current && startAnimateRef.current) {
            startAnimateRef.current();
        }
    }, [active]);

    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<{
        scene: THREE.Scene;
        camera: THREE.PerspectiveCamera;
        renderer: THREE.WebGLRenderer;
        disposables: { dispose: () => void }[];
    } | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;
        let frameId: number | null = null;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let resizeRafId: number | null = null;
        let resizeObserver: ResizeObserver | null = null;

        const initThree = () => {
            if (sceneRef.current) return;

            const width = container.clientWidth;
            const height = container.clientHeight;
            if (width === 0 || height === 0) return;

            const device = getDeviceType();
            const isMob = device === 'mobile';
            const isTab = device === 'tablet';
            const isLowPerf = isLowPerfDeviceOrSetting();
            const isLowEnd = isLowPerf || (isMob && (width < 600 || (window.devicePixelRatio || 1) < 2));
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

            const isSoftwareGl = detectSoftwareWebGL(renderer.getContext());
            const shellCount = isSoftwareGl
                ? 8
                : isLowPerf
                    ? 6
                    : isMob
                        ? 10
                        : isTab
                            ? 14
                            : 22;

            const pixelScale = isSoftwareGl ? 6.0 : isMob ? 4.5 : isTab ? 4.0 : 4.0;
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
            const spawnWidth = isMob ? 14 : 46;
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

            const disposables = [bodyGeo, baseGeo, bodyMat, baseMat, bodyInstanced, baseInstanced];
            sceneRef.current = { scene, camera, renderer, disposables };

            if (reducedMotion) {
                camera.lookAt(0, 0, 0);
                renderer.render(scene, camera);
                return;
            }

            // Cap FPS cleanly for buttery menu responsiveness & minimal battery/GPU heat
            const targetFps = isSoftwareGl ? 12 : isMob || isLowPerf ? 24 : 30;
            const frameIntervalMs = 1000 / targetFps;
            let lastRenderTime = performance.now();

            const scheduleNext = () => {
                if (!activeRef.current || document.hidden) {
                    isRunningRef.current = false;
                    return;
                }
                if (isSoftwareGl) {
                    timeoutId = setTimeout(() => {
                        timeoutId = null;
                        frameId = requestAnimationFrame(animate);
                    }, Math.round(frameIntervalMs));
                } else {
                    frameId = requestAnimationFrame(animate);
                }
            };

            const animate = (time: number) => {
                frameId = null;
                if (!activeRef.current || document.hidden) {
                    isRunningRef.current = false;
                    return;
                }

                const elapsed = time - lastRenderTime;
                if (!isSoftwareGl && elapsed < frameIntervalMs) {
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
                lastRenderTime = performance.now();
                if (!isRunningRef.current && activeRef.current && !document.hidden) {
                    isRunningRef.current = true;
                    frameId = requestAnimationFrame(animate);
                }
            };

            if (activeRef.current && !document.hidden) {
                startAnimateRef.current();
            }
        };

        const applyResize = () => {
            resizeRafId = null;
            if (!container || !sceneRef.current) return;
            const w = container.clientWidth;
            const h = container.clientHeight;
            if (w === 0 || h === 0) return;

            const device = getDeviceType();
            const isMob = device === 'mobile';
            const isTab = device === 'tablet';

            sceneRef.current.camera.aspect = w / h;
            sceneRef.current.camera.updateProjectionMatrix();
            const pxScale = isMob ? 4.5 : isTab ? 4.0 : 4.0;
            sceneRef.current.renderer.setSize(
                Math.max(1, Math.floor(w / pxScale)),
                Math.max(1, Math.floor(h / pxScale)),
                false
            );
            sceneRef.current.renderer.domElement.style.width = '100.5%';
            sceneRef.current.renderer.domElement.style.height = '100.5%';
        };

        const handleResize = () => {
            if (resizeRafId !== null) return;
            resizeRafId = requestAnimationFrame(applyResize);
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

        const handleVisibilityChange = () => {
            if (document.hidden || modalPausedRef.current) {
                stopLoop();
            } else if (activeRef.current && startAnimateRef.current && !isRunningRef.current) {
                startAnimateRef.current();
            }
        };

        const handleMenuModalState = (e: Event) => {
            const isOpen = Boolean((e as CustomEvent<{ open?: boolean }>).detail?.open);
            modalPausedRef.current = isOpen;
            if (isOpen) {
                stopLoop();
            } else if (activeRef.current && !document.hidden && startAnimateRef.current && !isRunningRef.current) {
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
            if (initRafId !== null) cancelAnimationFrame(initRafId);
            stopLoop();
            if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
            startAnimateRef.current = null;
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('bugshot_menu_modal_state', handleMenuModalState);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (resizeObserver) resizeObserver.disconnect();
            if (sceneRef.current) {
                sceneRef.current.disposables.forEach((d) => {
                    try { d.dispose(); } catch {}
                });
                try {
                    sceneRef.current.scene.clear();
                    if (sceneRef.current.renderer.renderLists) {
                        sceneRef.current.renderer.renderLists.dispose();
                    }
                    sceneRef.current.renderer.dispose();
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
