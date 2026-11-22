// @ts-check
// App-wide shared AI keys (F-706.3, D52).
// Owner-only storage, replacement and testing of one shared key per provider (Claude, Gemini, OpenAI).
// Plaintext keys never leave this module: responses carry masked hints only, and logs never carry keys or hints.
import { withAppKeys } from "../db.js";
import { AI_ERROR_STATUS } from "./catalog.js";
import { checkClaudeKey } from "./claude.js";
import { openAppKey, sealAppKey } from "./crypto.js";
import { checkGeminiKey } from "./gemini.js";
import { keyHintOf, maskHint } from "./mask.js";
import { checkOpenAiKey } from "./openai.js";
import { validateApiKeyFormat } from "./validate.js";

export const APP_KEY_PROVIDERS = /** @type {const} */ (["claude", "gemini", "openai"]);
/** @typedef {(typeof APP_KEY_PROVIDERS)[number]} AppKeyProvider */

/** @param {unknown} value @returns {value is AppKeyProvider} */
export function isAppKeyProvider(value) {
  return (
    typeof value === "string" &&
    /** @type {readonly string[]} */ (APP_KEY_PROVIDERS).includes(value)
  );
}

/** @typedef {import("node:crypto").webcrypto.CryptoKey} AiKek */

/**
 * Creates the app-wide shared key manager.
 * @param {{ connect?(): Promise<any> }} pool
 * @param {AiKek} kek
 * @param {{ fetch?: typeof globalThis.fetch }} [opts]
 */
export function createAppKeyStore(pool, kek, { fetch = globalThis.fetch } = {}) {
  return {
    /**
     * Lists all stored app keys with masked hints.
     * @returns {Promise<Array<{ provider: AppKeyProvider, keyHint: string, updatedAt: string }>>}
     */
    async list() {
      return withAppKeys(
        pool,
        async (client) => {
          const res = await client.query(
            "select provider, key_hint, updated_at from ai_app_keys order by provider",
          );
          return res.rows.map(
            /** @param {{ provider: string, key_hint: string, updated_at: Date }} row */
            (row) => ({
              provider: /** @type {AppKeyProvider} */ (row.provider),
              keyHint: maskHint(row.key_hint),
              updatedAt: row.updated_at.toISOString(),
            }),
          );
        },
        { readOnly: true },
      );
    },

    /**
     * Stores or replaces an app key for the given provider.
     * @param {string} provider
     * @param {string} rawKey
     * @returns {Promise<{ ok: true, keyHint: string } | { ok: false, status: number, code: string }>}
     */
    async put(provider, rawKey) {
      if (!isAppKeyProvider(provider)) {
        return { ok: false, status: 400, code: "invalid_provider" };
      }
      const valid = validateApiKeyFormat(rawKey);
      if (!valid.ok) {
        return { ok: false, status: 400, code: "invalid_key_format" };
      }
      const hint = keyHintOf(valid.key);
      const ciphertext = await sealAppKey(kek, provider, valid.key);
      await withAppKeys(pool, async (client) => {
        await client.query(
          `insert into ai_app_keys (provider, key_ciphertext, key_hint, updated_at)
           values ($1, $2, $3, now())
           on conflict (provider) do update
             set key_ciphertext = excluded.key_ciphertext,
                 key_hint = excluded.key_hint,
                 updated_at = now()`,
          [provider, ciphertext, hint],
        );
      });
      return { ok: true, keyHint: /** @type {string} */ (maskHint(hint)) };
    },

    /**
     * Deletes an app key for the given provider. Idempotent.
     * @param {string} provider
     * @returns {Promise<{ ok: true } | { ok: false, status: number, code: string }>}
     */
    async delete(provider) {
      if (!isAppKeyProvider(provider)) {
        return { ok: false, status: 400, code: "invalid_provider" };
      }
      await withAppKeys(pool, async (client) => {
        await client.query("delete from ai_app_keys where provider = $1", [provider]);
      });
      return { ok: true };
    },

    /**
     * Tests the saved app key with the provider without consuming tokens.
     * @param {string} provider
     * @returns {Promise<{ ok: true } | { ok: false, status: number, code: string }>}
     */
    async test(provider) {
      if (!isAppKeyProvider(provider)) {
        return { ok: false, status: 400, code: "invalid_provider" };
      }
      /** @type {string | null} */
      const ciphertext = await withAppKeys(
        pool,
        async (client) => {
          const res = await client.query(
            "select key_ciphertext from ai_app_keys where provider = $1",
            [provider],
          );
          return res.rows[0]?.key_ciphertext ?? null;
        },
        { readOnly: true },
      );

      if (!ciphertext) {
        return { ok: false, status: 404, code: "not_configured" };
      }

      /** @type {string} */
      let plaintext;
      try {
        plaintext = await openAppKey(kek, provider, ciphertext);
      } catch {
        return { ok: false, status: 409, code: "key_unreadable" };
      }

      /** @type {{ ok: true } | { ok: false, code: string }} */
      let checkResult;
      if (provider === "claude") {
        checkResult = await checkClaudeKey({
          fetch,
          key: plaintext,
          model: "claude-haiku-5-5",
        });
      } else if (provider === "gemini") {
        checkResult = await checkGeminiKey({
          fetch,
          key: plaintext,
          model: "gemini-2.5-flash",
        });
      } else {
        checkResult = await checkOpenAiKey({ fetch, key: plaintext });
      }

      if (!checkResult.ok) {
        const code = checkResult.code;
        const status =
          code in AI_ERROR_STATUS
            ? AI_ERROR_STATUS[/** @type {keyof typeof AI_ERROR_STATUS} */ (code)]
            : 502;
        return { ok: false, status, code };
      }
      return { ok: true };
    },
  };
}
