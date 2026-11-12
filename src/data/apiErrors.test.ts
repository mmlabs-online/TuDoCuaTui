import { describe, expect, test } from "vitest";
import { EDITOR_COPY } from "@/features/items/copy";
import { NAME_MAX } from "@/features/items/validate";
import { API_ERROR_COPY, ApiError, apiErrorMessage, PhotoSaveError } from "./apiErrors";

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
];

describe("apiErrorMessage", () => {
  test("every server code maps to a non-empty message; unknown code is generic", () => {
    for (const c of SERVER_CODES)
      expect(apiErrorMessage(c, undefined, "r1").length).toBeGreaterThan(0);
    expect(apiErrorMessage("method_not_allowed")).toBe(API_ERROR_COPY.generic);
    expect(apiErrorMessage("zzz")).toBe(API_ERROR_COPY.generic);
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
