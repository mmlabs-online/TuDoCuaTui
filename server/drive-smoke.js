// @ts-check
// Drive smoke: node server/drive-smoke.js. Creates a tiny file in the configured folder, moves it into a temporary subfolder, reads and deletes both.
// Exit codes: 0 ok, 1 a step failed, 2 not configured. Prints step names and codes only, never a secret.
import { pathToFileURL } from "node:url";
import { createDriveClient, DriveConfigError, DriveError, loadDriveConfig } from "./drive.js";

/**
 * @param {{ drive: ReturnType<typeof createDriveClient>, log?: (line: string) => void, now?: () => Date }} o
 * @returns {Promise<number>}
 */
export async function runSmoke({ drive, log = console.log, now = () => new Date() }) {
  let failed = false;
  /** @param {string} step @param {() => Promise<unknown>} fn */
  const step = async (step, fn) => {
    try {
      const v = await fn();
      log(`${step}: ok`);
      return v;
    } catch (err) {
      failed = true;
      log(`${step}: FAIL ${err instanceof DriveError ? err.code : "error"}`);
      return undefined;
    }
  };
  /** @param {string} id */
  const read = async (id) => {
    const m = await drive.getMedia(id);
    return Buffer.from(await new Response(m.body).arrayBuffer());
  };

  if ((await step("checkFolder", () => drive.checkFolder())) === undefined && failed) return 1;
  const payload = Buffer.from(`tudo smoke ${now().toISOString()}`);
  const file = /** @type {{ id: string } | undefined} */ (
    await step("create", () =>
      drive.createFile({
        name: `tudo-smoke-${now().toISOString()}.txt`,
        mimeType: "text/plain",
        bytes: payload,
        appProperties: { tudo: "smoke" },
      }),
    )
  );
  if (!file) return 1;
  await step("read", async () => {
    if (!payload.equals(await read(file.id))) throw new Error("mismatch");
  });
  const folder = /** @type {{ id: string } | undefined} */ (
    await step("createFolder", () =>
      drive.createFolder({
        name: `tudo-smoke-folder-${now().toISOString()}`,
        appProperties: { tudo: "smoke" },
      }),
    )
  );
  if (folder) {
    const moved = await step("move", async () => {
      await drive.moveFile(file.id, {
        addParent: folder.id,
        removeParent: drive.rootFolderId,
        appProperties: { tudo: "smoke" },
      });
      const parents = await drive.getParents(file.id);
      if (parents.length !== 1 || parents[0] !== folder.id) throw new Error("not moved");
      return true;
    });
    if (moved) {
      await step("read in folder", async () => {
        if (!payload.equals(await read(file.id))) throw new Error("mismatch");
      });
    }
  }
  const deleted = await step("delete", async () => {
    await drive.deleteFile(file.id);
    return true;
  });
  const folderDeleted = folder
    ? await step("delete folder", async () => {
        await drive.deleteFile(folder.id);
        return true;
      })
    : true;
  if (folder && !folderDeleted) log(`folder left behind: ${folder.id}`);
  if (!deleted) {
    log(`file left behind: ${file.id}`);
    return 1;
  }
  if (!folderDeleted) return 1;
  await step("read after delete", async () => {
    try {
      await read(file.id);
    } catch (err) {
      if (err instanceof DriveError && err.code === "drive_not_found") return;
      throw err;
    }
    throw new Error("still readable");
  });
  return failed ? 1 : 0;
}

/**
 * CLI logic: returns the exit code (0 ok, 1 failed, 2 not configured).
 * @param {{ env?: Record<string, string | undefined>, log?: (line: string) => void, error?: (line: string) => void,
 *   makeClient?: typeof createDriveClient }} [o]
 */
export async function main({
  env = process.env,
  log = console.log,
  error = console.error,
  makeClient = createDriveClient,
} = {}) {
  try {
    const config = loadDriveConfig(env);
    if (config.mode === "off") {
      error("drive not configured");
      return 2;
    }
    return await runSmoke({ drive: makeClient({ config }), log });
  } catch (err) {
    error(err instanceof DriveConfigError ? `config error: ${err.message}` : "smoke failed");
    return err instanceof DriveConfigError ? 2 : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main());
}
