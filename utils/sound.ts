import { audioManager, AudioManager, getAudioContext, resumeAudioContext, setupMobileAudioUnlock } from './audioManager';
import { GameSettings } from '../types';

export { audioManager, AudioManager, getAudioContext, resumeAudioContext, setupMobileAudioUnlock };

/**
 * Convenience helper to play SFX with resilient error handling.
 */
export const playSound = (key: string, options?: { volume?: number; playbackRate?: number; dimMusic?: boolean }) => {
    try {
        audioManager.playSound(key, options);
    } catch {
        // Guard against any synchronous invocation exceptions
    }
};

/**
 * Convenience helper to change or play background music.
 */
export const playMusic = (key: string) => {
    try {
        audioManager.playMusic(key);
    } catch {
        // Guard against synchronous invocation exceptions
    }
};

/**
 * Stop background music cleanly.
 */
export const stopMusic = () => {
    try {
        audioManager.stopMusic();
    } catch {
        // Silent catch
    }
};

/**
 * Synchronize audio volumes with user settings.
 */
export const updateVolumes = (settings: GameSettings) => {
    try {
        audioManager.updateVolumes(settings);
    } catch {
        // Silent catch
    }
};

/**
 * Stop all playing SFX audio clones and reset active audio dimming cleanly.
 */
export const stopAllSFX = () => {
    try {
        audioManager.stopAllSFX();
    } catch {
        // Silent catch
    }
};

/**
 * Ensure audio context and assets are unlocked on user gesture.
 */
export const unlockAudio = async (): Promise<boolean> => {
    try {
        const resumed = await resumeAudioContext();
        await audioManager.initialize();
        return resumed || audioManager.isInitialized;
    } catch {
        return false;
    }
};

export default audioManager;
