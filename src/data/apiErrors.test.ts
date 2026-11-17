import { describe, expect, test } from "vitest";
import { EDITOR_COPY } from "@/features/items/copy";
import { NAME_MAX } from "@/features/items/validate";
import {
  API_ERROR_COPY,
  ApiError,
  apiErrorMessage,
  BACKUP_REASON_COPY,
  describeBackupField,
  PHOTO_UPLOAD_ERROR_COPY,
  PhotoSaveError,
  RESTORE_ERROR_COPY,
  restoreErrorMessage,
} from "./apiErrors";

const SERVER_CODES = [
  "invalid_input",
  "invalid_json",
  "forbidden_origin",
  "not_found",
  "method_not_allowed",
  "conflict",
  "payload_too_large",
  "unsupported_media_type",
  "internal",
  "db_unavailable",
  "unauthorized",
  "invalid_photo",
  "photos_unavailable",
  "photo_upload_failed",
  "request_timeout",
  "photo_quota_exceeded",
  "rate_limited",
];

describe("apiErrorMessage", () => {
  test("every server code maps to a non-empty message; unknown code is generic", () => {
    for (const c of SERVER_CODES)
      expect(apiErrorMessage(c, undefined, "r1").length).toBeGreaterThan(0);
    expect(apiErrorMessage("method_not_allowed")).toBe(API_ERROR_COPY.generic);
    expect(apiErrorMessage("zzz")).toBe(API_ERROR_COPY.generic);
  });

  test("photo_quota_exceeded and rate_limited have their own Vietnamese copy", () => {
    for (const c of ["photo_quota_exceeded", "rate_limited"] as const) {
      expect(apiErrorMessage(c)).toBe(API_ERROR_COPY[c]);
      expect(apiErrorMessage(c)).not.toBe(API_ERROR_COPY.generic);
    }
    expect(API_ERROR_COPY.photo_quota_exceeded).not.toBe(API_ERROR_COPY.rate_limited);
  });

  test("invalid_input reasons reuse the editor copy; others are generic invalid input", () => {
    const e = EDITOR_COPY.errors;
    expect(apiErrorMessage("invalid_input", "nameRequired")).toBe(e.nameRequired);
    expect(apiErrorMessage("invalid_input", "nameTooLong")).toBe(e.nameTooLong(NAME_MAX));
    expect(apiErrorMessage("invalid_input", "priceNegative")).toBe(e.priceNegative);
    expect(apiErrorMessage("invalid_input", "priceInvalid")).toBe(e.priceInvalid);
    expect(apiErrorMessage("invalid_input", "dateInvalid")).toBe(e.dateInvalid);
    expect(apiErrorMessage("invalid_input", "tooMany")).toBe(API_ERROR_COPY.invalid_input);
  });

  test("internal includes the request id", () => {
    expect(apiErrorMessage("internal", undefined, "abc")).toContain("abc");
  });

  test("ApiError is an Error whose message is the Vietnamese text", () => {
    const err = new ApiError(404, "not_found");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(API_ERROR_COPY.not_found);
    expect(err.status).toBe(404);
  });
});

describe("PhotoSaveError", () => {
  test("message names the partial save and the cause; carries the saved item", () => {
    const saved = { id: "x" } as never;
    const e = new PhotoSaveError(saved, new ApiError(502, "photo_upload_failed"));
    expect(e.item).toBe(saved);
    expect(e.message).toBe(
      `${API_ERROR_COPY.photoNotSaved} — ${API_ERROR_COPY.photo_upload_failed}`,
    );
    expect(new PhotoSaveError(saved, null).message).toBe(API_ERROR_COPY.photoNotSaved);
  });
});

describe("PhotoSaveError photo copy", () => {
  const item = { id: "x" } as never;

  test("PhotoSaveError uses the photo copy for 413 and 415", () => {
    for (const [status, code] of [
      [413, "payload_too_large"],
      [415, "unsupported_media_type"],
    ] as const) {
      const m = new PhotoSaveError(item, new ApiError(status, code)).message;
      expect(m).toContain(PHOTO_UPLOAD_ERROR_COPY[code]);
      expect(m).not.toContain(API_ERROR_COPY[code]);
    }
  });

  test("PhotoSaveError keeps the existing copy for 429, 503 and other causes", () => {
    expect(new PhotoSaveError(item, new ApiError(429, "rate_limited")).message).toContain(
      API_ERROR_COPY.rate_limited,
    );
    expect(new PhotoSaveError(item, new ApiError(503, "photos_unavailable")).message).toContain(
      API_ERROR_COPY.photos_unavailable,
    );
    expect(new PhotoSaveError(item, new Error("boom")).message).toContain("boom");
    expect(new PhotoSaveError(item, null).message).toBe(API_ERROR_COPY.photoNotSaved);
  });
});

