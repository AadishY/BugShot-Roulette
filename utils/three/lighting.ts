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
    // Preset 1: Potato ('potato') - Flat shading, zero shadows
    // Preset 2: Low ('low') - Preserved atmospheric lighting & fog, lightweight performance
    // Preset 3: Balanced ('balanced') - Crisp 60fps, PCF shadows
    // Preset 4: High ('high') - Full dynamic range & soft contact shadows
    const preset = getGraphicsPreset(settings);
    const isPotato = preset === 'potato';
    const isLow = preset === 'low';
    const isBalanced = preset === 'balanced';
    const isHigh = preset === 'high';
    const isUltra = false;

    // Fog for depth: disabled in potato for peak fillrate, atmospheric in low/balanced/high
    scene.fog = isPotato
        ? null
        : new THREE.FogExp2(0x0a0a0a, isHigh ? 0.014 : 0.012);

    // ═══════════════════════════════════════════════════════════════
    // AMBIENT LIGHTING
    // ═══════════════════════════════════════════════════════════════
    let ambientIntensity = 0.36;
    if (isPotato) {
        ambientIntensity = 0.45;
    } else if (isLow) {
        ambientIntensity = 0.40;
    } else if (isBalanced) {
        ambientIntensity = 0.36;
    } else {
        // High
        ambientIntensity = 0.30;
    }
    const ambient = new THREE.AmbientLight(0x322824, ambientIntensity);
    scene.add(ambient);

    // ═══════════════════════════════════════════════════════════════
    // MAIN SPOTLIGHT - Key Light
    // ═══════════════════════════════════════════════════════════════
    const mainSpotIntensity = isHigh
        ? (isMobileDevice ? 5400 : 6800)
        : (isBalanced
            ? (isMobileDevice ? 4600 : 5800)
            : (isLow
                ? (isMobileDevice ? 4000 : 5000)
                : (isMobileDevice ? 3400 : 4000)));

    const mainSpotlight = new THREE.SpotLight(0xffddbb, mainSpotIntensity);
    mainSpotlight.position.set(0, 18, -2);
    mainSpotlight.target.position.set(0, -1, 0);
    mainSpotlight.angle = 0.42;
    mainSpotlight.penumbra = 0.75;
    mainSpotlight.decay = 2.4;
    mainSpotlight.distance = 65;
    
    // Shadows configuration per preset:
    if (isPotato || (isAndroid && (isBalanced || isLow))) {
        mainSpotlight.castShadow = false;
    } else if (isLow) {
        // Low on desktop gets lightweight 512 shadow
        mainSpotlight.castShadow = true;
        mainSpotlight.shadow.mapSize.width = 512;
        mainSpotlight.shadow.mapSize.height = 512;
        mainSpotlight.shadow.bias = -0.00008;
        mainSpotlight.shadow.normalBias = 0.04;
        mainSpotlight.shadow.radius = 1.0;
        mainSpotlight.shadow.camera.near = 2.0;
        mainSpotlight.shadow.camera.far = 42;
    } else if (isBalanced) {
        mainSpotlight.castShadow = true;
        mainSpotlight.shadow.mapSize.width = 512;
        mainSpotlight.shadow.mapSize.height = 512;
        mainSpotlight.shadow.bias = -0.00008;
        mainSpotlight.shadow.normalBias = 0.04;
        mainSpotlight.shadow.radius = 1.0;
        mainSpotlight.shadow.camera.near = 2.0;
        mainSpotlight.shadow.camera.far = 42;
    } else {
        // High
        mainSpotlight.castShadow = true;
        const shadowSize = isAndroid ? 512 : 1024;
        mainSpotlight.shadow.mapSize.width = shadowSize;
        mainSpotlight.shadow.mapSize.height = shadowSize;
        mainSpotlight.shadow.bias = -0.00003;
        mainSpotlight.shadow.normalBias = 0.03;
        mainSpotlight.shadow.radius = isAndroid ? 1.0 : 2.0;
        mainSpotlight.shadow.camera.near = 2.0;
        mainSpotlight.shadow.camera.far = 42;
    }

    scene.add(mainSpotlight);
    scene.add(mainSpotlight.target);

    // ═══════════════════════════════════════════════════════════════
    // GUN SPOT - Illuminates table items and shotgun
    // ═══════════════════════════════════════════════════════════════
    const gunSpotIntensity = isUltra
        ? (isMobileDevice ? 1200 : 1600)
        : (isHigh
            ? (isMobileDevice ? 1100 : 1450)
            : (isBalanced
                ? (isMobileDevice ? 950 : 1250)
                : 700));

    const gunSpot = new THREE.SpotLight(0xffeedd, gunSpotIntensity);
    gunSpot.position.set(0, 15, 2);
    gunSpot.target.position.set(0, 0, 2);
    gunSpot.angle = 0.48;
    gunSpot.penumbra = 0.65;
    
    // Shadows for gun spot: High (512 on PC) and Ultra (1024 on PC).
    // On Android mobile GPUs, skip secondary spotlight shadow pass to prevent extra TBDR framebuffer resolves.
    if (isUltra && !isAndroid) {
        gunSpot.castShadow = true;
        gunSpot.shadow.mapSize.width = 1024;
        gunSpot.shadow.mapSize.height = 1024;
        gunSpot.shadow.bias = -0.00001;
        gunSpot.shadow.normalBias = 0.02;
        gunSpot.shadow.camera.near = 2.0;
        gunSpot.shadow.camera.far = 24;
    } else if (isHigh && device === 'pc') {
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
    const bulbIntensity = isUltra ? 55.0 : (isHigh ? 50.0 : (isBalanced ? 44.0 : 25.0));
    const bulbLight = new THREE.PointLight(0xffaa44, isMobileDevice ? bulbIntensity * 0.8 : bulbIntensity, 50);
    bulbLight.position.set(0, 8, 0);
    
    // Shadows for bulb light: point-light shadows require 6 cube faces.
    // Strictly restricted to PC Ultra to prevent multi-pass GPU stalls on mobile devices.
    if (isUltra && !isAndroid && device === 'pc') {
        bulbLight.castShadow = true;
        bulbLight.shadow.mapSize.width = 1024;
        bulbLight.shadow.mapSize.height = 1024;
        bulbLight.shadow.bias = 0.00008;
        bulbLight.shadow.normalBias = 0.025;
        bulbLight.shadow.radius = 2.0;
        bulbLight.shadow.camera.near = 0.5;
        bulbLight.shadow.camera.far = 30;
    } else if (isHigh && device === 'pc') {
        bulbLight.castShadow = true;
        bulbLight.shadow.mapSize.width = 512;
        bulbLight.shadow.mapSize.height = 512;
        bulbLight.shadow.bias = 0.0001;
        bulbLight.shadow.normalBias = 0.03;
        bulbLight.shadow.radius = 2.0;
        bulbLight.shadow.camera.near = 0.5;
        bulbLight.shadow.camera.far = 30;
    } else {
        bulbLight.castShadow = false;
    }
    scene.add(bulbLight);

    // ═══════════════════════════════════════════════════════════════
    // DEALER RIM - Silhouettes and separates dealer from background
    // ═══════════════════════════════════════════════════════════════
    const dealerRimIntensity = isUltra ? 40 : (isHigh ? 36 : (isBalanced ? 32 : 16));
    const dealerRim = new THREE.SpotLight(0xffa470, isMobileDevice ? dealerRimIntensity * 0.75 : dealerRimIntensity);
    dealerRim.position.set(0, 14, -35);
    dealerRim.target.position.set(0, 4, -14);
    dealerRim.angle = 0.65;
    dealerRim.penumbra = 0.9;
    scene.add(dealerRim);
    scene.add(dealerRim.target);

    // ═══════════════════════════════════════════════════════════════
    // DYNAMIC GAME LIGHTS
    // ═══════════════════════════════════════════════════════════════
    const muzzleLight = new THREE.PointLight(0xffaa00, 0, 30);
    scene.add(muzzleLight);

    const roomRedLight = new THREE.PointLight(0xff0000, 0, 120);
    roomRedLight.position.set(0, 10, 0);
    scene.add(roomRedLight);

    const underLightIntensity = isUltra ? 7.0 : (isHigh ? 6.0 : (isBalanced ? 5.5 : 3.0));
    const underLight = new THREE.PointLight(0xff1111, isMobileDevice ? underLightIntensity * 0.6 : underLightIntensity, 20);
    underLight.position.set(0, -2, -10);
    if (!isPotato) {
        scene.add(underLight);
    }

    const tableGlowIntensity = isUltra ? 5.0 : (isHigh ? 4.0 : (isBalanced ? 4.5 : 2.0));
    const tableGlow = new THREE.PointLight(0x445533, tableGlowIntensity, 15);
    tableGlow.position.set(0, 0, 0);
    if (!isPotato) {
        scene.add(tableGlow);
    }

    // ═══════════════════════════════════════════════════════════════
    // FILL & ATMOSPHERIC LIGHTS
    // Selective on Balanced; Full on High and Ultra
    // ═══════════════════════════════════════════════════════════════
    let playerFill: THREE.DirectionalLight | null = null;
    let bgRim: THREE.SpotLight | null = null;
    let rimLight: THREE.SpotLight | null = null;

    if (!isPotato) {
        // Player fill: Directional light from player perspective to ensure shotgun, table, and items are clearly visible
        const fillIntensity = isUltra ? 0.42 : (isHigh ? 0.38 : 0.48);
        playerFill = new THREE.DirectionalLight(0x38455a, fillIntensity);
        playerFill.position.set(-4, 6, 14);
        scene.add(playerFill);

        // Hemisphere light: Warm bunker bounce from ceiling/floor
        const hemiIntensity = isUltra ? 0.52 : (isHigh ? 0.48 : 0.58);
        const hemiLight = new THREE.HemisphereLight(0x443834, 0x181412, hemiIntensity);
        scene.add(hemiLight);

        // Atmospheric and accent lights for Balanced, High, and Ultra
        if (isHigh || isUltra) {
            bgRim = new THREE.SpotLight(0xff2200, isUltra ? 100 : 80);
            bgRim.position.set(20, 10, -25);
            bgRim.target.position.set(0, 2, -10);
            bgRim.angle = 1.0;
            bgRim.penumbra = 0.8;
            scene.add(bgRim);
            scene.add(bgRim.target);

            const coldRim = new THREE.SpotLight(0x0044ff, isUltra ? 50 : 40);
            coldRim.position.set(-20, 10, -25);
            coldRim.target.position.set(0, 2, -10);
            coldRim.angle = 1.0;
            coldRim.penumbra = 0.8;
            if (!isMobileDevice || isUltra) {
                scene.add(coldRim);
                scene.add(coldRim.target);
            }

            const sideFill = new THREE.PointLight(0x332222, isUltra ? 10 : 8, 40);
            sideFill.position.set(18, 2, 8);
            scene.add(sideFill);

            rimLight = new THREE.SpotLight(0x442222, isUltra ? 16 : 12);
            rimLight.position.set(0, 12, -30);
            rimLight.lookAt(0, 5, -14);
            scene.add(rimLight);

            const deepBgLight = new THREE.PointLight(0x334455, isUltra ? 50 : 40, 120);
            deepBgLight.position.set(0, 12, -20);
            if (!isMobileDevice || isUltra) {
                scene.add(deepBgLight);
            }

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
        } else if (isBalanced) {
            // Balanced: Selective lighting for solid 60fps on mid-range devices
            const sideFill = new THREE.PointLight(0x332222, 6, 30);
            sideFill.position.set(18, 2, 8);
            if (device === 'pc') {
                scene.add(sideFill);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // HEAVY ACCENT LIGHTS (High and Ultra)
    // ═══════════════════════════════════════════════════════════════
    if (isHigh || isUltra) {
        // Table Accents
        const tableAccent1 = new THREE.PointLight(0x44ff44, isUltra ? 2.0 : 1.5, 8);
        tableAccent1.position.set(-10, -0.5, 0);
        scene.add(tableAccent1);

        const tableAccent2 = new THREE.PointLight(0x44ff44, isUltra ? 2.0 : 1.5, 8);
        tableAccent2.position.set(10, -0.5, 0);
        scene.add(tableAccent2);

        // Player Spot
        const playerSpot = new THREE.SpotLight(0x443344, isUltra ? 4.0 : 3.0);
        playerSpot.position.set(0, 6, 10);
        playerSpot.target.position.set(0, -2, 6);
        playerSpot.angle = 0.9;
        playerSpot.penumbra = 1.0;
        scene.add(playerSpot);
        scene.add(playerSpot.target);

        const cornerLight1 = new THREE.PointLight(0x664433, isUltra ? 25 : 20, 50);
        cornerLight1.position.set(-12, 10, -12);
        scene.add(cornerLight1);

        const cornerLight2 = new THREE.PointLight(0x445577, isUltra ? 25 : 20, 50);
        cornerLight2.position.set(12, 10, -12);
        scene.add(cornerLight2);

        const backFlood = new THREE.DirectionalLight(0x554444, isUltra ? 0.6 : 0.5);
        backFlood.position.set(0, 15, 10);
        backFlood.target.position.set(0, 0, -25);
        scene.add(backFlood);
        scene.add(backFlood.target);

        const wallWash = new THREE.SpotLight(0x556677, isUltra ? 50 : 40);
        wallWash.position.set(0, 20, 5);
        wallWash.target.position.set(0, 0, -25);
        wallWash.angle = 1.0;
        wallWash.penumbra = 0.5;
        scene.add(wallWash);
        scene.add(wallWash.target);

        const leftWallLight = new THREE.PointLight(0x665544, isUltra ? 25 : 20, 40);
        leftWallLight.position.set(-15, 8, -8);
        scene.add(leftWallLight);

        const rightWallLight = new THREE.PointLight(0x445566, isUltra ? 25 : 20, 40);
        rightWallLight.position.set(15, 8, -8);
        scene.add(rightWallLight);

        const genSpot = new THREE.SpotLight(0xaaccff, isUltra ? 60 : 50);
        genSpot.position.set(15, 10, 0);
        genSpot.target.position.set(12, -3, -10);
        genSpot.angle = 0.5;
        genSpot.penumbra = 1;
        scene.add(genSpot);
        scene.add(genSpot.target);

        const cameraFill = new THREE.PointLight(0x443333, isUltra ? 14 : 10, 40);
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
