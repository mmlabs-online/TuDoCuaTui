// @ts-check
// One-off relocation (T-021): node server/photo-relocate.js [--apply] [--max-move N].
// Moves each tagged photo that still sits in the flat TuDo root into its owner's subfolder TuDoCuaTui/<user_id>/ and
// tags it with userId. Dry-run by default. Idempotent and resumable: moved files drop out of the root listing.
// Reads item_photos of all users through withMaintenance(pool, "photo-sweep", ...): that task name is reused on
// purpose (policy photo_sweep_read is exactly the SELECT needed, no migration); it is SELECT-only, nothing is written.
// Exit codes: 0 ok, 1 something failed, 2 bad usage or config.
// Prints counts, codes, photo row uuids and user uuids only: never a Drive id, page token, secret or Google text.
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { createPool, withMaintenance } from "./db.js";
import {
  createDriveClient,
  DriveConfigError,
  DriveError,
  loadDriveConfig,
  taggedFilesQuery,
} from "./drive.js";
import { createFolderResolver } from "./driveFolders.js";
import { isUuid } from "./validate.js";

const MAX_PAGES = 1000;
const USAGE = "usage: photo-relocate.js [--apply] [--max-move 1..10000]";

/** @param {unknown} err */
const codeOf = (err) =>
  err instanceof DriveError
    ? err.code
    : typeof (/** @type {{ code?: unknown }} */ (err)?.code) === "string"
      ? /** @type {{ code: string }} */ (err).code
      : "error";

/**
 * @param {{
 *   drive: Pick<ReturnType<typeof createDriveClient>, "checkFolder" | "listFiles" | "moveFile" | "getParents" | "rootFolderId" | "createFolder">,
 *   pool: { connect(): Promise<any> },
 *   apply?: boolean, maxMove?: number, log?: (line: string) => void,
 * }} o
 * @returns {Promise<number>}
 */
