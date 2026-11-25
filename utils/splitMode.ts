export type SplitItemRule = 'NONE' | 'FROM_ROUND_2' | 'FROM_ROUND_1';

export interface SplitRandomFlags {
  itemRule?: boolean;
  totalMatches?: boolean;
  startingHp?: boolean;
  itemsPerShipment?: boolean;
}

export interface LocalSplitConfig {
  player1Name: string;
  player2Name: string;
  itemRule: SplitItemRule;
  itemsPerShipment: number;
  totalMatches: number;
  startingHp: number;
  randomFlags?: SplitRandomFlags;
}

export const SPLIT_ITEM_RULES: readonly SplitItemRule[] = [
  'NONE',
  'FROM_ROUND_2',
  'FROM_ROUND_1',
] as const;

export const ODD_MATCH_OPTIONS = [1, 3, 5, 7, 9] as const;
export const SPLIT_HP_MIN = 2;
export const SPLIT_HP_MAX = 6;
export const SPLIT_ITEMS_MIN = 1;
export const SPLIT_ITEMS_MAX = 8;

export const DEFAULT_LOCAL_SPLIT_CONFIG: LocalSplitConfig = {
  player1Name: 'PLAYER 1',
  player2Name: 'PLAYER 2',
  itemRule: 'FROM_ROUND_2',
  itemsPerShipment: 4,
  totalMatches: 3,
  startingHp: 4,
};

/**
 * Ensures totalMatches is always a positive odd integer in [1, 9].
 */
export const normalizeOddMatches = (value: number): number => {
  const num = Number.isFinite(value) ? Math.floor(value) : 3;
  if (num <= 1) return 1;
  if (num >= 9) return 9;
  return num % 2 === 1 ? num : Math.min(9, num + 1);
};

export const getSplitWinsNeeded = (totalMatches: number): number => {
  const odd = normalizeOddMatches(totalMatches);
  return Math.ceil(odd / 2);
};

const pickFromArray = <T>(items: readonly T[], rng: () => number): T => {
  const clamped = Math.max(0, Math.min(0.999999, rng()));
  return items[Math.floor(clamped * items.length)];
};

const pickIntInRange = (min: number, max: number, rng: () => number): number => {
  const clamped = Math.max(0, Math.min(0.999999, rng()));
  return min + Math.floor(clamped * (max - min + 1));
};

export const sanitizeSplitConfig = (
  raw: Partial<LocalSplitConfig>
): LocalSplitConfig => {
  const p1Raw = (raw.player1Name || '').trim().slice(0, 14).toUpperCase();
  const p2Raw = (raw.player2Name || '').trim().slice(0, 14).toUpperCase();

  const player1Name = p1Raw || 'PLAYER 1';
  let player2Name = p2Raw || 'PLAYER 2';
  if (player2Name === player1Name) {
    player2Name = `${player2Name.slice(0, 11)} II`;
  }

  const itemRule: SplitItemRule =
    raw.itemRule === 'NONE' || raw.itemRule === 'FROM_ROUND_1' || raw.itemRule === 'FROM_ROUND_2'
      ? raw.itemRule
      : 'FROM_ROUND_2';

  const rawItems = Number.isFinite(raw.itemsPerShipment)
    ? Math.floor(Number(raw.itemsPerShipment))
    : DEFAULT_LOCAL_SPLIT_CONFIG.itemsPerShipment;
  const itemsPerShipment =
    itemRule === 'NONE'
      ? 0
      : Math.max(SPLIT_ITEMS_MIN, Math.min(SPLIT_ITEMS_MAX, rawItems || 4));

  const totalMatches = normalizeOddMatches(
    raw.totalMatches ?? DEFAULT_LOCAL_SPLIT_CONFIG.totalMatches
  );

  const rawHp = Number.isFinite(raw.startingHp)
    ? Math.floor(Number(raw.startingHp))
    : DEFAULT_LOCAL_SPLIT_CONFIG.startingHp;
  const startingHp = Math.max(SPLIT_HP_MIN, Math.min(SPLIT_HP_MAX, rawHp || 4));

  return {
    player1Name,
    player2Name,
    itemRule,
    itemsPerShipment,
    totalMatches,
    startingHp,
    ...(raw.randomFlags ? { randomFlags: { ...raw.randomFlags } } : {}),
  };
};

/**
 * Resolves any options marked as Random before sanitizing into a playable LocalSplitConfig.
 */
export const resolveSplitSetupConfig = (
  raw: Partial<LocalSplitConfig>,
  randomFlags?: SplitRandomFlags,
  rng: () => number = Math.random
): LocalSplitConfig => {
  const flags = randomFlags || raw.randomFlags || {};

  const resolvedItemRule: SplitItemRule = flags.itemRule
    ? pickFromArray(SPLIT_ITEM_RULES, rng)
    : (raw.itemRule ?? DEFAULT_LOCAL_SPLIT_CONFIG.itemRule);

  const resolvedMatches = flags.totalMatches
    ? pickFromArray(ODD_MATCH_OPTIONS, rng)
    : (raw.totalMatches ?? DEFAULT_LOCAL_SPLIT_CONFIG.totalMatches);

  const resolvedHp = flags.startingHp
    ? pickIntInRange(SPLIT_HP_MIN, SPLIT_HP_MAX, rng)
    : (raw.startingHp ?? DEFAULT_LOCAL_SPLIT_CONFIG.startingHp);

  const resolvedItems = flags.itemsPerShipment
    ? pickIntInRange(SPLIT_ITEMS_MIN, SPLIT_ITEMS_MAX, rng)
    : (raw.itemsPerShipment ?? DEFAULT_LOCAL_SPLIT_CONFIG.itemsPerShipment);

  return sanitizeSplitConfig({
    ...raw,
    itemRule: resolvedItemRule,
    totalMatches: resolvedMatches,
    startingHp: resolvedHp,
    itemsPerShipment: resolvedItems,
    randomFlags: flags,
  });
};

/**
 * Returns how many items each player receives for a given 1-indexed match number.
 */
export const getSplitItemAmountForMatch = (
  config: LocalSplitConfig,
  matchNumber: number
): number => {
  const safeMatch = Math.max(1, Math.floor(matchNumber || 1));
  if (config.itemRule === 'NONE') return 0;
  if (config.itemRule === 'FROM_ROUND_2' && safeMatch <= 1) return 0;
  return Math.max(
    SPLIT_ITEMS_MIN,
    Math.min(SPLIT_ITEMS_MAX, Math.floor(config.itemsPerShipment || 1))
  );
};

export const pickRandomStartingTurn = (
  rng: () => number = Math.random
): 'PLAYER' | 'DEALER' => {
  return rng() < 0.5 ? 'PLAYER' : 'DEALER';
};

export const resolveSplitWinnerName = (
  winner: string | null | undefined,
  player1Name?: string,
  player2Name?: string
): string => {
  const p1 = (player1Name || 'PLAYER 1').trim().toUpperCase();
  const p2 = (player2Name || 'PLAYER 2').trim().toUpperCase();
  if (winner === 'PLAYER') return p1;
  if (winner === 'DEALER') return p2;
  return 'UNKNOWN';
};
