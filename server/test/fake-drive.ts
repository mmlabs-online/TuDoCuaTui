// A small fake Google token endpoint and Drive v3 API on node:http. Test fixture only (excluded from the image).
import http from "node:http";
import type { AddressInfo } from "node:net";

export const FAKE = {
  clientId: "fake-client.apps.googleusercontent.com",
  clientSecret: "fake-client-secret-not-real",
  refreshToken: "fake-refresh-token-not-real",
  folderId: "fakefolder0123456789",
  accessToken: "fake-access-token-not-real",
};

export const fakeConfig = {
  clientId: FAKE.clientId,
  clientSecret: FAKE.clientSecret,
  refreshToken: FAKE.refreshToken,
  folderId: FAKE.folderId,
};

export const fakeEnv = {
  GOOGLE_CLIENT_ID: FAKE.clientId,
  GOOGLE_CLIENT_SECRET: FAKE.clientSecret,
  GOOGLE_REFRESH_TOKEN: FAKE.refreshToken,
  DRIVE_FOLDER_ID: FAKE.folderId,
};

/** Put in every failure body, so tests can prove no Google text reaches logs or output. */
export const GOOGLE_TEXT_SENTINEL = "sentinel-google-error-text-not-real";

export type Recorded = { method: string; url: string; auth: string | undefined; body: Buffer };

export async function startFakeDrive() {
  const files = new Map<string, { bytes: Buffer; meta: Record<string, unknown> }>();
  const requests: Recorded[] = [];
  const hang = new Set<"upload" | "upload-after-store" | "media" | "stream-stall" | "list">();
  const fail = new Set<"upload" | "delete" | "media" | "list">();
  const modes = new Set<"list-ignore-tag">();
  const config = { listPageSize: 1000 };
  let next = 0;

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const url = req.url ?? "";
      requests.push({ method: req.method ?? "", url, auth: req.headers.authorization, body });
      const json = (status: number, v: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(v));
      };
      if (url === "/token") return json(200, { access_token: FAKE.accessToken, expires_in: 3600 });
      const backendError = () =>
        json(500, {
          error: { errors: [{ reason: "backendError" }], message: GOOGLE_TEXT_SENTINEL },
        });
      if (req.headers.authorization !== `Bearer ${FAKE.accessToken}`) return json(401, {});
      if (req.method === "GET" && url.startsWith("/drive/v3/files?q=")) {
        if (hang.has("list")) return;
        if (fail.has("list")) return backendError();
        const sp = new URL(url, "http://fake").searchParams;
        const m =
          /^'([A-Za-z0-9_-]+)' in parents and trashed = false and appProperties has \{ key='app' and value='tudo' \}$/.exec(
            sp.get("q") ?? "",
          );
        if (!m) return json(400, { error: { errors: [{ reason: "invalid" }] } });
        const size = Math.min(Number(sp.get("pageSize") ?? 1000), config.listPageSize);
        const token = sp.get("pageToken");
        const offset = token ? Number(Buffer.from(token, "base64url").toString()) : 0;
        if (!Number.isInteger(offset) || offset < 0) return json(400, {});
        const all = [...files.entries()].filter(
          ([, f]) =>
            (f.meta.parents as string[] | undefined)?.includes(m[1]) &&
            f.meta.trashed !== true &&
            (modes.has("list-ignore-tag") ||
              (f.meta.appProperties as Record<string, string> | undefined)?.app === "tudo"),
        );
        const page = all.slice(offset, offset + size);
        const out: Record<string, unknown> = {
          files: page.map(([id, f]) => ({
            id,
            createdTime: f.meta.createdTime,
            appProperties: f.meta.appProperties,
          })),
        };
        if (offset + size < all.length) {
          out.nextPageToken = Buffer.from(String(offset + size)).toString("base64url");
        }
        return json(200, out);
      }
      if (req.method === "POST" && url.startsWith("/upload/drive/v3/files")) {
        if (hang.has("upload")) return;
        if (fail.has("upload")) return backendError();
        const boundary = /boundary=(.+)$/.exec(String(req.headers["content-type"]))?.[1] ?? "";
        const metaStart = body.indexOf("\r\n\r\n") + 4;
        const metaEnd = body.indexOf(`\r\n--${boundary}`, metaStart);
        const metaPart = body.subarray(metaStart, metaEnd).toString("utf8");
        const start = body.indexOf("\r\n\r\n", metaEnd) + 4;
        const bytes = body.subarray(start, body.length - `\r\n--${boundary}--`.length);
        const id = `fakefile${String(++next).padStart(8, "0")}`;
        const meta = JSON.parse(metaPart);
        meta.createdTime ??= new Date().toISOString();
        files.set(id, { bytes, meta });
        if (hang.has("upload-after-store")) return; // stored, but the client never gets the answer
        return json(200, { id, size: String(bytes.length), mimeType: meta.mimeType });
      }
      const m = /^\/drive\/v3\/files\/([^?]+)(\?.*)?$/.exec(url);
      if (m) {
        const id = m[1];
        if (id === FAKE.folderId) {
          return json(200, { id, mimeType: "application/vnd.google-apps.folder", trashed: false });
        }
        const f = files.get(id);
        if (!f) return json(404, { error: { errors: [{ reason: "notFound" }] } });
        if (req.method === "DELETE") {
          if (fail.has("delete")) return backendError();
          files.delete(id);
          res.writeHead(204).end();
          return;
        }
        if (hang.has("media")) return;
        if (fail.has("media")) return backendError();
        if (hang.has("stream-stall")) {
          res.writeHead(200, { "content-type": "image/jpeg", "content-length": f.bytes.length });
          res.write(f.bytes.subarray(0, 4)); // headers and part of the body, then silence
          return;
        }
        res.writeHead(200, {
          "content-type": String(f.meta.mimeType),
          "content-length": f.bytes.length,
        });
        res.end(f.bytes);
        return;
      }
      json(404, {});
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    files,
    requests,
    hang,
    fail,
    modes,
    config,
    urls: {
      tokenUrl: `${base}/token`,
      apiBase: `${base}/drive/v3`,
      uploadBase: `${base}/upload/drive/v3`,
    },
    close: () => {
      server.closeAllConnections();
      return new Promise<void>((r) => server.close(() => r()));
    },
  };
}
