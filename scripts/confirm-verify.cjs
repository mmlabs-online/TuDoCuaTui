#!/usr/bin/env node
/*
 * BUG-001 regression check (reviewer tool, not run by `pnpm test`): the confirm button must show the
 * danger fill with readable text in all three confirm dialogs, light and dark, at 390 and 1280 px.
 *
 *   pnpm build && pnpm preview --port 5199 --strictPort
 *   NODE_PATH=$(npm root -g) node scripts/confirm-verify.cjs --out <dir> [--base http://localhost:5199]
 *
 * Exit 1 on any failure. `summary.json` is written to <dir> and printed.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const BASE = opt("base", "http://localhost:5199");
const OUT = opt("out");
if (!OUT) {
  console.error("--out <dir> is required");
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });

const DANGER = "rgb(164, 69, 62)";
const WHITE = "rgb(255, 255, 255)";
const THEMES = ["light", "dark"];
const VIEWPORTS = [
  [390, 844, true],
  [1280, 800, false],
];
const DIALOGS = ["discard", "delete-item", "delete-ai-key"];
const failures = [];
const info = [];
const unchanged = {};
const fail = (check, msg) => failures.push(`[${check}] ${msg}`);

// Colours and contrast of the first visible match (same compositing math as mobile-verify.cjs).
function measure(sel) {
  const el = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0);
  if (!el) return null;
  const parse = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1]
      .split(/[ ,/]+/)
      .filter(Boolean)
      .map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 };
  };
  const lum = (c) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const layers = [];
  for (let p = el; p; p = p.parentElement) {
    const c = parse(getComputedStyle(p).backgroundColor);
    if (c && c.a > 0) {
      layers.push(c);
      if (c.a >= 0.99) break;
    }
  }
  let bg = { r: 255, g: 255, b: 255 };
  for (const l of layers.reverse())
    bg = {
      r: l.r * l.a + bg.r * (1 - l.a),
      g: l.g * l.a + bg.g * (1 - l.a),
      b: l.b * l.a + bg.b * (1 - l.a),
    };
  const cs = getComputedStyle(el);
  const fg = parse(cs.color);
  const f = {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
  };
  const L1 = lum(f);
  const L2 = lum(bg);
  const r = el.getBoundingClientRect();
  return {
    ratio: (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05),
    bg: cs.backgroundColor,
    border: cs.borderTopColor,
    color: cs.color,
    rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height },
    vw: window.innerWidth,
    vh: window.innerHeight,
  };
}

async function newContext(browser, w, h, theme, mobile) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    colorScheme: theme,
  });
  await ctx.addInitScript((t) => {
    if (!sessionStorage.getItem("init")) {
      localStorage.clear();
      localStorage.setItem("tu-do-theme", t);
      sessionStorage.setItem("init", "1");
    }
  }, theme);
  ctx.setDefaultTimeout(5000);
  return ctx;
}

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

// API mode without a server: /healthz answers like the Node server, /api/** is mocked.
async function mockApi(page) {
  await page.route("**/healthz", (r) => json(r, { status: "ok" }));
  await page.route("**/api/**", (r) => {
    const p = new URL(r.request().url()).pathname;
    if (p === "/api/items") return json(r, { items: [] });
    if (p === "/api/locations") return json(r, { locations: [] });
    if (p === "/api/ai-settings")
      return json(r, {
        settings: {
          provider: "claude",
          model: "claude-haiku-5-5",
          keyHint: "…abcd",
          hasKey: true,
          modelSupported: true,
          updatedAt: new Date().toISOString(),
        },
      });
    info.push(`unmocked ${r.request().method()} ${p}`);
    return json(r, { error: { code: "not_found" } }, 404);
  });
}

async function openDialog(page, dialog) {
  if (dialog === "delete-ai-key") {
    await mockApi(page);
    await page.goto(BASE);
    await page.getByRole("button", { name: "Cài đặt" }).click();
    const del = page.locator(".modal-footer .btn-danger");
    await del.waitFor();
    await page.waitForFunction(
      () => !document.querySelector(".modal-footer .btn-danger")?.disabled,
    );
    await del.click();
  } else {
    await page.goto(BASE);
    await page.locator(".item-card").first().click();
    if (dialog === "delete-item") {
      await page.getByRole("button", { name: /Xoá$/ }).click();
    } else {
      const input = page.locator(".modal .field input").first();
      await input.fill((await input.inputValue()) + " x");
      await page.keyboard.press("Escape");
    }
  }
  await page.locator(".confirm-content").waitFor();
}

async function run(browser, dialog, theme, [w, h, mobile]) {
  const tag = `${dialog} ${theme} ${w}`;
  const ctx = await newContext(browser, w, h, theme, mobile);
  const page = await ctx.newPage();
  try {
    await openDialog(page, dialog);
  } catch (e) {
    fail("open", `${tag}: ${String(e.message).split("\n")[0]}`);
    await ctx.close();
    return;
  }
  const BTN = ".confirm-content .btn-danger-fill";
  const check = (m, suffix) => {
    const t = suffix ? `${tag} ${suffix}` : tag;
    if (!m) return fail("danger-bg", `${t}: button not found`);
    if (m.bg !== DANGER) fail("danger-bg", `${t}: ${m.bg}`);
    if (m.border !== DANGER) fail("danger-bg", `${t}: border ${m.border}`);
    if (m.color !== WHITE) fail("danger-bg", `${t}: text ${m.color}`);
    if (m.ratio < 4.5) fail("contrast", `${t}: ${m.ratio.toFixed(2)}`);
  };
  const idle = await page.evaluate(measure, BTN);
  check(idle);
  await page.screenshot({ path: path.join(OUT, `${dialog}-${theme}-${w}.png`) });

  if (w === 390) {
    const cancel = await page.evaluate(measure, ".confirm-content .btn-secondary");
    if (!idle || !cancel) fail("tap-390", `${tag}: buttons missing`);
    else {
      for (const [n, m] of [
        ["confirm", idle],
        ["cancel", cancel],
      ]) {
        const r = m.rect;
        if (r.w <= 0 || r.left < 0 || r.right > m.vw || r.bottom > m.vh || r.h < 44)
          fail("tap-390", `${tag}: ${n} ${JSON.stringify(r)}`);
      }
      const a = idle.rect;
      const b = cancel.rect;
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)
        fail("tap-390", `${tag}: buttons overlap`);
    }
  }
  if (!mobile) {
    await page.locator(BTN).hover();
    await page.waitForTimeout(300);
    check(await page.evaluate(measure, BTN), "hover");
    await page.screenshot({ path: path.join(OUT, `${dialog}-${theme}-${w}-hover.png`) });
  }
  if (dialog === "discard" && w === 390) {
    const cancel = await page.evaluate(measure, ".confirm-content .btn-secondary");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    unchanged[theme] = { cancel: pick(cancel) };
  }
  await ctx.close();
}

const pick = (m) => m && { bg: m.bg, color: m.color, border: m.border };

(async () => {
  const browser = await chromium.launch();
  for (const theme of THEMES) {
    for (const vp of VIEWPORTS) for (const d of DIALOGS) await run(browser, d, theme, vp);
    const ctx = await newContext(browser, 1280, 800, theme, false);
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.locator(".item-card").first().waitFor();
    unchanged[theme] = {
      ...unchanged[theme],
      primary: pick(await page.evaluate(measure, ".btn-primary")),
    };
    await ctx.close();
  }
  await browser.close();
  const summary = { failures, info, unchanged, out: OUT };
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  process.exit(failures.length ? 1 : 0);
})();
