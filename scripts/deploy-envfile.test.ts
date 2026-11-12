// @vitest-environment node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const WORKFLOW = path.resolve(
  __dirname,
  "../deploy/deployment-repo/.github/workflows/deploy-tudocuatui.yml",
);
const yml = fs.readFileSync(WORKFLOW, "utf8");
const lines = yml.split("\n");

const hasBash = process.platform !== "win32" && spawnSync("bash", ["-c", "true"]).status === 0;
const d = hasBash ? describe : describe.skip;

/** Lines of the step whose `- name:` is `name` (up to the next step). */
function stepLines(name: string): string[] {
  const start = lines.findIndex((l) => l === `      - name: ${name}`);
  expect(start).toBeGreaterThan(-1);
  let end = start + 1;
  while (
    end < lines.length &&
    !lines[end].startsWith("      - ") &&
    !lines[end].startsWith("      #")
  )
    end++;
  return lines.slice(start, end);
}

/** The `run: |` block of a step, de-indented. */
function runBlock(name: string): string {
  const s = stepLines(name);
  const i = s.findIndex((l) => l === "        run: |");
  expect(i).toBeGreaterThan(-1);
  return s
    .slice(i + 1)
    .map((l) => l.slice(10))
    .join("\n");
}

const FAKE_PW = "fakepassword0123456789";
const ID = "fake-client-1.apps.googleusercontent.com";
const GOOD = {
  GOOGLE_CLIENT_ID: ID,
  GOOGLE_CLIENT_SECRET: "fake-client-secret-XYZ",
  GOOGLE_REFRESH_TOKEN: "fake-refresh/token.abc-1",
  DRIVE_FOLDER_ID: "fakeFolderId_0001",
};
const NAMES = Object.keys(GOOD) as (keyof typeof GOOD)[];
const DB_LINE = `DATABASE_URL=postgres://tudocuatui:${FAKE_PW}@postgres:5432/tudocuatui\n`;

const dirs: string[] = [];
afterEach(() => {
  for (const x of dirs.splice(0)) fs.rmSync(x, { recursive: true, force: true });
});

function setup(pwfile: string | null = FAKE_PW + "\n") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "envfile-"));
  dirs.push(root);
  const cwd = path.join(root, "checkout");
  fs.mkdirSync(path.join(cwd, "postgres/secrets/apps"), { recursive: true });
  if (pwfile !== null)
    fs.writeFileSync(path.join(cwd, "postgres/secrets/apps/tudocuatui.password"), pwfile);
  const home = path.join(root, "home");
  fs.mkdirSync(home);
  const script = path.join(root, "step.sh");
  fs.writeFileSync(script, runBlock("envfile"));
  const envFile = path.join(home, ".config/tudocuatui/tudocuatui.env");
  const output = path.join(root, "output");
  fs.writeFileSync(output, "");
  function exec(secrets: Partial<Record<keyof typeof GOOD, string>> = {}) {
    const r = spawnSync("bash", ["-e", script], {
      cwd,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH ?? "",
        HOME: home,
        ENV_FILE: envFile,
        DB_APP: "tudocuatui",
        GITHUB_OUTPUT: output,
        ...secrets,
      },
    });
    return { ...r, output: fs.readFileSync(output, "utf8") };
  }
  const seed = (text: string) => {
    fs.mkdirSync(path.dirname(envFile), { recursive: true });
    fs.writeFileSync(envFile, text);
  };
  const dirFiles = () =>
    fs.existsSync(path.dirname(envFile)) ? fs.readdirSync(path.dirname(envFile)) : [];
  return { exec, seed, envFile, dirFiles };
}

