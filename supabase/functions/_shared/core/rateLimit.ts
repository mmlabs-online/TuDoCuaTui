import type { AiStore } from "./store.ts";

export type CallKind = "test" | "save";

const HOUR_MS = 60 * 60 * 1000;
const PRUNE_AFTER_MS = 2 * 24 * HOUR_MS;

export const LIMITS: Record<CallKind, { max: number; windowMs: number }> = {
  test: { max: 20, windowMs: HOUR_MS },
  save: { max: 30, windowMs: HOUR_MS },
};

type CallStore = Pick<AiStore, "countCalls" | "recordCall" | "pruneCalls">;

/**
 * Counts an attempt in a rolling window. Returns false (and records nothing) at the limit.
 * Store errors propagate: the request fails closed.
 */
export async function checkAndRecord(
  store: CallStore,
  uid: string,
  kind: CallKind,
  now: Date,
): Promise<boolean> {
  const { max, windowMs } = LIMITS[kind];
  const used = await store.countCalls(uid, kind, new Date(now.getTime() - windowMs).toISOString());
  if (used >= max) return false;
  await store.recordCall(uid, kind);
  await store.pruneCalls(uid, new Date(now.getTime() - PRUNE_AFTER_MS).toISOString());
  return true;
}
