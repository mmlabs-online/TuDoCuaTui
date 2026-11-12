// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  createDriveClient,
  DriveConfigError,
  DriveError,
  loadDriveConfig,
  taggedFilesQuery,
} from "./drive.js";
import { FAKE, fakeConfig, fakeEnv } from "./test/fake-drive.js";

type Step = { status: number; body?: unknown; headers?: Record<string, string> } | Error;
const TOKEN_OK: Step = { status: 200, body: { access_token: "fake-access-A", expires_in: 3600 } };
const ID = "fakefile00000001";

function setup(steps: Step[], extra: Record<string, unknown> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const logs: Record<string, unknown>[] = [];
  const sleeps: number[] = [];
  let clock = 1_000_000;
  const fetchStub = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const s = steps.shift();
    if (!s) throw new Error("unscripted request");
    if (s instanceof Error) throw s;
    const raw =
      typeof s.body === "string" ? s.body : s.body === undefined ? "" : JSON.stringify(s.body);
    return new Response(s.status === 204 ? null : raw, { status: s.status, headers: s.headers });
  };
  const drive = createDriveClient({
    config: fakeConfig,
    fetch: fetchStub as unknown as typeof fetch,
    now: () => clock,
    sleep: async (ms) => void sleeps.push(ms),
    random: () => 0,
    log: (e) => logs.push(e),
    ...extra,
  });
  return { drive, calls, logs, sleeps, advance: (ms: number) => (clock += ms) };
}

const fail = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as DriveError;
  }
  throw new Error("expected rejection");
};
const auth = (c: { init: RequestInit }) => (c.init.headers as Record<string, string>).authorization;

describe("loadDriveConfig", () => {
  it("all four unset or empty -> off", () => {
    expect(loadDriveConfig({})).toEqual({ mode: "off" });
    const empty = {
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      GOOGLE_REFRESH_TOKEN: "",
      DRIVE_FOLDER_ID: "",
    };
    expect(loadDriveConfig(empty)).toEqual({ mode: "off" });
  });

  it("all set and valid -> on", () => {
    expect(loadDriveConfig(fakeEnv)).toEqual({ mode: "on", ...fakeConfig });
  });

  it("malformed client id, folder id or whitespace -> DriveConfigError naming the variable only", () => {
    const cases: [Record<string, string>, string][] = [
      [{ GOOGLE_CLIENT_ID: "plain-id" }, "GOOGLE_CLIENT_ID"],
      [{ DRIVE_FOLDER_ID: "short" }, "DRIVE_FOLDER_ID"],
      [{ DRIVE_FOLDER_ID: "has/slash0123456789" }, "DRIVE_FOLDER_ID"],
      [{ GOOGLE_CLIENT_SECRET: "has space" }, "GOOGLE_CLIENT_SECRET"],
      [{ GOOGLE_REFRESH_TOKEN: "line\nbreak" }, "GOOGLE_REFRESH_TOKEN"],
      [{ GOOGLE_CLIENT_ID: "bad id.apps.googleusercontent.com" }, "GOOGLE_CLIENT_ID"],
    ];
    for (const [patch, name] of cases) {
      const env = { ...fakeEnv, ...patch };
      let msg = "";
      try {
        loadDriveConfig(env);
      } catch (e) {
        expect(e).toBeInstanceOf(DriveConfigError);
        msg = (e as Error).message;
      }
      expect(msg).toContain(name);
      for (const v of Object.values(env)) expect(msg).not.toContain(v);
    }
  });

  it("1, 2 or 3 of 4 set -> DriveConfigError naming the missing variables, never a value", () => {
    const names = Object.keys(fakeEnv) as (keyof typeof fakeEnv)[];
    for (let mask = 1; mask < 15; mask++) {
      const env: Record<string, string> = {};
      names.forEach((n, i) => {
        if (mask & (1 << i)) env[n] = fakeEnv[n];
      });
      let msg = "";
      try {
        loadDriveConfig(env);
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).not.toBe("");
      names.forEach((n, i) => {
        expect(msg.includes(n)).toBe(!(mask & (1 << i)));
        expect(msg).not.toContain(fakeEnv[n]);
      });
    }
  });
});

