import * as THREE from 'three';
import { getDeviceType } from '../gameUtils';
import { getGraphicsPreset } from '../../types';
import { getGraphicsPresetConfig, GraphicsPresetProfile } from './graphicsConfig';

let _cachedGlowTexture: THREE.CanvasTexture | null = null;
let _cachedBrickTexture: THREE.CanvasTexture | null = null;
let _cachedTableTexture: THREE.CanvasTexture | null = null;
let _cachedConcreteTexture: THREE.CanvasTexture | null = null;
let _cachedWallTexture: THREE.CanvasTexture | null = null;
let _cachedDirtySkinTexture: THREE.CanvasTexture | null = null;
let _cachedRimTexture: THREE.CanvasTexture | null = null;
let _cachedFogSpriteMaterial: THREE.SpriteMaterial | null = null;
let _cachedBunkerEnvTexture: THREE.CanvasTexture | null = null;

export function createBunkerEnvTexture(): THREE.CanvasTexture {
    if (_cachedBunkerEnvTexture) return _cachedBunkerEnvTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        // Dark industrial bunker vertical gradient
        const bgGrad = ctx.createLinearGradient(0, 0, 0, 64);
        bgGrad.addColorStop(0.0, '#1c1612');
        bgGrad.addColorStop(0.45, '#121418');
        bgGrad.addColorStop(0.55, '#0b0a09');
        bgGrad.addColorStop(1.0, '#050505');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, 128, 64);

        // Warm overhead hanging bulb bounce for crisp metallic top highlights
        const warmOrb = ctx.createRadialGradient(64, 10, 1, 64, 10, 26);
        warmOrb.addColorStop(0.0, 'rgba(255, 220, 165, 0.95)');
        warmOrb.addColorStop(0.45, 'rgba(255, 170, 95, 0.38)');
        warmOrb.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = warmOrb;
        ctx.fillRect(0, 0, 128, 64);

        // Cool steel-blue rim highlight on left/right edges for warm/cool metallic separation
        const coolLeft = ctx.createRadialGradient(18, 28, 1, 18, 28, 22);
        coolLeft.addColorStop(0.0, 'rgba(95, 145, 220, 0.55)');
        coolLeft.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = coolLeft;
        ctx.fillRect(0, 0, 128, 64);

        const warmRight = ctx.createRadialGradient(110, 28, 1, 110, 28, 22);
        warmRight.addColorStop(0.0, 'rgba(220, 110, 70, 0.45)');
        warmRight.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = warmRight;
        ctx.fillRect(0, 0, 128, 64);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.userData = { isCachedAsset: true };
    _cachedBunkerEnvTexture = tex;
    return tex;
}

export function getGlowTexture() {
    return generateGlowTexture();
}

function generateGlowTexture() {
    if (_cachedGlowTexture) return _cachedGlowTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const context = canvas.getContext('2d');
    if (context) {
        const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.4, 'rgba(255,200,0,0.5)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 64, 64);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.userData = { isCachedAsset: true };
    _cachedGlowTexture = texture;
    return texture;
}

// procedural brick texture - brighter for visibility
function createBrickTexture() {
    if (_cachedBrickTexture) return _cachedBrickTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    ctx.fillStyle = '#3a2a25'; // Brighter reddish brown base
    ctx.fillRect(0, 0, 512, 512);

    const brickH = 32;
    const brickW = 64;

    for (let y = 0; y < 512; y += brickH) {
        // Offset every other row
        const offset = (y / brickH) % 2 === 0 ? 0 : 32;
        for (let x = -32; x < 512; x += brickW) {
            // Brick color variation - brighter
            const shade = 35 + Math.random() * 40;
            ctx.fillStyle = `rgb(${shade + 45}, ${shade + 25}, ${shade + 15})`;

            // Draw brick with mortar gap
            ctx.fillRect(x + offset + 2, y + 2, brickW - 4, brickH - 4);

            // Add grunge/noise
            if (Math.random() > 0.5) {
                ctx.fillStyle = 'rgba(0,0,0,0.2)';
                ctx.fillRect(x + offset + 5 + Math.random() * 40, y + 5 + Math.random() * 20, 10, 10);
            }
        }
    }

    // Light vignette
    const grad = ctx.createRadialGradient(256, 256, 128, 256, 256, 512);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.4)'); // Less dark
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.anisotropy = (getDeviceType() === 'pc') ? 8 : 1;
    tex.userData = { isCachedAsset: true };
    _cachedBrickTexture = tex;
    return tex;
}

function createTableTexture() {
    if (_cachedTableTexture) return _cachedTableTexture;
    const canvas = document.createElement('canvas');
    // 512x512 compiles 4x faster on startup while preserving crisp felt & glowing amber slot lines
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    // Base - Very dark olive/military green
    ctx.fillStyle = '#1a2a1a';
    ctx.fillRect(0, 0, 512, 512);

    // Felt texture layer - fast 2,400-speckle pass (eliminates startup UI freeze)
    for (let i = 0; i < 2400; i++) {
        const shade = Math.random();
        ctx.fillStyle = shade > 0.7 ? '#253525' : (shade > 0.4 ? '#1e2e1e' : '#142014');
        const size = 1 + Math.random() * 2;
        ctx.fillRect(Math.random() * 512, Math.random() * 512, size, size);
    }

    // Wear scratches
    ctx.strokeStyle = 'rgba(10, 15, 10, 0.55)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 24; i++) {
        ctx.beginPath();
        const x1 = Math.random() * 512;
        const y1 = Math.random() * 512;
        const len = 6 + Math.random() * 28;
        const angle = Math.random() * Math.PI * 2;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + Math.cos(angle) * len, y1 + Math.sin(angle) * len);
        ctx.stroke();
    }

    // Liquid stains
    for (let i = 0; i < 5; i++) {
        const x = 75 + Math.random() * 362;
        const y = 75 + Math.random() * 362;
        const r = 10 + Math.random() * 22;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(25, 15, 10, 0.3)');
        grad.addColorStop(0.6, 'rgba(20, 12, 8, 0.15)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    const drawGlowRect = (x: number, y: number, w: number, h: number, width: number = 1.5) => {
        const sX = x * 0.25;
        const sY = y * 0.25;
        const sW = w * 0.25;
        const sH = h * 0.25;
        ctx.strokeStyle = 'rgba(180, 150, 80, 0.16)';
        ctx.lineWidth = width + 3.5;
        ctx.strokeRect(sX, sY, sW, sH);
        ctx.strokeStyle = 'rgba(220, 180, 90, 0.72)';
        ctx.lineWidth = width;
        ctx.strokeRect(sX, sY, sW, sH);
    };

    drawGlowRect(150, 300, 350, 250, 1.5);
    drawGlowRect(150, 600, 350, 250, 1.5);
    drawGlowRect(1548, 300, 350, 250, 1.5);
    drawGlowRect(1548, 600, 350, 250, 1.5);

    for (let i = 0; i < 4; i++) {
        drawGlowRect(1200 + i * 100, 1700, 80, 80, 1.5);
        drawGlowRect(648 + i * 100, 250, 80, 80, 1.5);
    }
    drawGlowRect(874, 900, 300, 150, 2);

    const vignette = ctx.createRadialGradient(256, 256, 100, 256, 256, 350);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, 512, 512);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = (getDeviceType() === 'pc') ? 4 : 1;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.userData = { isCachedAsset: true };
    _cachedTableTexture = tex;
    return tex;
}


