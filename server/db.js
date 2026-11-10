// @ts-check
// Connection pool for the Node API (D24: plain postgres:// URL, no SSL). Never logs the URL.
import pg from "pg";

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
