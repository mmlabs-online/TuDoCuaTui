import { describe, expect, it } from "vitest";

import type { TagSuggestion } from "@/data/aiTagging";
import type { AiSettingsView } from "@/shared/ai/catalog";
import {
  aiAvailability,
  aiErrorText,
  fillEmpty,
  needsSettings,
  photoSourceFor,
  suggestionToFields,
  undoFill,
  type AiFields,
} from "./aiFill";
import { blankItem } from "./blankItem";
import { EDITOR_COPY } from "./copy";

const sugg = (o: Partial<TagSuggestion> = {}): TagSuggestion => ({
  name: null,
  category: null,
  colors: [],
  seasons: [],
  material: null,
  brand: null,
  tags: [],
  ...o,
});

describe("suggestionToFields", () => {
  it("maps category ids to labels; null, unknown and retired ids give none", () => {
    expect(suggestionToFields(sugg({ category: "top" })).category).toBe("Áo");
    expect(suggestionToFields(sugg({ category: "ao_dai" })).category).toBe("Áo dài");
    for (const c of [null, "zzz", "bag", "__proto__", "constructor"]) {
      expect(suggestionToFields(sugg({ category: c })).category).toBeUndefined();
    }
  });

  it("maps colours and seasons, dropping unknown and duplicates", () => {
    const f = suggestionToFields(
      sugg({ colors: ["trang", "xyz", "trang", "__proto__"], seasons: ["winter", "nope"] }),
    );
    expect(f.colors).toEqual(["Trắng"]);
    expect(f.seasons).toEqual(["Đông"]);
    expect(suggestionToFields(sugg({ colors: ["xyz"] })).colors).toBeUndefined();
  });

  it("trims strings and drops empty ones", () => {
    const f = suggestionToFields(sugg({ brand: "  Zara ", material: "   ", name: "" }));
    expect(f.brand).toBe("Zara");
    expect(f.material).toBeUndefined();
    expect(f.name).toBeUndefined();
  });

  it("drops a name over 120 code points and keeps one of exactly 120", () => {
    expect(suggestionToFields(sugg({ name: "a".repeat(121) })).name).toBeUndefined();
    const ok = "Á".repeat(120);
    expect(suggestionToFields(sugg({ name: ok })).name).toBe(ok);
  });

  it("normalises to NFC", () => {
    const f = suggestionToFields(sugg({ name: "Áo" }));
    expect(f.name).toBe("Áo");
  });

  it("cleans tags: trimmed, empty / comma-containing dropped, deduped", () => {
    const f = suggestionToFields(sugg({ tags: [" đi làm ", "", "a, b", "đi làm", "dự tiệc"] }));
    expect(f.tags).toEqual(["đi làm", "dự tiệc"]);
  });
});

describe("fillEmpty", () => {
  const fields: AiFields = {
    name: "Áo AI",
    category: "Đầm",
    colors: ["Trắng"],
    seasons: ["Hạ"],
    material: "Cotton",
    brand: "Zara",
    tags: ["đi làm"],
  };
  const opts = { categoryFillable: true };

  it("fills every empty field", () => {
    const { patch, previous } = fillEmpty(blankItem(), fields, opts);
    expect(patch).toEqual(fields);
    expect(previous).toEqual({
      name: "",
      category: "Áo",
      colors: [],
      seasons: [],
      material: "",
      brand: "",
      tags: [],
    });
  });

  it("treats a whitespace-only string as empty", () => {
    const { patch } = fillEmpty(
      { ...blankItem(), name: "  ", brand: " ", material: "\t" },
      fields,
      opts,
    );
    expect(patch).toMatchObject({ name: "Áo AI", brand: "Zara", material: "Cotton" });
  });

  it("never overwrites typed values", () => {
    const item = {
      ...blankItem(),
      name: "Áo của tôi",
      brand: "Uniqlo",
      material: "Linen",
      colors: ["Đen"],
      seasons: ["Xuân"],
      tags: ["x"],
    };
    expect(fillEmpty(item, fields, opts)).toEqual({
      patch: { category: "Đầm" },
      previous: { category: "Áo" },
    });
  });

  it("fills category only when fillable", () => {
    expect(
      fillEmpty(blankItem(), fields, { categoryFillable: false }).patch.category,
    ).toBeUndefined();
  });

  it("skips fields with no suggestion and never touches other fields", () => {
    const item = {
      ...blankItem(),
      size: "M",
      location: "Tủ",
      price: 5,
      notes: "n",
      photo: "data:x",
    };
    const { patch } = fillEmpty(item, { name: "A" }, opts);
    expect(patch).toEqual({ name: "A" });
    expect(Object.keys(fillEmpty(item, fields, opts).patch).sort()).toEqual([
      "brand",
      "category",
      "colors",
      "material",
      "name",
      "seasons",
      "tags",
    ]);
  });

  it("returns an empty patch when there is nothing to fill", () => {
    expect(fillEmpty(blankItem(), {}, opts)).toEqual({ patch: {}, previous: {} });
  });
});

