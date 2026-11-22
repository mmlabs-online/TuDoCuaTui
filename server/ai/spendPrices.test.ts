// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AI_MODELS, type AiProvider } from "./catalog.js";
import { GEMINI_TAG_INSTRUCTION } from "./gemini.js";
import { buildSuggestPrompt, buildSuggestSchema } from "./outfitSuggest.js";
import {
  estimateMicroUsd,
  IMAGE_TOKENS_MAX,
  isConfirmedNoCharge,
  KIND_CEILINGS,
  MONTHLY_CAP_MICRO_USD,
  NO_CHARGE_OUTCOMES,
  PRICE_VERSION,
  PRICES,
  spendPeriod,
} from "./spendPrices.js";
import { buildTagSchema, TAG_INSTRUCTION } from "./tagging.js";

const aiDir = import.meta.dirname;

describe("spendPrices (pure)", () => {
  it("PRICE_VERSION matches YYYY-MM-DD; MONTHLY_CAP_MICRO_USD === 20_000_000; PRICES and its entries are frozen", () => {
    expect(PRICE_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(MONTHLY_CAP_MICRO_USD).toBe(20_000_000);
    expect(Object.isFrozen(PRICES)).toBe(true);
    for (const v of Object.values(PRICES)) {
      expect(Object.isFrozen(v)).toBe(true);
    }
  });

  it("every AI_MODELS id (both providers) has a price entry and estimateMicroUsd returns a positive integer for photo_fill and suggest", () => {
    for (const provider of ["gemini", "claude"] as AiProvider[]) {
      for (const m of AI_MODELS[provider]) {
        for (const kind of ["photo_fill", "suggest"]) {
          const cost = estimateMicroUsd(provider, m.id, kind);
          expect(cost, `${provider}:${m.id} for ${kind}`).toBeTypeOf("number");
          expect(Number.isInteger(cost)).toBe(true);
          expect(cost!).toBeGreaterThan(0);
        }
      }
    }
  });

  it("estimateMicroUsd equals ceil(in*inPrice/1e6) + ceil(out*outPrice/1e6) for a fixture entry and always returns an integer >= 1", () => {
    const fixtureTable = {
      "test:model": { inMicroUsdPerMTok: 123_456, outMicroUsdPerMTok: 654_321 },
    };
    const c = KIND_CEILINGS.photo_fill!;
    const expected =
      Math.ceil((c.inputTokens * 123_456) / 1e6) + Math.ceil((c.outputTokens * 654_321) / 1e6);
    const result = estimateMicroUsd("test", "model", "photo_fill", fixtureTable);
    expect(result).toBe(expected);
    expect(Number.isInteger(result)).toBe(true);
    expect(result!).toBeGreaterThanOrEqual(1);
  });

  it("unknown provider/model, constructor/toString/__proto__ as model, sticker on a text-only entry -> null", () => {
    expect(estimateMicroUsd("unknown", "model", "photo_fill")).toBeNull();
    expect(estimateMicroUsd("gemini", "unknown-model", "photo_fill")).toBeNull();
    for (const bad of ["constructor", "toString", "__proto__", "valueOf"]) {
      expect(estimateMicroUsd("gemini", bad, "photo_fill")).toBeNull();
      expect(estimateMicroUsd(bad, "gemini-2.5-flash", "photo_fill")).toBeNull();
    }
    expect(estimateMicroUsd("gemini", "gemini-2.5-flash", "sticker")).toBeNull();
  });

  it("an image entry ({ microUsdPerImage } fixture via an injected table) prices sticker and returns null for text kinds", () => {
    const imageTable = {
      "image-prov:sticker-gen": {
        microUsdPerImage: 40_000,
        inMicroUsdPerMTok: 500_000,
      },
      "image-prov:fixed-only": {
        microUsdPerImage: 35_000,
      },
    };
    const withInput = estimateMicroUsd("image-prov", "sticker-gen", "sticker", imageTable);
    const expectedWithInput = Math.ceil(40_000 + (IMAGE_TOKENS_MAX * 500_000) / 1e6);
    expect(withInput).toBe(expectedWithInput);

    const fixed = estimateMicroUsd("image-prov", "fixed-only", "sticker", imageTable);
    expect(fixed).toBe(35_000);

    expect(estimateMicroUsd("image-prov", "sticker-gen", "photo_fill", imageTable)).toBeNull();
    expect(estimateMicroUsd("image-prov", "sticker-gen", "suggest", imageTable)).toBeNull();
  });

  it("KIND_CEILINGS.*.outputTokens >= Gemini MAX_OUTPUT_TOKENS + largest GEMINI_THINKING budget, and >= Claude max_tokens", () => {
    const geminiSrc = readFileSync(path.join(aiDir, "gemini.js"), "utf8");
    const claudeSrc = readFileSync(path.join(aiDir, "claude.js"), "utf8");

    const maxOutMatch = /const\s+MAX_OUTPUT_TOKENS\s*=\s*(\d+);/.exec(geminiSrc);
    expect(maxOutMatch).not.toBeNull();
    const geminiMaxOut = Number(maxOutMatch![1]);

    const thinkingBudgets = [...geminiSrc.matchAll(/thinkingBudget:\s*(\d+)/g)].map((m) =>
      Number(m[1]),
    );
    const maxThinking = Math.max(...thinkingBudgets);

    const claudeMaxTokensMatch = /max_tokens:\s*(\d+)/.exec(claudeSrc);
    expect(claudeMaxTokensMatch).not.toBeNull();
    const claudeMaxTokens = Number(claudeMaxTokensMatch![1]);

    const geminiRequirement = geminiMaxOut + maxThinking;

    for (const kind of ["photo_fill", "suggest"] as const) {
      const ceiling = KIND_CEILINGS[kind]!;
      expect(ceiling.outputTokens).toBeGreaterThanOrEqual(geminiRequirement);
      expect(ceiling.outputTokens).toBeGreaterThanOrEqual(claudeMaxTokens);
    }
  });

  it("KIND_CEILINGS.suggest.inputTokens >= UTF-8 bytes of buildSuggestPrompt with 40 worst-case candidates + JSON.stringify(buildSuggestSchema(aliases)) + 1000", () => {
    const candidates = Array.from({ length: 40 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      name: "Đầm dạ hội lụa tơ tằm dệt kim thiết kế đính đá đặc biệt sang trọng", // ~65 char vietnamese
      category: "dress",
      material: "Lụa tơ tằm thượng hạng kết hợp sợi tơ dệt kim đan chéo",
      colors: ["đen", "trắng", "đỏ", "xanh navy", "vàng kim", "hồng phấn"],
      seasons: ["xuân", "hạ", "thu", "đông"],
      tags: ["tiệc tối", "cao cấp", "dạ hội", "sự kiện", "trang trọng", "vintage"],
      notes: "Mẫu đầm đặc biệt lưu giữ trong tủ chuyên dụng số một cần nâng niu kỹ lưỡng",
      wear_count: 0,
      last_worn: null,
    }));

    const { prompt, aliases } = buildSuggestPrompt(candidates, {
      season: "đông",
      weather: { cold: true, hot: false, rain: true },
      avoidIds: [candidates[0].id, candidates[1].id],
      today: "2026-11-22",
    });
    const schema = buildSuggestSchema(aliases);
    const bytes =
      Buffer.byteLength(prompt, "utf8") + Buffer.byteLength(JSON.stringify(schema), "utf8");

    expect(KIND_CEILINGS.suggest!.inputTokens).toBeGreaterThanOrEqual(bytes + 1000);
  });

  it("KIND_CEILINGS.photo_fill.inputTokens >= IMAGE_TOKENS_MAX + bytes of TAG_INSTRUCTION/GEMINI_TAG_INSTRUCTION + tag schema JSON + 1000", () => {
    const maxInstBytes = Math.max(
      Buffer.byteLength(TAG_INSTRUCTION, "utf8"),
      Buffer.byteLength(GEMINI_TAG_INSTRUCTION, "utf8"),
    );
    const schemaBytes = Buffer.byteLength(JSON.stringify(buildTagSchema()), "utf8");
    const total = IMAGE_TOKENS_MAX + maxInstBytes + schemaBytes + 1000;

    expect(KIND_CEILINGS.photo_fill!.inputTokens).toBeGreaterThanOrEqual(total);
  });

  it("isConfirmedNoCharge: true for not_sent and pre-generation HTTP errors; false for others", () => {
    for (const code of NO_CHARGE_OUTCOMES) {
      expect(isConfirmedNoCharge(code), code).toBe(true);
    }
    const falseCases = [
      "ok",
      "provider_unavailable",
      "provider_bad_response",
      "request_timeout",
      "internal",
      "",
      "toString",
      "constructor",
      null,
      undefined,
      123,
      {},
    ];
    for (const c of falseCases) {
      expect(isConfirmedNoCharge(c), String(c)).toBe(false);
    }
  });

  it("spendPeriod: UTC+7 month boundary", () => {
    expect(spendPeriod(new Date("2026-11-30T16:59:59.999Z").getTime())).toBe("2026-11");
    expect(spendPeriod(new Date("2026-11-30T17:00:00.000Z").getTime())).toBe("2026-12");
    expect(spendPeriod(new Date("2026-12-31T17:00:00.000Z").getTime())).toBe("2027-01");
  });
});
