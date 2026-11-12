// @ts-check
// One-time Google Drive connect for TuDo photos (T-005.5, D27). Run on your own computer (Node 22):
//   node scripts/drive-connect.mjs --client-file <client_secret_....json> [--out <file>]
// It signs in through a loopback redirect (PKCE + state), finds or creates the `TuDoCuaTui` Drive folder and writes
// the four deploy secrets to a mode-600 dotenv file OUTSIDE any git work tree. Nothing secret is printed or logged.
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const FOLDER_NAME = "TuDoCuaTui";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const REPO = "mmlabs-online/deployment";
export const ENDPOINTS = {
  auth: "https://accounts.google.com/o/oauth2/v2/auth",
  token: "https://oauth2.googleapis.com/token",
  about: "https://www.googleapis.com/drive/v3/about",
  files: "https://www.googleapis.com/drive/v3/files",
};
const CLIENT_ID_RE = /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/;
const SECRET_RE = /^[A-Za-z0-9._-]+$/;
const TOKEN_RE = /^[A-Za-z0-9._/-]+$/;
const FOLDER_RE = /^[A-Za-z0-9_-]{10,200}$/;
const USAGE =
  "usage: node scripts/drive-connect.mjs --client-file <client_secret_....json> [--out <file>]";

/** A failure with a fixed, secret-free message. */
export class ConnectError extends Error {
  /** @param {string} message @param {number} [code] */
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

/** @param {string[]} argv @returns {{ clientFile: string, out: string | undefined }} */
export function parseArgs(argv) {
  /** @type {{ clientFile: string, out: string | undefined }} */
  const r = { clientFile: "", out: undefined };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const val = argv[i + 1];
    if ((flag !== "--client-file" && flag !== "--out") || !val || val.startsWith("--")) {
      throw new ConnectError(USAGE, 2);
    }
    if (flag === "--client-file") r.clientFile = val;
    else r.out = val;
  }
  if (!r.clientFile) throw new ConnectError(USAGE, 2);
  return r;
}

/** @param {string} file @returns {{ clientId: string, clientSecret: string }} */
export function readClient(file) {
  /** @type {any} */
  let j;
  try {
    j = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new ConnectError("cannot read the client JSON file", 2);
  }
  const c = j?.installed;
  if (!c || typeof c.client_id !== "string" || typeof c.client_secret !== "string") {
    throw new ConnectError(
      'the client JSON must be a "Desktop app" client (an "installed" key)',
      2,
    );
  }
  if (!CLIENT_ID_RE.test(c.client_id) || !SECRET_RE.test(c.client_secret)) {
    throw new ConnectError("the client id or secret in the JSON has an unexpected format", 2);
  }
  return { clientId: c.client_id, clientSecret: c.client_secret };
}

/** @returns {{ verifier: string, challenge: string }} */
export function pkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/**
 * @param {{ clientId: string, redirectUri: string, challenge: string, state: string, authEndpoint?: string }} p
 */
export function buildAuthUrl(p) {
  const u = new URL(p.authEndpoint ?? ENDPOINTS.auth);
  u.search = new URLSearchParams({
    response_type: "code",
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    code_challenge: p.challenge,
    code_challenge_method: "S256",
    state: p.state,
  }).toString();
  return u.toString();
}

/**
 * True when the path, or its nearest existing ancestor, sits inside a git work tree (a .git dir or file).
 * @param {string} target
 */
