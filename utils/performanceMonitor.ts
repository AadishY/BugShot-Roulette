type PerformanceMonitorState = {
    lastTime: number;
    lastFrameTime: number;
    frameCount: number;
    averageFps: number;
    averageFrameMs: number;
};

const state: PerformanceMonitorState = {
    lastTime: performance.now(),
    lastFrameTime: performance.now(),
    frameCount: 0,
    averageFps: 60,
    averageFrameMs: 16.67,
};

export const performanceMonitor = {
    updateFrame() {
        const now = performance.now();
        state.frameCount += 1;
        const delta = now - state.lastTime;
        if (delta >= 1000) {
            state.averageFps = Math.round((state.frameCount * 1000) / delta);
            state.averageFrameMs = Number((delta / state.frameCount).toFixed(2));
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
    reset() {
        const now = performance.now();
        state.lastTime = now;
        state.lastFrameTime = now;
        state.frameCount = 0;
        state.averageFps = 60;
        state.averageFrameMs = 16.67;
    },
};