d("envfile step (real run block)", () => {
  it("no Drive secrets: only DATABASE_URL, live bytes; changed=true first, false on re-run", () => {
    const t = setup();
    const a = t.exec();
    expect(a.status).toBe(0);
    expect(fs.readFileSync(t.envFile, "utf8")).toBe(DB_LINE);
    expect(a.output).toContain("changed=true");
    const b = t.exec();
    expect(b.status).toBe(0);
    expect(b.output).toContain("changed=false");
    expect(t.dirFiles()).toEqual(["tudocuatui.env"]);
  });

  it("all four: DATABASE_URL then the four values unprefixed; mode 600; changed flips", () => {
    const t = setup();
    const a = t.exec(GOOD);
    expect(a.status).toBe(0);
    expect(fs.readFileSync(t.envFile, "utf8")).toBe(
      `${DB_LINE}GOOGLE_CLIENT_ID=${GOOD.GOOGLE_CLIENT_ID}\nGOOGLE_CLIENT_SECRET=${GOOD.GOOGLE_CLIENT_SECRET}\n` +
        `GOOGLE_REFRESH_TOKEN=${GOOD.GOOGLE_REFRESH_TOKEN}\nDRIVE_FOLDER_ID=${GOOD.DRIVE_FOLDER_ID}\n`,
    );
    expect(fs.statSync(t.envFile).mode & 0o777).toBe(0o600);
    expect(a.output).toContain("changed=true");
    expect(a.stdout + a.stderr).not.toContain(GOOD.GOOGLE_CLIENT_SECRET);
    expect(t.exec(GOOD).output).toContain("changed=false");
    // removing the secrets changes the file again (turn photos off)
    const off = t.exec();
    expect(off.output.trim().split("\n").pop()).toBe("changed=true");
    expect(fs.readFileSync(t.envFile, "utf8")).toBe(DB_LINE);
  });

  it("every 1/2/3-of-4 subset: exit 1, error lists the missing names, old file unchanged, no temp left", () => {
    for (let mask = 1; mask < 15; mask++) {
      const t = setup();
      t.seed("OLD=1\n");
      const given: Partial<typeof GOOD> = {};
      const missing: string[] = [];
      NAMES.forEach((n, i) => {
        if (mask & (1 << i)) given[n] = GOOD[n];
        else missing.push(`TUDOCUATUI_${n}`);
      });
      const r = t.exec(given);
      expect(r.status, String(mask)).toBe(1);
      for (const m of missing) expect(r.stdout + r.stderr).toContain(m);
      for (const n of NAMES) if (given[n]) expect(r.stdout + r.stderr).not.toContain(given[n]!);
      expect(fs.readFileSync(t.envFile, "utf8")).toBe("OLD=1\n");
      expect(t.dirFiles()).toEqual(["tudocuatui.env"]);
    }
  });

  it("bad characters in each value: exit 1, file unchanged, value not in output", () => {
    const bads = ["x\nTUDO_ACCESS_DISABLED=1", "a b", 'a"b', "a$b", "a=b", "a#b"];
    for (const n of NAMES) {
      for (const bad of bads) {
        const t = setup();
        t.seed("OLD=1\n");
        // keep the suffix/length rules satisfied so only the bad character is at fault
        const value =
          n === "GOOGLE_CLIENT_ID"
            ? `${bad}.apps.googleusercontent.com`
            : n === "DRIVE_FOLDER_ID"
              ? `${bad}0123456789`
              : bad;
        const r = t.exec({ ...GOOD, [n]: value });
        expect(r.status, `${n} ${JSON.stringify(bad)}`).toBe(1);
        expect(r.stdout + r.stderr).not.toContain(bad);
        expect(fs.readFileSync(t.envFile, "utf8")).toBe("OLD=1\n");
        expect(t.dirFiles()).toEqual(["tudocuatui.env"]);
      }
    }
  });

  it("client id without the suffix, folder id too short or with bad chars: exit 1", () => {
    for (const patch of [
      { GOOGLE_CLIENT_ID: "fake-client-1" },
      { GOOGLE_CLIENT_ID: "fake.apps.googleusercontent.com.evil" },
      { DRIVE_FOLDER_ID: "short" },
      { DRIVE_FOLDER_ID: "has/slash/0123456789" },
    ]) {
      const t = setup();
      t.seed("OLD=1\n");
      expect(t.exec({ ...GOOD, ...patch }).status).toBe(1);
      expect(fs.readFileSync(t.envFile, "utf8")).toBe("OLD=1\n");
    }
  });

  it("malformed or missing password file: exit 1 (existing behaviour kept)", () => {
    for (const pw of ["short\n", null]) {
      const t = setup(pw);
      t.seed("OLD=1\n");
      expect(t.exec().status).toBe(1);
      expect(fs.readFileSync(t.envFile, "utf8")).toBe("OLD=1\n");
    }
  });
});

describe("deploy-tudocuatui.yml static checks", () => {
  it("job deploy runs only on main and has no environment key", () => {
    expect(yml).toMatch(/^ {2}deploy:\n {4}if: github\.ref == 'refs\/heads\/main'\n {4}runs-on:/m);
    expect(yml).not.toMatch(/^\s*environment:/m);
  });
  it("envfile env maps exactly the four TUDOCUATUI_* secrets", () => {
    const s = stepLines("envfile").join("\n");
    const mapped = [...s.matchAll(/^ {10}(\w+): \$\{\{ (secrets\.\w+) \}\}$/gm)].map((m) => [
      m[1],
      m[2],
    ]);
    expect(mapped).toEqual([
      ["GOOGLE_CLIENT_ID", "secrets.TUDOCUATUI_GOOGLE_CLIENT_ID"],
      ["GOOGLE_CLIENT_SECRET", "secrets.TUDOCUATUI_GOOGLE_CLIENT_SECRET"],
      ["GOOGLE_REFRESH_TOKEN", "secrets.TUDOCUATUI_GOOGLE_REFRESH_TOKEN"],
      ["DRIVE_FOLDER_ID", "secrets.TUDOCUATUI_DRIVE_FOLDER_ID"],
    ]);
    expect(yml.match(/secrets\./g)).toHaveLength(4);
  });
  it("no run block contains ${{", () => {
    for (const name of [
      "release",
      "envfile",
      "pull",
      "backup",
      "migrate",
      "deploy",
      "rollback",
      "notify",
    ]) {
      expect(runBlock(name), name).not.toContain("${{");
    }
  });
  it("deploy adds --force-recreate only when the env file changed or on workflow_dispatch", () => {
    const s = stepLines("deploy").join("\n");
    expect(s).toContain("CHANGED: ${{ steps.envfile.outputs.changed }}");
    expect(s).toContain("EVENT: ${{ github.event_name }}");
    expect(s.match(/--force-recreate/g)).toHaveLength(1);
    expect(s).toContain(
      'if [ "$CHANGED" = "true" ] || [ "$EVENT" = "workflow_dispatch" ]; then recreate=(--force-recreate); fi',
    );
    expect(s).toContain('${recreate[@]+"${recreate[@]}"} tudocuatui');
  });
});
