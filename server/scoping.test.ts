// @vitest-environment node
// Static guard (T-019.2): every SQL string literal in server/**/*.js (not test/) that touches a TuDo table
// must mention user_id. Limit: the check is per literal, not per table reference; the runtime recorder in
// isolation.db.test.ts, the composite FKs and RLS (T-019.4, live) are the backstops.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const serverDir = path.resolve(import.meta.dirname);
const TABLE_RE =
  /\b(from|into|update|join)\s+(items|locations|item_photos|wear_logs|items_with_stats|ai_settings)\b/i;

/** String and template literals of a JS source; comments are skipped. */
function literals(src: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
      out.push(src.slice(i + 1, j));
      i = j + 1;
    } else {
      i++;
    }
  }
  return out;
}

function unscoped(src: string): string[] {
  return literals(src).filter((l) => TABLE_RE.test(l) && !l.includes("user_id"));
}

/** Statements that are global on purpose. */
const ALLOW = [
  {
    file: "photo-sweep.js",
    includes: "from item_photos where drive_file_id is not null",
    reason: "orphan sweep: one Drive folder, the DB of all users is the authority",
  },
  {
    file: "photo-sweep.js",
    includes: "from item_photos where drive_file_id = $1",
    reason: "orphan sweep re-check before a delete",
  },
  {
    file: "photo-relocate.js",
    includes: "from item_photos where drive_file_id is not null",
    reason: "relocate: one Drive root, the DB of all users decides each file's owner",
  },
];

const files = [...readdirSync(serverDir, { recursive: true, encoding: "utf8" })]
  .filter((f) => f.endsWith(".js") && !f.startsWith("test"))
  .sort();

describe("user_id scoping guard", () => {
  it("negative fixtures: an unscoped literal is reported, a scoped one is not", () => {
    expect(unscoped('pool.query("select * from items where id = $1", [id])')).toHaveLength(1);
    expect(unscoped("pool.query(`delete from wear_logs\n where id = $1`)")).toHaveLength(1);
    expect(unscoped('pool.query("select * from items where id = $1 and user_id = $2")')).toEqual(
      [],
    );
    expect(unscoped('pool.query("select provider from ai_settings where id")')).toHaveLength(1);
    expect(unscoped("pool.query(`update ai_settings set key_hint = null`)")).toHaveLength(1);
    expect(unscoped('pool.query("select provider from ai_settings where user_id = $1")')).toEqual(
      [],
    );
    expect(unscoped('// select * from items\nconst x = "no sql here";')).toEqual([]);
  });

  it("the file list is recursive and skips server/test/", () => {
    expect(files).toEqual(expect.arrayContaining(["auth.js", "identity.js", "ai/store.js"]));
    expect(files.some((f) => f.startsWith("test"))).toBe(false);
  });

  it("server/**/*.js has no unscoped SQL", () => {
    const bad: string[] = [];
    for (const f of files) {
      for (const l of unscoped(readFileSync(path.join(serverDir, f), "utf8"))) {
        if (!ALLOW.some((a) => a.file === f && l.includes(a.includes))) bad.push(`${f}: ${l}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("allow-list entries are not stale", () => {
    for (const a of ALLOW) {
      const found = literals(readFileSync(path.join(serverDir, a.file), "utf8")).some((l) =>
        l.includes(a.includes),
      );
      expect(found, `${a.file}: ${a.includes}`).toBe(true);
    }
  });

  it("items.js, photos.js, ai/store.js, photo-sweep.js and photo-relocate.js never call pool.query( or pool.connect( directly", () => {
    for (const f of [
      "items.js",
      "photos.js",
      "ai/store.js",
      "photo-sweep.js",
      "photo-relocate.js",
    ]) {
      const src = readFileSync(path.join(serverDir, f), "utf8");
      expect(src, f).not.toMatch(/\bpool\.(query|connect)\(/);
    }
  });

  it("set_config( only in db.js and migrator.js; tudo.maintenance and app.user_id only in db.js", () => {
    const all = [...readdirSync(serverDir, { recursive: true, encoding: "utf8" })].filter(
      (f) => f.endsWith(".js") && !f.startsWith("test"),
    );
    const where = (needle: string) =>
      all.filter((f) => readFileSync(path.join(serverDir, f), "utf8").includes(needle)).sort();
    expect(where("set_config(")).toEqual(["db.js", "migrator.js"]);
    expect(where("tudo.maintenance")).toEqual(["db.js"]);
    expect(where("app.user_id")).toEqual(["db.js"]);
    expect(where("withMaintenance")).toEqual(["db.js", "photo-relocate.js", "photo-sweep.js"]);
  });
});
