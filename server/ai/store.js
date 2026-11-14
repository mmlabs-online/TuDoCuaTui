// @ts-check
// All SQL for ai_settings (one row per user, primary key user_id; D33). Values only ever travel as $n parameters.
import { withUser } from "../db.js";
import { toUserId } from "../user.js";

/** @typedef {{ query(text: string, values?: unknown[]): Promise<any>, connect?(): Promise<any> }} Pool */
/** @typedef {{ provider: string, model: string, keyHint: string | null, hasKey: boolean, updatedAt: string }} AiSettingsRow */
/**
 * @typedef {{
 *   get(userId: string): Promise<AiSettingsRow | null>,
 *   save(userId: string, input: { provider: string, model: string, sealed: { ciphertext: string, hint: string } | null }): Promise<{ ok: true, row: AiSettingsRow } | { ok: false, code: "key_required" }>,
 *   clearKey(userId: string): Promise<AiSettingsRow | null>,
 *   getSecret(userId: string): Promise<{ provider: string, model: string, ciphertext: string } | null>,
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

/** @param {string} userId */
function need(userId) {
  if (typeof userId !== "string" || toUserId(userId) !== userId) throw new Error("userId required");
}

/** @param {Pool} pool @returns {AiStore} */
export function createAiStore(pool) {
  return {
    async get(userId) {
      need(userId);
      const r = await withUser(
        pool,
        userId,
        (c) => c.query(`select ${COLUMNS} from ai_settings where user_id = $1`, [userId]),
        { readOnly: true },
      );
      return r.rows[0] ? toRow(r.rows[0]) : null;
    },

    async save(userId, { provider, model, sealed }) {
      need(userId);
      return withUser(pool, userId, async (client) => {
        const cur = (
          await client.query(
            "select provider, key_hint from ai_settings where user_id = $1 for update",
            [userId],
          )
        ).rows[0];
        // A key sealed for one provider is never kept for another: the user must enter it again.
        if (!sealed && cur && cur.key_hint !== null && cur.provider !== provider) {
          return /** @type {const} */ ({ ok: false, code: "key_required" });
        }
        const r = sealed
          ? await client.query(
              `insert into ai_settings (user_id, provider, model, key_ciphertext, key_hint, key_updated_at)
               values ($1, $2, $3, $4, $5, now())
               on conflict (user_id) do update set provider = excluded.provider, model = excluded.model,
                 key_ciphertext = excluded.key_ciphertext, key_hint = excluded.key_hint,
                 key_updated_at = excluded.key_updated_at
               returning ${COLUMNS}`,
              [userId, provider, model, sealed.ciphertext, sealed.hint],
            )
          : await client.query(
              `insert into ai_settings (user_id, provider, model) values ($1, $2, $3)
               on conflict (user_id) do update set provider = excluded.provider, model = excluded.model
               returning ${COLUMNS}`,
              [userId, provider, model],
            );
        return /** @type {const} */ ({ ok: true, row: toRow(r.rows[0]) });
      });
    },

    async getSecret(userId) {
      need(userId);
      const r = await withUser(
        pool,
        userId,
        (c) =>
          c.query(
            "select provider, model, key_ciphertext from ai_settings where user_id = $1 and key_ciphertext is not null",
            [userId],
          ),
        { readOnly: true },
      );
      const row = r.rows[0];
      return row
        ? { provider: row.provider, model: row.model, ciphertext: row.key_ciphertext }
        : null;
    },

    async clearKey(userId) {
      need(userId);
      const r = await withUser(pool, userId, (c) =>
        c.query(
          `update ai_settings set key_ciphertext = null, key_hint = null, key_updated_at = null
           where user_id = $1 returning ${COLUMNS}`,
          [userId],
        ),
      );
      return r.rows[0] ? toRow(r.rows[0]) : null;
    },
  };
}