export function isInsideGitWorkTree(target) {
  let dir = path.resolve(target);
  while (!fs.existsSync(dir)) {
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  dir = fs.realpathSync(dir);
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) return true;
    const parent = path.dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

/**
 * Loopback listener on 127.0.0.1. Resolves with the auth code of the one valid callback.
 * @param {{ state: string, timeoutMs: number }} p
 * @returns {Promise<{ redirectUri: string, code: Promise<string> }>}
 */
export function startCallbackServer({ state, timeoutMs }) {
  return new Promise((resolveStart) => {
    /** @type {(c: string) => void} */
    let ok = () => {};
    /** @type {(e: Error) => void} */
    let fail = () => {};
    const code = new Promise((res, rej) => {
      ok = res;
      fail = rej;
    });
    code.catch(() => {});
    const server = http.createServer((req, res) => {
      const u = new URL(req.url ?? "/", "http://127.0.0.1");
      if (u.pathname !== "/") {
        res.writeHead(404).end();
        return;
      }
      const given = Buffer.from(u.searchParams.get("state") ?? "");
      const want = Buffer.from(state);
      const stateOk = given.length === want.length && crypto.timingSafeEqual(given, want);
      const error = u.searchParams.get("error");
      const c = u.searchParams.get("code");
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      if (!stateOk) {
        res.end("Rejected.");
        done(() =>
          fail(new ConnectError("the sign-in answer had the wrong state; nothing was done")),
        );
      } else if (error) {
        res.end("Cancelled.");
        const reason = /^[a-z_]+$/.test(error) ? error : "unknown";
        done(() => fail(new ConnectError(`Google returned the error: ${reason}`)));
      } else if (!c) {
        res.end("Rejected.");
        done(() => fail(new ConnectError("the sign-in answer had no code")));
      } else {
        res.end("Done, you can close this tab.");
        done(() => ok(c));
      }
    });
    const timer = setTimeout(
      () => done(() => fail(new ConnectError("timed out waiting for the sign-in"))),
      timeoutMs,
    );
    /** @param {() => void} f */
    function done(f) {
      clearTimeout(timer);
      server.close();
      server.closeAllConnections();
      f();
    }
    server.listen(0, "127.0.0.1", () => {
      const addr = /** @type {import("node:net").AddressInfo} */ (server.address());
      resolveStart({ redirectUri: `http://127.0.0.1:${addr.port}/`, code });
    });
  });
}

/** @param {Response} res @returns {Promise<any>} */
async function readJson(res) {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

/**
 * @param {typeof fetch} fetchFn
 * @param {typeof ENDPOINTS} endpoints
 * @param {{ clientId: string, clientSecret: string, code: string, verifier: string, redirectUri: string }} p
 */
export async function exchangeCode(fetchFn, endpoints, p) {
  const res = await fetchFn(endpoints.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: p.code,
      code_verifier: p.verifier,
      redirect_uri: p.redirectUri,
      client_id: p.clientId,
      client_secret: p.clientSecret,
    }).toString(),
  });
  const j = await readJson(res);
  if (!res.ok) {
    const e = typeof j?.error === "string" && /^[a-z_]+$/.test(j.error) ? j.error : "unknown";
    throw new ConnectError(`Google refused the code exchange (${e})`);
  }
  if (typeof j?.refresh_token !== "string" || typeof j?.access_token !== "string") {
    throw new ConnectError("Google returned no refresh token (revoke the app's access and retry)");
  }
  if (typeof j.scope !== "string" || !j.scope.split(" ").includes(SCOPE)) {
    throw new ConnectError("Google did not grant the drive.file scope");
  }
  return { accessToken: j.access_token, refreshToken: j.refresh_token };
}

/**
 * @param {typeof fetch} fetchFn
 * @param {typeof ENDPOINTS} endpoints
 * @param {string} accessToken
 * @param {(s: string) => void} warn
 */
export async function findOrCreateFolder(fetchFn, endpoints, accessToken, warn) {
  const headers = { authorization: `Bearer ${accessToken}` };
  const q = `name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`;
  const list = new URL(endpoints.files);
  list.search = new URLSearchParams({
    q,
    orderBy: "createdTime",
    fields: "files(id)",
    spaces: "drive",
  }).toString();
  const lr = await fetchFn(list.toString(), { headers });
  const lj = await readJson(lr);
  if (!lr.ok || !Array.isArray(lj?.files)) throw new ConnectError("Drive folder lookup failed");
  /** @type {string | undefined} */
  let id = lj.files[0]?.id;
  if (lj.files.length > 1) {
    warn(`warning: ${lj.files.length} folders named ${FOLDER_NAME} exist; using the oldest.`);
  }
  if (id === undefined) {
    const cr = await fetchFn(`${endpoints.files}?fields=id`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
    });
    const cj = await readJson(cr);
    if (!cr.ok) throw new ConnectError("Drive folder creation failed");
    id = cj?.id;
  }
  if (typeof id !== "string" || !FOLDER_RE.test(id)) {
    throw new ConnectError("Drive returned an unexpected folder id");
  }
  return id;
}

/**
 * @param {string} file
 * @param {{ clientId: string, clientSecret: string, refreshToken: string, folderId: string }} v
 */
