import * as THREE from 'three';
import { getDeviceType } from '../gameUtils';
import { GameSettings } from '../../types';
import { getGraphicsPreset } from '../../constants';

export const setupLighting = (scene: THREE.Scene, settings?: GameSettings) => {
    // ═══════════════════════════════════════════════════════════════
    // BUCKSHOT ROULETTE STYLE LIGHTING - Dark Industrial Bunker
    // ═══════════════════════════════════════════════════════════════

    const device = getDeviceType();
    const isMobileDevice = device === 'mobile';
    const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

    // 4 Standardized Graphics Presets:
    // Preset 1: Potato ('potato') - Ultra-fast barebones playable, zero shadows, minimal lights
    // Preset 2: Low ('low') - Real atmospheric lighting, bunker fog, subtle contrast & readable shadows
    // Preset 3: Balanced ('balanced') - Rich 60fps default with sharp key/fill balance & smooth PCF shadows
    // Preset 4: High ('high') - Cinematic ACESFilmic, warm/cool rim separation, crisp shadows & reflections
    const preset = getGraphicsPreset(settings);
    const isPotato = preset === 'potato';
    const isLow = preset === 'low';
    const isBalanced = preset === 'balanced';
    const isHigh = preset === 'high';

    // Fog for depth: disabled in potato for peak fillrate, atmospheric in low/balanced/high
    scene.fog = isPotato
        ? null
        : new THREE.FogExp2(0x0a0a0a, isHigh ? 0.014 : (isBalanced ? 0.012 : 0.011));

    // ═══════════════════════════════════════════════════════════════
    // AMBIENT LIGHTING
    // ═══════════════════════════════════════════════════════════════
    let ambientIntensity = 0.34;
    if (isPotato) {
        ambientIntensity = 0.60;
    } else if (isLow) {
        ambientIntensity = 0.38;
    } else if (isBalanced) {
        ambientIntensity = 0.34;
    } else {
        // High
        ambientIntensity = 0.28;
    }
    const ambient = new THREE.AmbientLight(0x322824, ambientIntensity);
    scene.add(ambient);

    // ═══════════════════════════════════════════════════════════════
    // MAIN SPOTLIGHT - Key Light
    // ═══════════════════════════════════════════════════════════════
    const mainSpotIntensity = isHigh
        ? (isMobileDevice ? 5600 : 7000)
        : (isBalanced
            ? (isMobileDevice ? 4800 : 6000)
            : (isLow
                ? (isMobileDevice ? 4200 : 5200)
                : (isMobileDevice ? 3600 : 4200)));

    const mainSpotlight = new THREE.SpotLight(0xffddbb, mainSpotIntensity);
    mainSpotlight.position.set(0, 18, -2);
    mainSpotlight.target.position.set(0, -1, 0);
    mainSpotlight.angle = 0.42;
    mainSpotlight.penumbra = 0.75;
    mainSpotlight.decay = 2.4;
    mainSpotlight.distance = 65;

    // Shadows configuration per preset:
    if (isPotato) {
        mainSpotlight.castShadow = false;
    } else if (isLow) {
        // Low: lightweight shadow map (256 on Android for speed, 512 on desktop/iOS)
        mainSpotlight.castShadow = true;
        const lowShadowSize = isAndroid ? 256 : 512;
        mainSpotlight.shadow.mapSize.width = lowShadowSize;
        mainSpotlight.shadow.mapSize.height = lowShadowSize;
        mainSpotlight.shadow.bias = -0.0001;
        mainSpotlight.shadow.normalBias = 0.04;
        mainSpotlight.shadow.radius = 1.0;
        mainSpotlight.shadow.camera.near = 2.0;
        mainSpotlight.shadow.camera.far = 42;
    } else if (isBalanced) {
        mainSpotlight.castShadow = true;
        const balancedShadowSize = (isAndroid || isMobileDevice) ? 512 : 1024;
        mainSpotlight.shadow.mapSize.width = balancedShadowSize;
        mainSpotlight.shadow.mapSize.height = balancedShadowSize;
        mainSpotlight.shadow.bias = -0.00006;
        mainSpotlight.shadow.normalBias = 0.03;
        mainSpotlight.shadow.radius = 1.5;
        mainSpotlight.shadow.camera.near = 2.0;
        mainSpotlight.shadow.camera.far = 42;
    } else {
        // High
        mainSpotlight.castShadow = true;
        const highShadowSize = isAndroid ? 512 : 1024;
        mainSpotlight.shadow.mapSize.width = highShadowSize;
        mainSpotlight.shadow.mapSize.height = highShadowSize;
        mainSpotlight.shadow.bias = -0.00003;
        mainSpotlight.shadow.normalBias = 0.025;
        mainSpotlight.shadow.radius = isAndroid ? 1.2 : 2.2;
        mainSpotlight.shadow.camera.near = 2.0;
        mainSpotlight.shadow.camera.far = 42;
    }

    scene.add(mainSpotlight);
    scene.add(mainSpotlight.target);

    // ═══════════════════════════════════════════════════════════════
    // GUN SPOT - Illuminates table items and shotgun
    // ═══════════════════════════════════════════════════════════════
    const gunSpotIntensity = isHigh
        ? (isMobileDevice ? 1150 : 1500)
        : (isBalanced
            ? (isMobileDevice ? 1050 : 1350)
            : (isLow
                ? (isMobileDevice ? 780 : 950)
                : 700));

    const gunSpot = new THREE.SpotLight(0xffeedd, gunSpotIntensity);
    gunSpot.position.set(0, 15, 2);
    gunSpot.target.position.set(0, 0, 2);
    gunSpot.angle = 0.48;
    gunSpot.penumbra = 0.65;

    // Secondary spotlight shadow pass reserved for PC High to avoid Android TBDR framebuffer stalls
    if (isHigh && device === 'pc') {
        gunSpot.castShadow = true;
        gunSpot.shadow.mapSize.width = 512;
        gunSpot.shadow.mapSize.height = 512;
        gunSpot.shadow.bias = -0.00002;
        gunSpot.shadow.normalBias = 0.025;
        gunSpot.shadow.camera.near = 2.0;
        gunSpot.shadow.camera.far = 24;
    } else {
        gunSpot.castShadow = false;
    }
    scene.add(gunSpot);
    scene.add(gunSpot.target);

    // ═══════════════════════════════════════════════════════════════
    // BULB LIGHT - Industrial center point light
    // ═══════════════════════════════════════════════════════════════
    const bulbIntensity = isHigh ? 52.0 : (isBalanced ? 44.0 : 28.0);
    const bulbLight = new THREE.PointLight(0xffaa44, isMobileDevice ? bulbIntensity * 0.8 : bulbIntensity, 50);
    bulbLight.position.set(0, 8, 0);
    // PointLight shadow maps cost 6 cube-map render passes per frame; mainSpotlight handles shadows cleanly
    bulbLight.castShadow = false;
    scene.add(bulbLight);

    // ═══════════════════════════════════════════════════════════════
    // DEALER RIM - Silhouettes and separates dealer from background
    // ═══════════════════════════════════════════════════════════════
    const dealerRimIntensity = isHigh ? 42 : (isBalanced ? 32 : 20);
    const dealerRim = new THREE.SpotLight(0xff9a58, isMobileDevice ? dealerRimIntensity * 0.75 : dealerRimIntensity);
    dealerRim.position.set(0, 14, -35);
    dealerRim.target.position.set(0, 4, -14);
    dealerRim.angle = 0.65;
    dealerRim.penumbra = 0.9;
    scene.add(dealerRim);
    scene.add(dealerRim.target);

    // ═══════════════════════════════════════════════════════════════
    // DYNAMIC GAME LIGHTS
    // ═══════════════════════════════════════════════════════════════
    const muzzleLight = new THREE.PointLight(0xffaa00, 0, 32);
    scene.add(muzzleLight);

    const roomRedLight = new THREE.PointLight(0xff0000, 0, 120);
    roomRedLight.position.set(0, 10, 0);
    scene.add(roomRedLight);

    const underLightIntensity = isHigh ? 6.5 : (isBalanced ? 5.5 : 3.2);
    const underLight = new THREE.PointLight(0xff1111, isMobileDevice ? underLightIntensity * 0.6 : underLightIntensity, 20);
    underLight.position.set(0, -2, -10);
    if (!isPotato) {
        scene.add(underLight);
    }

    const tableGlowIntensity = isHigh ? 4.5 : (isBalanced ? 4.2 : 2.5);
    const tableGlow = new THREE.PointLight(0x445533, tableGlowIntensity, 15);
    tableGlow.position.set(0, 0, 0);
    if (!isPotato) {
        scene.add(tableGlow);
    }

    // ═══════════════════════════════════════════════════════════════
    // FILL & ATMOSPHERIC LIGHTS
    // ═══════════════════════════════════════════════════════════════
    let playerFill: THREE.DirectionalLight | null = null;
    let bgRim: THREE.SpotLight | null = null;
    let rimLight: THREE.SpotLight | null = null;

    if (!isPotato) {
        // Player fill: Cool slate fill from player perspective for sharp key/fill contrast on gun & table
        const fillIntensity = isHigh ? 0.42 : (isBalanced ? 0.48 : 0.40);
        const fillColor = isHigh ? 0x4a6488 : (isBalanced ? 0x425670 : 0x38455a);
        playerFill = new THREE.DirectionalLight(fillColor, fillIntensity);
        playerFill.position.set(-4, 6, 14);
        scene.add(playerFill);

        // Hemisphere light: Warm ceiling / cool concrete floor bounce
        const hemiIntensity = isHigh ? 0.50 : (isBalanced ? 0.54 : 0.48);
        const hemiLight = new THREE.HemisphereLight(
            isHigh ? 0x4c3c36 : 0x443834,
            isHigh ? 0x161c24 : 0x181412,
            hemiIntensity
        );
        scene.add(hemiLight);

        if (isHigh) {
            // Warm/Cool cinematic rim separation
            bgRim = new THREE.SpotLight(0xff2b0a, 90);
            bgRim.position.set(20, 10, -25);
            bgRim.target.position.set(0, 2, -10);
            bgRim.angle = 1.0;
            bgRim.penumbra = 0.8;
            scene.add(bgRim);
            scene.add(bgRim.target);

            const coldRim = new THREE.SpotLight(0x1b66ff, isMobileDevice ? 42 : 56);
            coldRim.position.set(-20, 10, -25);
            coldRim.target.position.set(0, 2, -10);
            coldRim.angle = 1.0;
            coldRim.penumbra = 0.8;
            scene.add(coldRim);
            scene.add(coldRim.target);

            const sideFill = new THREE.PointLight(0x3a2622, 8, 40);
            sideFill.position.set(18, 2, 8);
            scene.add(sideFill);

            rimLight = new THREE.SpotLight(0x552822, 14);
            rimLight.position.set(0, 12, -30);
            rimLight.lookAt(0, 5, -14);
            scene.add(rimLight);

            if (!isMobileDevice) {
                const deepBgLight = new THREE.PointLight(0x334455, 40, 120);
                deepBgLight.position.set(0, 12, -20);
                scene.add(deepBgLight);

                const leftPropLight = new THREE.PointLight(0xaa6644, 25.0, 30);
                leftPropLight.position.set(-15, 2, 10);
                scene.add(leftPropLight);

                const rightPropLight = new THREE.PointLight(0x4466aa, 25.0, 30);
                rightPropLight.position.set(15, 2, 10);
                scene.add(rightPropLight);

                const playerWallWash = new THREE.SpotLight(0x775544, 40);
                playerWallWash.position.set(0, 18, -2);
                playerWallWash.target.position.set(0, 5, 18);
                playerWallWash.angle = 1.0;
                playerWallWash.penumbra = 0.5;
                scene.add(playerWallWash);
                scene.add(playerWallWash.target);
            }
        } else if (isBalanced) {
            // Balanced: crisp key/fill & cool rim separation for solid 60fps
            const sideFill = new THREE.PointLight(0x332222, 6, 30);
            sideFill.position.set(18, 2, 8);
            if (device === 'pc') {
                scene.add(sideFill);

                const coldRim = new THREE.SpotLight(0x1b55cc, 32);
                coldRim.position.set(-18, 10, -24);
                coldRim.target.position.set(0, 2, -10);
                coldRim.angle = 0.9;
                coldRim.penumbra = 0.8;
                scene.add(coldRim);
                scene.add(coldRim.target);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // ACCENT LIGHTS (Desktop High only to protect mobile fragment budget)
    // ═══════════════════════════════════════════════════════════════
    if (isHigh && !isMobileDevice) {
        const tableAccent1 = new THREE.PointLight(0x44ff44, 1.5, 8);
        tableAccent1.position.set(-10, -0.5, 0);
        scene.add(tableAccent1);

        const tableAccent2 = new THREE.PointLight(0x44ff44, 1.5, 8);
        tableAccent2.position.set(10, -0.5, 0);
        scene.add(tableAccent2);

        const playerSpot = new THREE.SpotLight(0x443344, 3.0);
        playerSpot.position.set(0, 6, 10);
        playerSpot.target.position.set(0, -2, 6);
        playerSpot.angle = 0.9;
        playerSpot.penumbra = 1.0;
        scene.add(playerSpot);
        scene.add(playerSpot.target);

        const cornerLight1 = new THREE.PointLight(0x664433, 20, 50);
        cornerLight1.position.set(-12, 10, -12);
        scene.add(cornerLight1);

        const cornerLight2 = new THREE.PointLight(0x445577, 20, 50);
        cornerLight2.position.set(12, 10, -12);
        scene.add(cornerLight2);

        const backFlood = new THREE.DirectionalLight(0x554444, 0.5);
        backFlood.position.set(0, 15, 10);
        backFlood.target.position.set(0, 0, -25);
        scene.add(backFlood);
        scene.add(backFlood.target);

        const wallWash = new THREE.SpotLight(0x556677, 40);
        wallWash.position.set(0, 20, 5);
        wallWash.target.position.set(0, 0, -25);
        wallWash.angle = 1.0;
        wallWash.penumbra = 0.5;
        scene.add(wallWash);
        scene.add(wallWash.target);

        const leftWallLight = new THREE.PointLight(0x665544, 20, 40);
        leftWallLight.position.set(-15, 8, -8);
        scene.add(leftWallLight);

        const rightWallLight = new THREE.PointLight(0x445566, 20, 40);
        rightWallLight.position.set(15, 8, -8);
        scene.add(rightWallLight);

        const genSpot = new THREE.SpotLight(0xaaccff, 50);
        genSpot.position.set(15, 10, 0);
        genSpot.target.position.set(12, -3, -10);
        genSpot.angle = 0.5;
        genSpot.penumbra = 1;
        scene.add(genSpot);
        scene.add(genSpot.target);

        const cameraFill = new THREE.PointLight(0x443333, 10, 40);
        cameraFill.position.set(0, 10, 15);
        scene.add(cameraFill);
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