export const createEnvironment = (scene: THREE.Scene, isMobile: boolean = false, ultraPerformance: boolean = false) => {
    const settings = scene.userData.settings || {};
    const preset = getGraphicsPreset(settings);
    const isAndroid = !!scene.userData.isAndroid;
    const profile: GraphicsPresetProfile = scene.userData.graphicsProfile || getGraphicsPresetConfig(preset, {
        isMobile,
        isAndroid,
        nativeDpr: typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1,
        isSoftwareGl: !!scene.userData.isSoftwareGl
    });
    const isPotato = ultraPerformance || profile.useBasicEnv;
    const isLow = preset === 'low';
    const isBalanced = preset === 'balanced';
    const isHigh = preset === 'high';
    const useLambertEnv = profile.useLambertEnv;
    const allowEnvShadows = profile.allowEnvShadows;

    // Shared material factory: ensures Low & Balanced use zero-PBR Lambert shaders on all background props
    const makeEnvMat = (opts: {
        color: number;
        roughness?: number;
        metalness?: number;
        emissive?: number;
        emissiveIntensity?: number;
        side?: THREE.Side;
        toneMapped?: boolean;
    }): THREE.Material => {
        if (isPotato) {
            return new THREE.MeshBasicMaterial({
                color: opts.emissive ?? opts.color,
                side: opts.side
            });
        }
        if (useLambertEnv) {
            return new THREE.MeshLambertMaterial({
                color: opts.color,
                emissive: opts.emissive ?? 0x000000,
                emissiveIntensity: opts.emissive ? Math.min(opts.emissiveIntensity ?? 1, 1.5) : 0,
                side: opts.side
            });
        }
        return new THREE.MeshStandardMaterial({
            color: opts.color,
            roughness: opts.roughness ?? 0.75,
            metalness: opts.metalness ?? 0.1,
            emissive: opts.emissive ?? 0x000000,
            emissiveIntensity: opts.emissive ? (opts.emissiveIntensity ?? 1) : 0,
            side: opts.side,
            toneMapped: opts.toneMapped ?? true
        });
    };

    // Create procedural concrete texture for floor (512x512, fast startup)
    const createConcreteTexture = () => {
        if (_cachedConcreteTexture) return _cachedConcreteTexture;
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (!ctx) return new THREE.CanvasTexture(canvas);

        ctx.fillStyle = '#1a1816';
        ctx.fillRect(0, 0, 512, 512);

        for (let i = 0; i < 2200; i++) {
            const shade = Math.random();
            ctx.fillStyle = shade > 0.7 ? '#252220' : (shade > 0.4 ? '#1e1c1a' : '#161412');
            ctx.fillRect(Math.random() * 512, Math.random() * 512, 1.5 + Math.random() * 4, 1.5 + Math.random() * 4);
        }

        ctx.strokeStyle = 'rgba(10, 8, 6, 0.8)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 14; i++) {
            ctx.beginPath();
            let x = Math.random() * 512;
            let y = Math.random() * 512;
            ctx.moveTo(x, y);
            for (let j = 0; j < 4; j++) {
                x += (Math.random() - 0.5) * 44;
                y += (Math.random() - 0.5) * 44;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        for (let i = 0; i < 8; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const r = 12 + Math.random() * 30;
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, 'rgba(25, 20, 15, 0.4)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(4, 4);
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.anisotropy = (getDeviceType() === 'pc') ? 4 : 1;
        tex.userData = { isCachedAsset: true };
        _cachedConcreteTexture = tex;
        return tex;
    };

    // Floor - Industrial concrete
    const floorTex = isPotato ? null : createConcreteTexture();
    const floorMat = isPotato
        ? new THREE.MeshBasicMaterial({ color: 0x0c0b0a })
        : (useLambertEnv
            ? new THREE.MeshLambertMaterial({ map: floorTex || undefined, color: 0x201c19 })
            : new THREE.MeshStandardMaterial({
                map: floorTex || undefined,
                color: 0x1a1614,
                roughness: 0.88,
                metalness: 0.1
            }));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -9;
    floor.receiveShadow = profile.shadowMapEnabled && (isHigh || (isBalanced && !isAndroid));
    scene.add(floor);

    // Ceiling - Very dark with void feel
    const ceilingMat = isPotato
        ? new THREE.MeshBasicMaterial({ color: 0x040404, side: THREE.BackSide })
        : (useLambertEnv
            ? new THREE.MeshLambertMaterial({ color: 0x040404, side: THREE.BackSide })
            : new THREE.MeshStandardMaterial({ color: 0x020202, roughness: 1.0, side: THREE.BackSide }));
    const ceiling = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        ceilingMat
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 20;
    scene.add(ceiling);

    // Grunge Back Wall - Near black industrial
    const createWallTexture = () => {
        if (_cachedWallTexture) return _cachedWallTexture;
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (!ctx) return new THREE.CanvasTexture(canvas);

        ctx.fillStyle = '#1a1614';
        ctx.fillRect(0, 0, 512, 512);

        for (let i = 0; i < 200; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#252220' : '#1c1a18';
            ctx.fillRect(Math.random() * 512, Math.random() * 512, 3 + Math.random() * 15, 3 + Math.random() * 15);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.userData = { isCachedAsset: true };
        _cachedWallTexture = tex;
        return tex;
    };

    const wallTex = isPotato ? null : createWallTexture();
    // Back wall with emissive so it's always visible
    const backWallMat = isPotato
        ? new THREE.MeshBasicMaterial({ color: 0x0d0b0a })
        : (useLambertEnv
            ? new THREE.MeshLambertMaterial({ map: wallTex || undefined, color: 0x3a3530, emissive: 0x100d0b })
            : new THREE.MeshStandardMaterial({
                map: wallTex || undefined,
                color: 0x3a3530,
                roughness: 0.85,
                emissive: 0x151210,
                emissiveIntensity: 0.15
            }));
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(80, 50), backWallMat);
    backWall.position.set(0, 5, -28); // Moved back (was -22)
    backWall.receiveShadow = allowEnvShadows;
    scene.add(backWall);

    if (!isPotato) {
        // Crate material with slight emissive for visibility
        const crateMat = useLambertEnv
            ? new THREE.MeshLambertMaterial({ color: 0x3a3530, emissive: 0x080606 })
            : new THREE.MeshStandardMaterial({
                color: 0x3a3530,
                roughness: 0.8,
                emissive: 0x0a0808,
                emissiveIntensity: 0.15
            });

        // Background Stacks (Fill the void)
        const makeStack = (x: number, z: number, y: number, r: number, scale: number = 1) => {
            const box = new THREE.Mesh(new THREE.BoxGeometry(4 * scale, 4 * scale, 4 * scale), crateMat);
            box.position.set(x, y, z);
            box.rotation.y = r;
            if (allowEnvShadows) {
                box.castShadow = true;
                box.receiveShadow = true;
            }
            scene.add(box);
            return box;
        };

        // Left Stack - More crates for density
        makeStack(-15, -5, -7, 0.5);
        makeStack(-15, -5, -3, 0.5);
        makeStack(-15, -1, -5, 0.2);
        makeStack(-17, -7, -5, 0.3, 0.8);

        // Right Stack
        makeStack(16, -6, -6, -0.2);
        makeStack(18, -6, -2, -0.4);
        makeStack(17, -2, -4, 0.1);
        makeStack(19, -7, -4, -0.3, 0.7);

        // Far Back Props (Silhouettes for depth)
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(14, 12, 2), crateMat);
        shelf.position.set(0, -2, -25);
        shelf.receiveShadow = !isMobile;
        scene.add(shelf);

        // Left Foreground - Industrial Cart with items
        const cartGroup = new THREE.Group();
        cartGroup.position.set(-10, -5, 6);
        cartGroup.rotation.y = 0.4;

        const cartMat = makeEnvMat({ color: 0x252220, metalness: 0.6, roughness: 0.65 });
        const cartFrame = new THREE.Mesh(new THREE.BoxGeometry(3.5, 4.5, 2.5), cartMat);
        cartGroup.add(cartFrame);

        // Tray top
        const trayMat = makeEnvMat({ color: 0x3a3530, metalness: 0.5, roughness: 0.55 });
        const cartTray = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.15, 2.8), trayMat);
        cartTray.position.y = 2.3;
        cartGroup.add(cartTray);

        // Wheels
        const wheelMat = makeEnvMat({ color: 0x151210 });
        const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8);
        [[-1.2, -2, -0.8], [1.2, -2, -0.8], [-1.2, -2, 0.8], [1.2, -2, 0.8]].forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeo, wheelMat);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(pos[0], pos[1], pos[2]);
            cartGroup.add(wheel);
        });
        scene.add(cartGroup);

        // Cart light (Desktop High only)
        if (profile.enableExtraEnvLights) {
            const cartLight = new THREE.PointLight(0x4a4540, 8.0, 20);
            cartLight.position.set(-8, -2, 6);
            scene.add(cartLight);
        }

        // Right Foreground - Industrial Cabinet with LED display
        const cabinetGroup = new THREE.Group();
        cabinetGroup.position.set(11, -4.5, 5);
        cabinetGroup.rotation.y = -0.35;

        const cabMat = makeEnvMat({ color: 0x1a1815, roughness: 0.75, metalness: 0.2 });
        const cabinet = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 3), cabMat);
        cabinetGroup.add(cabinet);

        // LED display panel (green glow like reference)
        const displayMat = makeEnvMat({
            color: 0x001500,
            emissive: 0x00ff00,
            emissiveIntensity: 0.3
        });
        const display = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.2), displayMat);
        display.position.set(0, 1, 1.51);
        cabinetGroup.add(display);

        // LED indicator lights
        const ledMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        for (let i = 0; i < 5; i++) {
            const led = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.05), ledMat);
            led.position.set(-1 + i * 0.5, 0, 1.52);
            cabinetGroup.add(led);
        }
        scene.add(cabinetGroup);
    }




    // Bulb & Wire Group for animation
    const bulbGroup = new THREE.Group();
    bulbGroup.name = "BULB_GROUP";
    scene.add(bulbGroup);

    // === HANGING WIRES (Procedural) ===
    const wireTubeMat = makeEnvMat({ color: 0x111111, roughness: 0.8 });
    const createWire = (start: THREE.Vector3, end: THREE.Vector3, slack: number, segments: number) => {
        const points = [];
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const x = THREE.MathUtils.lerp(start.x, end.x, t);
            const z = THREE.MathUtils.lerp(start.z, end.z, t);
            const y = THREE.MathUtils.lerp(start.y, end.y, t) - (Math.sin(t * Math.PI) * slack);
            points.push(new THREE.Vector3(x, y, z));
        }
        const curve = new THREE.CatmullRomCurve3(points);
        const geo = new THREE.TubeGeometry(curve, isLow ? Math.max(5, segments - 3) : segments, 0.05, 5, false);
        return new THREE.Mesh(geo, wireTubeMat);
    };

    // Add multiple wires hanging from ceiling
    if (!isPotato) {
        scene.add(createWire(new THREE.Vector3(-10, 12, -5), new THREE.Vector3(10, 12, -5), 2.5, 10));
        scene.add(createWire(new THREE.Vector3(-15, 12, -10), new THREE.Vector3(5, 14, -15), 3.0, 10));
        if (!isLow) {
            scene.add(createWire(new THREE.Vector3(-5, 14, -20), new THREE.Vector3(15, 12, -18), 2.0, 10));
        }
        scene.add(createWire(new THREE.Vector3(0, 14, 5), new THREE.Vector3(0, 10, 0), 1.0, 8));
    }

    // Wire Geometry (Simple straight one for bulb group)
    const wireGeo = new THREE.CylinderGeometry(0.03, 0.03, 6, 6);
    const wire = new THREE.Mesh(wireGeo, new THREE.MeshBasicMaterial({ color: 0x111111 }));
    wire.position.set(0, -3, 0);

    // Ceiling Pivot Group
    const hangingLight = new THREE.Group();
    hangingLight.name = "HANGING_LIGHT";
    hangingLight.position.set(0, 14, 0);
    scene.add(hangingLight);

    hangingLight.add(wire);

    // Bulb Mesh
    const bulbMat = isPotato || isLow
        ? new THREE.MeshBasicMaterial({ color: 0xffcc66 })
        : new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffaa00,
            emissiveIntensity: 2.0,
            toneMapped: false
        });
    const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, isPotato || isLow ? 10 : 18, isPotato || isLow ? 10 : 18),
        bulbMat
    );
    bulb.position.set(0, -6, 0);
    bulb.castShadow = false;
    hangingLight.add(bulb);

    // Volumetric Bulb Halo Sprite (PC Balanced & High)
    if (profile.enableBulbHalo) {
        const spriteMat = new THREE.SpriteMaterial({
            map: generateGlowTexture(),
            color: 0xffaa00,
            transparent: true,
            opacity: isHigh ? 0.5 : 0.35,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const glowSprite = new THREE.Sprite(spriteMat);
        glowSprite.scale.set(isHigh ? 7.5 : 6, isHigh ? 7.5 : 6, 1);
        bulb.add(glowSprite);
    }

    // --- INDUSTRIAL PIPES & VENTS ---
    const pipeMat = makeEnvMat({ color: 0x3a3535, roughness: 0.55, metalness: 0.72 });
    const rustMat = makeEnvMat({ color: 0x5d4638, roughness: 0.85 });

    // --- ENHANCED BACKGROUND PROPS ---
    if (!isPotato) {
        const boxGeo = new THREE.BoxGeometry(3, 3, 3);
        const boxMat = makeEnvMat({ color: 0x5a4a3a, roughness: 0.85 });

        // === AMP RACK (Left Side - visible) ===
        const rackGroup = new THREE.Group();
        rackGroup.position.set(-10, -1, -12);
        rackGroup.rotation.y = 0.5;

        const rackFrame = new THREE.Mesh(new THREE.BoxGeometry(5, 8, 4), makeEnvMat({ color: 0x353030 }));
        rackGroup.add(rackFrame);

        const ampMat = makeEnvMat({ color: 0x252222 });
        const dialMat = makeEnvMat({ color: 0x777777 });
        const lightMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

        for (let i = 0; i < 3; i++) {
            const amp = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2, 0.2), ampMat);
            amp.position.set(0, 2 - i * 2.5, 2.0);
            rackGroup.add(amp);

            for (let j = 0; j < 5; j++) {
                const l = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.1), lightMat);
                l.position.set(-1.5 + j * 0.5, 0, 0.2);
                amp.add(l);
            }

            const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8), dialMat);
            dial.rotation.x = Math.PI / 2;
            dial.position.set(1.5, 0, 0.2);
            amp.add(dial);
        }

        const sub = new THREE.Mesh(new THREE.CircleGeometry(1.5, 16), makeEnvMat({ color: 0x1a1818 }));
        sub.position.set(0, -2.5, 2.05);
        rackGroup.add(sub);
        scene.add(rackGroup);

        // === EXTRA LEFT PROPS (Visible) ===
        const leftStack = new THREE.Group();
        leftStack.position.set(-14, -4, -8);
        leftStack.rotation.y = 0.8;
        const box1 = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 3), makeEnvMat({ color: 0x4a3a2a }));
        const box2 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.5, 2.5), makeEnvMat({ color: 0x3a2a1a }));
        box2.position.y = 3.2; box2.rotation.y = 0.5;
        leftStack.add(box1); leftStack.add(box2);
        scene.add(leftStack);

        // === RIGHT GENERATOR STACK (Visible) ===
        const genGroup = new THREE.Group();
        genGroup.position.set(12, -3, -10);
        genGroup.rotation.y = -0.6;

        const genBase = new THREE.Mesh(new THREE.BoxGeometry(5, 6, 4), makeEnvMat({ color: 0x334433 }));
        genGroup.add(genBase);

        const ventMat = makeEnvMat({ color: 0x111111 });
        for (let i = 0; i < 3; i++) {
            const vent = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.5, 12), ventMat);
            vent.rotation.x = Math.PI / 2;
            vent.position.set(0, 1.5 - i * 1.5, 2.1);
            genGroup.add(vent);
        }
        scene.add(genGroup);

        // Ceiling Fan (Industrial)
        const fanGroup = new THREE.Group();
        fanGroup.name = 'CEILING_FAN';
        fanGroup.position.set(0, 10, -5);
        const bladeGeo = new THREE.BoxGeometry(12, 0.2, 1);
        const bladeMat = useLambertEnv
            ? new THREE.MeshLambertMaterial({ color: 0x111111 })
            : new THREE.MeshStandardMaterial({ color: 0x111111 });
        const blade1 = new THREE.Mesh(bladeGeo, bladeMat);
        const blade2 = new THREE.Mesh(bladeGeo, bladeMat);
        blade2.rotation.y = Math.PI / 2;
        fanGroup.add(blade1); fanGroup.add(blade2);
        scene.add(fanGroup);
        scene.userData.fanGroup = fanGroup;

        // Random Cables hanging
        const cableCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(-10, 15, -5),
            new THREE.Vector3(-4, 9, -5),
            new THREE.Vector3(4, 12, -5),
            new THREE.Vector3(10, 15, -5),
        ]);
        const cableGeo = new THREE.TubeGeometry(cableCurve, 20, 0.1, 8, false);
        const cableMat = useLambertEnv
            ? new THREE.MeshLambertMaterial({ color: 0x111111 })
            : new THREE.MeshStandardMaterial({ color: 0x111111 });
        const looseCable = new THREE.Mesh(cableGeo, cableMat);
        scene.add(looseCable);

        // Right Stack Clutter - closer
        const clutter2 = new THREE.Mesh(boxGeo, boxMat); clutter2.position.set(12, -6.5, -18); clutter2.rotation.y = -0.3; scene.add(clutter2);
        const clutter3 = new THREE.Mesh(new THREE.BoxGeometry(2, 5, 2), boxMat); clutter3.position.set(10, -5, -19); clutter3.rotation.y = 0.4; scene.add(clutter3);

        // === DEALER LAIR FOG (Only when fogSpriteCount > 0; disabled on Low & mobile Balanced to eliminate overdraw) ===
        if (profile.fogSpriteCount > 0) {
            const createDirtySkinTexture = () => {
                if (_cachedDirtySkinTexture) return _cachedDirtySkinTexture;
                const canvas = document.createElement('canvas');
                canvas.width = 128; canvas.height = 128;
                const ctx = canvas.getContext('2d');
                if (!ctx) return null;
                ctx.fillStyle = '#e0c0b0';
                ctx.fillRect(0, 0, 128, 128);
                for (let i = 0; i < 120; i++) {
                    ctx.fillStyle = 'rgba(50, 40, 30, 0.2)';
                    ctx.fillRect(Math.random() * 128, Math.random() * 128, 3, 3);
                }
                const tex = new THREE.CanvasTexture(canvas);
                tex.minFilter = THREE.LinearFilter;
                tex.magFilter = THREE.LinearFilter;
                tex.generateMipmaps = false;
                tex.userData = { isCachedAsset: true };
                _cachedDirtySkinTexture = tex;
                return tex;
            };
            const getFogSpriteMaterial = () => {
                if (!_cachedFogSpriteMaterial) {
                    _cachedFogSpriteMaterial = new THREE.SpriteMaterial({
                        map: createDirtySkinTexture(),
                        color: 0x121212,
                        transparent: true,
                        opacity: 0.22,
                        blending: THREE.NormalBlending,
                        depthWrite: false
                    });
                    _cachedFogSpriteMaterial.userData = { isCachedAsset: true };
                }
                return _cachedFogSpriteMaterial;
            };

            const envFogGroup = new THREE.Group();
            envFogGroup.name = 'ENV_DEALER_FOG';
            envFogGroup.position.set(0, 3, -8);

            for (let i = 0; i < profile.fogSpriteCount; i++) {
                const spr = new THREE.Sprite(getFogSpriteMaterial());
                spr.position.set(
                    (Math.random() - 0.5) * 8,
                    -2 + (Math.random() - 0.5) * 6,
                    (Math.random() - 0.5) * 6
                );
                spr.scale.setScalar(8 + Math.random() * 4);
                envFogGroup.add(spr);
            }
            scene.add(envFogGroup);
        }

        // === LEFT SIDE - ROD CUPBOARD / SHELF ===
        const leftShelfGroup = new THREE.Group();
        leftShelfGroup.position.set(-14, -8, 4);
        leftShelfGroup.rotation.y = 0.4;
        leftShelfGroup.scale.set(2.0, 2.0, 2.0);

        const rodMat = makeEnvMat({ color: 0x444444, metalness: 0.8, roughness: 0.4 });
        const shelfMat = makeEnvMat({ color: 0x222222, roughness: 0.8 });

        const rodGeo = new THREE.CylinderGeometry(0.1, 0.1, 14, 6);
        const rod1 = new THREE.Mesh(rodGeo, rodMat); rod1.position.set(-1.8, 0, 1); leftShelfGroup.add(rod1);
        const rod2 = new THREE.Mesh(rodGeo, rodMat); rod2.position.set(1.8, 0, 1); leftShelfGroup.add(rod2);
        const rod3 = new THREE.Mesh(rodGeo, rodMat); rod3.position.set(-1.8, 0, -1); leftShelfGroup.add(rod3);
        const rod4 = new THREE.Mesh(rodGeo, rodMat); rod4.position.set(1.8, 0, -1); leftShelfGroup.add(rod4);

        const shelfGeo = new THREE.BoxGeometry(3.8, 0.1, 2.2);
        for (let y = -6; y <= 6; y += 3) {
            const shelf = new THREE.Mesh(shelfGeo, shelfMat);
            shelf.position.y = y;
            leftShelfGroup.add(shelf);
        }

        const boxPropMat = makeEnvMat({ color: 0x8d6e63 });
        const shelfBox1 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.0, 1.6), boxPropMat);
        shelfBox1.position.set(-0.5, 6.7, 0);
        shelfBox1.rotation.y = 0.2;
        leftShelfGroup.add(shelfBox1);

        const shelfBox2 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.8, 1.0), boxPropMat);
        shelfBox2.position.set(0.6, 6.6, 0.2);
        shelfBox2.rotation.y = -0.4;
        leftShelfGroup.add(shelfBox2);

        scene.add(leftShelfGroup);

        // === RIGHT SIDE - INDUSTRIAL RACK ===
        const rightRackGroup = new THREE.Group();
        rightRackGroup.position.set(13, -1, 4);
        rightRackGroup.rotation.y = -0.5;
        rightRackGroup.scale.set(1.5, 1.5, 1.5);

        const rackMat = makeEnvMat({ color: 0x333333, metalness: 0.6, roughness: 0.5 });
        const rackBody = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 1.5), rackMat);
        rightRackGroup.add(rackBody);

        const ventBody = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.2, 1.2), rackMat);
        ventBody.position.set(-2.2, -0.15, 0.2);
        ventBody.rotation.z = 0.1;
        rightRackGroup.add(ventBody);

        const ventCircle = new THREE.Mesh(
            new THREE.CircleGeometry(0.5, 12),
            makeEnvMat({ color: 0x111111, side: THREE.DoubleSide })
        );
        ventCircle.position.set(-2.2, -0.2, 0.81);
        rightRackGroup.add(ventCircle);

        const panelGeo = new THREE.PlaneGeometry(0.8, 0.3);
        const panelMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.position.set(0.5, 0.6, 0.76);
        rightRackGroup.add(panel);

        const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(1, 0, 0.8),
            new THREE.Vector3(1.5, -1, 1.5),
            new THREE.Vector3(1.2, -3, 2),
            new THREE.Vector3(2, -5, 1)
        ]);
        const rackWireGeo = new THREE.TubeGeometry(curve, 6, 0.05, 4, false);
        const rackWires = new THREE.Mesh(rackWireGeo, wireTubeMat);
        rightRackGroup.add(rackWires);

        const mugMat = makeEnvMat({ color: 0xeeeeee });
        const mugGroup = new THREE.Group();
        mugGroup.position.set(0.5, 1.25, 0);
        mugGroup.rotation.y = 0.5;
        const mugBody = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.5, 10), mugMat);
        mugBody.position.y = 0.25;
        mugGroup.add(mugBody);
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 6, 10), mugMat);
        handle.position.set(0.25, 0.25, 0);
        mugGroup.add(handle);
        rightRackGroup.add(mugGroup);

        scene.add(rightRackGroup);

        // Center Back - Metal Drum / Barrel
        const drumGeo = new THREE.CylinderGeometry(1.5, 1.5, 4, 12);
        const drumMat = makeEnvMat({ color: 0x445566, roughness: 0.65, metalness: 0.5 });
        const drum = new THREE.Mesh(drumGeo, drumMat);
        drum.position.set(2, -6, -22);
        scene.add(drum);

        // === CRT SECURITY TELEVISION (Left Side) ===
        const leftTvGroup = new THREE.Group();
        leftTvGroup.position.set(-12, 1.0, -4);
        leftTvGroup.rotation.y = 0.8;
        leftTvGroup.scale.set(1.2, 1.2, 1.2);

        const tvCaseMat = makeEnvMat({ color: 0x2d302e, metalness: 0.5, roughness: 0.5 });
        const leftTvCase = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.8, 1.8), tvCaseMat);
        leftTvGroup.add(leftTvCase);

        const leftTvBevel = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 0.1), tvCaseMat);
        leftTvBevel.position.set(0, 0, 0.9);
        leftTvGroup.add(leftTvBevel);

        const leftTvScreenMat = makeEnvMat({
            color: 0x113322,
            emissive: 0x00cc55,
            emissiveIntensity: 2.2,
            roughness: 0.15,
            metalness: 0.8
        });
        const leftTvScreen = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 0.05), leftTvScreenMat);
        leftTvScreen.position.set(-0.1, 0, 0.95);
        leftTvGroup.add(leftTvScreen);

        const knobMat = makeEnvMat({ color: 0x111111, metalness: 0.8, roughness: 0.2 });
        const leftDial1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 6), knobMat);
        leftDial1.rotation.x = Math.PI / 2;
        leftDial1.position.set(0.7, 0.4, 0.95);
        leftTvGroup.add(leftDial1);

        const leftDial2 = leftDial1.clone();
        leftDial2.position.set(0.7, 0.0, 0.95);
        leftTvGroup.add(leftDial2);

        if (profile.enableExtraEnvLights) {
            const leftTvLight = new THREE.SpotLight(0x00ff88, 22.0, 20);
            leftTvLight.position.set(0, 0, 1.0);
            leftTvLight.target.position.set(5, -1, 3);
            leftTvGroup.add(leftTvLight);
            leftTvGroup.add(leftTvLight.target);
        }

        scene.add(leftTvGroup);

        // === TERMINAL SCREEN (Right Side) ===
        const rightTvGroup = new THREE.Group();
        rightTvGroup.position.set(12, 1.5, -4);
        rightTvGroup.rotation.y = -0.8;
        rightTvGroup.scale.set(1.1, 1.1, 1.1);

        const rightTvCase = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 1.6), tvCaseMat);
        rightTvGroup.add(rightTvCase);

        const rightTvBevel = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.4, 0.1), tvCaseMat);
        rightTvBevel.position.set(0, 0, 0.8);
        rightTvGroup.add(rightTvBevel);

        const rightTvScreenMat = makeEnvMat({
            color: 0x331111,
            emissive: 0xff3300,
            emissiveIntensity: 2.0,
            roughness: 0.15,
            metalness: 0.8
        });
        const rightTvScreen = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.05), rightTvScreenMat);
        rightTvScreen.position.set(-0.1, 0, 0.85);
        rightTvGroup.add(rightTvScreen);

        const rightDial1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 6), knobMat);
        rightDial1.rotation.x = Math.PI / 2;
        rightDial1.position.set(0.8, 0.3, 0.85);
        rightTvGroup.add(rightDial1);

        const rightDial2 = rightDial1.clone();
        rightDial2.position.set(0.8, -0.1, 0.85);
        rightTvGroup.add(rightDial2);

        if (profile.enableExtraEnvLights) {
            const rightTvLight = new THREE.SpotLight(0xff4400, 18.0, 20);
            rightTvLight.position.set(0, 0, 0.9);
            rightTvLight.target.position.set(-5, -1, 3);
            rightTvGroup.add(rightTvLight);
            rightTvGroup.add(rightTvLight.target);
        }

        scene.add(rightTvGroup);

        // Floor Debris (Desktop High only)
        if (profile.enableFloorDebris) {
            const debrisGeo = new THREE.PlaneGeometry(0.3, 0.4);
            const debrisMat = makeEnvMat({ color: 0xaaaaaa, side: THREE.DoubleSide });
            for (let i = 0; i < 12; i++) {
                const debris = new THREE.Mesh(debrisGeo, debrisMat);
                debris.position.set((Math.random() - 0.5) * 15, -7.95, (Math.random() - 0.5) * 15 - 5);
                debris.rotation.x = -Math.PI / 2;
                debris.rotation.z = Math.random() * 2 * Math.PI;
                scene.add(debris);
            }
        }

        // Single background point light on PC Balanced & High (skipped on Low and mobile Balanced)
        if (profile.enableBgRimLights) {
            const clutterLight = new THREE.PointLight(0x778899, isHigh ? 28 : 22, 58);
            clutterLight.position.set(0, 10, -20);
            scene.add(clutterLight);
        }

        // --- INDUSTRIAL PIPES & VENTS ---
        const pipe1 = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 40, 8), pipeMat);
        pipe1.rotation.z = Math.PI / 2; pipe1.position.set(0, 12, -15);
        scene.add(pipe1);

        const pipe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 40, 8), rustMat);
        pipe2.rotation.z = Math.PI / 2; pipe2.position.set(0, 13, -12);
        scene.add(pipe2);

        const vPipe1 = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 20, 8), pipeMat);
        vPipe1.position.set(-18, 5, -22);
        scene.add(vPipe1);

        const vPipe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 20, 8), rustMat);
        vPipe2.position.set(15, 5, -22);
        scene.add(vPipe2);

        const fanHousing = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 2), makeEnvMat({ color: 0x2a2828 }));
        fanHousing.position.set(8, 5, -25);
        scene.add(fanHousing);
        const fanBlades = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.2, 8), makeEnvMat({ color: 0x1a1818 }));
        fanBlades.rotation.x = Math.PI / 2; fanBlades.position.set(8, 5, -24);
        scene.add(fanBlades);

        const terminal = new THREE.Mesh(new THREE.BoxGeometry(3, 2.5, 2), makeEnvMat({ color: 0x252222 }));
        terminal.position.set(-10, -5, -20); terminal.rotation.y = 0.4;
        scene.add(terminal);
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.8), makeEnvMat({ color: 0x004400, emissive: 0x00ff00, emissiveIntensity: 0.4 }));
        screen.position.set(-10, -5, -18.9); screen.rotation.y = 0.4;
        scene.add(screen);
    }

    // === BRICK WALLS === (With emissive for visibility)
    const brickTex = isPotato ? null : createBrickTexture();
    if (brickTex) brickTex.repeat.set(2, 2);
    const brickMat = isPotato
        ? new THREE.MeshBasicMaterial({ color: 0x14100e })
        : (useLambertEnv
            ? new THREE.MeshLambertMaterial({ map: brickTex || undefined, color: 0xbb8877, emissive: 0x160f0d })
            : new THREE.MeshStandardMaterial({
                map: brickTex || undefined,
                color: 0xbb8877,
                roughness: 0.8,
                metalness: 0.1,
                emissive: 0x1a1210,
                emissiveIntensity: 0.15
            }));

    // Side Walls - further away for open feel
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), brickMat);
    leftWall.position.set(-20, 5, -12); // Moved out and back (was -15, -5)
    leftWall.rotation.y = Math.PI / 2;
    leftWall.receiveShadow = allowEnvShadows;
    scene.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), brickMat);
    rightWall.position.set(20, 5, -12); // Moved out and back
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.receiveShadow = allowEnvShadows;
    scene.add(rightWall);

    // Front Wall (Behind Player) - completes room enclosure at Z = 18
    const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(80, 50), brickMat);
    frontWall.position.set(0, 5, 18);
    frontWall.rotation.y = Math.PI;
    frontWall.receiveShadow = allowEnvShadows;
    scene.add(frontWall);

    if (!isPotato) {
        // Behind Props (Behind Player, Z = 17 to 17.5)
    // Horizontal ceiling pipes behind player
    const behindPipe1 = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 40), pipeMat);
    behindPipe1.rotation.z = Math.PI / 2;
    behindPipe1.position.set(0, 11, 17.2);
    scene.add(behindPipe1);

    const behindPipe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 40), rustMat);
    behindPipe2.rotation.z = Math.PI / 2;
    behindPipe2.position.set(0, 12, 17.5);
    scene.add(behindPipe2);

    // Vertical pipes behind player
    const behindVPipe1 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 20), pipeMat);
    behindVPipe1.position.set(-15, 5, 17.3);
    scene.add(behindVPipe1);

    const behindVPipe2 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 20), rustMat);
    behindVPipe2.position.set(15, 5, 17.3);
    scene.add(behindVPipe2);

    // === STAGE LIGHTS (Barn Doors) ===
    const housingMat = makeEnvMat({ color: 0x111111, metalness: 0.5, roughness: 0.7 });
    const lensMat = makeEnvMat({
        color: 0xffcc88,
        emissive: 0xffaa66,
        emissiveIntensity: 2.2,
        toneMapped: false
    });
    const coreMat = new THREE.MeshBasicMaterial({
        color: 0xffffee,
        transparent: true,
        opacity: 0.9
    });
    const doorGeo = new THREE.BoxGeometry(2.5, 2.5, 0.1);

    const createStageLight = (x: number, y: number, z: number, targetX: number, targetY: number, targetZ: number) => {
        const group = new THREE.Group();
        group.position.set(x, y, z);
        group.lookAt(targetX, targetY, targetZ);

        const can = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.0, 3, 10), housingMat);
        can.rotation.x = Math.PI / 2;
        group.add(can);

        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.3, 14), lensMat);
        lens.rotation.x = Math.PI / 2;
        lens.position.z = 1.6;
        group.add(lens);

        const core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 10), coreMat);
        core.position.z = 1.5;
        group.add(core);

        const topDoor = new THREE.Mesh(doorGeo, housingMat);
        topDoor.position.set(0, 1.6, 2.0);
        topDoor.rotation.x = Math.PI / 3;
        group.add(topDoor);

        const bottomDoor = new THREE.Mesh(doorGeo, housingMat);
        bottomDoor.position.set(0, -1.6, 2.0);
        bottomDoor.rotation.x = -Math.PI / 3;
        group.add(bottomDoor);

        const leftDoor = new THREE.Mesh(doorGeo, housingMat);
        leftDoor.position.set(-1.6, 0, 2.0);
        leftDoor.rotation.y = -Math.PI / 3;
        group.add(leftDoor);

        const rightDoor = new THREE.Mesh(doorGeo, housingMat);
        rightDoor.position.set(1.6, 0, 2.0);
        rightDoor.rotation.y = Math.PI / 3;
        group.add(rightDoor);

        const yoke = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.2, 4, 12, Math.PI), housingMat);
        yoke.rotation.z = Math.PI / 2;
        yoke.rotation.x = Math.PI / 2;
        group.add(yoke);

        if (profile.enableBulbHalo) {
            const innerGlowMat = new THREE.SpriteMaterial({
                map: generateGlowTexture(),
                color: 0xffffcc,
                transparent: true,
                opacity: 0.85,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const innerGlow = new THREE.Sprite(innerGlowMat);
            innerGlow.position.set(0, 0, 1.7);
            innerGlow.scale.set(3, 3, 1);
            group.add(innerGlow);

            if (isHigh) {
                const outerGlowMat = new THREE.SpriteMaterial({
                    map: generateGlowTexture(),
                    color: 0xffaa55,
                    transparent: true,
                    opacity: 0.45,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                });
                const outerGlow = new THREE.Sprite(outerGlowMat);
                outerGlow.position.set(0, 0, 2.0);
                outerGlow.scale.set(7.5, 7.5, 1);
                group.add(outerGlow);
            }
        }

        scene.add(group);
    };

    createStageLight(-12, 10, -15, 0, 0, 0);
    createStageLight(12, 10, -15, 0, 0, 0);

    // === BACK WALL SPEAKERS/TECH ===
    const speakerCabMat = makeEnvMat({ color: 0x1a1a1a });
    const speakerConeMat = makeEnvMat({ color: 0x050505 });
    const createSpeaker = (x: number, y: number, z: number, ry: number) => {
        const group = new THREE.Group();
        group.position.set(x, y, z);
        group.rotation.y = ry;

        const cab = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 3), speakerCabMat);
        group.add(cab);

        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.5, 14, 1, true), speakerConeMat);
        cone.rotation.x = -Math.PI / 2;
        cone.position.set(0, -1, 1.5);
        group.add(cone);

        const tweet = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 10), speakerConeMat);
        tweet.rotation.x = Math.PI / 2;
        tweet.position.set(0, 1.5, 1.5);
        group.add(tweet);

        scene.add(group);
    };

    createSpeaker(-12, 1, -26, 0.4);
    createSpeaker(12, 1, -26, -0.4);

    // --- CAGE / FENCE BACKGROUND ---
    const fenceGroup = new THREE.Group();
    const wireFMat = makeEnvMat({ color: 0x1a1a1a, roughness: 0.7, metalness: 0.5 });
    const horizBarGeo = new THREE.CylinderGeometry(0.05, 0.05, 50, 5);
    const vertBarGeo = new THREE.CylinderGeometry(0.05, 0.05, 14, 5);

    for (let i = 0; i < 6; i++) {
        const bar = new THREE.Mesh(horizBarGeo, wireFMat);
        bar.rotation.z = Math.PI / 2;
        bar.position.set(0, -5 + i * 2, -18);
        fenceGroup.add(bar);
    }
    const barStep = isLow ? 4 : 2;
    for (let i = -12; i <= 12; i += barStep) {
        const bar = new THREE.Mesh(vertBarGeo, wireFMat);
        bar.position.set(i * 2, 0, -18);
        fenceGroup.add(bar);
    }
    scene.add(fenceGroup);
    }

    // ═══════════════════════════════════════════════════════════════
    // FRUSTUM CULLING SAFEGUARD - All environment props
    // ═══════════════════════════════════════════════════════════════
    scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
            obj.frustumCulled = true;
            if ((obj as THREE.Mesh).geometry && !(obj as THREE.Mesh).geometry.boundingSphere) {
                (obj as THREE.Mesh).geometry.computeBoundingSphere();
            }
        }
    });
};