describe("token", () => {
  it("form POST with grant_type=refresh_token; the secret is only in the body", async () => {
    const { drive, calls } = setup([TOKEN_OK, { status: 204 }]);
    await drive.deleteFile(ID);
    const t = calls[0];
    expect(t.url).not.toContain(FAKE.clientSecret);
    expect(t.url).not.toContain(FAKE.refreshToken);
    const form = new URLSearchParams(String(t.init.body));
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("client_secret")).toBe(FAKE.clientSecret);
    expect(form.get("refresh_token")).toBe(FAKE.refreshToken);
    expect(form.get("client_id")).toBe(FAKE.clientId);
    expect(auth(calls[1])).toBe("Bearer fake-access-A");
  });

  it("cached until expires_in - 60 s, refreshed after", async () => {
    const { drive, calls, advance } = setup([
      TOKEN_OK,
      { status: 204 },
      { status: 204 },
      { status: 200, body: { access_token: "fake-access-B", expires_in: 3600 } },
      { status: 204 },
    ]);
    await drive.deleteFile(ID);
    advance(3539 * 1000);
    await drive.deleteFile(ID);
    expect(calls).toHaveLength(3);
    advance(2000);
    await drive.deleteFile(ID);
    expect(calls).toHaveLength(5);
    expect(auth(calls[4])).toBe("Bearer fake-access-B");
  });

  it("concurrent calls share one in-flight refresh", async () => {
    const { drive, calls } = setup([TOKEN_OK, { status: 204 }, { status: 204 }]);
    await Promise.all([drive.deleteFile(ID), drive.deleteFile(ID)]);
    expect(calls.filter((c) => c.url.includes("token"))).toHaveLength(1);
  });

  it("a failed refresh clears the in-flight promise; the next call retries", async () => {
    const { drive } = setup([{ status: 200, body: { nope: true } }, TOKEN_OK, { status: 204 }]);
    expect((await fail(drive.deleteFile(ID))).code).toBe("drive_bad_response");
    await drive.deleteFile(ID);
  });

  it("invalid_grant -> drive_auth without retry; no new token request for 60 s", async () => {
    for (const error of ["invalid_grant", "invalid_client", "unauthorized_client"]) {
      const { drive, calls, advance } = setup([
        { status: 400, body: { error } },
        TOKEN_OK,
        { status: 204 },
      ]);
      expect((await fail(drive.deleteFile(ID))).code).toBe("drive_auth");
      expect(calls).toHaveLength(1);
      expect((await fail(drive.deleteFile(ID))).code).toBe("drive_auth");
      expect(calls).toHaveLength(1);
      advance(61_000);
      await drive.deleteFile(ID);
      expect(calls).toHaveLength(3);
    }
  });

  it("another 4xx is drive_auth without a cooldown", async () => {
    const { drive, calls } = setup([{ status: 400, body: "<html>" }, TOKEN_OK, { status: 204 }]);
    expect((await fail(drive.deleteFile(ID))).code).toBe("drive_auth");
    await drive.deleteFile(ID);
    expect(calls).toHaveLength(3);
  });

  it("5xx or network error is retried, then drive_unavailable; 429 ends as drive_rate_limited", async () => {
    const a = setup([{ status: 503 }, new Error("boom"), { status: 500 }]);
    expect((await fail(a.drive.deleteFile(ID))).code).toBe("drive_unavailable");
    expect(a.calls).toHaveLength(3);
    expect(a.sleeps).toEqual([500, 1000]);
    const b = setup([{ status: 503 }, TOKEN_OK, { status: 204 }]);
    await b.drive.deleteFile(ID);
    const c = setup([{ status: 429 }, { status: 429 }, { status: 429 }]);
    expect((await fail(c.drive.deleteFile(ID))).code).toBe("drive_rate_limited");
  });

  it("a 2xx token reply without JSON is drive_bad_response; expires_in defaults to 3600", async () => {
    const a = setup([{ status: 200, body: "not json" }]);
    expect((await fail(a.drive.deleteFile(ID))).code).toBe("drive_bad_response");
    const b = setup([
      { status: 200, body: { access_token: "fake-access-C" } },
      { status: 204 },
      { status: 204 },
    ]);
    await b.drive.deleteFile(ID);
    await b.drive.deleteFile(ID);
    expect(b.calls).toHaveLength(3);
  });
});

