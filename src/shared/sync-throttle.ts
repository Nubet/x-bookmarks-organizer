export const QUICK_SYNC_MIN_INTERVAL_MS = 5_000

export function isQuickSyncThrottled(lastSyncAt: number | null, now = Date.now()) {
  return lastSyncAt !== null && now - lastSyncAt < QUICK_SYNC_MIN_INTERVAL_MS
}
