import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { getDeviceType } from '../../utils/gameUtils';

interface ShellData {
    mesh: THREE.Group;
    speed: number;
    rotationSpeed: THREE.Vector3;
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
    const isRunningRef = useRef(false);
    const startAnimateRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        activeRef.current = active;
        if (active && !document.hidden && !isRunningRef.current && startAnimateRef.current) {
            startAnimateRef.current();
        }
    }, [active]);

    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<{
        scene: THREE.Scene;
        camera: THREE.PerspectiveCamera;
        renderer: THREE.WebGLRenderer;
        shells: ShellData[];
        disposables: { dispose: () => void }[];
    } | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;
        let frameId: number | null = null;
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
            const isTouch = isMob || isTab || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
            const isLowPerf = isLowPerfDeviceOrSetting();
            const isLowEnd = isLowPerf || (isMob && (width < 600 || (window.devicePixelRatio || 1) < 2));
            const reducedMotion = isReducedMotionPreferred();

            const shellCount = isLowPerf ? 6 : (isMob ? 8 : (isTab ? 14 : 28));

            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x000000);
            scene.fog = new THREE.Fog(0x000000, 5, 30);

            const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
            camera.position.set(0, 0, 15);

            // alpha: false eliminates full-screen WebGL alpha blending in the browser compositor on Android
            const renderer = new THREE.WebGLRenderer({
                antialias: false,
                powerPreference: isMob ? 'default' : 'high-performance',
                precision: isLowEnd ? 'lowp' : 'mediump',
                alpha: false,
                stencil: false
            });

            const pixelScale = isMob ? 4.0 : (isTab ? 3.5 : 4.0);
            renderer.setSize(Math.max(1, Math.floor(width / pixelScale)), Math.max(1, Math.floor(height / pixelScale)), false);
            renderer.domElement.style.position = 'absolute';
            renderer.domElement.style.left = '0';
            renderer.domElement.style.top = '0';
            renderer.domElement.style.width = '100.5%';
            renderer.domElement.style.height = '100.5%';
            renderer.domElement.style.imageRendering = 'pixelated';
            // Skip expensive CSS filter pass on mobile/touch/low-perf devices (handled by light intensity instead)
            if (!isTouch && !isLowEnd) {
                renderer.domElement.style.filter = 'contrast(1.2) brightness(1.2)';
            }
            renderer.setPixelRatio(1);
            container.appendChild(renderer.domElement);

            // Enhanced Lighting - Compensate for omitted CSS brightness filter on touch/low-end
            const lightBoost = (isTouch || isLowEnd) ? 1.25 : 1.0;
            const ambientLight = new THREE.AmbientLight(0x1a1a1a, (isMob ? 10.0 : 8.0) * lightBoost);
            scene.add(ambientLight);

            const topLight = new THREE.DirectionalLight(0xffffff, (isMob ? 20.0 : 15.0) * lightBoost);
            topLight.position.set(0, 20, 10);
            scene.add(topLight);

            if (device !== 'mobile' && !isLowPerf) {
                const redLight = new THREE.PointLight(0xcc0000, 100.0, 100);
                redLight.position.set(-10, 5, 10);
                scene.add(redLight);

                if (device === 'pc') {
                    const blueLight = new THREE.PointLight(0x0044ff, 120.0, 100);
                    blueLight.position.set(10, -5, 10);
                    scene.add(blueLight);

                    const amberLight = new THREE.PointLight(0xffaa00, 150.0, 120);
                    amberLight.position.set(0, 5, 15);
                    scene.add(amberLight);
                }
            }

            const bodyGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.45, isLowEnd ? 6 : 8);
            const baseGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.1, isLowEnd ? 6 : 8);

            const liveMat = new THREE.MeshStandardMaterial({ color: 0xaa1111, roughness: 0.3, metalness: 0.6 });
            const blankMat = new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.3, metalness: 0.5 });
            const baseMat = new THREE.MeshStandardMaterial({ color: 0xaa8800, roughness: 0.2, metalness: 0.9 });

            const disposables = [bodyGeo, baseGeo, liveMat, blankMat, baseMat];

            const shells: ShellData[] = [];
            const spawnWidth = isMob ? 12 : 70;
            for (let i = 0; i < shellCount; i++) {
                const isLive = Math.random() > 0.4;
                const group = new THREE.Group();

                const body = new THREE.Mesh(bodyGeo, isLive ? liveMat : blankMat);
                group.add(body);

                const base = new THREE.Mesh(baseGeo, baseMat);
                base.position.y = -0.22;
                group.add(base);

                group.position.set(
                    (Math.random() - 0.5) * spawnWidth,
                    (Math.random() * 40) - 20,
                    (Math.random() * 20) - 10
                );
                group.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
                const depthFactor = (group.position.z + 10) / 20;
                const size = (isMob ? 2.5 : 1.5) + (depthFactor * 2.5) + Math.random() * 1.5;
                group.scale.setScalar(size);

                scene.add(group);

                const rotMult = device === 'pc' ? 0.3 : 0.15;
                shells.push({
                    mesh: group,
                    speed: 0.04 + Math.random() * 0.12,
                    rotationSpeed: new THREE.Vector3(
                        (Math.random() - 0.5) * rotMult,
                        (Math.random() - 0.5) * rotMult,
                        (Math.random() - 0.5) * rotMult
                    ),
                    drift: Math.random() * 4,
                    driftSpeed: 0.5 + Math.random() * 1.5,
                    driftOffset: Math.random() * 10
                });
            }

            sceneRef.current = { scene, camera, renderer, shells, disposables };

            if (reducedMotion) {
                camera.lookAt(0, 0, 0);
                renderer.render(scene, camera);
                return;
            }

            let lastTime = performance.now();

            const animate = (time: number) => {
                if (!activeRef.current || document.hidden) {
                    isRunningRef.current = false;
                    frameId = null;
                    return;
                }
                isRunningRef.current = true;
                frameId = requestAnimationFrame(animate);

                const dt = Math.min((time - lastTime) / 1000, 0.1);
                lastTime = time;
                const t = time * 0.001;
                const dt60 = dt * 60;

                camera.position.x = Math.sin(t * 0.5) * 1.5;
                camera.position.y = Math.cos(t * 0.3) * 1.0;
                camera.lookAt(0, 0, 0);

                const numShells = shells.length;
                for (let i = 0; i < numShells; i++) {
                    const shell = shells[i];
                    shell.mesh.position.y -= shell.speed * dt60;
                    shell.mesh.position.x += Math.sin(t * shell.driftSpeed + shell.driftOffset) * (shell.drift * 0.01);

                    shell.mesh.rotation.x += shell.rotationSpeed.x * dt60;
                    shell.mesh.rotation.y += shell.rotationSpeed.y * dt60;
                    shell.mesh.rotation.z += shell.rotationSpeed.z * dt60;

                    if (shell.mesh.position.y < -25) {
                        shell.mesh.position.y = 25;
                        shell.mesh.position.x = (Math.random() - 0.5) * spawnWidth;
                        shell.mesh.position.z = (Math.random() * 20) - 10;
                    }
                }

                renderer.render(scene, camera);
            };

            startAnimateRef.current = () => {
                lastTime = performance.now();
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
            const pxScale = isMob ? 4.0 : (isTab ? 3.5 : 4.0);
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

        const handleVisibilityChange = () => {
            if (document.hidden) {
                if (frameId !== null) {
                    cancelAnimationFrame(frameId);
                    frameId = null;
                }
                isRunningRef.current = false;
            } else if (activeRef.current && startAnimateRef.current && !isRunningRef.current) {
                startAnimateRef.current();
            }
        };

        if (container.clientWidth > 0 && container.clientHeight > 0) {
            initThree();
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
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (frameId !== null) cancelAnimationFrame(frameId);
            if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
            startAnimateRef.current = null;
            isRunningRef.current = false;
            window.removeEventListener('resize', handleResize);
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
