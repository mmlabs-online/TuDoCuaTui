// @ts-check
// Orphan sweep for Drive photos (T-005.6): node server/photo-sweep.js [--apply] [--grace-minutes N] [--max-delete N].
// Dry-run by default. Deletes only files tagged app=tudo that no item_photos row references and that are older than
// the grace period; re-checks the DB before each delete. Exit codes: 0 ok, 1 something failed, 2 bad usage or config.
// Prints counts, codes and photo row uuids only: never a Drive id, page token, secret or Google text.
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { createPool } from "./db.js";
import {
  createDriveClient,
  DriveConfigError,
  DriveError,
  loadDriveConfig,
  taggedFilesQuery,
} from "./drive.js";
import { isUuid } from "./validate.js";

const MAX_PAGES = 1000;
const USAGE = "usage: photo-sweep.js [--apply] [--grace-minutes 15..43200] [--max-delete 1..10000]";

/** @param {unknown} err */
const codeOf = (err) =>
  err instanceof DriveError
    ? err.code
    : typeof (/** @type {{ code?: unknown }} */ (err)?.code) === "string"
      ? /** @type {{ code: string }} */ (err).code
      : "error";

/**
 * @param {{
 *   drive: Pick<ReturnType<typeof createDriveClient>, "checkFolder" | "listFiles" | "deleteFile">,
 *   pool: { query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> },
 *   folderId: string, apply?: boolean, graceMinutes?: number, maxDelete?: number,
 *   now?: () => number, log?: (line: string) => void,
 * }} o
 * @returns {Promise<number>}
 */
export async function runSweep({
  drive,
  pool,
  folderId,
  apply = false,
  graceMinutes = 60,
  maxDelete = 50,
  now = Date.now,
  log = console.log,
}) {
  const graceMs = graceMinutes * 60_000;
  try {
    await drive.checkFolder();
  } catch (err) {
    log(`checkFolder: FAIL ${codeOf(err)}`);
    return 1;
  }

  /** @type {{ id: string, createdTime: number | null, appProperties: Record<string, string> }[]} */
  const listed = [];
  let pages = 0;
  try {
    const q = taggedFilesQuery(folderId);
    const seen = new Set();
    /** @type {string | undefined} */
    let pageToken;
    do {
      if (++pages > MAX_PAGES) throw new DriveError("drive_bad_response");
      const page = await drive.listFiles({ q, pageToken });
      listed.push(...page.files);
      pageToken = page.nextPageToken;
      if (pageToken !== undefined) {
        if (seen.has(pageToken)) throw new DriveError("drive_bad_response");
        seen.add(pageToken);
      }
    } while (pageToken !== undefined);
  } catch (err) {
    log(`list: FAIL ${codeOf(err)}`);
    return 1;
  }

  /** @type {{ id: string, drive_file_id: string, created_at: Date }[]} */
  let rows;
  try {
    rows = (
      await pool.query(
        "select id, drive_file_id, created_at from item_photos where drive_file_id is not null",
      )
    ).rows;
  } catch (err) {
    log(`db: FAIL ${codeOf(err)}`);
    return 1;
  }

  const referenced = new Set(rows.map((r) => r.drive_file_id));
  const t = now();
  const count = { referenced: 0, young: 0, untagged: 0, no_time: 0 };
  /** @type {typeof listed} */
  const candidates = [];
  for (const f of listed) {
    if (f.appProperties.app !== "tudo") count.untagged++;
    else if (referenced.has(f.id)) count.referenced++;
    else if (f.createdTime === null) count.no_time++;
    else if (t - f.createdTime < graceMs) count.young++;
    else candidates.push(f);
  }
  /** @param {{ appProperties: Record<string, string> }} f */
  const label = (f) => (isUuid(f.appProperties.photoId) ? f.appProperties.photoId : "-");

  let failed = false;
  let deleted = 0;
  let failedDeletes = 0;
  if (candidates.length > 0 && count.referenced === 0) {
    // No listed file is referenced: likely a wrong or empty DATABASE_URL, so every file would look orphaned.
    log("refusing: no listed file is referenced (check DATABASE_URL)");
    if (apply) failed = true;
  }
  if (apply && failed) {
    // refused above: delete nothing
  } else if (apply && candidates.length > maxDelete) {
    log(
      `too many candidates: ${candidates.length} > ${maxDelete} (rerun with --max-delete ${candidates.length})`,
    );
    failed = true;
  } else {
    for (const f of candidates) {
      if (!apply) {
        log(`would delete ${label(f)}`);
        continue;
      }
      try {
        const again = await pool.query("select 1 from item_photos where drive_file_id = $1", [
          f.id,
        ]);
        if (again.rows.length > 0) {
          log(`keep ${label(f)}: referenced`);
          continue;
        }
        await drive.deleteFile(f.id);
        deleted++;
        log(`delete ${label(f)}: ok`);
      } catch (err) {
        failedDeletes++;
        failed = true;
        log(`delete ${label(f)}: FAIL ${codeOf(err)}`);
      }
    }
  }

  const present = new Set(listed.map((f) => f.id));
  let missing = 0;
  for (const r of rows) {
    if (present.has(r.drive_file_id) || t - r.created_at.getTime() < graceMs) continue;
    missing++;
    log(`missing file for photo ${r.id}`);
  }

  log(
    `listed ${listed.length} (${pages} pages), referenced ${count.referenced}, young ${count.young}, ` +
      `untagged ${count.untagged}, no_time ${count.no_time}, candidates ${candidates.length}, ` +
      `deleted ${deleted}, failed ${failedDeletes}, missing ${missing}, mode ${apply ? "apply" : "dry-run"}`,
  );
  return failed ? 1 : 0;
}

