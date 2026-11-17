// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const DESCRIPTION =
  "Quản lý tủ quần áo cá nhân với tìm kiếm, theo dõi số lần mặc và nhập xuất dữ liệu, giúp bạn dễ dàng sắp xếp và lựa chọn trang phục.";

/** The tags after <title>, as `[name, attribute]` in document order, whitespace-insensitive. */
function headTagsAfterTitle(): string[] {
  const head = html.slice(html.indexOf("</title>"), html.indexOf("</head>"));
  return [...head.matchAll(/<(meta|link)\s+([^>]*?)\/?>/gs)].map(
    (m) => `${m[1]} ${m[2].replace(/\s+/g, " ").trim()}`,
  );
}

describe("index.html", () => {
  it("has the static title, lang, head tags in order; no template slots; no inline script/style", () => {
    expect(html).toContain('<html lang="vi">');
    expect(html).toContain("<title>Tủ đồ của tôi</title>");
    expect(headTagsAfterTitle()).toEqual([
      `meta name="description" content="${DESCRIPTION}"`,
      'meta name="robots" content="noindex, nofollow"',
      'link rel="icon" href="/favicon.png"',
      'meta property="og:title" content="Tủ đồ của tôi"',
      `meta property="og:description" content="${DESCRIPTION}"`,
    ]);
    expect(html).not.toContain("<!--");
    expect(html).not.toMatch(/<style\b/i);
    // CSP forbids inline code: the only <script> is the module entry, with a src.
    const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]);
    expect(scripts).toEqual(['<script type="module" src="/src/main.tsx">']);
  });
});

describe("public/robots.txt", () => {
  it("is noindex", () => {
    expect(fs.readFileSync(path.join(root, "public/robots.txt"), "utf8")).toBe(
      "User-agent: *\nDisallow: /\n",
    );
  });
});
