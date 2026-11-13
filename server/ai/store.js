// @ts-check
// All SQL for ai_settings (one row, id = true). Values only ever travel as $n parameters.

/** @typedef {{ query(text: string, values?: unknown[]): Promise<any>, connect?(): Promise<any> }} Pool */
/** @typedef {{ provider: string, model: string, keyHint: string | null, hasKey: boolean, updatedAt: string }} AiSettingsRow */
/**
 * @typedef {{
 *   get(): Promise<AiSettingsRow | null>,
 *   save(input: { provider: string, model: string, sealed: { ciphertext: string, hint: string } | null }): Promise<{ ok: true, row: AiSettingsRow } | { ok: false, code: "key_required" }>,
 *   clearKey(): Promise<AiSettingsRow | null>,
 * }} AiStore
 */

const COLUMNS = "provider, model, key_hint, updated_at";

/** @param {Record<string, any>} r @returns {AiSettingsRow} */
function toRow(r) {
  return {
    provider: r.provider,
    model: r.model,
    keyHint: r.key_hint,
    hasKey: r.key_hint !== null,
    updatedAt: r.updated_at.toISOString(),
  };
}

/** @param {Pool} pool @returns {AiStore} */
export function createAiStore(pool) {
  return {
    async get() {
      const r = await pool.query(`select ${COLUMNS} from ai_settings where id`);
      return r.rows[0] ? toRow(r.rows[0]) : null;
    },

    async save({ provider, model, sealed }) {
      if (!pool.connect) throw new Error("pool has no connect()");
      const client = await pool.connect();
      try {
        await client.query("begin");
        const cur = (
          await client.query("select provider, key_hint from ai_settings where id for update")
        ).rows[0];
        // A key sealed for one provider is never kept for another: the user must enter it again.
        if (!sealed && cur && cur.key_hint !== null && cur.provider !== provider) {
          await client.query("rollback");
          return { ok: false, code: "key_required" };
        }
        const r = sealed
          ? await client.query(
              `insert into ai_settings (id, provider, model, key_ciphertext, key_hint, key_updated_at)
               values (true, $1, $2, $3, $4, now())
               on conflict (id) do update set provider = excluded.provider, model = excluded.model,
                 key_ciphertext = excluded.key_ciphertext, key_hint = excluded.key_hint,
                 key_updated_at = excluded.key_updated_at
               returning ${COLUMNS}`,
              [provider, model, sealed.ciphertext, sealed.hint],
            )
          : await client.query(
              `insert into ai_settings (id, provider, model) values (true, $1, $2)
               on conflict (id) do update set provider = excluded.provider, model = excluded.model
               returning ${COLUMNS}`,
              [provider, model],
            );
        await client.query("commit");
        return { ok: true, row: toRow(r.rows[0]) };
      } catch (err) {
        await client.query("rollback").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },

    async clearKey() {
      const r = await pool.query(
        `update ai_settings set key_ciphertext = null, key_hint = null, key_updated_at = null
         where id returning ${COLUMNS}`,
      );
      return r.rows[0] ? toRow(r.rows[0]) : null;
    },
  };
}
