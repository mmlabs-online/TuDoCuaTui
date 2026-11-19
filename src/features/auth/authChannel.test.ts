import { describe, expect, it, vi } from "vitest";
import { createAuthChannel, parseAuthMessage } from "./authChannel";
import { createFakeChannelHub } from "./fakeTabs";

const ID = "11111111-1111-4111-8111-111111111111";
const NOW = 1_700_000_000_000;
const token = (o: Record<string, unknown> = {}) => ({
  v: 1,
  type: "token",
  accountId: ID,
  accessToken: "abc.DEF-123_x",
  expiresAt: NOW + 900_000,
  at: NOW - 1000,
  ...o,
});
const signedOut = (o: Record<string, unknown> = {}) => ({
  v: 1,
  type: "signedOut",
  accountId: ID,
  at: NOW,
  ...o,
});

describe("parseAuthMessage", () => {
  it("accepts a valid token and signedOut message", () => {
    expect(parseAuthMessage(token(), NOW)).toEqual(token());
    expect(parseAuthMessage(signedOut(), NOW)).toEqual(signedOut());
  });

  it("does not copy unknown fields", () => {
    expect(parseAuthMessage(token({ extra: "x" }), NOW)).toEqual(token());
    expect(parseAuthMessage(signedOut({ extra: "x" }), NOW)).toEqual(signedOut());
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["string", "x"],
    ["array", [token()]],
    ["v is not 1", token({ v: 2 })],
    ["unknown type", token({ type: "signedIn" })],
    ["non-UUID accountId", token({ accountId: "nope" })],
    ["empty accessToken", token({ accessToken: "" })],
    ["accessToken too long", token({ accessToken: "a".repeat(8193) })],
    ["accessToken with a space", token({ accessToken: "ab cd" })],
    ["accessToken with +", token({ accessToken: "ab+cd" })],
    ["expiresAt in the past", token({ expiresAt: NOW })],
    ["expiresAt more than 24 h away", token({ expiresAt: NOW + 86_400_001 })],
    ["expiresAt NaN", token({ expiresAt: NaN })],
    ["expiresAt a string", token({ expiresAt: String(NOW + 1000) })],
    ["at older than 10 s", token({ at: NOW - 10_001 })],
    ["at in the future", token({ at: NOW + 5001 })],
    ["at not a number", token({ at: "now" })],
    ["signedOut at older than 10 s", signedOut({ at: NOW - 10_001 })],
  ])("rejects %s", (_name, raw) => {
    expect(parseAuthMessage(raw, NOW)).toBeNull();
  });
});

describe("createAuthChannel", () => {
  it("subscribe delivers only parsed messages; unsubscribe stops delivery; close closes the endpoint", async () => {
    const hub = createFakeChannelHub();
    const a = createAuthChannel({ create: () => hub.endpoint(), now: () => NOW });
    const b = createAuthChannel({ create: () => hub.endpoint(), now: () => NOW });
    const seen: unknown[] = [];
    const off = b.subscribe((m) => seen.push(m));
    a.post(signedOut() as never);
    a.post({ v: 1, type: "bogus" } as never);
    await Promise.resolve();
    expect(seen).toEqual([signedOut()]);
    off();
    a.post(signedOut() as never);
    await Promise.resolve();
    expect(seen).toHaveLength(1);
    const close = vi.fn();
    createAuthChannel({
      create: () => ({ ...hub.endpoint(), close }),
    }).close();
    expect(close).toHaveBeenCalledOnce();
  });

  it("create undefined or throwing -> post/subscribe/close are no-ops; postMessage throwing is swallowed", () => {
    for (const create of [
      () => undefined,
      () => {
        throw new Error("no channel");
      },
    ]) {
      const ch = createAuthChannel({ create });
      expect(() => {
        ch.post(signedOut() as never);
        ch.subscribe(() => {})();
        ch.close();
      }).not.toThrow();
    }
    const ch = createAuthChannel({
      create: () => ({
        ...createFakeChannelHub().endpoint(),
        postMessage: () => {
          throw new Error("closed");
        },
      }),
    });
    expect(() => ch.post(signedOut() as never)).not.toThrow();
  });
});
