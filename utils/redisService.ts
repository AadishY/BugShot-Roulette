/**
 * Upstash Redis Compatibility Layer -> Migrated to Firebase Cloud
 * All operations are transparently bridged to firebaseService.ts
 */

import {
    loginUserWithFirebase,
    registerUserWithFirebase,
    saveUserStatsToFirebase,
    getUserStatsFromFirebase,
    getLeaderboard as getLeaderboardFirebase,
    findUserByUsernameOrEmail,
    UserProfile,
    LeaderboardEntry
} from './firebaseService';
import type { GameStats } from './statsManager';

// Forwarded Auth
export const loginUser = async (identifier: string, password: string) => {
    return loginUserWithFirebase(identifier, password);
};

export const registerUser = async (username: string, password: string, email?: string) => {
    // If legacy caller only provided username & password, generate a fallback registration email
    const safeEmail = email || `${username.trim().toLowerCase()}@bugshot.local`;
    return registerUserWithFirebase(username, safeEmail, password);
};

// Forwarded Stats
export const saveUserStatsToRedis = async (username: string, stats: GameStats) => {
    return saveUserStatsToFirebase(username, stats);
};

export const getUserStatsFromRedis = async (username: string): Promise<GameStats | null> => {
    return getUserStatsFromFirebase(username);
};

export const getUserData = async (username: string): Promise<UserProfile | null> => {
    return findUserByUsernameOrEmail(username);
};

export const getLeaderboard = async (): Promise<LeaderboardEntry[]> => {
    return getLeaderboardFirebase();
};

export const updateLeaderboardWithGameStats = async (username: string, stats: GameStats) => {
    return saveUserStatsToFirebase(username, stats);
};

// Re-export everything from firebaseService
export * from './firebaseService';