export function writeSecretsFile(file, v) {
  if (!CLIENT_ID_RE.test(v.clientId) || !SECRET_RE.test(v.clientSecret)) {
    throw new ConnectError("the client id or secret has characters the deploy would reject");
  }
  if (!TOKEN_RE.test(v.refreshToken)) {
    throw new ConnectError("the refresh token has characters the deploy would reject");
  }
  if (!FOLDER_RE.test(v.folderId)) throw new ConnectError("the folder id is malformed");
  const target = path.resolve(file);
  if (isInsideGitWorkTree(target)) {
    throw new ConnectError("refusing to write the secrets file inside a git work tree", 2);
  }
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `.drive-secrets.${crypto.randomBytes(6).toString("hex")}.tmp`);
  const text =
    `TUDOCUATUI_GOOGLE_CLIENT_ID=${v.clientId}\n` +
    `TUDOCUATUI_GOOGLE_CLIENT_SECRET=${v.clientSecret}\n` +
    `TUDOCUATUI_GOOGLE_REFRESH_TOKEN=${v.refreshToken}\n` +
    `TUDOCUATUI_DRIVE_FOLDER_ID=${v.folderId}\n`;
  try {
    fs.writeFileSync(tmp, text, { flag: "wx", mode: 0o600 });
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, target);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  return target;
}

/**
 * @param {{
 *   argv: string[], fetch?: typeof fetch, out?: (s: string) => void, err?: (s: string) => void,
 *   endpoints?: typeof ENDPOINTS, timeoutMs?: number, homedir?: string, platform?: string,
 * }} opts
 * @returns {Promise<number>} exit code
 */
export async function run(opts) {
  const out = opts.out ?? ((s) => process.stdout.write(`${s}\n`));
  const err = opts.err ?? ((s) => process.stderr.write(`${s}\n`));
  const fetchFn = opts.fetch ?? fetch;
  const endpoints = opts.endpoints ?? ENDPOINTS;
  try {
    const args = parseArgs(opts.argv);
    const { clientId, clientSecret } = readClient(args.clientFile);
    const outFile = path.resolve(
      args.out ??
        path.join(opts.homedir ?? os.homedir(), ".config", "tudocuatui", "drive-secrets.env"),
    );
    if (isInsideGitWorkTree(outFile)) {
      throw new ConnectError("refusing to write the secrets file inside a git work tree", 2);
    }
    const { verifier, challenge } = pkce();
    const state = crypto.randomBytes(16).toString("base64url");
    const server = await startCallbackServer({ state, timeoutMs: opts.timeoutMs ?? 300_000 });
    out("Open this URL in a browser and sign in with the Google account that owns the photos:");
    out(
      buildAuthUrl({
        clientId,
        redirectUri: server.redirectUri,
        challenge,
        state,
        authEndpoint: endpoints.auth,
      }),
    );
    const code = await server.code;
    const { accessToken, refreshToken } = await exchangeCode(fetchFn, endpoints, {
      clientId,
      clientSecret,
      code,
      verifier,
      redirectUri: server.redirectUri,
    });
    const about = await fetchFn(`${endpoints.about}?fields=user(emailAddress)`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const email = (await readJson(about))?.user?.emailAddress;
    if (!about.ok || typeof email !== "string")
      throw new ConnectError("Drive account lookup failed");
    out(`Signed in as: ${email}`);
    const folderId = await findOrCreateFolder(fetchFn, endpoints, accessToken, err);
    const written = writeSecretsFile(outFile, { clientId, clientSecret, refreshToken, folderId });
    out(`Drive folder id: ${folderId}`);
    out(`Secrets file: ${written}`);
    if ((opts.platform ?? process.platform) === "win32") {
      out(
        "Note: Windows does not enforce the file mode; delete the file as soon as the next step is done.",
      );
    }
    out("Next, set the deploy secrets:");
    out(`  gh secret set -f "${written}" -R ${REPO}`);
    out(`Check: gh secret list -R ${REPO}`);
    out("Then delete the secrets file and the client JSON.");
    return 0;
  } catch (e) {
    err(e instanceof ConnectError ? `error: ${e.message}` : "error: unexpected failure");
    return e instanceof ConnectError ? e.code : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run({ argv: process.argv.slice(2) });
}
