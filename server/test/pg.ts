import { randomBytes } from "node:crypto";
import pg from "pg";

export const adminUrl = process.env.TEST_DATABASE_URL;

// R8: in CI the DB tests must run, never skip.
if (process.env.CI && !adminUrl) {
  throw new Error("TEST_DATABASE_URL is required when CI is set");
}

export const dbAvailable = Boolean(adminUrl);

const rand = () => randomBytes(4).toString("hex");

function urlFor(base: string, database: string, user?: string, password?: string) {
  const u = new URL(base);
  u.pathname = `/${database}`;
  if (user) u.username = user;
  if (password) u.password = password;
  return u.toString();
}

async function withAdmin<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: adminUrl });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

export interface TestDb {
  name: string;
  url: string;
  baseUrl: string;
  drop(): Promise<void>;
}

/** Creates a throwaway database; `owner` makes it owned by a NOSUPERUSER role (created and dropped too). */
export async function createTestDb(opts: { owner?: boolean } = {}): Promise<TestDb> {
  if (!adminUrl) throw new Error("TEST_DATABASE_URL is not set");
  const name = `tudo_test_${rand()}`;
  const role = opts.owner ? `tudo_role_${rand()}` : undefined;
  const password = rand();
  await withAdmin(async (c) => {
    if (role) await c.query(`create role ${role} login nosuperuser password '${password}'`);
    await c.query(`create database ${name}${role ? ` owner ${role}` : ""}`);
  });
  return {
    name,
    baseUrl: adminUrl,
    url: urlFor(adminUrl, name, role, role ? password : undefined),
    drop: () =>
      withAdmin(async (c) => {
        await c.query(`drop database if exists ${name} with (force)`);
        if (role) await c.query(`drop role if exists ${role}`);
      }),
  };
}

export { urlFor };
