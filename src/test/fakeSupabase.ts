import { vi } from "vitest";

export type FakeResult = { data?: unknown; error?: unknown };
export type Call = { table: string; method: string; args: unknown[] };

const METHODS = [
  "select",
  "eq",
  "order",
  "limit",
  "insert",
  "upsert",
  "delete",
  "single",
  "maybeSingle",
] as const;

type Builder = { [K in (typeof METHODS)[number]]: (...args: unknown[]) => Builder } & {
  then: (
    onFulfilled?: (v: { data: unknown; error: unknown }) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => Promise<unknown>;
};

/**
 * Hand-written stand-in for the Supabase client. Every awaited query chain consumes
 * one scripted result (FIFO, see `push`); every builder call is logged in `calls`.
 */
export function createFakeSupabase(userId: string | null = "user-1") {
  const calls: Call[] = [];
  const queue: FakeResult[] = [];

  const from = vi.fn((table: string) => {
    calls.push({ table, method: "from", args: [] });
    let last = "from";
    const builder = {} as Builder;
    for (const method of METHODS) {
      builder[method] = (...args: unknown[]) => {
        last = method;
        calls.push({ table, method, args });
        return builder;
      };
    }
    builder.then = (onFulfilled, onRejected) => {
      const next = queue.shift();
      const settled = next
        ? Promise.resolve({ data: next.data ?? null, error: next.error ?? null })
        : Promise.reject(new Error(`fakeSupabase: no scripted result for ${table}.${last}`));
      return settled.then(onFulfilled, onRejected);
    };
    return builder;
  });

  const storage = {
    createSignedUrls: vi.fn(async (..._args: unknown[]) => ({
      data: [] as unknown,
      error: null as unknown,
    })),
    upload: vi.fn(async (..._args: unknown[]) => ({
      data: null as unknown,
      error: null as unknown,
    })),
    remove: vi.fn(async (..._args: unknown[]) => ({
      data: null as unknown,
      error: null as unknown,
    })),
    copy: vi.fn(async (..._args: unknown[]) => ({ data: null as unknown, error: null as unknown })),
  };

  const client = {
    from,
    storage: { from: vi.fn((..._args: unknown[]) => storage) },
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: userId ? { id: userId } : null },
        error: null,
      })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  };

  return {
    client,
    calls,
    storage,
    push: (...results: FakeResult[]) => {
      queue.push(...results);
    },
    pending: () => queue.length,
  };
}

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;
