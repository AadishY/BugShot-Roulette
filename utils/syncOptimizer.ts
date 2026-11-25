export interface QueuedSocketAction {
  roomId: string;
  action: any;
  isImmediate?: boolean;
}

const COALESCEABLE_OFFLINE_TYPES = new Set([
  'HOVER_TARGET',
  'SYNC_STATE',
  'SYNC_THREE_PLAYER_STATE',
]);

/**
 * Removes redundant, heavy client-side mirror fields (such as the full room object & chat log
 * stored inside `multiplayerState`) before transmitting `SYNC_STATE` packets over WebSockets.
 * Room metadata and chat messages are already synced independently via `roomUpdated`.
 */
export function stripHeavySyncGameState<T extends Record<string, any> | null | undefined>(
  gameState: T
): T {
  if (!gameState || typeof gameState !== 'object') return gameState;
  const {
    multiplayerState: _mpState,
    localSplitConfig: _splitCfg,
    ...compact
  } = gameState as Record<string, any>;
  return compact as T;
}

const serializePlayerSyncSummary = (p: any): string => {
  if (!p || typeof p !== 'object') return 'null';
  const items = Array.isArray(p.items) ? p.items.join(',') : '';
  return [
    p.hp ?? '',
    p.maxHp ?? '',
    items,
    p.isHandcuffed ? 1 : 0,
    p.isSawedActive ? 1 : 0,
    p.isChokeActive ? 1 : 0,
    p.isFlashbanged ? 1 : 0,
    p.jackpotImmunity ?? 0,
    p.activeCard ?? '',
    p.isAlive === false ? 0 : 1,
  ].join(':');
};

/**
 * Fast, deterministic fingerprint for host state sync broadcasts so identical snapshots
 * are skipped instead of flooding WebSocket frames during rapid React re-renders.
 */
export function computeSyncFingerprint(payload: {
  type: string;
  playerState?: any;
  player1State?: any;
  dealerState?: any;
  player2State?: any;
  player3State?: any;
  player4State?: any;
  gameState?: any;
}): string {
  const gs = payload.gameState || {};
  const chamber = Array.isArray(gs.chamber) ? gs.chamber.join(',') : '';
  return [
    payload.type,
    gs.round ?? '',
    gs.phase ?? '',
    gs.turnOwner ?? '',
    gs.turnOwnerId ?? '',
    gs.winner ?? '',
    gs.dealerScore ?? '',
    gs.playerScore ?? '',
    gs.currentShellIndex ?? '',
    chamber,
    serializePlayerSyncSummary(payload.playerState ?? payload.player1State),
    serializePlayerSyncSummary(payload.dealerState ?? payload.player2State),
    serializePlayerSyncSummary(payload.player3State),
    serializePlayerSyncSummary(payload.player4State),
  ].join('|');
}

/**
 * Compacts an offline/reconnecting action queue so only the newest snapshot is kept for
 * idempotent overwrite actions (`HOVER_TARGET`, `SYNC_STATE`, `SYNC_THREE_PLAYER_STATE`)
 * per room, while preserving strict chronological order for every gameplay action (`SHOOT`,
 * `USE_ITEM`, `SELECT_CARD`, etc.).
 */
export function compactOfflineActionQueue(
  queue: readonly QueuedSocketAction[],
  maxSize: number = 30
): QueuedSocketAction[] {
  if (!Array.isArray(queue) || queue.length === 0) return [];

  const latestCoalesceIndex = new Map<string, number>();
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    const actionType = item?.action?.type;
    if (actionType && COALESCEABLE_OFFLINE_TYPES.has(actionType)) {
      latestCoalesceIndex.set(`${item.roomId}::${actionType}`, i);
    }
  }

  const compacted: QueuedSocketAction[] = [];
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    if (!item || !item.roomId || !item.action) continue;
    const actionType = item.action.type;
    if (actionType && COALESCEABLE_OFFLINE_TYPES.has(actionType)) {
      const key = `${item.roomId}::${actionType}`;
      if (latestCoalesceIndex.get(key) !== i) continue;
    }
    compacted.push(item);
  }

  const safeLimit = Math.max(1, Math.floor(maxSize));
  if (compacted.length > safeLimit) {
    return compacted.slice(compacted.length - safeLimit);
  }
  return compacted;
}
