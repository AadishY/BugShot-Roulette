type PerformanceMonitorState = {
    lastTime: number;
    lastFrameTime: number;
    lastFrameDeltaMs: number;
    frameCount: number;
    averageFps: number;
    averageFrameMs: number;
    slowFrames: number;
    droppedFrames: number;
};

const getNow = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const initialNow = getNow();

const state: PerformanceMonitorState = {
    lastTime: initialNow,
    lastFrameTime: initialNow,
    lastFrameDeltaMs: 16.67,
    frameCount: 0,
    averageFps: 60,
    averageFrameMs: 16.67,
    slowFrames: 0,
    droppedFrames: 0,
};

export const performanceMonitor = {
    updateFrame() {
        const now = getNow();
        const frameDelta = now - state.lastFrameTime;
        state.lastFrameDeltaMs = frameDelta;
        if (frameDelta > 25 && frameDelta < 1000) {
            if (frameDelta > 33.4) {
                state.slowFrames += 1;
            }
            state.droppedFrames += Math.max(1, Math.floor(frameDelta / 16.6667) - 1);
        }
        state.frameCount += 1;
        const delta = now - state.lastTime;
        if (delta >= 1000) {
            state.averageFps = Math.round((state.frameCount * 1000) / delta);
            state.averageFrameMs = Math.round((delta / state.frameCount) * 100) / 100;
            state.frameCount = 0;
            state.lastTime = now;
        }
        state.lastFrameTime = now;
    },
    getFps() {
        return state.averageFps;
    },
    getFrameTimeMs() {
        return state.averageFrameMs;
    },
    getLastFrameTimeMs() {
        return state.lastFrameDeltaMs;
    },
    getSlowFrameCount() {
        return state.slowFrames;
    },
    getDroppedFrameCount() {
        return state.droppedFrames;
    },
    reset() {
        const now = getNow();
        state.lastTime = now;
        state.lastFrameTime = now;
        state.lastFrameDeltaMs = 16.67;
        state.frameCount = 0;
        state.averageFps = 60;
        state.averageFrameMs = 16.67;
        state.slowFrames = 0;
        state.droppedFrames = 0;
    },
};
