// @ts-check
// Entry point: node server/index.js. Exit codes: 0 clean stop, 1 runtime failure, 2 configuration error.
// Logs fixed lines only; never DATABASE_URL, tokens or whole error objects.
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AccessConfigError, createAccessVerifier, loadAccessConfig } from "./access.js";
import { createApp } from "./app.js";
import { createPool } from "./db.js";
import { createDriveClient, DriveConfigError, loadDriveConfig } from "./drive.js";

/** @param {Record<string, unknown>} entry */
const log = (entry) => console.log(JSON.stringify(entry));

/** @param {unknown} err */
const fatal = (err) => {
  console.error(
    `fatal: unexpected error ${/** @type {{ code?: string }} */ (err)?.code ?? ""}`.trim(),
  );
  process.exit(1);
};
process.on("unhandledRejection", fatal);
process.on("uncaughtException", fatal);

let accessConfig;
try {
  accessConfig = loadAccessConfig(process.env);
} catch (err) {
  console.error(err instanceof AccessConfigError ? `config error: ${err.message}` : "config error");
  process.exit(2);
}

/** @type {ReturnType<typeof createAccessVerifier> | null} */
let access = null;
if (accessConfig.mode === "on") access = createAccessVerifier(accessConfig);
else console.log("access check OFF (dev)");

// Drive is not part of /readyz: a Drive outage must not take the whole app out of rotation.
/** @type {ReturnType<typeof createDriveClient> | null} */
let drive = null;
try {
  const driveConfig = loadDriveConfig(process.env);
  if (driveConfig.mode === "on") drive = createDriveClient({ config: driveConfig, log });
  console.log(drive ? "drive configured" : "drive not configured");
} catch (err) {
  console.error(err instanceof DriveConfigError ? `config error: ${err.message}` : "config error");
  process.exit(2);
}

const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl ? createPool(databaseUrl, log) : null;
if (!pool) console.log("database not configured");

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const port = Number(process.env.PORT ?? 3000);

const server = http.createServer(createApp({ pool, distDir, drive, access, log }));
server.listen(port, "0.0.0.0", () => {
  const addr = server.address();
  console.log(`listening on :${typeof addr === "object" && addr ? addr.port : port}`);
});

async function shutdown() {
  const timer = setTimeout(() => process.exit(1), 10_000);
  timer.unref();
  server.close();
  server.closeIdleConnections();
  try {
    await pool?.end();
  } catch {
    // ignore: shutting down
  }
  process.exitCode = 0;
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
