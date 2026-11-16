// @ts-check
// Per-user Drive subfolders (T-021): TuDoCuaTui/<user_id>/, found by appProperties, created on first use.
// In-memory cache with single-flight, so one process creates a folder once. A duplicate (another process, index
// lag) is harmless: files are addressed by id, and the oldest folder wins on every later lookup. No logging here.
import { DriveError, userFolderQuery } from "./drive.js";
import { isUuid } from "./validate.js";

const MAX_PAGES = 10;

/**
 * @param {{ drive: Pick<ReturnType<typeof import("./drive.js").createDriveClient>, "rootFolderId" | "listFiles" | "createFolder"> }} o
 */
export function createFolderResolver({ drive }) {
  /** @type {Map<string, string>} */
  const resolved = new Map();
  /** @type {Map<string, Promise<string | null>>} */
  const inflight = new Map();

  /** @param {string} userId @param {boolean} create @returns {Promise<string | null>} */
  async function lookup(userId, create) {
    const q = userFolderQuery(drive.rootFolderId, userId);
    /** @type {{ id: string, createdTime: number | null } | null} */
    let best = null;
    /** @type {string | undefined} */
    let pageToken;
    for (let pages = 0; ;) {
      if (++pages > MAX_PAGES) throw new DriveError("drive_bad_response");
      const page = await drive.listFiles({ q, pageToken });
      for (const f of page.files) {
        const a = f.createdTime ?? Infinity;
        const b = best ? (best.createdTime ?? Infinity) : Infinity;
        if (!best || a < b || (a === b && f.id < best.id)) best = f;
      }
      pageToken = page.nextPageToken;
      if (pageToken === undefined) break;
    }
    if (best) return best.id;
    if (!create) return null;
    return (
      await drive.createFolder({ name: userId, appProperties: { app: "tudo-folder", userId } })
    ).id;
  }

  /**
   * @param {string} userId @param {{ create?: boolean }} [o]
   * @returns {Promise<string | null>} null only with `create: false` and no folder yet (not cached)
   */
  async function resolve(userId, { create = true } = {}) {
    if (!isUuid(userId)) throw new DriveError("drive_invalid_id");
    const hit = resolved.get(userId);
    if (hit) return hit;
    let p = inflight.get(userId);
    if (!p) {
      p = lookup(userId, create)
        .then((id) => {
          if (id) resolved.set(userId, id);
          return id;
        })
        .finally(() => inflight.delete(userId));
      inflight.set(userId, p);
    }
    const id = await p;
    if (id === null && create) return resolve(userId, { create });
    return id;
  }

  return {
    resolve,
    /** Drops a cached id that Drive no longer knows. @param {string} userId */
    forget(userId) {
      resolved.delete(userId);
    },
  };
}
