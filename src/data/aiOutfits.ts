import { ApiError } from "./apiErrors";
import { AiSettingsError } from "./aiSettings";
import { createAuthedFetch, type AuthOptions } from "./authFetch";
import type { DbSeason } from "./mappers";
import { isServerErrorCode } from "@/shared/ai/errors";

type FetchFn = typeof fetch;

export interface AiSuggestInput {
  candidateIds: string[];
  /** DB season id, e.g. "winter". */
  season: DbSeason;
  weather: { cold: boolean; hot: boolean; rain: boolean };
  /** Items shown last time; the server ignores ids that are not candidates. */
  avoidIds?: string[];
}

/** What `POST /api/ai/suggest-outfits` answers: ids ordered main → outer → shoes → accessory. */
export interface AiSuggestResult {
  outfits: { itemIds: string[]; reason: string }[];
}

export interface AiOutfitSuggester {
  suggest(input: AiSuggestInput, signal?: AbortSignal): Promise<AiSuggestResult>;
}

function parseOutfits(json: unknown): AiSuggestResult {
  const list = (json as { outfits?: unknown } | null)?.outfits;
  if (!Array.isArray(list)) throw new AiSettingsError(200, "internal");
  const outfits: AiSuggestResult["outfits"] = [];
  for (const o of list) {
    if (typeof o !== "object" || o === null) continue;
    const { itemIds, reason } = o as Record<string, unknown>;
    if (!Array.isArray(itemIds) || !itemIds.every((x) => typeof x === "string")) continue;
    if (typeof reason !== "string") continue;
    outfits.push({ itemIds: itemIds as string[], reason });
  }
  return { outfits };
}

/** Outfit suggestions through the Node API (`/api/ai/suggest-outfits`). */
export function createHttpAiOutfits(
  fetchFn: FetchFn = (...a) => fetch(...a),
  base = "/api",
  auth: AuthOptions = {},
): AiOutfitSuggester {
  const authedFetch = createAuthedFetch({ fetchFn, ...auth });
  return {
    suggest: async ({ candidateIds, season, weather, avoidIds }, signal) => {
      const { cold, hot, rain } = weather;
      let res: Response;
      try {
        res = await authedFetch(`${base}/ai/suggest-outfits`, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            candidateIds,
            season,
            weather: { cold, hot, rain },
            ...(avoidIds?.length ? { avoidIds } : {}),
          }),
          cache: "no-store",
          credentials: "same-origin",
          redirect: "manual",
          signal,
        });
      } catch (e) {
        if (signal?.aborted) throw e;
        if (e instanceof ApiError && e.status === 401) {
          throw new AiSettingsError(401, "unauthorized");
        }
        throw new AiSettingsError(0, "network");
      }
      let json: unknown;
      try {
        json = await res.json();
      } catch {
        throw new AiSettingsError(res.status, "internal");
      }
      if (!res.ok) {
        const e = (json as { error?: { code?: unknown; requestId?: unknown } } | null)?.error;
        const requestId = typeof e?.requestId === "string" ? e.requestId : undefined;
        throw new AiSettingsError(
          res.status,
          isServerErrorCode(e?.code) ? e.code : "internal",
          requestId,
        );
      }
      return parseOutfits(json);
    },
  };
}