export const createDust = (scene: THREE.Scene, isMobile: boolean = false, ultraPerformance: boolean = false): THREE.Points | null => {
    const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
    const isMobileDevice = isMobile || isAndroid;
    const settings = scene.userData.settings || {};
    const preset = getGraphicsPreset(settings);
    const profile: GraphicsPresetProfile = scene.userData.graphicsProfile || getGraphicsPresetConfig(preset, {
        isMobile: isMobileDevice,
        isAndroid,
        nativeDpr: typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1,
        isSoftwareGl: !!scene.userData.isSoftwareGl
    });

    if (ultraPerformance || !profile.enableDust || profile.dustCount <= 0) return null;

    const particleCount = profile.dustCount;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 30;
        positions[i * 3 + 1] = Math.random() * 15 + 2;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 25;

        velocities[i * 3] = (Math.random() - 0.5) * 0.01;
        velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.005;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.01;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));

    const material = new THREE.PointsMaterial({
        color: preset === 'high' ? 0xd8c39a : 0xbbaa88,
        map: preset === 'high' ? generateGlowTexture() : null,
        size: preset === 'high' ? (isMobileDevice ? 0.24 : 0.32) : 0.13,
        transparent: true,
        opacity: preset === 'high' ? 0.26 : 0.2,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        depthWrite: false
    });

    const particles = new THREE.Points(geometry, material);
    particles.name = 'DUST_PARTICLES';
    scene.add(particles);

    return particles;
};

