import { GraphicsPresetTier } from '../../types';

export interface GraphicsPresetProfile {
    preset: GraphicsPresetTier;
    antialias: boolean;
    shaderPrecision: 'highp' | 'mediump' | 'lowp';
    maxPixelRatio: number;
    pixelScaleMultiplier: number;
    shadowMapEnabled: boolean;
    shadowAutoUpdate: boolean;
    shadowRefreshInterval: number; // 1 = every frame, 2 = every 2nd frame, 0 = disabled
    shadowMapSize: number;
    secondaryShadowMapSize: number;
    useSoftShadows: boolean;
    enableFog: boolean;
    fogDensity: number;
    enableEnvMap: boolean;
    useBasicEnv: boolean;
    useLambertEnv: boolean;
    allowEnvShadows: boolean;
    enableBulbHalo: boolean;
    enableDust: boolean;
    dustCount: number;
    fogSpriteCount: number;
    enableExtraEnvLights: boolean;
    enableBgRimLights: boolean;
    enableAccentLights: boolean;
    enableFloorDebris: boolean;
    bloodParticleCount: number;
    sparkParticleCount: number;
    toneMapping: 'linear' | 'aces';
    baseExposure: number;
    skipSyncCompile: boolean;
}

export interface GraphicsEnvironmentInfo {
    isMobile: boolean;
    isTablet?: boolean;
    isAndroid: boolean;
    nativeDpr: number;
    isSoftwareGl: boolean;
}

/**
 * Detects CPU/software WebGL renderers (SwiftShader, llvmpipe, Microsoft Basic Render Driver)
 * so we can disable expensive passes and pace renders safely.
 */
export function detectSoftwareWebGL(gl?: WebGLRenderingContext | WebGL2RenderingContext | null): boolean {
    if (!gl) return false;
    try {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const rendererStr = String(
            debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
        );
        return /swiftshader|llvmpipe|software|microsoft basic render|mesa offscreen/i.test(rendererStr);
    } catch {
        return false;
    }
}

/**
 * Pure graphics tier resolver tuned for high FPS across all 4 tiers,
 * with major GPU & shader savings on LOW and BALANCED.
 */
