#!/usr/bin/env node
/*
 * T-024 mobile verification (reviewer tool, not run by `pnpm test`).
 *
 *   pnpm dev --port 5199 --strictPort            # local mode: no Supabase env vars
 *   NODE_PATH=$(npm root -g) node scripts/mobile-verify.cjs --out /tmp/t024-after
 *   # desktop baseline against a `main` worktree on port 5198:
 *   NODE_PATH=$(npm root -g) node scripts/mobile-verify.cjs --desktop-only --base http://localhost:5198 --out /tmp/t024-before
 *   NODE_PATH=$(npm root -g) node scripts/mobile-verify.cjs --desktop-only --out /tmp/t024-after --baseline /tmp/t024-before
 *
 * Flags: --base <url> (default http://localhost:5199), --out <dir> (required), --desktop-only, --baseline <dir>.
 * Checks: A overflow, B zoomInputs, C tinyText, D smallTargets, E contrast, F editor-320,
 *         G meta, H toast, I desktop. Exit code 1 on any failed hard assertion.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : d;
};
const BASE = opt("base", "http://localhost:5199");
const OUT = opt("out");
const BASELINE = opt("baseline");
if (!OUT) {
  console.error("--out <dir> is required");
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });

const PHONES = [
  [320, 568],
  [360, 740],
  [390, 844],
  [430, 932],
];
const THEMES = ["light", "dark"];
const LONG_NAME = "Áo khoác dạ dáng dài hai hàng khuy màu nâu caramel siêu dài";
const failures = [];
const info = [];
const fail = (check, msg) => failures.push(`[${check}] ${msg}`);

function metrics() {
  const vw = window.innerWidth,
    vh = window.innerHeight;
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return (
      r.width > 0 &&
      r.height > 0 &&
      cs.visibility !== "hidden" &&
      cs.display !== "none" &&
      +cs.opacity > 0.05
    );
  };
  const desc = (el) => {
    const c =
      typeof el.className === "string"
        ? el.className.trim().split(/\s+/).slice(0, 2).join(".")
        : "";
    const t = (el.innerText || el.value || el.getAttribute("aria-label") || el.placeholder || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 28);
    return `${el.tagName.toLowerCase()}${c ? "." + c : ""}${t ? ' "' + t + '"' : ""}`;
  };
  const se = document.scrollingElement;
  const out = { vw, vh, scrollW: se.scrollWidth, overflowX: se.scrollWidth - vw };
  // elements extending beyond viewport horizontally
  const wide = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) {
      // skip if an ancestor clips
      let p = el.parentElement,
        clipped = false;
      while (p && p !== document.body) {
        const ox = getComputedStyle(p).overflowX;
        if (ox !== "visible") {
          const pr = p.getBoundingClientRect();
          if (pr.right <= vw + 1 && pr.left >= -1) {
            clipped = true;
            break;
          }
        }
        p = p.parentElement;
      }
      if (!clipped) wide.push(`${desc(el)} [${Math.round(r.left)}..${Math.round(r.right)}]`);
    }
  }
  out.offscreen = wide.slice(0, 8);
  // tap targets
  const small = [];
  const inter = document.querySelectorAll(
    "button, a[href], input:not([type=hidden]), select, textarea, [role=button], summary",
  );
  for (const el of inter) {
    if (!vis(el)) continue;
    let r = el.getBoundingClientRect();
    if (el.type === "file") continue;
    // checkbox inside label: use label box
    if ((el.type === "checkbox" || el.type === "radio") && el.closest("label"))
      r = el.closest("label").getBoundingClientRect();
    if (el.tagName === "SELECT" && el.closest("label.filter-select"))
      r = el.closest("label").getBoundingClientRect();
    if (el.closest(".item-card, .stat-card")) continue;
    if (r.width < 44 || r.height < 44)
      small.push(`${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  out.smallTargets = small;
  // small text
  const tiny = {};
  const lowC = {};
  const parseRGB = (s) => {
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
  const bgOf = (el) => {
    let layers = [];
    for (let p = el; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.backgroundImage !== "none" && !cs.backgroundImage.startsWith("url"))
        return { img: true };
      if (cs.backgroundImage.startsWith("url") || p.tagName === "IMG") return { img: true };
      const c = parseRGB(cs.backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 0.99) break;
      }
    }
    let base = { r: 255, g: 255, b: 255 };
    for (const l of layers.reverse())
      base = {
        r: l.r * l.a + base.r * (1 - l.a),
        g: l.g * l.a + base.g * (1 - l.a),
        b: l.b * l.a + base.b * (1 - l.a),
      };
    return base;
  };
  for (const el of document.querySelectorAll("body *")) {
    if (!vis(el)) continue;
    const hasText = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 0,
    );
    if (!hasText) continue;
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > document.documentElement.scrollHeight) continue;
    if (
      fs < 12 &&
      !el.closest('[aria-hidden="true"], .hero-sparkle, .card-sparkle, .modal-doodle')
    ) {
      const k = `${desc(el).split(' "')[0]} ${fs}px`;
      tiny[k] = (tiny[k] || 0) + 1;
    }
    const fg = parseRGB(cs.color);
    const bg = bgOf(el);
    if (fg && !bg.img) {
      const fgc = {
        r: fg.r * fg.a + bg.r * (1 - fg.a),
        g: fg.g * fg.a + bg.g * (1 - fg.a),
        b: fg.b * fg.a + bg.b * (1 - fg.a),
      };
      const L1 = lum(fgc),
        L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const large = fs >= 24 || (fs >= 18.66 && +cs.fontWeight >= 700);
      if (ratio < (large ? 3 : 4.5)) {
        const k = `${desc(el)} ${fs}px ratio ${ratio.toFixed(2)}`;
        lowC[k] = 1;
      }
    }
  }
  out.tinyText = tiny;
  out.lowContrast = Object.keys(lowC).slice(0, 25);
  // inputs <16px
  out.zoomInputs = [
    ...document.querySelectorAll(
      "input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]), select, textarea",
    ),
  ]
    .filter(vis)
    .map((el) => `${desc(el)} ${getComputedStyle(el).fontSize}`)
    .filter((s) => parseFloat(s.split(" ").pop()) < 16);
  // truncated / clipped text
  const clip = [];
  for (const el of document.querySelectorAll("body *")) {
    if (!vis(el)) continue;
    const cs = getComputedStyle(el);
    if (
      (cs.overflowX !== "visible" || cs.textOverflow === "ellipsis") &&
      el.scrollWidth > el.clientWidth + 2 &&
      el.clientWidth > 0 &&
      el.innerText &&
      el.innerText.trim() &&
      el.children.length < 3
    )
      clip.push(`${desc(el)} ${el.clientWidth}/${el.scrollWidth}`);
  }
  out.clipped = clip.slice(0, 12);
  // fixed/sticky
  out.fixed = [...document.querySelectorAll("body *")]
    .filter((el) => {
      const p = getComputedStyle(el).position;
      return (p === "fixed" || p === "sticky") && vis(el);
    })
    .map((el) => {
      const r = el.getBoundingClientRect();
      return `${desc(el).split(' "')[0]} ${getComputedStyle(el).position} top=${Math.round(r.top)} bottom=${Math.round(r.bottom)} h=${Math.round(r.height)}`;
    });
  // modals
  out.modals = [...document.querySelectorAll(".modal")].filter(vis).map((m) => {
    const r = m.getBoundingClientRect();
    const cs = getComputedStyle(m);
    return `modal top=${Math.round(r.top)} bottom=${Math.round(r.bottom)} h=${Math.round(r.height)} vh=${vh} scrollH=${m.scrollHeight} clientH=${m.clientHeight} overflowY=${cs.overflowY} w=${Math.round(r.width)}`;
  });
  // grid density
  const cards = [...document.querySelectorAll(".item-grid > *")].filter(vis);
  if (cards.length) {
    const top0 = cards[0].getBoundingClientRect().top;
    out.cardsPerRow = cards.filter(
      (c) => Math.abs(c.getBoundingClientRect().top - top0) < 2,
    ).length;
    out.cardSize = `${Math.round(cards[0].getBoundingClientRect().width)}x${Math.round(cards[0].getBoundingClientRect().height)}`;
  }
  // overlaps among interactive elements
  const ov = [];
  const ints = [...inter].filter(vis);
  for (let i = 0; i < ints.length; i++)
    for (let j = i + 1; j < ints.length; j++) {
      const a = ints[i].getBoundingClientRect(),
        b = ints[j].getBoundingClientRect();
      if (ints[i].contains(ints[j]) || ints[j].contains(ints[i])) continue;
      const x = Math.min(a.right, b.right) - Math.max(a.left, b.left),
        y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (x > 4 && y > 4) ov.push(`${desc(ints[i])} <> ${desc(ints[j])}`);
    }
  out.overlaps = ov.slice(0, 8);
  return out;
}

// Contrast of the first visible match for a selector (same compositing math as metrics()).
function contrastOf(sel) {
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
  return {
    ratio: (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05),
    bgColor: cs.backgroundColor,
  };
}

const rectOf = (sel) =>
  [...document.querySelectorAll(sel)]
    .filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
    })
    .map((e) => {
      const r = e.getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        h: r.height,
        w: r.width,
      };
    });

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

async function checkMetrics(tag, name, m, opts = {}) {
  if (m.overflowX !== 0) fail("A", `${tag} ${name}: page overflowX ${m.overflowX}`);
  if (m.offscreen.length) fail("A", `${tag} ${name}: offscreen ${m.offscreen.join("; ")}`);
  for (const mo of m.modalOverflow)
    fail("A", `${tag} ${name}: modal scrollWidth > clientWidth (${mo})`);
  if (m.zoomInputs.length) fail("B", `${tag} ${name}: ${m.zoomInputs.join("; ")}`);
  const tiny = Object.keys(m.tinyText);
  if (tiny.length) fail("C", `${tag} ${name}: ${tiny.join("; ")}`);
  if (m.smallTargets.length) fail("D", `${tag} ${name}: ${m.smallTargets.join("; ")}`);
  if (m.lowContrast.length) info.push(`[E info] ${tag} ${name}: ${m.lowContrast.join("; ")}`);
}

async function phoneRun(browser, w, h, theme) {
  const tag = `${w}x${h}-${theme}`;
  const ctx = await newContext(browser, w, h, theme, true);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  const record = async (name, full = false) => {
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`), fullPage: full });
    const m = await page.evaluate(metrics);
    m.modalOverflow = await page.evaluate(() =>
      [...document.querySelectorAll(".modal")]
        .filter((e) => e.getBoundingClientRect().width > 0 && e.scrollWidth > e.clientWidth + 1)
        .map((e) => `${e.scrollWidth}/${e.clientWidth}`),
    );
    await checkMetrics(tag, name, m);
  };
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      fail("script", `${tag} ${name}: ${e.message.split("\n")[0]}`);
      await page.screenshot({ path: path.join(OUT, `${tag}-FAILED-${name}.png`) }).catch(() => {});
    }
  };
  const contrast = async (check, sel, min = 4.5) => {
    const c = await page.evaluate(contrastOf, sel);
    if (!c) return fail("E", `${tag} ${check}: ${sel} not found`);
    if (c.ratio < min) fail("E", `${tag} ${check}: ${sel} ratio ${c.ratio.toFixed(2)} < ${min}`);
    return c;
  };

  await page.goto(BASE + "/");
  await page.waitForSelector(".item-card", { timeout: 15000 });
  await step("meta", async () => {
    const v = await page.evaluate(() => document.querySelector('meta[name="viewport"]').content);
    if (!v.includes("viewport-fit=cover")) fail("G", `viewport meta: ${v}`);
  });
  await step("home", () => record("home", true));
  await step("filter-active", async () => {
    await page.locator(".filter-select select").first().selectOption({ index: 1 });
    await page.locator(".toolbar").scrollIntoViewIfNeeded();
    await record("filter-active");
    await contrast("text-btn", ".text-btn");
    await page.locator(".text-btn").click();
  });
  await step("chip-active", () => contrast("chip", ".categories button.active"));
  await step("editor-edit", async () => {
    await page.locator(".item-card").first().click();
    await page.waitForSelector(".modal");
    await record("editor-edit");
    const mh = await page.evaluate(() => ({
      h: document.querySelector(".modal-wide").getBoundingClientRect().height,
      ih: innerHeight,
    }));
    if (Math.abs(mh.h - mh.ih) > 0.5)
      fail("F", `${tag}: .modal-wide height ${mh.h} !== innerHeight ${mh.ih}`);
    const foot = await page.evaluate(rectOf, ".modal-footer .btn");
    if (foot.some((r) => Math.abs(r.top - foot[0].top) > 1))
      fail("F", `${tag}: footer buttons not on one row`);
    const wb = await page.evaluate(contrastOf, ".wear-bar > div:first-child > span");
    if (theme === "dark" && wb && wb.ratio < 3)
      fail("E", `${tag}: wear-bar icon ${wb.ratio.toFixed(2)} < 3`);
  });
  await step("editor-edit-bottom", async () => {
    await page.evaluate(() => {
      const m = document.querySelector(".modal");
      m.scrollTop = m.scrollHeight;
    });
    await record("editor-edit-bottom");
  });
  await step("wear-toast", async () => {
    await page.getByRole("button", { name: /Mặc hôm nay/ }).click();
    await page.waitForSelector(".toast");
    await record("wear-toast");
    if (w === 390) {
      const t = await page.evaluate(() => {
        const r = (e) => e.getBoundingClientRect();
        const toast = document.querySelector(".toast");
        const tr = r(toast);
        const hit = [
          ...document.querySelectorAll(".modal-footer .btn, .modal-header .icon-btn"),
        ].filter((b) => {
          const br = r(b);
          return (
            br.width > 0 &&
            tr.left < br.right &&
            tr.right > br.left &&
            tr.top < br.bottom &&
            tr.bottom > br.top
          );
        });
        return { hits: hit.length, pe: getComputedStyle(toast).pointerEvents };
      });
      if (t.hits) fail("H", `${tag}: toast overlaps ${t.hits} modal controls`);
      if (t.pe !== "none") fail("H", `${tag}: toast pointer-events ${t.pe}`);
    }
  });
  await step("delete-confirm", async () => {
    await page.getByRole("button", { name: /Xoá$/ }).first().click();
    await page.waitForSelector(".confirm-content");
    await record("delete-confirm");
    const c = await contrast("delete-confirm", ".confirm-content .btn-danger-fill");
    if (c && c.bgColor !== "rgb(164, 69, 62)") fail("E", `${tag}: danger fill ${c.bgColor}`);
    await page.getByRole("button", { name: "Giữ lại" }).click();
  });
  await step("close-editor", async () => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    if (await page.locator(".confirm-content").count())
      await page.locator(".confirm-content .btn").last().click();
  });
  await step("editor-new", async () => {
    await page.evaluate(() => scrollTo(0, 0));
    await page
      .getByRole("button", { name: /Thêm món đồ/ })
      .first()
      .click();
    await page.waitForSelector(".modal");
    await record("editor-new");
  });
  await step("editor-new-discard", async () => {
    await page.locator(".modal .field input").first().fill("Áo test");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".confirm-content");
    await record("editor-new-discard");
    await contrast("discard-confirm", ".confirm-content .btn-danger-fill");
    await page.locator(".confirm-content .btn").last().click();
  });
  await step("save-toast", async () => {
    // Without a modal the toast sits at the bottom, clear of the home indicator.
    await page
      .getByRole("button", { name: /Thêm món đồ/ })
      .first()
      .click();
    await page.waitForSelector(".modal");
    await page.locator(".modal .field input").first().fill("Áo toast");
    await page.getByRole("button", { name: "Lưu món đồ" }).click();
    // Measure the first moment the toast is shown with no modal open (it lives 2.4 s).
    let bottom = null;
    for (let i = 0; i < 100 && bottom === null; i++) {
      bottom = await page.evaluate(() =>
        document.querySelector(".toast") && !document.querySelector(".modal-backdrop")
          ? document.querySelector(".toast").getBoundingClientRect().bottom
          : null,
      );
      if (bottom === null) await page.waitForTimeout(30);
    }
    if (bottom === null) info.push(`[H info] ${tag}: toast without modal not observed (timing)`);
    else if (w === 390 && bottom > 844 - 15)
      fail("H", `${tag}: home toast bottom ${bottom} > ${844 - 15}`);
  });
  await step("import", async () => {
    await page.locator(".mobile-import .btn").first().click();
    await page.waitForSelector(".modal");
    await record("import-photos");
    await page.locator(".tabs button").nth(1).click();
    await record("import-csv");
    await contrast("copy-mau", ".code-head button");
    await page.fill(
      ".paste-area",
      "name,category,colors\nÁo sơ mi trắng cực kỳ dài tên dài thật dài để kiểm tra,Áo,Trắng\nQuần,Quần,Đen\n,,",
    );
    await page.waitForTimeout(300);
    await record("import-csv-preview");
    await page.locator(".tabs button").nth(2).click();
    await record("import-json");
    await page.keyboard.press("Escape");
  });
  await step("export", async () => {
    await page.locator(".mobile-import .btn").nth(1).click();
    await page.waitForSelector(".modal");
    await record("export");
    await page.keyboard.press("Escape");
  });
  await step("long-name", async () => {
    await page.evaluate((n) => {
      const it = JSON.parse(localStorage.getItem("tu-do-items"));
      it[0].name = n;
      it[0].brand = "MaisonMargielaArtisanalCollectionVeryLongBrand";
      it[0].location = "Tủ quần áo phòng ngủ tầng hai ngăn kéo thứ ba bên trái";
      localStorage.setItem("tu-do-items", JSON.stringify(it));
    }, LONG_NAME);
    await page.reload();
    await page.waitForSelector(".item-card");
    await record("long-names");
    await page.locator(".item-card").first().click();
    await page.waitForSelector(".modal");
    await record("long-editor");
    if (w === 320) {
      const lh = await page.evaluate(() => {
        const h2 = document.querySelector(".editor-header h2");
        const cs = getComputedStyle(h2);
        return {
          h: h2.getBoundingClientRect().height,
          lh: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2,
        };
      });
      if (lh.h > 2 * lh.lh + 1) fail("F", `${tag}: long h2 height ${lh.h} > 2 lines (${lh.lh})`);
    }
    await page.keyboard.press("Escape");
  });
  await step("empty", async () => {
    await page.evaluate(() => localStorage.setItem("tu-do-items", "[]"));
    await page.reload();
    await page.waitForTimeout(800);
    await record("empty", true);
  });
  if (errs.length) fail("script", `${tag} page errors: ${errs.join("; ")}`);

  const ap = await ctx.newPage();
  await ap.goto(BASE + "/auth-preview.html");
  await ap.waitForTimeout(800);
  if (theme === "dark") await ap.evaluate(() => document.documentElement.classList.add("dark"));
  const screens = {
    signIn: ["idle"],
    signUp: ["idle", "sent"],
    verify: ["ready", "invalid"],
    forgot: ["idle", "sent"],
    reset: ["ready", "invalid"],
    join: ["idle"],
  };
  for (const [s, states] of Object.entries(screens))
    for (const st of states)
      await step(`auth-${s}-${st}`, async () => {
        const sels = ap.locator("select");
        await sels.nth(0).selectOption(s);
        await sels.nth(1).selectOption(st);
        if (st === "idle" || st === "ready") await sels.nth(2).selectOption({ index: 1 });
        else await sels.nth(2).selectOption("");
        await ap.waitForTimeout(250);
        await ap.screenshot({ path: path.join(OUT, `${tag}-auth-${s}-${st}.png`), fullPage: true });
        // Hide the preview harness (its own selects/log) so only app UI is measured.
        await ap.evaluate(() => {
          const root = document.querySelector("#root > div");
          root.children[0].style.display = "none";
          root.querySelector("pre").style.display = "none";
        });
        const m = await ap.evaluate(metrics);
        m.modalOverflow = [];
        await checkMetrics(tag, `auth-${s}-${st}`, m);
        await ap.evaluate(() => {
          const root = document.querySelector("#root > div");
          root.children[0].style.display = "";
          root.querySelector("pre").style.display = "";
        });
      });
  await ctx.close();
}

// F: editor at 320x568, header + footer budget, scrolling, normal and long name, edit and new.
async function editor320(browser, theme) {
  const tag = `editor-320-${theme}`;
  const ctx = await newContext(browser, 320, 568, theme, true);
  const page = await ctx.newPage();
  await page.goto(BASE + "/");
  await page.waitForSelector(".item-card");
  for (const mode of ["edit", "new"])
    for (const long of [false, true]) {
      const label = `${tag} ${mode}${long ? "-long" : ""}`;
      try {
        if (mode === "edit") await page.locator(".item-card").first().click();
        else await page.locator(".header-actions .btn-primary").click();
        await page.waitForSelector(".modal");
        if (long) await page.locator(".modal .field input").first().fill(LONG_NAME);
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(OUT, `${label.replace(/ /g, "-")}.png`) });
        const r = await page.evaluate(
          ([rectOfSrc]) => {
            const rectOf = eval(`(${rectOfSrc})`);
            const m = document.querySelector(".modal");
            const header = rectOf(".editor-header")[0];
            const footer = rectOf(".editor-footer")[0];
            const btns = rectOf(".editor-footer .btn");
            const close = rectOf(".editor-header .icon-btn")[0];
            const up = rectOf(".upload-zone")[0];
            m.scrollTop = m.scrollHeight;
            const ta = [...document.querySelectorAll("textarea")].pop().getBoundingClientRect();
            const footerNow = rectOf(".editor-footer")[0];
            return {
              header,
              footer,
              btns,
              close,
              up,
              scrolls: m.scrollHeight > m.clientHeight,
              taBottom: ta.bottom,
              footerTop: footerNow.top,
              ih: innerHeight,
              iw: innerWidth,
            };
          },
          [rectOf.toString()],
        );
        if (r.header.h + r.footer.h > 142)
          fail("F", `${label}: chrome ${r.header.h + r.footer.h} > 142`);
        if (r.footer.h > 64) fail("F", `${label}: footer ${r.footer.h} > 64`);
        if (r.btns.some((b) => Math.abs(b.top - r.btns[0].top) > 1))
          fail("F", `${label}: footer not one row`);
        if (!r.scrolls) fail("F", `${label}: modal does not scroll`);
        if (r.taBottom > r.footerTop + 0.5) fail("F", `${label}: textarea hidden behind footer`);
        if (Math.abs(r.close.w - 44) > 0.5 || Math.abs(r.close.h - 44) > 0.5)
          fail("F", `${label}: close ${r.close.w}x${r.close.h}`);
        if (r.close.right > r.iw || r.close.left < 0 || r.close.bottom > r.ih)
          fail("F", `${label}: close outside viewport`);
        if (r.up.h < 160 || r.up.h > 200) fail("F", `${label}: upload zone ${r.up.h}`);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
        if (await page.locator(".confirm-content").count())
          await page.locator(".confirm-content .btn").last().click();
        await page.waitForSelector(".modal", { state: "detached" });
      } catch (e) {
        fail("script", `${label}: ${e.message.split("\n")[0]}`);
      }
    }
  await ctx.close();
}

// I: desktop 1280x800.
async function desktop(browser, theme) {
  const tag = `desktop-${theme}`;
  const ctx = await newContext(browser, 1280, 800, theme, false);
  const page = await ctx.newPage();
  const shot = async (name) => {
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) });
  };
  try {
    await page.goto(BASE + "/");
    await page.waitForSelector(".item-card");
    await shot("home");
    await page.locator(".item-card").first().click();
    await page.waitForSelector(".modal");
    await shot("editor");
    const d = await page.evaluate(() => ({
      header: document.querySelector(".editor-header").getBoundingClientRect().height,
      footerBtns: [...document.querySelectorAll(".editor-footer .btn")]
        .filter((b) => b.getBoundingClientRect().width > 0)
        .map((b) => b.innerText.trim()),
      tops: [...document.querySelectorAll(".editor-footer .btn")].map((b) =>
        Math.round(b.getBoundingClientRect().top),
      ),
      addLabel: (() => {
        const s = document.querySelector(".header-actions .btn-primary span");
        return s && s.getBoundingClientRect().width > 0;
      })(),
    }));
    if (d.header !== 86) fail("I", `${tag}: editor header ${d.header} !== 86`);
    if (d.footerBtns.length !== 4 || !d.footerBtns.some((t) => t.includes("Huỷ")))
      fail("I", `${tag}: footer buttons ${JSON.stringify(d.footerBtns)}`);
    if (new Set(d.tops).size !== 1) fail("I", `${tag}: footer not one row ${d.tops}`);
    if (!d.addLabel) fail("I", `${tag}: "Thêm món đồ" label hidden`);
    await page.getByRole("button", { name: /Xoá$/ }).first().click();
    await page.waitForSelector(".confirm-content");
    await shot("delete-confirm");
    await page.getByRole("button", { name: "Giữ lại" }).click();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    if (await page.locator(".confirm-content").count())
      await page.locator(".confirm-content .btn").last().click();
    await page
      .getByRole("button", { name: /Thêm món đồ/ })
      .first()
      .click();
    await page.waitForSelector(".modal");
    await shot("editor-new");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".modal", { state: "detached" });
    await page.locator(".header-actions .desktop-btn").first().click();
    await page.waitForSelector(".modal");
    await page.locator(".tabs button").nth(1).click();
    await shot("import-csv");
    await page.keyboard.press("Escape");
    await page.waitForSelector(".modal", { state: "detached" });
    await page.locator(".header-actions .desktop-btn").nth(1).click();
    await page.waitForSelector(".modal");
    await shot("export");
  } catch (e) {
    fail("script", `${tag}: ${e.message.split("\n")[0]}`);
  }
  await ctx.close();
}

async function diff(browser, theme) {
  if (!BASELINE) return;
  const page = await browser.newPage();
  const names = ["home", "editor", "editor-new", "delete-confirm", "import-csv", "export"];
  for (const n of names) {
    const a = path.join(BASELINE, `desktop-${theme}-${n}.png`);
    const b = path.join(OUT, `desktop-${theme}-${n}.png`);
    if (!fs.existsSync(a) || !fs.existsSync(b)) {
      fail("I", `diff ${theme} ${n}: missing screenshot`);
      continue;
    }
    const pct = await page.evaluate(
      async ([x, y]) => {
        const load = (s) =>
          new Promise((res) => {
            const i = new Image();
            i.onload = () => res(i);
            i.src = s;
          });
        const data = async (s) => {
          const i = await load(s);
          const c = document.createElement("canvas");
          c.width = i.width;
          c.height = i.height;
          const g = c.getContext("2d");
          g.drawImage(i, 0, 0);
          return g.getImageData(0, 0, i.width, i.height).data;
        };
        const p = await data(x);
        const q = await data(y);
        if (p.length !== q.length) return 100;
        let n = 0;
        for (let k = 0; k < p.length; k += 4)
          if (
            Math.abs(p[k] - q[k]) > 8 ||
            Math.abs(p[k + 1] - q[k + 1]) > 8 ||
            Math.abs(p[k + 2] - q[k + 2]) > 8 ||
            Math.abs(p[k + 3] - q[k + 3]) > 8
          )
            n++;
        return (n / (p.length / 4)) * 100;
      },
      [
        "data:image/png;base64," + fs.readFileSync(a).toString("base64"),
        "data:image/png;base64," + fs.readFileSync(b).toString("base64"),
      ],
    );
    info.push(`[I diff] desktop-${theme}-${n}: ${pct.toFixed(2)}% changed`);
  }
  await page.close();
}

(async () => {
  const browser = await chromium.launch();
  if (!flag("desktop-only")) {
    for (const [w, h] of PHONES) for (const t of THEMES) await phoneRun(browser, w, h, t);
    for (const t of THEMES) await editor320(browser, t);
  }
  for (const t of THEMES) {
    await desktop(browser, t);
    await diff(browser, t);
  }
  await browser.close();
  const summary = { failures, info, out: OUT };
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 1));
  console.log(JSON.stringify(summary, null, 1));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