describe("requests and error mapping", () => {
  it("401 drops the cached token, refreshes once and retries once; a second 401 -> drive_auth", async () => {
    const a = setup([
      TOKEN_OK,
      { status: 401 },
      { status: 200, body: { access_token: "fake-access-B", expires_in: 3600 } },
      { status: 204 },
    ]);
    await a.drive.deleteFile(ID);
    expect(auth(a.calls[3])).toBe("Bearer fake-access-B");
    const b = setup([TOKEN_OK, { status: 401 }, TOKEN_OK, { status: 401 }]);
    expect((await fail(b.drive.deleteFile(ID))).code).toBe("drive_auth");
    expect(b.calls).toHaveLength(4);
  });

  it("429 and 403 rate limits retry with backoff; Retry-After is honoured and capped at 10 s", async () => {
    const a = setup([
      TOKEN_OK,
      { status: 429, headers: { "retry-after": "3" } },
      {
        status: 403,
        body: { error: { errors: [{ reason: "userRateLimitExceeded" }] } },
        headers: { "retry-after": "99" },
      },
      { status: 204 },
    ]);
    await a.drive.deleteFile(ID);
    expect(a.sleeps).toEqual([3000, 10_000]);
    const b = setup([
      TOKEN_OK,
      { status: 403, body: { error: { errors: [{ reason: "rateLimitExceeded" }] } } },
      { status: 403, body: { error: { errors: [{ reason: "rateLimitExceeded" }] } } },
      { status: 403, body: { error: { errors: [{ reason: "rateLimitExceeded" }] } } },
    ]);
    const err = await fail(b.drive.deleteFile(ID));
    expect(err.code).toBe("drive_rate_limited");
    expect(err.status).toBe(403);
    expect(b.sleeps).toEqual([500, 1000]);
  });

  it("500/502/503/504 give up after 3 attempts with drive_unavailable", async () => {
    const a = setup([TOKEN_OK, { status: 500 }, { status: 502 }, { status: 504 }]);
    expect((await fail(a.drive.deleteFile(ID))).code).toBe("drive_unavailable");
    expect(a.calls).toHaveLength(4);
  });

  it("network errors on a retried call are retried; an aborted caller is not", async () => {
    const a = setup([TOKEN_OK, new Error("reset"), { status: 204 }]);
    await a.drive.deleteFile(ID);
    const ctl = new AbortController();
    ctl.abort();
    const b = setup([TOKEN_OK, new Error("aborted"), { status: 204 }]);
    expect((await fail(b.drive.getMedia(ID, { signal: ctl.signal }))).code).toBe(
      "drive_unavailable",
    );
    expect(b.calls).toHaveLength(2);
  });

  it("403 for another reason -> drive_forbidden, no retry", async () => {
    for (const reason of ["insufficientFilePermissions", "storageQuotaExceeded", "somethingNew"]) {
      const { drive, calls, logs } = setup([
        TOKEN_OK,
        { status: 403, body: { error: { errors: [{ reason }] } } },
      ]);
      expect((await fail(drive.deleteFile(ID))).code).toBe("drive_forbidden");
      expect(calls).toHaveLength(2);
      expect(logs[0].reason).toBe(reason === "somethingNew" ? "other" : reason);
    }
  });

  it("404 -> drive_not_found; deleteFile 404 resolves; DELETE is permanent (files/{id})", async () => {
    const a = setup([TOKEN_OK, { status: 404 }]);
    expect((await fail(a.drive.getMedia(ID))).code).toBe("drive_not_found");
    const b = setup([TOKEN_OK, { status: 404 }]);
    await b.drive.deleteFile(ID);
    expect(b.calls[1].init.method).toBe("DELETE");
    expect(b.calls[1].url).toBe(`https://www.googleapis.com/drive/v3/files/${ID}`);
    const c = setup([TOKEN_OK, { status: 403, body: "x" }]);
    expect((await fail(c.drive.deleteFile(ID))).code).toBe("drive_forbidden");
    const d = setup([TOKEN_OK, { status: 400 }]);
    expect((await fail(d.drive.deleteFile(ID))).code).toBe("drive_bad_response");
  });

  it("file id validation: bad ids -> drive_invalid_id without any request (also for deleteFile)", async () => {
    const { drive, calls } = setup([]);
    for (const id of [
      "a/b0123456789",
      "..0123456789",
      "x?y0123456789",
      "%2e%2e0123456789",
      "short",
      "x".repeat(201),
    ]) {
      expect((await fail(drive.getMedia(id))).code).toBe("drive_invalid_id");
      expect((await fail(drive.deleteFile(id))).code).toBe("drive_invalid_id");
    }
    expect(calls).toHaveLength(0);
  });

  it("redirects: manual on token/meta/create/delete (307 fails, one request), follow on media", async () => {
    const t = setup([{ status: 307, headers: { location: "https://evil.example/" } }]);
    expect((await fail(t.drive.deleteFile(ID))).code).toBe("drive_bad_response");
    expect(t.calls).toHaveLength(1);
    expect(t.calls[0].init.redirect).toBe("manual");
    const d = setup([TOKEN_OK, { status: 307, headers: { location: "https://evil.example/" } }]);
    expect((await fail(d.drive.deleteFile(ID))).code).toBe("drive_bad_response");
    expect(d.calls).toHaveLength(2);
    expect(d.calls[1].init.redirect).toBe("manual");
    const m = setup([TOKEN_OK, { status: 200, body: "x" }]);
    await m.drive.getMedia(ID);
    expect(m.calls[0].init.redirect).toBe("manual");
    expect(m.calls[1].init.redirect).toBe("follow");
  });

  it("failed streaming attempts remove their abort listener; a handed-over stream keeps it", async () => {
    const ctl = new AbortController();
    const added = vi.spyOn(ctl.signal, "addEventListener");
    const removed = vi.spyOn(ctl.signal, "removeEventListener");
    const { drive } = setup([
      TOKEN_OK,
      { status: 500 },
      { status: 200, body: "abc", headers: { "content-length": "3" } },
    ]);
    const m = await drive.getMedia(ID, { signal: ctl.signal });
    expect(added).toHaveBeenCalledTimes(2);
    expect(removed).toHaveBeenCalledTimes(1);
    expect(await new Response(m.body).text()).toBe("abc");
  });

  it("getMedia returns the body stream, content type and length", async () => {
    const { drive } = setup([
      TOKEN_OK,
      {
        status: 200,
        body: "abc",
        headers: { "content-type": "image/jpeg", "content-length": "3" },
      },
    ]);
    const m = await drive.getMedia(ID);
    expect(m.contentType).toBe("image/jpeg");
    expect(m.contentLength).toBe(3);
    expect(await new Response(m.body).text()).toBe("abc");
  });

  it("getMedia asks Drive for an identity encoding so Content-Length matches the bytes", async () => {
    const m = setup([TOKEN_OK, { status: 200, body: "abc", headers: { "content-length": "3" } }]);
    await m.drive.getMedia(ID);
    expect(new Headers(m.calls[1].init.headers).get("accept-encoding")).toBe("identity");
  });

  it("getMedia without a body is drive_bad_response", async () => {
    const { drive } = setup([TOKEN_OK, { status: 204 }]);
    expect((await fail(drive.getMedia(ID))).code).toBe("drive_bad_response");
  });
});