export const createTable = (scene: THREE.Scene, ultraPerformance: boolean = false) => {
    const settings = scene.userData.settings || {};
    const preset = getGraphicsPreset(settings);
    const isMobile = scene.userData.isMobile || false;
    const isAndroid = !!scene.userData.isAndroid;
    const profile: GraphicsPresetProfile = scene.userData.graphicsProfile || getGraphicsPresetConfig(preset, {
        isMobile,
        isAndroid,
        nativeDpr: typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1,
        isSoftwareGl: !!scene.userData.isSoftwareGl
    });
    const isPotato = ultraPerformance || profile.useBasicEnv;
    const isLow = preset === 'low';
    const isBalanced = preset === 'balanced';
    const isHigh = preset === 'high';
    const allowTableShadows = profile.shadowMapEnabled && (isHigh || isBalanced);

    const tableGroup = new THREE.Group();
    tableGroup.name = 'TABLE_GROUP';

    // ═══════════════════════════════════════════════════════════════
    // BUCKSHOT ROULETTE STYLE TABLE - Industrial worn metal & felt
    // ═══════════════════════════════════════════════════════════════

    // Generate Procedural Table Texture
    const tableTex = isPotato ? null : createTableTexture();

    // Table Top - Worn green felt with glowing lines
    const tableMat = isPotato
        ? new THREE.MeshBasicMaterial({ color: 0x223319 }) // Crisp readable dark green
        : (isLow
            ? new THREE.MeshLambertMaterial({ map: tableTex || undefined, color: 0x6c6e5b, emissive: 0x16140c })
            : new THREE.MeshStandardMaterial({
                map: tableTex || undefined,
                color: 0x666655,
                roughness: isBalanced ? 0.78 : 0.85,
                metalness: 0.06,
                envMapIntensity: isHigh ? 0.65 : 0.45,
                emissiveMap: tableTex || undefined,
                emissive: 0x443322, // Subtle glow for lines
                emissiveIntensity: 0.15
            }));

    const top = new THREE.Mesh(new THREE.BoxGeometry(20, 0.6, 18), tableMat);
    top.position.y = -1;
    top.receiveShadow = allowTableShadows;
    top.castShadow = allowTableShadows && !isLow;
    tableGroup.add(top);

    // ═══════════════════════════════════════════════════════════════
    // WORN INDUSTRIAL METAL RIM
    // ═══════════════════════════════════════════════════════════════

    // Create worn metal texture
    const createRimTexture = () => {
        if (_cachedRimTexture) return _cachedRimTexture;
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d');
        if (!ctx) return new THREE.CanvasTexture(canvas);

        // Base rusty metal
        ctx.fillStyle = '#1a1815';
        ctx.fillRect(0, 0, 256, 256);

        // Rust spots
        for (let i = 0; i < 200; i++) {
            const shade = Math.random();
            ctx.fillStyle = shade > 0.8 ? '#3d2a1a' : (shade > 0.5 ? '#252220' : '#1c1916');
            ctx.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 8, 2 + Math.random() * 8);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.userData = { isCachedAsset: true };
        _cachedRimTexture = tex;
        return tex;
    };

    const rimTex = isPotato ? null : createRimTexture();
    const rimMat = isPotato
        ? new THREE.MeshBasicMaterial({ color: 0x1b1917 }) // Crisp dark steel rim
        : (isLow
            ? new THREE.MeshLambertMaterial({ map: rimTex || undefined, color: 0x2e2924 })
            : new THREE.MeshStandardMaterial({
                map: rimTex || undefined,
                color: 0x2a2520,
                roughness: isBalanced ? 0.42 : 0.48,
                metalness: 0.72,
                envMapIntensity: isHigh ? 1.15 : 0.85
            }));

    // Thicker industrial rim
    const rimHeight = 1.2;
    const rimThickness = 0.8;

    // Front/Back rims - shorter width (19)
    const rimF = new THREE.Mesh(new THREE.BoxGeometry(19, rimHeight, rimThickness), rimMat);
    rimF.position.set(0, -0.6, 7.4); // Adjusted Z
    rimF.castShadow = isHigh && !isMobile;
    tableGroup.add(rimF);

    const rimB = new THREE.Mesh(new THREE.BoxGeometry(19, rimHeight, rimThickness), rimMat);
    rimB.position.set(0, -0.6, -7.4); // Adjusted Z
    rimB.castShadow = isHigh && !isMobile;
    tableGroup.add(rimB);

    // Left/Right rims - shorter length (14)
    const rimL = new THREE.Mesh(new THREE.BoxGeometry(rimThickness, rimHeight, 14), rimMat);
    rimL.position.set(-9.4, -0.6, 0); // Adjusted X
    rimL.castShadow = isHigh && !isMobile;
    tableGroup.add(rimL);

    const rimR = new THREE.Mesh(new THREE.BoxGeometry(rimThickness, rimHeight, 14), rimMat);
    rimR.position.set(9.4, -0.6, 0); // Adjusted X
    rimR.castShadow = isHigh && !isMobile;
    tableGroup.add(rimR);

    // ═══════════════════════════════════════════════════════════════
    // HEAVY INDUSTRIAL LEGS
    // ═══════════════════════════════════════════════════════════════

    const legMat = isPotato
        ? new THREE.MeshBasicMaterial({ color: 0x0e0d0c })
        : (isLow
            ? new THREE.MeshLambertMaterial({ color: 0x151210 })
            : new THREE.MeshStandardMaterial({
                color: 0x151210,
                roughness: 0.75,
                metalness: 0.4
            }));

    // Chunky square legs
    const legGeo = new THREE.BoxGeometry(1.2, 8, 1.2);
    const legPositions = [
        [-8, -5, -6], // Adjusted leg positions
        [8, -5, -6],
        [-8, -5, 6],
        [8, -5, 6]
    ];

    const boltMat = isPotato
        ? new THREE.MeshBasicMaterial({ color: 0x282522 })
        : (isLow
            ? new THREE.MeshLambertMaterial({ color: 0x3a3530 })
            : new THREE.MeshStandardMaterial({ color: 0x3a3530, metalness: 0.8, roughness: 0.35, envMapIntensity: isHigh ? 1.1 : 0.8 }));
    const boltGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 6);

    legPositions.forEach(pos => {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(pos[0], pos[1], pos[2]);
        leg.castShadow = isHigh && !isMobile;
        tableGroup.add(leg);

        const bolt = new THREE.Mesh(boltGeo, boltMat);
        bolt.rotation.x = Math.PI / 2;
        bolt.position.set(pos[0], pos[1] + 3, pos[2] + 0.6);
        tableGroup.add(bolt);
    });

    // Cross-braces under table
    const braceMat = isPotato
        ? new THREE.MeshBasicMaterial({ color: 0x0c0a09 })
        : ((isLow || isBalanced)
            ? new THREE.MeshLambertMaterial({ color: 0x1a1512 })
            : new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.8 }));
    const braceGeo = new THREE.BoxGeometry(0.5, 0.5, 20);

    const brace1 = new THREE.Mesh(braceGeo, braceMat);
    brace1.position.set(-12, -3, 0);
    tableGroup.add(brace1);

    const brace2 = new THREE.Mesh(braceGeo, braceMat);
    brace2.position.set(12, -3, 0);
    tableGroup.add(brace2);

    // Verify frustum culling across all table meshes
    tableGroup.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
            obj.frustumCulled = true;
            if ((obj as THREE.Mesh).geometry && !(obj as THREE.Mesh).geometry.boundingSphere) {
                (obj as THREE.Mesh).geometry.computeBoundingSphere();
            }
        }
    });

    scene.add(tableGroup);
    return top;
};