export async function runRelocate({
  drive,
  pool,
  apply = false,
  maxMove = 100,
  log = console.log,
}) {
  let foldersCreated = 0;
  const folders = createFolderResolver({
    drive: {
      rootFolderId: drive.rootFolderId,
      listFiles: (o) => drive.listFiles(o),
      createFolder: async (o) => {
        foldersCreated++;
        return drive.createFolder(o);
      },
    },
  });
  try {
    await drive.checkFolder();
  } catch (err) {
    log(`checkFolder: FAIL ${codeOf(err)}`);
    return 1;
  }

  /** @type {{ id: string, appProperties: Record<string, string> }[]} */
  const listed = [];
  try {
    const q = taggedFilesQuery(drive.rootFolderId);
    const seen = new Set();
    /** @type {string | undefined} */
    let pageToken;
    let pages = 0;
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

  /** @type {{ id: string, user_id: string, drive_file_id: string }[]} */
  let rows;
  try {
    rows = (
      await withMaintenance(pool, "photo-sweep", (c) =>
        c.query(
          "select id, user_id, drive_file_id from item_photos where drive_file_id is not null",
        ),
      )
    ).rows;
  } catch (err) {
    log(`db: FAIL ${codeOf(err)}`);
    return 1;
  }

  const byFile = new Map(rows.map((r) => [r.drive_file_id, r]));
  /** @param {{ appProperties: Record<string, string> }} f */
  const label = (f) => (isUuid(f.appProperties.photoId) ? f.appProperties.photoId : "-");
  let unreferenced = 0;
  let mismatch = 0;
  /** @type {{ file: { id: string }, row: { id: string, user_id: string } }[]} */
  const candidates = [];
  for (const f of listed) {
    const row = byFile.get(f.id);
    if (!row) {
      unreferenced++;
      log(`unreferenced ${label(f)}`);
    } else if (f.appProperties.userId !== undefined && f.appProperties.userId !== row.user_id) {
      mismatch++;
      log(`mismatch ${row.id}`);
    } else {
      candidates.push({ file: f, row });
    }
  }

  let failed = false;
  if (rows.length > 0 && listed.length > 0 && candidates.length + mismatch === 0) {
    // Orphans in root are normal once the referenced files were moved: probe a few rows to tell right DB from wrong DB.
    let found = false;
    for (const r of rows.slice(0, 5)) {
      try {
        await drive.getParents(r.drive_file_id);
        found = true;
        break;
      } catch (err) {
        if (!(err instanceof DriveError && err.code === "drive_not_found")) {
          log(`probe: FAIL ${codeOf(err)}`);
          return 1;
        }
      }
    }
    if (found) {
      log("nothing to move: no listed file is referenced");
    } else {
      log("refusing: no listed file is referenced (check DATABASE_URL)");
      if (apply) return 1;
    }
  } else if (listed.length > 0 && candidates.length + mismatch === 0) {
    log("nothing to move: no listed file is referenced");
  }

  let moved = 0;
  let gone = 0;
  let already = 0;
  let failedMoves = 0;
  let wouldMove = 0;
  const todo = apply ? candidates.slice(0, maxMove) : candidates;
  const announced = new Set();
  for (const { file, row } of todo) {
    try {
      if (!apply) {
        if (!announced.has(row.user_id)) {
          announced.add(row.user_id);
          if ((await folders.resolve(row.user_id, { create: false })) === null) {
            log(`would create folder for user ${row.user_id}`);
          }
        }
        wouldMove++;
        log(`would move ${row.id} to user ${row.user_id}`);
        continue;
      }
      const target = /** @type {string} */ (await folders.resolve(row.user_id));
      const parents = await drive.getParents(file.id);
      if (!parents.includes(drive.rootFolderId)) {
        already++;
        log(`already ${row.id}`);
        continue;
      }
      await drive.moveFile(file.id, {
        addParent: target,
        removeParent: drive.rootFolderId,
        appProperties: { userId: row.user_id },
      });
      moved++;
      log(`move ${row.id}: ok`);
    } catch (err) {
      if (err instanceof DriveError && err.code === "drive_not_found") {
        gone++;
        log(`gone ${row.id}`);
      } else {
        failedMoves++;
        failed = true;
        log(`move ${row.id}: FAIL ${codeOf(err)}`);
      }
    }
  }
  const remaining = apply ? candidates.length - todo.length : 0;

  log(
    `listed ${listed.length}, referenced ${candidates.length + mismatch}, unreferenced ${unreferenced}, ` +
      `mismatch ${mismatch}, ${apply ? `moved ${moved}` : `would_move ${wouldMove}`}, gone ${gone}, ` +
      `already ${already}, failed ${failedMoves}, remaining ${remaining}, ` +
      `folders_created ${foldersCreated}, mode ${apply ? "apply" : "dry-run"}`,
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
 *   makePool?: (url: string) => ReturnType<typeof createPool> }} [o]
 */
export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  log = console.log,
  error = console.error,
  makeClient = createDriveClient,
  makePool = createPool,
} = {}) {
  /** @type {ReturnType<typeof parseArgs>["values"]} */
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: { apply: { type: "boolean" }, "max-move": { type: "string" } },
    }));
  } catch {
    error(USAGE);
    return 2;
  }
  const maxMove = intFlag(/** @type {string | undefined} */ (values["max-move"]), 1, 10000, 100);
  if (maxMove === null) {
    error(USAGE);
    return 2;
  }
  /** @type {ReturnType<typeof loadDriveConfig>} */
  let config;
  try {
    config = loadDriveConfig(env);
  } catch (err) {
    error(err instanceof DriveConfigError ? `config error: ${err.message}` : "relocate failed");
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
    return await runRelocate({
      drive: makeClient({ config }),
      pool,
      apply: values.apply === true,
      maxMove,
      log,
    });
  } catch {
    error("relocate failed");
    return 1;
  } finally {
    await pool?.end().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
