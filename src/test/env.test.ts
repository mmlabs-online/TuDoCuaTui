import { expect, test } from "vitest";
import { supabase } from "@/lib/supabase";

test("runs in UTC+7 (Asia/Ho_Chi_Minh)", () => {
  expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-420);
});

test("runs in local mode (supabase is null)", () => {
  expect(supabase).toBeNull();
});
