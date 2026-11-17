// @vitest-environment node
import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { readJson } from "./http.js";

const servers: http.Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => {
      s.closeAllConnections();
      return new Promise((r) => s.close(r));
    }),
  );
});

async function serve(opts: Parameters<typeof readJson>[1]) {
  const server = http.createServer(async (req, res) => {
    const r = await readJson(req, opts);
    res.writeHead(r.ok ? 200 : r.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(r));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  return (server.address() as AddressInfo).port;
}

/** Sends the head and the start of the body, then stalls. */
function stalled(port: number) {
  return new Promise<string>((resolve) => {
    const s = net.connect(port, "127.0.0.1", () => {
      s.write(
        'POST / HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 20\r\n\r\n{"a":',
      );
    });
    let out = "";
    s.on("data", (d) => {
      out += d;
      if (out.includes("request_timeout") || out.includes("\r\n\r\n")) {
        s.destroy();
        resolve(out);
      }
    });
  });
}

const post = (port: number, body: string, headers: Record<string, string> = {}) =>
  fetch(`http://127.0.0.1:${port}`, { method: "POST", headers, body });

describe("readJson", () => {
  it("answers 408 request_timeout when the body goes idle and timeouts are set", async () => {
    const port = await serve({ timeouts: { totalMs: 5000, idleMs: 50 } });
    const out = await stalled(port);
    expect(out.startsWith("HTTP/1.1 408")).toBe(true);
  });

  it("answers 408 when the total time is exceeded", async () => {
    const port = await serve({ timeouts: { totalMs: 50, idleMs: 5000 } });
    expect((await stalled(port)).startsWith("HTTP/1.1 408")).toBe(true);
  });

  it("without timeouts a normal body parses and an over-limit body gives 413", async () => {
    const port = await serve({ limit: 10 });
    const json = { "Content-Type": "application/json" };
    const ok = await post(port, '{"a":1}', json);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, value: { a: 1 } });
    expect((await post(port, '{"a":"0123456789"}', json)).status).toBe(413);
  });

  it("a normal body also parses with timeouts set", async () => {
    const port = await serve({ timeouts: { totalMs: 5000, idleMs: 5000 } });
    const res = await post(port, '{"a":1}', { "Content-Type": "application/json" });
    expect(await res.json()).toEqual({ ok: true, value: { a: 1 } });
  });

  it("rejects other content types with 415 and bad JSON with 400", async () => {
    const port = await serve({});
    expect((await post(port, "x", { "Content-Type": "text/plain" })).status).toBe(415);
    expect((await post(port, "{", { "Content-Type": "application/json" })).status).toBe(400);
  });
});
