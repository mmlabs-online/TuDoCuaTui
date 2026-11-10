// @vitest-environment node
import { describe, expect, it } from "vitest";
import { corsHeaders, errorResponse, parseOrigins, readLimitedText } from "./http";

const allowed = parseOrigins(" https://a.example , http://localhost:8443 ,");

describe("http", () => {
  it("parses the origin list", () => {
    expect(allowed).toEqual(["https://a.example", "http://localhost:8443"]);
    expect(parseOrigins(undefined)).toEqual([]);
  });

  it("echoes an allowed origin and gives a foreign one nothing", () => {
    const h = corsHeaders("https://a.example", allowed);
    expect(h["Access-Control-Allow-Origin"]).toBe("https://a.example");
    expect(h.Vary).toBe("Origin");
    expect(h["Access-Control-Allow-Methods"]).toBe("POST, OPTIONS");
    expect(corsHeaders("https://evil.example", allowed)).toEqual({});
    expect(corsHeaders(null, allowed)).toEqual({});
  });

  it("error body is exactly {error:{code}}", async () => {
    const res = errorResponse("rate_limited", {});
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: { code: "rate_limited" } });
  });

  it("caps the body size", async () => {
    const post = (body: string) => new Request("http://x/", { method: "POST", body });
    expect(await readLimitedText(post("a".repeat(4096)))).toHaveLength(4096);
    expect(await readLimitedText(post("a".repeat(4097)))).toBeNull();
  });

  it("refuses by declared content-length", async () => {
    const req = new Request("http://x/", {
      method: "POST",
      body: "x",
      headers: { "content-length": "99999" },
    });
    expect(await readLimitedText(req)).toBeNull();
  });
});
