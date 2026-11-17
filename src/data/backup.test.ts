import { describe, expect, test } from "vitest";
import { fixtureBackup } from "@/test/fixtures";
import {
  BACKUP_CAPS,
  precheckBackup,
  precheckBackupSize,
  type RestoreSummary,
  summaryLines,
} from "./backup";

const MAX = BACKUP_CAPS.bytes;
const reason = (text: string, caps?: typeof BACKUP_CAPS) => {
  const r = precheckBackup(text, caps);
  return r.ok ? "ok" : r.reason;
};

describe("precheckBackupSize", () => {
  test("8 MiB is ok, one byte more is tooLarge", () => {
    expect(precheckBackupSize(MAX)).toEqual({ ok: true });
    expect(precheckBackupSize(MAX + 1)).toEqual({ ok: false, reason: "tooLarge", max: MAX });
  });
});

describe("precheckBackup", () => {
  test("a pretty-printed fixture backup is ok with counts", () => {
    const r = precheckBackup(JSON.stringify(fixtureBackup, null, 2));
    expect(r.ok && r.counts).toEqual({ locations: 2, items: 3, wearLogs: 2, withPhoto: 1 });
    expect(r.ok && r.backup).toEqual(fixtureBackup);
  });

  test("size is counted in UTF-8 bytes, not characters", () => {
    const text = "ạ".repeat(Math.floor(MAX / 3) + 1); // 3 bytes each: fewer chars than the cap, more bytes
    expect(text.length).toBeLessThan(MAX);
    expect(reason(text)).toBe("tooLarge");
  });

  test("empty, not JSON, legacy array and non-objects", () => {
    expect(reason("")).toBe("empty");
    expect(reason("  \n ")).toBe("empty");
    expect(reason("{")).toBe("notJson");
    expect(reason("[]")).toBe("legacyArray");
    expect(reason('[{"name":"Áo"}]')).toBe("legacyArray");
    for (const t of ['"x"', "null", "1"]) expect(reason(t)).toBe("notObject");
  });

  test("version missing, 2 or the string '1' is versionUnsupported", () => {
    const { version: _v, ...noVersion } = fixtureBackup;
    expect(reason(JSON.stringify(noVersion))).toBe("versionUnsupported");
    expect(reason(JSON.stringify({ ...fixtureBackup, version: 2 }))).toBe("versionUnsupported");
    expect(reason(JSON.stringify({ ...fixtureBackup, version: "1" }))).toBe("versionUnsupported");
  });

  test("a missing or non-array list is missingList with the field", () => {
    for (const field of ["locations", "items", "wearLogs"] as const) {
      const { [field]: _x, ...missing } = fixtureBackup;
      expect(precheckBackup(JSON.stringify(missing))).toEqual({
        ok: false,
        reason: "missingList",
        field,
      });
      const bad = precheckBackup(JSON.stringify({ ...fixtureBackup, [field]: {} }));
      expect(bad).toEqual({ ok: false, reason: "missingList", field });
    }
  });

  test("each list one over its cap is tooMany with field and max", () => {
    const caps = { ...BACKUP_CAPS, locations: 1, items: 2, wearLogs: 1 };
    expect(precheckBackup(JSON.stringify(fixtureBackup), caps)).toEqual({
      ok: false,
      reason: "tooMany",
      field: "locations",
      max: 1,
    });
    const onlyItems = { ...fixtureBackup, locations: [], wearLogs: [] };
    expect(precheckBackup(JSON.stringify(onlyItems), caps)).toEqual({
      ok: false,
      reason: "tooMany",
      field: "items",
      max: 2,
    });
    const onlyLogs = { ...fixtureBackup, locations: [], items: [] };
    expect(precheckBackup(JSON.stringify(onlyLogs), caps)).toEqual({
      ok: false,
      reason: "tooMany",
      field: "wearLogs",
      max: 1,
    });
  });

  test("does not validate rows (the server is authoritative)", () => {
    const text = JSON.stringify({ ...fixtureBackup, items: [{ id: "x" }] });
    expect(reason(text)).toBe("ok");
  });
});

describe("summaryLines", () => {
  const zero: RestoreSummary = {
    locations: { inserted: 0, updated: 0, unchanged: 0, merged: 0, remapped: 0 },
    items: { inserted: 0, updated: 0, unchanged: 0, remapped: 0 },
    wearLogs: { inserted: 0, unchanged: 0 },
    photosMissing: 0,
  };
  const keys = (s: RestoreSummary) => summaryLines(s).map((l) => l.key);

  test("all zero keeps the core lines and hides merged, remapped and photos", () => {
    expect(keys(zero)).toEqual([
      "itemsInserted",
      "itemsUpdated",
      "itemsUnchanged",
      "locationsInserted",
      "locationsUpdated",
      "locationsUnchanged",
      "wearLogsInserted",
      "wearLogsUnchanged",
    ]);
  });

  test("photosMissing shows only when non-zero", () => {
    expect(keys({ ...zero, photosMissing: 0 })).not.toContain("photosMissing");
    expect(summaryLines({ ...zero, photosMissing: 2 })).toContainEqual({
      key: "photosMissing",
      n: 2,
    });
  });

  test("remapped and merged show only when non-zero", () => {
    const s = {
      ...zero,
      items: { ...zero.items, remapped: 1 },
      locations: { ...zero.locations, merged: 2, remapped: 3 },
    };
    expect(keys(s)).toEqual(
      expect.arrayContaining(["itemsRemapped", "locationsMerged", "locationsRemapped"]),
    );
  });
});
