// @ts-check
// Entry point for the `migrate` one-shot service (D24): node server/migrate.js
// Exit codes: 0 ok or no-op, 1 runtime failure, 2 configuration error. Never prints DATABASE_URL.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MigrationError, runMigrations } from "./migrator.js";

/** @param {unknown} err */
function fail(err) {
  if (err instanceof MigrationError) {
    console.error(`migrate failed: ${err.message}${err.code ? ` [${err.code}]` : ""}`);
    process.exitCode = err.exitCode;
  } else {
    console.error("migrate failed: unexpected error");
    process.exitCode = 1;
  }
}

process.on("unhandledRejection", () => {
  console.error("migrate failed: unexpected error");
  process.exit(1);
});
process.on("uncaughtException", () => {
  console.error("migrate failed: unexpected error");
  process.exit(1);
});

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exitCode = 2;
} else {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../db/migrations");
  try {
    await runMigrations({ connectionString, dir, log: (line) => console.log(line) });
  } catch (err) {
    fail(err);
  }
}
