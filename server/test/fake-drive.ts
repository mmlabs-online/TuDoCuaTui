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

export type Recorded = { method: string; url: string; auth: string | undefined; body: Buffer };

export async function startFakeDrive() {
  const files = new Map<string, { bytes: Buffer; meta: Record<string, unknown> }>();
  const requests: Recorded[] = [];
  const hang = new Set<"upload" | "media">();
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
      if (req.headers.authorization !== `Bearer ${FAKE.accessToken}`) return json(401, {});
      if (req.method === "POST" && url.startsWith("/upload/drive/v3/files")) {
        if (hang.has("upload")) return;
        const boundary = /boundary=(.+)$/.exec(String(req.headers["content-type"]))?.[1] ?? "";
        const metaStart = body.indexOf("\r\n\r\n") + 4;
        const metaEnd = body.indexOf(`\r\n--${boundary}`, metaStart);
        const metaPart = body.subarray(metaStart, metaEnd).toString("utf8");
        const start = body.indexOf("\r\n\r\n", metaEnd) + 4;
        const bytes = body.subarray(start, body.length - `\r\n--${boundary}--`.length);
        const id = `fakefile${String(++next).padStart(8, "0")}`;
        const meta = JSON.parse(metaPart);
        files.set(id, { bytes, meta });
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
          files.delete(id);
          res.writeHead(204).end();
          return;
        }
        if (hang.has("media")) return;
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
