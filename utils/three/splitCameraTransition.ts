export type SplitSeat = 'A' | 'B';
export type Vec3Tuple = [number, number, number];

export interface SplitCameraTransitionState {
  active: boolean;
  fromSeat: SplitSeat;
  toSeat: SplitSeat;
  elapsed: number;
  duration: number;
  startPos: Vec3Tuple;
  startLookAt: Vec3Tuple;
  arcDirection: 1 | -1;
}

export interface SplitCameraStepResult {
  active: boolean;
  progress: number;
  easedProgress: number;
  bankRoll: number;
}

/**
 * Duration (in seconds) of the eased local split-screen camera orbit between Seat A and Seat B.
 * Tuned to settle smoothly right before the 1.65s turn handoff banner clears.
 */
export const DEFAULT_SPLIT_TRANSITION_DURATION = 1.25;

/** Lateral orbit clearance around the table (+X side is unobstructed in the bunker scene). */
export const SPLIT_ORBIT_LATERAL_ARC = 4.8;

/** Subtle crane elevation lift at the midpoint of the sweep. */
export const SPLIT_ORBIT_VERTICAL_LIFT = 1.65;

/** Peak cinematic roll angle in radians (~1.4 degrees) that eases back to 0 on arrival. */
export const SPLIT_ORBIT_MAX_BANK_ROLL = 0.024;

export function clamp01(t: number): number {
  if (!Number.isFinite(t)) return 0;
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

/**
 * Smooth S-curve cubic ease-in-out: zero initial velocity, smooth mid-sweep glide, cushioned settle.
 */
export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Gentle sinusoidal ease-in-out for camera gaze / look-at panning.
 */
export function easeInOutSine(t: number): number {
  const x = clamp01(t);
  return -(Math.cos(Math.PI * x) - 1) / 2 + 0;
}

export function createIdleSplitCameraTransition(seat: SplitSeat): SplitCameraTransitionState {
  return {
    active: false,
    fromSeat: seat,
    toSeat: seat,
    elapsed: 0,
    duration: DEFAULT_SPLIT_TRANSITION_DURATION,
    startPos: [0, 3.8, seat === 'B' ? -12 : 12],
    startLookAt: [0, 1.5, seat === 'B' ? 2 : -2],
    arcDirection: 1,
  };
}

/**
 * Starts a smooth camera transition in-place (zero allocations) from the camera's exact
 * current position and look-at point, preventing hard cuts even if triggered mid-aim or mid-sweep.
 */
export function beginSplitCameraTransition(
  state: SplitCameraTransitionState,
  fromPos: readonly [number, number, number],
  fromLookAt: readonly [number, number, number],
  fromSeat: SplitSeat,
  toSeat: SplitSeat,
  duration: number = DEFAULT_SPLIT_TRANSITION_DURATION
): SplitCameraTransitionState {
  state.active = fromSeat !== toSeat;
  state.fromSeat = fromSeat;
  state.toSeat = toSeat;
  state.elapsed = 0;
  state.duration = duration > 0 ? duration : DEFAULT_SPLIT_TRANSITION_DURATION;
  state.startPos[0] = fromPos[0];
  state.startPos[1] = fromPos[1];
  state.startPos[2] = fromPos[2];
  state.startLookAt[0] = fromLookAt[0];
  state.startLookAt[1] = fromLookAt[1];
  state.startLookAt[2] = fromLookAt[2];
  state.arcDirection = 1;
  return state;
}

/**
 * Advances an active split-screen camera transition by `dt` seconds and writes the eased
 * camera position and look-at target into pre-allocated output tuples (zero per-frame GC).
 */
export function stepSplitCameraTransition(
  state: SplitCameraTransitionState,
  targetPos: readonly [number, number, number],
  targetLookAt: readonly [number, number, number],
  dt: number,
  outPos: Vec3Tuple,
  outLookAt: Vec3Tuple
): SplitCameraStepResult {
  if (!state.active) {
    outPos[0] = targetPos[0];
    outPos[1] = targetPos[1];
    outPos[2] = targetPos[2];
    outLookAt[0] = targetLookAt[0];
    outLookAt[1] = targetLookAt[1];
    outLookAt[2] = targetLookAt[2];
    return { active: false, progress: 1, easedProgress: 1, bankRoll: 0 };
  }

  // Guard against negative delta or tab-switch frame spikes
  const safeDt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
  state.elapsed += safeDt;

  const rawT = state.duration > 0 ? clamp01(state.elapsed / state.duration) : 1;
  const posEase = easeInOutCubic(rawT);
  const lookEase = easeInOutSine(rawT);
  const arcBell = Math.sin(Math.PI * posEase);

  // Smooth eased interpolation plus subtle arc around the table
  outPos[0] =
    state.startPos[0] +
    (targetPos[0] - state.startPos[0]) * posEase +
    SPLIT_ORBIT_LATERAL_ARC * state.arcDirection * arcBell;
  outPos[1] =
    state.startPos[1] +
    (targetPos[1] - state.startPos[1]) * posEase +
    SPLIT_ORBIT_VERTICAL_LIFT * arcBell;
  outPos[2] = state.startPos[2] + (targetPos[2] - state.startPos[2]) * posEase;

  // Smooth gaze pan with subtle framing pull toward table center (0, 1.35, 0) during mid-arc
  const baseLookX = state.startLookAt[0] + (targetLookAt[0] - state.startLookAt[0]) * lookEase;
  const baseLookY = state.startLookAt[1] + (targetLookAt[1] - state.startLookAt[1]) * lookEase;
  const baseLookZ = state.startLookAt[2] + (targetLookAt[2] - state.startLookAt[2]) * lookEase;
  const centerPull = arcBell * 0.42;

  outLookAt[0] = baseLookX + (0 - baseLookX) * centerPull;
  outLookAt[1] = baseLookY + (1.35 - baseLookY) * centerPull;
  outLookAt[2] = baseLookZ + (0 - baseLookZ) * centerPull;

  const rawBankRoll = rawT >= 1 ? 0 : -SPLIT_ORBIT_MAX_BANK_ROLL * state.arcDirection * arcBell;
  const bankRoll = rawBankRoll === 0 ? 0 : rawBankRoll;

  if (rawT >= 1) {
    state.active = false;
    state.fromSeat = state.toSeat;
  }

  return {
    active: state.active,
    progress: rawT,
    easedProgress: posEase,
    bankRoll,
  };
}
