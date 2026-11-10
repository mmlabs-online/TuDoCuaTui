// @ts-check
// Serves the built SPA from dist/ with the caching rules nginx used (docker/nginx.conf, T-007).
import fs from "node:fs";
import path from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};

/** @param {string} file */
export function mimeFor(file) {
  return (
    /** @type {Record<string, string>} */ (MIME)[path.extname(file).toLowerCase()] ??
    "application/octet-stream"
  );
}

/**
 * Maps a URL path to a regular file strictly inside distDir.
 * @param {string} distDir absolute path
 * @param {string} rawPath URL path without query string
 * @returns {Promise<{ file: string } | { notFound: true } | { bad: true }>}
 */
export async function resolveStaticPath(distDir, rawPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return { bad: true };
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return { bad: true };
  if (decoded.split("/").some((seg) => seg.startsWith("."))) return { notFound: true };
  const root = path.resolve(distDir);
  const file = path.resolve(root, "." + (decoded.startsWith("/") ? decoded : "/" + decoded));
  if (file !== root && !file.startsWith(root + path.sep)) return { notFound: true };
  try {
    const st = await fs.promises.stat(file);
    return st.isFile() ? { file } : { notFound: true };
  } catch {
    return { notFound: true };
  }
}

/** @param {string} urlPath @param {string} file */
function cacheControlFor(urlPath, file) {
  if (urlPath.startsWith("/assets/")) return "public, max-age=31536000, immutable";
  const base = path.basename(file);
  if (base === "index.html" || base === "version.txt") return "no-cache";
  return undefined;
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {string} distDir
 * @param {string} urlPath
 */
export async function serveStatic(req, res, distDir, urlPath) {
  const resolved = await resolveStaticPath(distDir, urlPath);
  /** @type {string | undefined} */
  let file;
  let cacheTarget = urlPath;
  if ("file" in resolved) {
    file = resolved.file;
  } else if (urlPath.startsWith("/assets/")) {
    return notFound(res);
  } else {
    const index = await resolveStaticPath(distDir, "/index.html");
    if (!("file" in index)) return notFound(res);
    file = index.file;
    cacheTarget = "/index.html";
  }
  const size = (await fs.promises.stat(file)).size;
  /** @type {Record<string, string | number>} */
  const headers = { "Content-Type": mimeFor(file), "Content-Length": size };
  const cc = cacheControlFor(cacheTarget, file);
  if (cc) headers["Cache-Control"] = cc;
  res.writeHead(200, headers);
  if (req.method === "HEAD") return void res.end();
  const stream = fs.createReadStream(file);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

/** @param {import("node:http").ServerResponse} res */
function notFound(res) {
  const body = "Not found";
  res.writeHead(404, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": body.length,
  });
  res.end(body);
}