describe("restore errors", () => {
  const err = (code: string, field?: string, reason?: string, requestId?: string) =>
    new ApiError(code === "internal" ? 500 : 400, code, field, reason, requestId);

  test("API_ERROR_COPY has restore_busy and restore_conflict", () => {
    for (const code of ["restore_busy", "restore_conflict"]) {
      expect(new ApiError(503, code).message).not.toBe(API_ERROR_COPY.generic);
    }
  });

  test("restoreErrorMessage: busy, conflict and the restore overrides", () => {
    expect(restoreErrorMessage(err("restore_busy"))).toBe(API_ERROR_COPY.restore_busy);
    expect(restoreErrorMessage(err("restore_conflict"))).toBe(API_ERROR_COPY.restore_conflict);
    for (const code of ["request_timeout", "rate_limited", "payload_too_large", "invalid_json"]) {
      const m = restoreErrorMessage(err(code));
      expect(m).toBe((RESTORE_ERROR_COPY as Record<string, string>)[code]);
      expect(m).not.toBe((API_ERROR_COPY as Record<string, unknown>)[code]);
    }
    expect(restoreErrorMessage(new ApiError(0, "network"))).toBe(RESTORE_ERROR_COPY.network);
  });

  test("restoreErrorMessage: internal keeps the request id; unknown codes and non-ApiErrors are generic", () => {
    expect(restoreErrorMessage(err("internal", undefined, undefined, "r-1"))).toBe(
      API_ERROR_COPY.internal("r-1"),
    );
    expect(restoreErrorMessage(err("weird"))).toBe(API_ERROR_COPY.generic);
    expect(restoreErrorMessage(new Error("x"))).toBe(API_ERROR_COPY.generic);
  });

  test("invalid_input with an item field and nameRequired names the item and reuses editor copy", () => {
    const m = restoreErrorMessage(err("invalid_input", "items[3].name", "nameRequired"));
    expect(m).toContain("món #4");
    expect(m).toContain(EDITOR_COPY.errors.nameRequired);
  });

  test("invalid_input reasons each give a Vietnamese reason; unknown ones the generic text", () => {
    const base = RESTORE_ERROR_COPY.invalidFile;
    expect(restoreErrorMessage(err("invalid_input", "locations[0].parent_id", "cycle"))).toBe(
      `${base} — vị trí #1 (parent_id): ${BACKUP_REASON_COPY.cycle}`,
    );
    expect(
      restoreErrorMessage(err("invalid_input", "wearLogs[5].worn_on", "dateInvalid")),
    ).toContain("lượt mặc #6");
    expect(restoreErrorMessage(err("invalid_input", "items", "tooMany"))).toBe(
      `${base} — items: ${BACKUP_REASON_COPY.tooMany}`,
    );
    expect(restoreErrorMessage(err("invalid_input", undefined, "unknownKey"))).toBe(base);
    expect(restoreErrorMessage(err("invalid_input", "items[0].x", "brandNewReason"))).toBe(base);
  });

  test("every reason the server can send has copy", () => {
    for (const r of [
      "notObject",
      "versionUnsupported",
      "unknownKey",
      "invalidType",
      "tooMany",
      "idInvalid",
      "duplicateId",
      "invalidValue",
      "tooLong",
      "duplicateName",
      "danglingRef",
      "cycle",
      "timestampInvalid",
      "duplicateWear",
    ]) {
      expect(BACKUP_REASON_COPY[r]).toBeTruthy();
    }
  });

  test("describeBackupField", () => {
    expect(describeBackupField("items[3].tags[1]")).toBe("món #4 (tags)");
    expect(describeBackupField("items[0]")).toBe("món #1");
    expect(describeBackupField("locations[0]")).toBe("vị trí #1");
    expect(describeBackupField("wearLogs[12].item_id")).toBe("lượt mặc #13 (item_id)");
    expect(describeBackupField("version")).toBe("version");
    expect(describeBackupField(undefined)).toBe("");
  });
});