describe("createFile", () => {
  const f = {
    name: "a.jpg",
    mimeType: "image/jpeg",
    bytes: new Uint8Array([1, 2, 3, 255]),
    appProperties: { itemId: "x" },
  };

  it("multipart/related body: random boundary, JSON part with parents and appProperties, then the bytes", async () => {
    const reply: Step = {
      status: 200,
      body: { id: "newid0123456789", size: "4", mimeType: "image/jpeg" },
    };
    const { drive, calls } = setup([TOKEN_OK, reply, reply]);
    expect(await drive.createFile(f)).toEqual({
      id: "newid0123456789",
      size: 4,
      mimeType: "image/jpeg",
    });
    await drive.createFile(f);
    const c = calls[1];
    expect(c.url).toBe(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,size,mimeType",
    );
    const ct = (c.init.headers as Record<string, string>)["content-type"];
    const boundary = /^multipart\/related; boundary=(tudo[0-9a-f]{24})$/.exec(ct)?.[1];
    expect(boundary).toBeTruthy();
    const body = Buffer.from(c.init.body as Uint8Array);
    const text = body.toString("latin1");
    expect(
      text.startsWith(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    ).toBe(true);
    const meta = JSON.parse(text.split("\r\n\r\n")[1].split("\r\n--")[0]);
    expect(meta).toEqual({
      name: "a.jpg",
      mimeType: "image/jpeg",
      parents: [FAKE.folderId],
      appProperties: { itemId: "x" },
    });
    expect(
      body.subarray(body.length - 4 - `\r\n--${boundary}--`.length).toString("latin1"),
    ).toContain("ÿ");
    expect(text.endsWith(`\r\n--${boundary}--`)).toBe(true);
    expect((calls[2].init.headers as Record<string, string>)["content-type"]).not.toBe(ct);
  });

  it("exactly one request on 5xx or network error; 401 still gets one refresh and retry", async () => {
    const a = setup([TOKEN_OK, { status: 503 }]);
    expect((await fail(a.drive.createFile(f))).code).toBe("drive_unavailable");
    expect(a.calls).toHaveLength(2);
    const b = setup([TOKEN_OK, new Error("reset")]);
    expect((await fail(b.drive.createFile(f))).code).toBe("drive_unavailable");
    expect(b.calls).toHaveLength(2);
    const c = setup([
      TOKEN_OK,
      { status: 401 },
      TOKEN_OK,
      { status: 200, body: { id: "newid0123456789" } },
    ]);
    expect((await c.drive.createFile(f)).id).toBe("newid0123456789");
    const d = setup([TOKEN_OK, { status: 429 }]);
    expect((await fail(d.drive.createFile(f))).code).toBe("drive_rate_limited");
    expect(d.calls).toHaveLength(2);
  });

  it("more than 5 MB -> drive_too_large without any request; a bad mime type is refused", async () => {
    const { drive, calls } = setup([]);
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    expect((await fail(drive.createFile({ ...f, bytes: big }))).code).toBe("drive_too_large");
    expect((await fail(drive.createFile({ ...f, mimeType: "a\r\nb" }))).code).toBe(
      "drive_bad_response",
    );
    expect(calls).toHaveLength(0);
  });

  it("2xx with a non-JSON body or no id -> drive_bad_response", async () => {
    const a = setup([TOKEN_OK, { status: 200, body: "<html>" }]);
    expect((await fail(a.drive.createFile(f))).code).toBe("drive_bad_response");
    const b = setup([TOKEN_OK, { status: 200, body: { size: "1" } }]);
    expect((await fail(b.drive.createFile(f))).code).toBe("drive_bad_response");
  });

  it("an id that fails the file id check (short, path-like) -> drive_bad_response", async () => {
    for (const id of ["short", "a/b0123456789", "../etc/passwd", "x".repeat(201)]) {
      const a = setup([TOKEN_OK, { status: 200, body: { id } }]);
      expect((await fail(a.drive.createFile(f))).code).toBe("drive_bad_response");
    }
  });

  it("a 307 on create fails without a second upload request", async () => {
    const a = setup([TOKEN_OK, { status: 307, headers: { location: "https://evil.example/" } }]);
    expect((await fail(a.drive.createFile(f))).code).toBe("drive_bad_response");
    expect(a.calls).toHaveLength(2);
    expect(a.calls[1].init.redirect).toBe("manual");
  });
});

describe("checkFolder", () => {
  it("ok for a live folder", async () => {
    const { drive, calls } = setup([
      TOKEN_OK,
      {
        status: 200,
        body: { id: "x", mimeType: "application/vnd.google-apps.folder", trashed: false },
      },
    ]);
    await drive.checkFolder();
    expect(calls[1].url).toContain(`/files/${FAKE.folderId}?fields=id,mimeType,trashed`);
  });

  it("not a folder, trashed or 404 -> drive_folder_not_found; other errors pass through", async () => {
    const bodies = [
      { mimeType: "image/jpeg" },
      { mimeType: "application/vnd.google-apps.folder", trashed: true },
    ];
    for (const body of bodies) {
      const { drive } = setup([TOKEN_OK, { status: 200, body }]);
      expect((await fail(drive.checkFolder())).code).toBe("drive_folder_not_found");
    }
    const a = setup([TOKEN_OK, { status: 404 }]);
    expect((await fail(a.drive.checkFolder())).code).toBe("drive_folder_not_found");
    const b = setup([TOKEN_OK, { status: 403 }]);
    expect((await fail(b.drive.checkFolder())).code).toBe("drive_forbidden");
    const c = setup([TOKEN_OK, { status: 200, body: "nope" }]);
    expect((await fail(c.drive.checkFolder())).code).toBe("drive_bad_response");
  });
});

describe("logging and redaction", () => {
  it("log entries hold only event, op, status, code and an allowlisted reason", async () => {
    const { drive, logs } = setup([
      TOKEN_OK,
      {
        status: 403,
        body: { error: { errors: [{ reason: "tellMeSecrets-xyz" }], message: "leak" } },
      },
    ]);
    await fail(drive.deleteFile(ID));
    expect(logs).toEqual([
      { event: "drive", op: "delete", status: 403, code: "drive_forbidden", reason: "other" },
    ]);
  });

  it("no error path leaks the client secret, refresh token or access token", async () => {
    const leak = {
      error: "invalid_grant",
      error_description: `${FAKE.clientSecret} ${FAKE.refreshToken}`,
    };
    const scenarios: [Step[], (d: ReturnType<typeof setup>["drive"]) => Promise<unknown>][] = [
      [[{ status: 400, body: leak }], (d) => d.deleteFile(ID)],
      [
        [
          { status: 500, body: leak },
          { status: 500, body: leak },
          { status: 500, body: leak },
        ],
        (d) => d.deleteFile(ID),
      ],
      [
        [new Error(FAKE.refreshToken), new Error(FAKE.clientSecret), new Error("x")],
        (d) => d.deleteFile(ID),
      ],
      [
        [TOKEN_OK, { status: 401, body: leak }, TOKEN_OK, { status: 401, body: leak }],
        (d) => d.deleteFile(ID),
      ],
      [[TOKEN_OK, { status: 403, body: leak }], (d) => d.deleteFile(ID)],
      [
        [TOKEN_OK, { status: 500, body: leak }],
        (d) => d.createFile({ name: "a", mimeType: "image/jpeg", bytes: new Uint8Array(1) }),
      ],
      [[TOKEN_OK, { status: 404, body: leak }], (d) => d.getMedia(ID)],
      [
        [TOKEN_OK, new Error("fake-access-A")],
        (d) => d.createFile({ name: "a", mimeType: "image/jpeg", bytes: new Uint8Array(1) }),
      ],
    ];
    for (const [steps, run] of scenarios) {
      const { drive, logs } = setup(steps);
      const err = await fail(run(drive));
      expect(err).toBeInstanceOf(DriveError);
      expect("cause" in err).toBe(false);
      const all = [JSON.stringify(err), String(err), err.stack ?? "", JSON.stringify(logs)].join(
        "\n",
      );
      for (const secret of [FAKE.clientSecret, FAKE.refreshToken, "fake-access-A"])
        expect(all).not.toContain(secret);
    }
  });
});

describe("listFiles and taggedFilesQuery", () => {
  const Q = taggedFilesQuery(fakeConfig.folderId);
  const FILE = {
    id: "fakefile00000002",
    createdTime: "2026-03-04T05:00:00.000Z",
    appProperties: { app: "tudo", photoId: "p" },
  };

  it("taggedFilesQuery builds the folder + trashed + app=tudo query", () => {
    expect(Q).toBe(
      `'${fakeConfig.folderId}' in parents and trashed = false and appProperties has { key='app' and value='tudo' }`,
    );
    expect(() => taggedFilesQuery("bad'id")).toThrow(DriveError);
  });

  it("listFiles sends q, fields, pageSize=1000 and pageToken; returns files and nextPageToken", async () => {
    const { drive, calls } = setup([
      TOKEN_OK,
      { status: 200, body: { files: [FILE, { id: "fakefile00000003" }], nextPageToken: "tok" } },
    ]);
    const r = await drive.listFiles({ q: Q, pageToken: "prev" });
    const u = new URL(calls[1].url);
    expect(u.origin + u.pathname).toBe("https://www.googleapis.com/drive/v3/files");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      q: Q,
      fields: "nextPageToken,files(id,createdTime,appProperties)",
      pageSize: "1000",
      spaces: "drive",
      pageToken: "prev",
    });
    expect(calls[1].init.method).toBe("GET");
    expect(r.nextPageToken).toBe("tok");
    expect(r.files).toEqual([
      { id: FILE.id, createdTime: Date.parse(FILE.createdTime), appProperties: FILE.appProperties },
      { id: "fakefile00000003", createdTime: null, appProperties: {} },
    ]);
  });

  it("listFiles without nextPageToken returns nextPageToken undefined; no pageToken param", async () => {
    const { drive, calls } = setup([TOKEN_OK, { status: 200, body: { files: [] } }]);
    const r = await drive.listFiles({ q: Q });
    expect(r).toEqual({ files: [], nextPageToken: undefined });
    expect(new URL(calls[1].url).searchParams.has("pageToken")).toBe(false);
  });

  it("listFiles keeps appProperties only when it is a plain object of strings; bad createdTime is null", async () => {
    const { drive } = setup([
      TOKEN_OK,
      {
        status: 200,
        body: {
          files: [
            { id: "fakefile00000004", createdTime: "nope", appProperties: { a: 1 } },
            { id: "fakefile00000005", createdTime: 5, appProperties: ["x"] },
          ],
        },
      },
    ]);
    const r = await drive.listFiles({ q: Q });
    expect(r.files.map((f) => [f.createdTime, f.appProperties])).toEqual([
      [null, {}],
      [null, {}],
    ]);
  });

  it("listFiles retries 5xx up to 3 attempts, refreshes once on 401", async () => {
    const a = setup([TOKEN_OK, { status: 500 }, { status: 503 }, { status: 502 }]);
    expect((await fail(a.drive.listFiles({ q: Q }))).code).toBe("drive_unavailable");
    expect(a.calls).toHaveLength(4);
    const b = setup([TOKEN_OK, { status: 401 }, TOKEN_OK, { status: 200, body: { files: [] } }]);
    await b.drive.listFiles({ q: Q });
    expect(b.calls).toHaveLength(4);
  });

  it("listFiles 3xx -> drive_bad_response after one request (redirect manual)", async () => {
    const d = setup([TOKEN_OK, { status: 307, headers: { location: "https://evil.example/" } }]);
    expect((await fail(d.drive.listFiles({ q: Q }))).code).toBe("drive_bad_response");
    expect(d.calls).toHaveLength(2);
    expect(d.calls[1].init.redirect).toBe("manual");
  });

  it("listFiles 400 -> drive_bad_response; 403 -> drive_forbidden; 429 -> drive_rate_limited", async () => {
    const a = setup([TOKEN_OK, { status: 400 }]);
    expect((await fail(a.drive.listFiles({ q: Q }))).code).toBe("drive_bad_response");
    const b = setup([TOKEN_OK, { status: 403 }]);
    expect((await fail(b.drive.listFiles({ q: Q }))).code).toBe("drive_forbidden");
    const c = setup([TOKEN_OK, { status: 429 }, { status: 429 }, { status: 429 }]);
    expect((await fail(c.drive.listFiles({ q: Q }))).code).toBe("drive_rate_limited");
  });

  it("listFiles malformed body (not JSON, files not an array, bad file id, bad nextPageToken) -> drive_bad_response", async () => {
    const bodies: unknown[] = [
      "not json",
      { files: {} },
      {},
      { files: [{ id: "a/b" }] },
      { files: [{}] },
      { files: [], nextPageToken: "" },
      { files: [], nextPageToken: 7 },
      { files: [], nextPageToken: "x".repeat(4097) },
    ];
    for (const body of bodies) {
      const { drive } = setup([TOKEN_OK, { status: 200, body }]);
      expect((await fail(drive.listFiles({ q: Q }))).code).toBe("drive_bad_response");
    }
  });

  it("listFiles errors carry only a code and log only {event, op, status, code, reason}", async () => {
    const { drive, logs } = setup([
      TOKEN_OK,
      {
        status: 403,
        body: { error: { errors: [{ reason: "tellMeSecrets-xyz" }], message: "leak-text" } },
      },
    ]);
    const err = await fail(drive.listFiles({ q: Q }));
    expect(JSON.stringify(err) + String(err)).not.toContain("leak-text");
    expect(logs).toEqual([
      { event: "drive", op: "list", status: 403, code: "drive_forbidden", reason: "other" },
    ]);
  });
});
