import { expect, test } from "vitest";

test("runs in UTC+7 (Asia/Ho_Chi_Minh)", () => {
  expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-420);
});