describe("undoFill", () => {
  const record = {
    patch: { name: "Áo AI", colors: ["Trắng"] },
    previous: { name: "", colors: [] },
  };

  it("restores every filled key", () => {
    const item = { ...blankItem(), name: "Áo AI", colors: ["Trắng"] };
    expect(undoFill(item, record)).toEqual({ name: "", colors: [] });
  });

  it("leaves a field the user edited after the fill", () => {
    const item = { ...blankItem(), name: "Tôi sửa", colors: ["Trắng"] };
    expect(undoFill(item, record)).toEqual({ colors: [] });
  });

  it("returns an empty patch when everything was edited", () => {
    const item = { ...blankItem(), name: "x", colors: ["Đen"] };
    expect(undoFill(item, record)).toEqual({});
  });
});

describe("aiAvailability", () => {
  const view = (o: Partial<AiSettingsView> = {}): AiSettingsView => ({
    provider: "claude",
    model: "claude-haiku-5-5",
    keyHint: "••••wxyz",
    hasKey: true,
    modelSupported: true,
    updatedAt: "2026-11-17T00:00:00Z",
    ...o,
  });
  const loaded = (v: AiSettingsView | null) => ({ state: "loaded" as const, view: v });

  it("maps the load state", () => {
    expect(aiAvailability({ state: "loading" }, true).kind).toBe("loading");
    expect(aiAvailability({ state: "error", code: "server_misconfigured" }, true).kind).toBe(
      "misconfigured",
    );
    expect(aiAvailability({ state: "error", code: "network" }, true).kind).toBe("load_error");
  });

  it("no settings or no key -> no_key, even without a photo", () => {
    expect(aiAvailability(loaded(null), false).kind).toBe("no_key");
    expect(aiAvailability(loaded(view({ hasKey: false })), false).kind).toBe("no_key");
  });

  it("unsupported model", () => {
    expect(aiAvailability(loaded(view({ modelSupported: false })), true).kind).toBe(
      "model_unsupported",
    );
  });

  it("no photo vs ready, with the provider", () => {
    expect(aiAvailability(loaded(view()), false)).toEqual({ kind: "no_photo", provider: "claude" });
    expect(aiAvailability(loaded(view({ provider: "gemini" })), true)).toEqual({
      kind: "ready",
      provider: "gemini",
    });
  });
});

describe("photoSourceFor", () => {
  it("data: and blob: photos are their own source", () => {
    expect(photoSourceFor("data:image/jpeg;base64,xx", null)).toBe("data:image/jpeg;base64,xx");
    expect(photoSourceFor("blob:http://x/1", null)).toBe("blob:http://x/1");
  });
  it("a stored photo uses the loaded blob URL, null while pending", () => {
    const p = "/api/photos/22222222-2222-4222-8222-222222222222";
    expect(photoSourceFor(p, "blob:http://x/2")).toBe("blob:http://x/2");
    expect(photoSourceFor(p, null)).toBeNull();
  });
  it("no photo -> null", () => {
    expect(photoSourceFor("", "blob:http://x/2")).toBeNull();
  });
});

describe("aiErrorText / needsSettings", () => {
  it("uses the editor copy for not_configured and rate_limited", () => {
    expect(aiErrorText("not_configured")).toBe(EDITOR_COPY.ai.notConfigured);
    expect(aiErrorText("rate_limited")).toBe(EDITOR_COPY.ai.rateLimited);
  });
  it("falls back to the settings copy", () => {
    expect(aiErrorText("ai_busy")).toBe("AI đang bận, thử lại sau vài giây");
    expect(aiErrorText("internal", "r9")).toBe("Lỗi máy chủ (mã r9)");
  });
  it("needsSettings only for settings-fixable codes", () => {
    for (const c of [
      "not_configured",
      "key_unreadable",
      "invalid_key",
      "key_forbidden",
      "invalid_model",
      "model_unavailable",
    ]) {
      expect(needsSettings(c)).toBe(true);
    }
    for (const c of ["ai_busy", "network", "rate_limited", "internal"]) {
      expect(needsSettings(c)).toBe(false);
    }
  });
});
