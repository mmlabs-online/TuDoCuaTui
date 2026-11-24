// Fakes for the paid AI routes (F-706.4, D45): no database and no real provider. In-memory shared-key store,
// credit ledger (reserve, commit, refund with replay) and spend meter (cap switch, settle log).

export const SHARED_KEY = "AIza-SHARED-SENTINEL-0123456789abcdef";

const PRICES: Record<string, number> = { photo_fill: 1, suggest: 1, sticker: 10 };

export function fakeAppKeys(opts: { key?: string | null; unreadable?: boolean } = {}) {
  const calls: string[] = [];
  return {
    calls,
    async open(provider: string) {
      calls.push(provider);
      if (opts.unreadable) return { ok: false as const, status: 409, code: "key_unreadable" };
      const key = opts.key === undefined ? SHARED_KEY : opts.key;
      if (key === null) return { ok: false as const, status: 409, code: "not_configured" };
      return { ok: true as const, key };
    },
  };
}

export interface FakeOp {
  opKey: string;
  kind: string;
  state: "reserved" | "committed" | "refunded";
  expired: boolean;
  requestHash: string | null;
  result: unknown;
  errorCode: string | null;
}

export function fakeCredits(opts: { balance?: number; welcomePending?: boolean } = {}) {
  const ops = new Map<string, FakeOp>();
  const log: string[] = [];
  const state = { balance: opts.balance ?? 10 };
  const key = (u: string, k: string) => `${u}:${k}`;
  return {
    state,
    ops,
    log,
    async reserve(userId: string, opKey: string, kind: string) {
      log.push(`reserve:${kind}`);
      const existing = ops.get(key(userId, opKey));
      if (existing) {
        return existing.kind === kind
          ? { status: "replay" as const, op: existing }
          : { status: "op_key_mismatch" as const };
      }
      const price = PRICES[kind];
      if (state.balance < price) {
        return {
          status: opts.welcomePending ? ("welcome_pending" as const) : ("insufficient" as const),
        };
      }
      state.balance -= price;
      const op: FakeOp = {
        opKey,
        kind,
        state: "reserved",
        expired: false,
        requestHash: null,
        result: null,
        errorCode: null,
      };
      ops.set(key(userId, opKey), op);
      return { status: "reserved" as const, op };
    },
    async commit(
      userId: string,
      opKey: string,
      data: { requestHash?: string; result?: unknown } = {},
    ) {
      log.push("commit");
      const op = ops.get(key(userId, opKey));
      if (!op) return { status: "not_found" as const };
      if (op.state !== "reserved") return { status: "noop" as const, op };
      op.state = "committed";
      op.requestHash = data.requestHash ?? null;
      op.result = data.result ?? null;
      return { status: "committed" as const, op };
    },
    async refund(userId: string, opKey: string, data: { errorCode?: string } = {}) {
      log.push("refund");
      const op = ops.get(key(userId, opKey));
      if (!op) return { status: "not_found" as const };
      if (op.state !== "reserved") return { status: "noop" as const, op };
      op.state = "refunded";
      op.errorCode = data.errorCode ?? null;
      state.balance += PRICES[op.kind];
      return { status: "refunded" as const, op };
    },
  };
}

export function fakeSpend(opts: { cap?: boolean; unpriced?: boolean } = {}) {
  const state = { cap: opts.cap ?? false, unpriced: opts.unpriced ?? false };
  const reserves: { provider: string; model: string; kind: string }[] = [];
  const settles: { spendId: string; outcome: string }[] = [];
  return {
    state,
    reserves,
    settles,
    async reserve(p: { provider: string; model: string; kind: string }) {
      reserves.push(p);
      if (state.unpriced) return { status: "unpriced" as const };
      if (state.cap) {
        return {
          status: "cap_reached" as const,
          spentMicroUsd: 0,
          capMicroUsd: 0,
          period: "2026-11",
        };
      }
      return {
        status: "reserved" as const,
        spendId: `00000000-0000-4000-8000-${String(reserves.length).padStart(12, "0")}`,
        estimateMicroUsd: 1,
        period: "2026-11",
      };
    },
    async settle(spendId: string, outcome: string) {
      settles.push({ spendId, outcome });
      return { status: "charged" as const };
    },
    async status() {
      return {
        period: "2026-11",
        capMicroUsd: 0,
        spentMicroUsd: 0,
        remainingMicroUsd: 0,
        priceVersion: "test",
      };
    },
  };
}
