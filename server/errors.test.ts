// @vitest-environment node
import { describe, expect, it } from "vitest";
import { dbLogFields, mapDbError } from "./errors.js";

const e = (code: string) => Object.assign(new Error("secret SQL"), { code });

describe("mapDbError", () => {
  it("data errors and not-null/check violations -> 400 invalid_input", () => {
    for (const c of ["22P02", "22001", "22003", "22007", "22008", "23502", "23514"]) {
      expect(mapDbError(e(c))).toEqual({ status: 400, code: "invalid_input" });
    }
  });

  it("23503 -> 404 not_found; 23505, 40001, 40P01 -> 409 conflict", () => {
    expect(mapDbError(e("23503"))).toEqual({ status: 404, code: "not_found" });
    for (const c of ["23505", "40001", "40P01"]) {
      expect(mapDbError(e(c))).toEqual({ status: 409, code: "conflict" });
    }
  });

  it("connection-class errors, timeouts and pool connect timeout -> 503 db_unavailable", () => {
    const codes = [
      "08006",
      "08001",
      "53300",
      "57P01",
      "57P02",
      "57P03",
      "57014",
      "ECONNREFUSED",
      "ECONNRESET",
      "ETIMEDOUT",
      "ENOTFOUND",
      "EAI_AGAIN",
    ];
    for (const c of codes)
      expect(mapDbError(e(c))).toEqual({ status: 503, code: "db_unavailable" });
    expect(mapDbError(new Error("timeout exceeded when trying to connect"))).toEqual({
      status: 503,
      code: "db_unavailable",
    });
  });

  it("anything else -> 500 internal", () => {
    for (const x of [
      e("XX000"),
      new Error("x"),
      new TypeError("y"),
      null,
      undefined,
      "s",
      { code: 5 },
    ]) {
      expect(mapDbError(x)).toEqual({ status: 500, code: "internal" });
    }
  });
});

describe("dbLogFields", () => {
  it("keeps only code/constraint/routine strings", () => {
    const err = Object.assign(new Error("m"), {
      code: "23505",
      constraint: "items_pkey",
      routine: "r",
      detail: "Key (x)=(secret)",
      hint: "h",
      where: "w",
      query: "select password",
    });
    expect(dbLogFields(err)).toEqual({ code: "23505", constraint: "items_pkey", routine: "r" });
    expect(dbLogFields({ code: 5 })).toEqual({});
    expect(dbLogFields(null)).toEqual({});
  });
});