/**
 * @param {string | undefined} v @param {number} min @param {number} max @param {number} dflt
 * @returns {number | null} null when invalid
 */
function intFlag(v, min, max, dflt) {
  if (v === undefined) return dflt;
  if (!/^\d{1,9}$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
}

/**
 * CLI logic: returns the exit code.
 * @param {{ argv?: string[], env?: Record<string, string | undefined>, log?: (line: string) => void,
 *   error?: (line: string) => void, makeClient?: typeof createDriveClient,
 *   makePool?: (url: string) => ReturnType<typeof createPool>, now?: () => number }} [o]
 */
export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  log = console.log,
  error = console.error,
  makeClient = createDriveClient,
  makePool = createPool,
  now = Date.now,
} = {}) {
  /** @type {ReturnType<typeof parseArgs>["values"]} */
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        apply: { type: "boolean" },
        "grace-minutes": { type: "string" },
        "max-delete": { type: "string" },
      },
    }));
  } catch {
    error(USAGE);
    return 2;
  }
  const graceMinutes = intFlag(
    /** @type {string | undefined} */ (values["grace-minutes"]),
    15,
    43200,
    60,
  );
  const maxDelete = intFlag(/** @type {string | undefined} */ (values["max-delete"]), 1, 10000, 50);
  if (graceMinutes === null || maxDelete === null) {
    error(USAGE);
    return 2;
  }
  /** @type {ReturnType<typeof loadDriveConfig>} */
  let config;
  try {
    config = loadDriveConfig(env);
  } catch (err) {
    error(err instanceof DriveConfigError ? `config error: ${err.message}` : "sweep failed");
    return err instanceof DriveConfigError ? 2 : 1;
  }
  if (config.mode === "off") {
    error("drive not configured");
    return 2;
  }
  if (!env.DATABASE_URL) {
    error("DATABASE_URL is not set");
    return 2;
  }
  /** @type {ReturnType<typeof createPool> | undefined} */
  let pool;
  try {
    pool = makePool(env.DATABASE_URL);
    return await runSweep({
      drive: makeClient({ config }),
      pool,
      folderId: config.folderId,
      apply: values.apply === true,
      graceMinutes,
      maxDelete,
      now,
      log,
    });
  } catch {
    error("sweep failed");
    return 1;
  } finally {
    await pool?.end().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