export function getGraphicsPresetConfig(
    preset: GraphicsPresetTier,
    env: GraphicsEnvironmentInfo
): GraphicsPresetProfile {
    const { isMobile, isAndroid, nativeDpr, isSoftwareGl } = env;
    const isMobileOrAndroid = isMobile || isAndroid;

    if (isSoftwareGl) {
        return {
            preset,
            antialias: false,
            shaderPrecision: 'mediump',
            maxPixelRatio: 1,
            pixelScaleMultiplier: preset === 'potato' ? 4.2 : (preset === 'low' ? 3.2 : 2.6),
            shadowMapEnabled: false,
            shadowAutoUpdate: false,
            shadowRefreshInterval: 0,
            shadowMapSize: 0,
            secondaryShadowMapSize: 0,
            useSoftShadows: false,
            enableFog: preset !== 'potato',
            fogDensity: 0.011,
            enableEnvMap: false,
            useBasicEnv: preset === 'potato',
            useLambertEnv: preset !== 'potato',
            allowEnvShadows: false,
            enableBulbHalo: false,
            enableDust: false,
            dustCount: 0,
            fogSpriteCount: 0,
            enableExtraEnvLights: false,
            enableBgRimLights: false,
            enableAccentLights: false,
            enableFloorDebris: false,
            bloodParticleCount: 10,
            sparkParticleCount: 8,
            toneMapping: preset === 'potato' ? 'linear' : 'aces',
            baseExposure: preset === 'potato' ? 1.05 : 1.5,
            skipSyncCompile: true,
        };
    }

    switch (preset) {
        case 'potato':
            return {
                preset: 'potato',
                antialias: false,
                shaderPrecision: 'lowp',
                maxPixelRatio: Math.min(nativeDpr, isAndroid ? 0.7 : 0.75),
                pixelScaleMultiplier: isMobile ? 4.6 : 4.0,
                shadowMapEnabled: false,
                shadowAutoUpdate: false,
                shadowRefreshInterval: 0,
                shadowMapSize: 0,
                secondaryShadowMapSize: 0,
                useSoftShadows: false,
                enableFog: false,
                fogDensity: 0,
                enableEnvMap: false,
                useBasicEnv: true,
                useLambertEnv: false,
                allowEnvShadows: false,
                enableBulbHalo: false,
                enableDust: false,
                dustCount: 0,
                fogSpriteCount: 0,
                enableExtraEnvLights: false,
                enableBgRimLights: false,
                enableAccentLights: false,
                enableFloorDebris: false,
                bloodParticleCount: 8,
                sparkParticleCount: 6,
                toneMapping: 'linear',
                baseExposure: 1.08,
                skipSyncCompile: true,
            };

        case 'low':
            // Major performance overhaul for LOW:
            // - Zero shadow map render passes (huge GPU win on mobile & integrated GPUs)
            // - Lambert shaders everywhere in the bunker environment (zero PBR fragment cost)
            // - Max 4 core lights (ambient + hemi + main key + center bulb), no extra prop lights
            // - Zero overdraw fog sprites or dust particles
            return {
                preset: 'low',
                antialias: false,
                shaderPrecision: 'mediump',
                maxPixelRatio: Math.min(nativeDpr, isMobileOrAndroid ? 0.85 : 0.9),
                pixelScaleMultiplier: isMobile ? 3.3 : 2.8,
                shadowMapEnabled: false,
                shadowAutoUpdate: false,
                shadowRefreshInterval: 0,
                shadowMapSize: 0,
                secondaryShadowMapSize: 0,
                useSoftShadows: false,
                enableFog: true,
                fogDensity: 0.011,
                enableEnvMap: false,
                useBasicEnv: false,
                useLambertEnv: true,
                allowEnvShadows: false,
                enableBulbHalo: false,
                enableDust: false,
                dustCount: 0,
                fogSpriteCount: 0,
                enableExtraEnvLights: false,
                enableBgRimLights: false,
                enableAccentLights: false,
                enableFloorDebris: false,
                bloodParticleCount: isMobileOrAndroid ? 12 : 16,
                sparkParticleCount: 10,
                toneMapping: 'aces',
                baseExposure: 1.52,
                skipSyncCompile: true,
            };

        case 'balanced':
            // Major performance overhaul for BALANCED:
            // - Single lightweight shadow map (256 mobile / 512 PC) updated every 2nd frame
            // - Lambert shaders on all background props, PBR reserved for hero gun/table/dealer
            // - Lean light count (no noisy prop point/spot lights on mobile; minimal rim on PC)
            // - No heavy alpha-blended fog sprite stacks on mobile (only 4 subtle sprites on PC)
            return {
                preset: 'balanced',
                antialias: false,
                shaderPrecision: isAndroid ? 'mediump' : 'highp',
                maxPixelRatio: Math.min(nativeDpr, isMobileOrAndroid ? 1.0 : 1.15),
                pixelScaleMultiplier: isMobile ? 2.5 : 2.3,
                shadowMapEnabled: true,
                shadowAutoUpdate: false,
                shadowRefreshInterval: 2,
                shadowMapSize: isMobileOrAndroid ? 256 : 512,
                secondaryShadowMapSize: 0,
                useSoftShadows: false,
                enableFog: true,
                fogDensity: 0.012,
                enableEnvMap: !isMobileOrAndroid,
                useBasicEnv: false,
                useLambertEnv: true,
                allowEnvShadows: false,
                enableBulbHalo: !isMobileOrAndroid,
                enableDust: !isMobileOrAndroid,
                dustCount: isMobileOrAndroid ? 0 : 28,
                fogSpriteCount: isMobileOrAndroid ? 0 : 4,
                enableExtraEnvLights: false,
                enableBgRimLights: !isMobileOrAndroid,
                enableAccentLights: false,
                enableFloorDebris: false,
                bloodParticleCount: isMobileOrAndroid ? 18 : 26,
                sparkParticleCount: isMobileOrAndroid ? 12 : 18,
                toneMapping: 'aces',
                baseExposure: 1.62,
                skipSyncCompile: isMobileOrAndroid,
            };

        case 'high':
        default:
            // High preset: rich visuals with redundant overlapping lights & overdraw trimmed
            return {
                preset: 'high',
                antialias: !isMobileOrAndroid,
                shaderPrecision: isAndroid ? 'mediump' : 'highp',
                maxPixelRatio: Math.min(nativeDpr, isAndroid ? 1.25 : 1.5),
                pixelScaleMultiplier: isMobile ? 1.85 : 1.7,
                shadowMapEnabled: true,
                shadowAutoUpdate: true,
                shadowRefreshInterval: 1,
                shadowMapSize: isMobileOrAndroid ? 512 : 1024,
                secondaryShadowMapSize: isMobileOrAndroid ? 0 : 512,
                useSoftShadows: !isAndroid,
                enableFog: true,
                fogDensity: 0.014,
                enableEnvMap: true,
                useBasicEnv: false,
                useLambertEnv: false,
                allowEnvShadows: !isMobileOrAndroid,
                enableBulbHalo: true,
                enableDust: true,
                dustCount: isMobileOrAndroid ? 32 : 70,
                fogSpriteCount: isMobileOrAndroid ? 4 : 8,
                enableExtraEnvLights: !isMobileOrAndroid,
                enableBgRimLights: true,
                enableAccentLights: !isMobileOrAndroid,
                enableFloorDebris: !isMobileOrAndroid,
                bloodParticleCount: isMobileOrAndroid ? 36 : 55,
                sparkParticleCount: isMobileOrAndroid ? 24 : 40,
                toneMapping: 'aces',
                baseExposure: 1.82,
                skipSyncCompile: false,
            };
    }
}
