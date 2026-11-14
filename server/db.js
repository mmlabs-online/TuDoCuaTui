// @ts-check
// Connection pool for the Node API (D24: plain postgres:// URL, no SSL). Never logs the URL.
import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";
import { toUserId } from "./user.js";

/**
 * @param {string} connectionString
 * @param {(entry: Record<string, unknown>) => void} [log]
 */
export function createPool(connectionString, log = () => {}) {
  const pool = new pg.Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30000,
    statement_timeout: 5000,
    application_name: "tudocuatui-api",
    // date (1082) stays 'YYYY-MM-DD'; per-pool so the global parsers are untouched.
    types: {
      getTypeParser: /** @type {any} */ (
        (/** @type {number} */ oid, /** @type {any} */ fmt) =>
          oid === 1082
            ? (/** @type {string} */ v) => v
            : pg.types.getTypeParser(/** @type {any} */ (oid), fmt)
      ),
    },
  });
  pool.on("error", (err) =>
    log({ event: "pool_error", code: /** @type {{ code?: string }} */ (err).code }),
  );
  return pool;
}

/** @param {{ query(sql: string): Promise<unknown> }} pool */
export async function ping(pool) {
  await pool.query("select 1");
}

const MAINTENANCE_TASKS = ["photo-sweep"];
const inTransaction = new AsyncLocalStorage();

/**
 * One transaction with a per-transaction setting (T-019.4). `setting` is [set_config sql, value]; value only as $1.
 * @template T
 * @param {{ connect?(): Promise<any> }} pool @param {[string, string]} setting
 * @param {boolean} readOnly @param {(client: any) => Promise<T>} fn @returns {Promise<T>}
 */
async function inTx(pool, [setSql, value], readOnly, fn) {
  if (!pool.connect) throw new Error("pool has no connect()");
  if (inTransaction.getStore()) throw new Error("nested transaction");
  const client = await pool.connect();
  /** @type {T} */
  let out;
  try {
    out = await inTransaction.run(true, async () => {
      await client.query(readOnly ? "begin read only" : "begin");
      await client.query(setSql, [value]);
      const result = await fn(client);
      // Postgres answers COMMIT of an aborted transaction with a ROLLBACK tag and no error.
      const done = await client.query("commit");
      if (done?.command === "ROLLBACK") throw new Error("transaction was rolled back");
      return result;
    });
  } catch (err) {
    await client.query("rollback").catch(() => {});
    client.release(/** @type {any} */ (err));
    throw err;
  }
  client.release();
  return out;
}

/**
 * Runs `fn(client)` in a transaction whose app.user_id is the caller (RLS, D32). The only way to touch user tables.
 * @template T
 * @param {{ connect?(): Promise<any> }} pool @param {string} userId
 * @param {(client: any) => Promise<T>} fn @param {{ readOnly?: boolean }} [opts] @returns {Promise<T>}
 */
export async function withUser(pool, userId, fn, { readOnly = false } = {}) {
  if (typeof userId !== "string" || toUserId(userId) !== userId) {
    throw new Error("userId required");
  }
  return inTx(
    pool,
    [
      "select set_config('app.user_id', $1, true), set_config('tudo.maintenance', '', true)",
      userId,
    ],
    readOnly,
    fn,
  );
}

/**
 * Read-only transaction for a named maintenance task (the photo sweep): see policy photo_sweep_read.
 * @template T
 * @param {{ connect?(): Promise<any> }} pool @param {string} task
 * @param {(client: any) => Promise<T>} fn @returns {Promise<T>}
 */
export async function withMaintenance(pool, task, fn) {
  if (!MAINTENANCE_TASKS.includes(task)) throw new Error("unknown maintenance task");
  return inTx(
    pool,
    ["select set_config('tudo.maintenance', $1, true), set_config('app.user_id', '', true)", task],
    true,
    fn,
  );
}
