import { describe, expect, it, vi } from "vitest";
import { startup, type View } from "./startup";

const run = async (results: Array<"ok" | "unreachable">, dev: boolean) => {
  const q = [...results];
  const probe = vi.fn(async () => q.shift() ?? "ok");
  const shown: View[] = [];
  await startup({ probe, dev, show: (v) => void shown.push(v) });
  return { probe, shown };
};

describe("startup", () => {
  it("unreachable shows the unavailable view, never the app or the auth slice", async () => {
    const { shown } = await run(["unreachable"], false);
    expect(shown.map((v) => v.kind)).toEqual(["unavailable"]);
  });

  it("retry probes again and continues to auth when the server is back", async () => {
    const { probe, shown } = await run(["unreachable", "ok"], false);
    const first = shown[0];
    if (first.kind !== "unavailable") throw new Error("expected unavailable");
    await first.retry();
    expect(probe).toHaveBeenCalledTimes(2);
    expect(shown.map((v) => v.kind)).toEqual(["unavailable", "auth"]);
  });

  it("dev + ok renders the app without getToken and never loads the auth slice", async () => {
    const { shown } = await run(["ok"], true);
    expect(shown).toEqual([{ kind: "devApp" }]);
  });

  it("prod + ok loads the auth slice", async () => {
    const { shown } = await run(["ok"], false);
    expect(shown).toEqual([{ kind: "auth" }]);
  });

  it("dev + unreachable passes dev=true (dev hint)", async () => {
    const { shown } = await run(["unreachable"], true);
    expect(shown[0]).toMatchObject({ kind: "unavailable", dev: true });
  });
});
