import * as THREE from 'three';
import { getDeviceType } from '../gameUtils';
import { GameSettings } from '../../types';
import { getGraphicsPreset } from '../../constants';
import { getGraphicsPresetConfig, GraphicsPresetProfile } from './graphicsConfig';

export const setupLighting = (scene: THREE.Scene, settings?: GameSettings) => {
    // ═══════════════════════════════════════════════════════════════
    // BUCKSHOT ROULETTE STYLE LIGHTING - Dark Industrial Bunker
    // Optimized across Potato, Low, Balanced, and High presets
    // ═══════════════════════════════════════════════════════════════

    const device = getDeviceType();
    const isMobileDevice = device === 'mobile';
    const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
    const preset = getGraphicsPreset(settings);

    const profile: GraphicsPresetProfile = scene.userData.graphicsProfile || getGraphicsPresetConfig(preset, {
        isMobile: isMobileDevice,
        isAndroid,
        nativeDpr: typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1,
        isSoftwareGl: !!scene.userData.isSoftwareGl
    });

    const isPotato = preset === 'potato';
    const isLow = preset === 'low';
    const isBalanced = preset === 'balanced';
    const isHigh = preset === 'high';

    // Fog for depth: disabled in potato, atmospheric in low/balanced/high
    scene.fog = profile.enableFog
        ? new THREE.FogExp2(0x0a0a0a, profile.fogDensity)
        : null;

    // ═══════════════════════════════════════════════════════════════
    // AMBIENT & HEMISPHERE LIGHTING (Zero fragment-loop shadow cost)
    // ═══════════════════════════════════════════════════════════════
    const ambientIntensity = isPotato ? 0.65 : (isLow ? 0.44 : (isBalanced ? 0.36 : 0.28));
    const ambient = new THREE.AmbientLight(0x322824, ambientIntensity);
    scene.add(ambient);

    if (!isPotato) {
        // Hemisphere light: warm ceiling / cool concrete bounce (cheap, high visual impact)
        const hemiIntensity = isHigh ? 0.50 : (isBalanced ? 0.56 : 0.58);
        const hemiLight = new THREE.HemisphereLight(
            isHigh ? 0x4c3c36 : 0x483b36,
            isHigh ? 0x161c24 : 0x191513,
            hemiIntensity
        );
        scene.add(hemiLight);
    }

    // ═══════════════════════════════════════════════════════════════
    // MAIN SPOTLIGHT - Primary Key Light (Sole shadow caster on Balanced)
    // ═══════════════════════════════════════════════════════════════
    const mainSpotIntensity = isHigh
        ? (isMobileDevice ? 5600 : 7000)
        : (isBalanced
            ? (isMobileDevice ? 5200 : 6200)
            : (isLow
                ? (isMobileDevice ? 4800 : 5600)
                : (isMobileDevice ? 3800 : 4400)));

    const mainSpotlight = new THREE.SpotLight(0xffddbb, mainSpotIntensity);
    mainSpotlight.position.set(0, 18, -2);
    mainSpotlight.target.position.set(0, -1, 0);
    mainSpotlight.angle = 0.45;
    mainSpotlight.penumbra = 0.78;
    mainSpotlight.decay = 2.35;
    mainSpotlight.distance = 65;

    if (profile.shadowMapEnabled && profile.shadowMapSize > 0) {
        mainSpotlight.castShadow = true;
        mainSpotlight.shadow.mapSize.width = profile.shadowMapSize;
        mainSpotlight.shadow.mapSize.height = profile.shadowMapSize;
        mainSpotlight.shadow.bias = isHigh ? -0.00003 : -0.00008;
        mainSpotlight.shadow.normalBias = isHigh ? 0.025 : 0.035;
        mainSpotlight.shadow.radius = profile.useSoftShadows ? 2.0 : 1.2;
        mainSpotlight.shadow.camera.near = 2.5;
        mainSpotlight.shadow.camera.far = 40;
    } else {
        mainSpotlight.castShadow = false;
    }

    scene.add(mainSpotlight);
    scene.add(mainSpotlight.target);

    // ═══════════════════════════════════════════════════════════════
    // BULB LIGHT - Industrial center point light (animated flicker & sway)
    // ═══════════════════════════════════════════════════════════════
    const bulbIntensity = isHigh ? 52.0 : (isBalanced ? 46.0 : (isLow ? 38.0 : 28.0));
    const bulbLight = new THREE.PointLight(0xffaa44, isMobileDevice ? bulbIntensity * 0.85 : bulbIntensity, 48);
    bulbLight.position.set(0, 8, 0);
    bulbLight.castShadow = false;
    scene.add(bulbLight);

    // ═══════════════════════════════════════════════════════════════
    // DYNAMIC GAME LIGHTS (Intensity = 0 at rest; active on shot/hard mode)
    // ═══════════════════════════════════════════════════════════════
    const muzzleLight = new THREE.PointLight(0xffaa00, 0, 32);
    scene.add(muzzleLight);

    const roomRedLight = new THREE.PointLight(0xff0000, 0, 110);
    roomRedLight.position.set(0, 10, 0);
    scene.add(roomRedLight);

    // ═══════════════════════════════════════════════════════════════
    // TIERED SUPPLEMENTAL LIGHTS (Skipped on Potato & Low for fast shaders)
    // ═══════════════════════════════════════════════════════════════
    let gunSpot: THREE.SpotLight | null = null;
    let dealerRim: THREE.SpotLight | null = null;
    let playerFill: THREE.DirectionalLight | null = null;
    let bgRim: THREE.SpotLight | null = null;
    let rimLight: THREE.SpotLight | null = null;

    // Keep lightweight non-added references for underLight/tableGlow on Potato/Low
    const underLight = new THREE.PointLight(0xff1111, isHigh ? 6.0 : 4.8, 20);
    underLight.position.set(0, -2, -10);

    const tableGlow = new THREE.PointLight(0x445533, isHigh ? 4.2 : 3.5, 15);
    tableGlow.position.set(0, 0, 0);

    if (isBalanced || isHigh) {
        // Gun Spot illuminates table items and shotgun crisply
        const gunSpotIntensity = isHigh
            ? (isMobileDevice ? 1100 : 1450)
            : (isMobileDevice ? 980 : 1250);
        gunSpot = new THREE.SpotLight(0xffeedd, gunSpotIntensity);
        gunSpot.position.set(0, 15, 2);
        gunSpot.target.position.set(0, 0, 2);
        gunSpot.angle = 0.48;
        gunSpot.penumbra = 0.65;

        if (profile.secondaryShadowMapSize > 0) {
            gunSpot.castShadow = true;
            gunSpot.shadow.mapSize.width = profile.secondaryShadowMapSize;
            gunSpot.shadow.mapSize.height = profile.secondaryShadowMapSize;
            gunSpot.shadow.bias = -0.00002;
            gunSpot.shadow.normalBias = 0.025;
            gunSpot.shadow.camera.near = 2.0;
            gunSpot.shadow.camera.far = 24;
        } else {
            gunSpot.castShadow = false;
        }
        scene.add(gunSpot);
        scene.add(gunSpot.target);

        // Cool slate directional fill (directional lights are much cheaper than point/spot lights)
        playerFill = new THREE.DirectionalLight(isHigh ? 0x4a6488 : 0x425670, isHigh ? 0.44 : 0.48);
        playerFill.position.set(-4, 6, 14);
        scene.add(playerFill);

        // Dealer rim separates dealer silhouette from dark bunker
        const dealerRimIntensity = isHigh ? 42 : 30;
        dealerRim = new THREE.SpotLight(0xff9a58, isMobileDevice ? dealerRimIntensity * 0.75 : dealerRimIntensity);
        dealerRim.position.set(0, 14, -35);
        dealerRim.target.position.set(0, 4, -14);
        dealerRim.angle = 0.65;
        dealerRim.penumbra = 0.9;
        scene.add(dealerRim);
        scene.add(dealerRim.target);
    }

    if (profile.enableBgRimLights) {
        // Balanced (PC) & High: subtle cool rim separation without bloating fragment shader light loops
        const coldRim = new THREE.SpotLight(0x1b60e0, isHigh ? (isMobileDevice ? 38 : 52) : 28);
        coldRim.position.set(-18, 10, -24);
        coldRim.target.position.set(0, 2, -10);
        coldRim.angle = 0.95;
        coldRim.penumbra = 0.8;
        scene.add(coldRim);
        scene.add(coldRim.target);

        if (isHigh) {
            scene.add(underLight);
            scene.add(tableGlow);

            bgRim = new THREE.SpotLight(0xff2b0a, 82);
            bgRim.position.set(20, 10, -25);
            bgRim.target.position.set(0, 2, -10);
            bgRim.angle = 1.0;
            bgRim.penumbra = 0.8;
            scene.add(bgRim);
            scene.add(bgRim.target);
        }
    }

    // Trimmed accent lights for Desktop High only (replaces 11 overlapping lights with 3 purposeful washes)
    if (profile.enableAccentLights) {
        const backFlood = new THREE.DirectionalLight(0x554444, 0.5);
        backFlood.position.set(0, 15, 10);
        backFlood.target.position.set(0, 0, -25);
        scene.add(backFlood);
        scene.add(backFlood.target);

        const cornerLight1 = new THREE.PointLight(0x664433, 22, 55);
        cornerLight1.position.set(-13, 9, -12);
        scene.add(cornerLight1);

        const cornerLight2 = new THREE.PointLight(0x445577, 22, 55);
        cornerLight2.position.set(13, 9, -12);
        scene.add(cornerLight2);
    }

    return {
        muzzleLight,
        roomRedLight,
        bulbLight,
        gunSpot,
        tableGlow,
        rimLight,
        fillLight: playerFill,
        ambient,
        bgRim,
        dealerRim,
        underLight,
        mainSpotlight
    };
};
