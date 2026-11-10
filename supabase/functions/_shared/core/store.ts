// The only module that touches tudo_ai_settings / tudo_ai_calls. Every query is filtered by the verified user id.

export interface QueryResult {
  data: unknown;
  error: { message?: string } | null;
  count?: number | null;
}

/** Structural subset of the supabase-js query builder (service-role client in the Edge Function). */
export interface Query extends PromiseLike<QueryResult> {
  select(columns?: string, opts?: { count?: "exact"; head?: boolean }): Query;
  insert(values: unknown): Query;
  upsert(values: unknown, opts?: { onConflict?: string }): Query;
  update(values: unknown): Query;
  delete(): Query;
  eq(column: string, value: string): Query;
  gte(column: string, value: string): Query;
  lt(column: string, value: string): Query;
  maybeSingle(): Query;
}

export interface DbClient {
  from(table: string): Query;
}

export interface SettingsRow {
  provider: string;
  model: string;
  keyHint: string | null;
  updatedAt: string;
}

export interface SecretRow {
  provider: string;
  model: string;
  keyCiphertext: string | null;
  keyHint: string | null;
  keyUpdatedAt: string | null;
}

export interface SettingsWrite {
  provider: string;
  model: string;
  keyCiphertext: string | null;
  keyHint: string | null;
  keyUpdatedAt: string | null;
}

export interface AiStore {
  getView(uid: string): Promise<SettingsRow | null>;
  getSecret(uid: string): Promise<SecretRow | null>;
  upsert(uid: string, w: SettingsWrite): Promise<void>;
  clearKey(uid: string): Promise<void>;
  countCalls(uid: string, kind: string, sinceIso: string): Promise<number>;
  recordCall(uid: string, kind: string): Promise<void>;
  pruneCalls(uid: string, beforeIso: string): Promise<void>;
}

const SETTINGS = "tudo_ai_settings";
const CALLS = "tudo_ai_calls";

function check(res: QueryResult): QueryResult {
  if (res.error) throw new Error("store_error");
  return res;
}

export function createAiStore(client: DbClient): AiStore {
  return {
    async getView(uid) {
      const { data } = check(
        await client
          .from(SETTINGS)
          .select("provider, model, key_hint, updated_at")
          .eq("user_id", uid)
          .maybeSingle(),
      );
      if (!data) return null;
      const r = data as {
        provider: string;
        model: string;
        key_hint: string | null;
        updated_at: string;
      };
      return { provider: r.provider, model: r.model, keyHint: r.key_hint, updatedAt: r.updated_at };
    },

    async getSecret(uid) {
      const { data } = check(
        await client
          .from(SETTINGS)
          .select("provider, model, key_ciphertext, key_hint, key_updated_at")
          .eq("user_id", uid)
          .maybeSingle(),
      );
      if (!data) return null;
      const r = data as {
        provider: string;
        model: string;
        key_ciphertext: string | null;
        key_hint: string | null;
        key_updated_at: string | null;
      };
      return {
        provider: r.provider,
        model: r.model,
        keyCiphertext: r.key_ciphertext,
        keyHint: r.key_hint,
        keyUpdatedAt: r.key_updated_at,
      };
    },

    async upsert(uid, w) {
      check(
        await client.from(SETTINGS).upsert(
          {
            user_id: uid,
            provider: w.provider,
            model: w.model,
            key_ciphertext: w.keyCiphertext,
            key_hint: w.keyHint,
            key_updated_at: w.keyUpdatedAt,
          },
          { onConflict: "user_id" },
        ),
      );
    },

    async clearKey(uid) {
      check(
        await client
          .from(SETTINGS)
          .update({ key_ciphertext: null, key_hint: null, key_updated_at: null })
          .eq("user_id", uid),
      );
    },

    async countCalls(uid, kind, sinceIso) {
      const res = check(
        await client
          .from(CALLS)
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid)
          .eq("kind", kind)
          .gte("created_at", sinceIso),
      );
      return res.count ?? 0;
    },

    async recordCall(uid, kind) {
      check(await client.from(CALLS).insert({ user_id: uid, kind }));
    },

    async pruneCalls(uid, beforeIso) {
      check(await client.from(CALLS).delete().eq("user_id", uid).lt("created_at", beforeIso));
    },
  };
}
