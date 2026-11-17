// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { AI_MODELS, AI_ERROR_STATUS } from "./catalog.js";
import {
  GEMINI_BASE,
  GEMINI_TAG_INSTRUCTION,
  GEMINI_THINKING,
  buildGeminiSchema,
  checkGeminiKey,
  tagPhotoWithGemini,
} from "./gemini.js";
import { CATEGORIES, COLOR_IDS, SEASONS } from "../validate.js";
import { TAG_FIELDS } from "./tagging.js";

const SENTINEL = "AIzaSENTINEL-0123456789abcdefghijkl";
const MODEL = "gemini-2.5-flash";
const INFO = "type.googleapis.com/google.rpc.ErrorInfo";
const fetchOf = (f: (url: string, init: RequestInit) => Promise<unknown>) =>
  vi.fn(f) as unknown as typeof globalThis.fetch & ReturnType<typeof vi.fn>;
const callOf = (f: ReturnType<typeof fetchOf>) =>
  (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const googleError = (status: number, reason?: string, extra: object = {}) =>
  json(
    {
      error: {
        code: status,
        message: "API key not valid. " + SENTINEL,
        status: "INVALID_ARGUMENT",
        ...(reason ? { details: [{ "@type": INFO, reason, domain: "googleapis.com" }] } : {}),
        ...extra,
      },
    },
    status,
  );

/** A 2xx response whose body readers throw: proves the check never reads a success body. */
function guarded(status: number) {
  const cancel = vi.fn(async () => {});
  const boom = () => {
    throw new Error("body read");
  };
  const res = {
    ok: status >= 200 && status < 300,
    status,
    body: { cancel, getReader: boom },
    json: boom,
    text: boom,
    arrayBuffer: boom,
  };
  return { res, cancel };
}

/** A body of more than 8 KB with API_KEY_INVALID after the cap; records cancel. */
function oversizedError() {
  const cancel = vi.fn();
  const text = JSON.stringify({
    error: {
      message: "x".repeat(9 * 1024),
      details: [{ "@type": INFO, reason: "API_KEY_INVALID" }],
    },
  });
  const bytes = new TextEncoder().encode(text);
  let off = 0;
  const stream = new ReadableStream({
    pull(c) {
      if (off >= bytes.length) return c.close();
      c.enqueue(bytes.slice(off, off + 1024));
      off += 1024;
    },
    cancel,
  });
  return { res: new Response(stream, { status: 400 }), cancel };
}

const ERROR_CASES: [() => Response, string][] = [
  [() => googleError(400, "API_KEY_INVALID"), "invalid_key"],
  [() => googleError(400, undefined, { status: "FAILED_PRECONDITION" }), "key_forbidden"],
  [() => googleError(400), "provider_unavailable"],
  [() => new Response("not json", { status: 400 }), "provider_unavailable"],
  [() => googleError(401), "invalid_key"],
  [() => googleError(403, "SERVICE_DISABLED"), "key_forbidden"],
  [() => googleError(404), "model_unavailable"],
  [() => googleError(429), "provider_rate_limited"],
  [() => googleError(500), "provider_unavailable"],
  [() => googleError(503), "provider_unavailable"],
];

const hang = () =>
  fetchOf(
    (_url, init) =>
      new Promise((_, reject) => {
        init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
      }),
  );

describe("checkGeminiKey", () => {
  it("check: key only in x-goog-api-key to the pinned URL", async () => {
    const f = fetchOf(async () => guarded(200).res);
    await checkGeminiKey({ fetch: f, key: SENTINEL, model: MODEL });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = callOf(f);
    expect(GEMINI_BASE).toBe("https://generativelanguage.googleapis.com/v1beta/models/");
    expect(url).toBe(GEMINI_BASE + MODEL);
    expect(new URL(url).search).toBe("");
    expect(url).not.toContain("key=");
    expect(url).not.toContain(SENTINEL);
    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("error");
    expect(init.headers).toEqual({ "x-goog-api-key": SENTINEL });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect("body" in init).toBe(false);
    const { headers, ...rest } = init;
    expect(JSON.stringify([url, rest])).not.toContain(SENTINEL);
    expect(headers).toBeDefined();
  });

  it("check: model id is URL-encoded", async () => {
    const f = fetchOf(async () => guarded(200).res);
    await checkGeminiKey({ fetch: f, key: SENTINEL, model: "a/b:c" });
    const url = callOf(f)[0];
    expect(url).toBe(GEMINI_BASE + "a%2Fb%3Ac");
    expect(new URL(url).pathname).toBe("/v1beta/models/a%2Fb%3Ac");
  });

  it("check: HTTP errors", async () => {
    const ok = guarded(200);
    expect(
      await checkGeminiKey({ fetch: fetchOf(async () => ok.res), key: SENTINEL, model: MODEL }),
    ).toEqual({
      ok: true,
    });
    expect(ok.cancel).toHaveBeenCalledTimes(1);
    for (const [mk, code] of ERROR_CASES) {
      const r = await checkGeminiKey({
        fetch: fetchOf(async () => mk()),
        key: SENTINEL,
        model: MODEL,
      });
      expect(r).toEqual({ ok: false, code });
      expect(JSON.stringify(r)).not.toContain(SENTINEL);
      expect(code in AI_ERROR_STATUS).toBe(true);
    }
    const big = oversizedError();
    const r = await checkGeminiKey({
      fetch: fetchOf(async () => big.res),
      key: SENTINEL,
      model: MODEL,
    });
    expect(r).toEqual({ ok: false, code: "provider_unavailable" });
    expect(big.cancel).toHaveBeenCalled();
  });

  it("check: timeout, network, redirect", async () => {
    const unavailable = { ok: false, code: "provider_unavailable" };
    expect(
      await checkGeminiKey({ fetch: hang(), key: SENTINEL, model: MODEL, timeoutMs: 20 }),
    ).toEqual(unavailable);
    const net = fetchOf(async () => {
      throw new TypeError("fetch failed " + SENTINEL);
    });
    const r = await checkGeminiKey({ fetch: net, key: SENTINEL, model: MODEL });
    expect(r).toEqual(unavailable);
    expect(JSON.stringify(r)).not.toContain(SENTINEL);
    const redirect = fetchOf(async () => {
      throw new TypeError("unexpected redirect");
    });
    expect(await checkGeminiKey({ fetch: redirect, key: SENTINEL, model: MODEL })).toEqual(
      unavailable,
    );
  });
});

describe("buildGeminiSchema", () => {
  it("translates buildTagSchema into Gemini's dialect", () => {
    const s = buildGeminiSchema() as any;
    expect(s.type).toBe("OBJECT");
    expect(s.required).toEqual([
      "name",
      "category",
      "colors",
      "seasons",
      "material",
      "brand",
      "tags",
    ]);
    expect(s.properties.category).toEqual({
      type: "STRING",
      nullable: true,
      enum: [...CATEGORIES],
    });
    for (const dead of ["bag", "sport", "home"])
      expect(s.properties.category.enum).not.toContain(dead);
    expect(s.properties.colors).toEqual({
      type: "ARRAY",
      maxItems: 3,
      items: { type: "STRING", enum: [...COLOR_IDS] },
    });
    expect(s.properties.seasons).toEqual({
      type: "ARRAY",
      maxItems: 4,
      items: { type: "STRING", enum: [...SEASONS] },
    });
    expect(s.properties.tags).toEqual({ type: "ARRAY", maxItems: 5, items: { type: "STRING" } });
    for (const k of ["name", "material", "brand"]) {
      expect(s.properties[k]).toEqual({ type: "STRING", nullable: true });
    }
    const walk = (node: any) => {
      expect(node).not.toHaveProperty("additionalProperties");
      expect(node).not.toHaveProperty("maxLength");
      expect(typeof node.type).toBe("string");
      expect(node.type).toBe(node.type.toUpperCase());
      if (node.enum) expect(node.enum).not.toContain(null);
      if (node.items) walk(node.items);
      if (node.properties) Object.values(node.properties).forEach(walk);
    };
    walk(s);
  });

  it("GEMINI_TAG_INSTRUCTION", () => {
    expect(GEMINI_TAG_INSTRUCTION.endsWith(TAG_FIELDS)).toBe(true);
    expect(GEMINI_TAG_INSTRUCTION).not.toContain("tag_item");
    expect(GEMINI_TAG_INSTRUCTION).not.toContain("tool");
  });

  it("thinking config exists for every catalog id", () => {
    expect(Object.keys(GEMINI_THINKING).sort()).toEqual(AI_MODELS.gemini.map((m) => m.id).sort());
    for (const v of Object.values(GEMINI_THINKING)) {
      const ok =
        (Object.keys(v).join() === "thinkingBudget" &&
          Number.isInteger(v.thinkingBudget) &&
          (v.thinkingBudget as number) >= 0) ||
        (Object.keys(v).join() === "thinkingLevel" && typeof v.thinkingLevel === "string");
      expect(ok).toBe(true);
    }
  });
});

describe("tagPhotoWithGemini", () => {
  const image = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]);
  const obj = { name: "Áo", category: "top" };
  const answer = (parts: unknown[], finishReason: unknown = "STOP") =>
    json({ candidates: [{ finishReason, content: { role: "model", parts } }] });
  const good = () => answer([{ text: JSON.stringify(obj) }]);
  const run = (f: ReturnType<typeof fetchOf>, extra: object = {}) =>
    tagPhotoWithGemini({ fetch: f, key: SENTINEL, model: MODEL, image, ...extra });
  const bad = { ok: false, code: "provider_bad_response" };

  it("tag: key only in x-goog-api-key to the pinned URL", async () => {
    const f = fetchOf(async () => good());
    await run(f);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = callOf(f);
    expect(url).toBe(GEMINI_BASE + encodeURIComponent(MODEL) + ":generateContent");
    expect(new URL(url).search).toBe("");
    expect(url).not.toContain("key=");
    expect(url).not.toContain(SENTINEL);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(init.headers).toEqual({
      "x-goog-api-key": SENTINEL,
      "content-type": "application/json",
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.body as string).not.toContain(SENTINEL);
  });

  it("tag: request body shape", async () => {
    const f = fetchOf(async () => good());
    await run(f);
    const body = JSON.parse(callOf(f)[1].body as string);
    expect(Object.keys(body).sort()).toEqual(["contents", "generationConfig"]);
    expect(body.contents).toHaveLength(1);
    expect(body.contents[0].role).toBe("user");
    const [img, txt] = body.contents[0].parts;
    expect(body.contents[0].parts).toHaveLength(2);
    expect(Object.keys(img)).toEqual(["inline_data"]);
    expect(Object.keys(img.inline_data).sort()).toEqual(["data", "mime_type"]);
    expect(img.inline_data.mime_type).toBe("image/jpeg");
    expect(Buffer.from(img.inline_data.data, "base64").equals(image)).toBe(true);
    expect(txt).toEqual({ text: GEMINI_TAG_INSTRUCTION });
    expect(body.generationConfig).toEqual({
      responseMimeType: "application/json",
      responseSchema: JSON.parse(JSON.stringify(buildGeminiSchema())),
      maxOutputTokens: 2048,
      temperature: 0,
      thinkingConfig: GEMINI_THINKING[MODEL],
    });
    expect(body).not.toHaveProperty("systemInstruction");
    expect(body).not.toHaveProperty("tools");
  });

  it("tag: success returns raw object", async () => {
    expect(await run(fetchOf(async () => good()))).toEqual({ ok: true, input: obj });
    const text = JSON.stringify(obj);
    const split = answer([{ text: text.slice(0, 5) }, { text: text.slice(5) }]);
    expect(await run(fetchOf(async () => split))).toEqual({ ok: true, input: obj });
    const thought = answer([{ thought: true, text: "thinking…" }, { text }]);
    expect(await run(fetchOf(async () => thought))).toEqual({ ok: true, input: obj });
  });

  it("tag: bad responses -> provider_bad_response", async () => {
    const text = JSON.stringify(obj);
    const cases: Response[] = [
      answer([{ text }], "MAX_TOKENS"),
      answer([], "MAX_TOKENS"),
      answer([{ text }], "SAFETY"),
      answer([{ text }], "RECITATION"),
      answer([{ text }], "PROHIBITED_CONTENT"),
      answer([{ text }], "OTHER"),
      json({ candidates: [{ content: { parts: [{ text }] } }] }),
      json({ promptFeedback: { blockReason: "SAFETY" } }),
      json({ candidates: [] }),
      json({}),
      answer([{ thought: true, text }]),
      answer([{ inline_data: { mime_type: "image/png", data: "" } }]),
      answer([{ text: "not json " + SENTINEL }]),
      answer([{ text: "[1,2]" }]),
      answer([{ text: '"str"' }]),
      answer([{ text: "null" }]),
      new Response("not json"),
      json(null),
    ];
    for (const res of cases) {
      const r = await run(fetchOf(async () => res));
      expect(r).toEqual(bad);
      expect(JSON.stringify(r)).not.toContain(SENTINEL);
    }
  });

  it("tag: body over 64 KB is cancelled, not buffered", async () => {
    const cancel = vi.fn();
    let pulls = 0;
    const stream = new ReadableStream({
      pull(c) {
        pulls++;
        c.enqueue(new Uint8Array(16 * 1024));
      },
      cancel,
    });
    expect(await run(fetchOf(async () => new Response(stream)))).toEqual(bad);
    expect(cancel).toHaveBeenCalled();
    expect(pulls).toBeLessThan(10);
  });

  it("tag: HTTP errors", async () => {
    for (const [mk, code] of ERROR_CASES) {
      const r = await run(fetchOf(async () => mk()));
      expect(r).toEqual({ ok: false, code });
      expect(JSON.stringify(r)).not.toContain(SENTINEL);
    }
    const big = oversizedError();
    expect(await run(fetchOf(async () => big.res))).toEqual({
      ok: false,
      code: "provider_unavailable",
    });
    expect(big.cancel).toHaveBeenCalled();
  });

  it("tag: timeout, network, abort, redirect", async () => {
    const unavailable = { ok: false, code: "provider_unavailable" };
    expect(await run(hang(), { timeoutMs: 20 })).toEqual(unavailable);
    const net = fetchOf(async () => {
      throw new TypeError("fetch failed " + SENTINEL);
    });
    const r = await run(net);
    expect(r).toEqual(unavailable);
    expect(JSON.stringify(r)).not.toContain(SENTINEL);
    const ctl = new AbortController();
    const h = hang();
    const p = run(h, { signal: ctl.signal });
    ctl.abort();
    expect(await p).toEqual(unavailable);
    expect(callOf(h)[1].signal!.aborted).toBe(true);
    const redirect = fetchOf(async () => {
      throw new TypeError("unexpected redirect");
    });
    expect(await run(redirect)).toEqual(unavailable);
  });
});
