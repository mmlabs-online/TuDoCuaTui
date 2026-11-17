import type { TagSuggestion } from "@/data/aiTagging";
import { CATEGORY_FROM_DB, COLOR_FROM_DB, SEASON_FROM_DB } from "@/data/mappers";
import type { AiSettingsView } from "@/shared/ai/catalog";
import type { AiProvider } from "@/shared/ai/catalog";
import type { Item } from "@/types/item";
import { aiErrorMessage } from "@/features/settings/copy";
import { EDITOR_COPY } from "./copy";
import { NAME_MAX } from "./validate";

/** The item fields the AI can fill, as UI labels. A key is absent when the suggestion has nothing for it. */
export interface AiFields {
  name?: string;
  category?: string;
  colors?: string[];
  seasons?: string[];
  material?: string;
  brand?: string;
  tags?: string[];
}
export type FillKey = keyof AiFields;
export type FillPatch = Partial<Pick<Item, FillKey>>;
export interface FillRecord {
  patch: FillPatch;
  previous: FillPatch;
}

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const clean = (v: string | null) => (v ?? "").normalize("NFC").trim();
const unique = (xs: string[]) => [...new Set(xs)];
const mapIds = (ids: string[], table: Record<string, string>) =>
  unique(ids.filter((id) => own(table, id)).map((id) => table[id]));

/** DB ids (as the server sends) → UI labels, dropping anything unknown or not usable in the form. */
export function suggestionToFields(s: TagSuggestion): AiFields {
  const f: AiFields = {};
  const name = clean(s.name);
  if (name && [...name].length <= NAME_MAX) f.name = name;
  if (s.category !== null && own(CATEGORY_FROM_DB, s.category)) {
    f.category = CATEGORY_FROM_DB[s.category as keyof typeof CATEGORY_FROM_DB];
  }
  const colors = mapIds(s.colors, COLOR_FROM_DB);
  if (colors.length) f.colors = colors;
  const seasons = mapIds(s.seasons, SEASON_FROM_DB);
  if (seasons.length) f.seasons = seasons;
  const material = clean(s.material);
  if (material) f.material = material;
  const brand = clean(s.brand);
  if (brand) f.brand = brand;
  // The editor joins tags with ", ", so a tag containing a comma would split on the next edit.
  const tags = unique(s.tags.map((t) => clean(t)).filter((t) => t && !t.includes(",")));
  if (tags.length) f.tags = tags;
  return f;
}

/** Only fields that are empty in `item` get the suggestion. `previous` holds the old values for undo. */
export function fillEmpty(
  item: Item,
  fields: AiFields,
  { categoryFillable }: { categoryFillable: boolean },
): FillRecord {
  const patch: FillPatch = {};
  const previous: FillPatch = {};
  const set = <K extends FillKey>(k: K, value: Item[K] | undefined, empty: boolean) => {
    if (value === undefined || !empty) return;
    patch[k] = value;
    previous[k] = item[k];
  };
  set("name", fields.name, item.name.trim() === "");
  set("category", fields.category, categoryFillable);
  set("colors", fields.colors, item.colors.length === 0);
  set("seasons", fields.seasons, item.seasons.length === 0);
  set("material", fields.material, item.material.trim() === "");
  set("brand", fields.brand, item.brand.trim() === "");
  set("tags", fields.tags, item.tags.length === 0);
  return { patch, previous };
}

const same = (a: unknown, b: unknown) =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((x, i) => x === b[i])
    : a === b;

/** Old values for every filled key the user has not edited since. */
export function undoFill(item: Item, { patch, previous }: FillRecord): FillPatch {
  const out: FillPatch = {};
  for (const k of Object.keys(patch) as FillKey[]) {
    if (same(item[k], patch[k])) (out as Record<string, unknown>)[k] = previous[k];
  }
  return out;
}

export type AiLoad =
  | { state: "loading" }
  | { state: "error"; code: string }
  | { state: "loaded"; view: AiSettingsView | null };

export type AiAvailability =
  | { kind: "loading" | "misconfigured" | "load_error" | "no_key" | "model_unsupported" }
  | { kind: "no_photo"; provider: AiProvider }
  | { kind: "ready"; provider: AiProvider };

export function aiAvailability(load: AiLoad, hasPhoto: boolean): AiAvailability {
  if (load.state === "loading") return { kind: "loading" };
  if (load.state === "error") {
    return { kind: load.code === "server_misconfigured" ? "misconfigured" : "load_error" };
  }
  if (!load.view || !load.view.hasKey) return { kind: "no_key" };
  if (!load.view.modelSupported) return { kind: "model_unsupported" };
  return { kind: hasPhoto ? "ready" : "no_photo", provider: load.view.provider };
}

/** The URL to read the photo bytes from, or null while it is not available. */
export function photoSourceFor(photo: string, storedSrc: string | null): string | null {
  if (!photo) return null;
  if (photo.startsWith("data:") || photo.startsWith("blob:")) return photo;
  return storedSrc;
}

export function aiErrorText(code: string, requestId?: string): string {
  if (code === "not_configured") return EDITOR_COPY.ai.notConfigured;
  if (code === "rate_limited") return EDITOR_COPY.ai.rateLimited;
  return aiErrorMessage(code, requestId);
}

const SETTINGS_FIXES = new Set([
  "not_configured",
  "key_unreadable",
  "invalid_key",
  "key_forbidden",
  "invalid_model",
  "model_unavailable",
]);
export const needsSettings = (code: string) => SETTINGS_FIXES.has(code);
