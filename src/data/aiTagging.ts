import { ApiError } from "./apiErrors";
import { AiSettingsError } from "./aiSettings";
import { createAuthedFetch, type AuthOptions } from "./authFetch";
import { isServerErrorCode } from "@/shared/ai/errors";

type FetchFn = typeof fetch;

/** What `POST /api/ai/tag-photo` answers: DB ids, `null` / `[]` when unknown. */
export interface TagSuggestion {
  name: string | null;
  category: string | null;
  colors: string[];
  seasons: string[];
  material: string | null;
  brand: string | null;
  tags: string[];
}

export interface AiTagger {
  tag(image: Blob, signal?: AbortSignal): Promise<TagSuggestion>;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const strs = (v: unknown): string[] => {
  if (!Array.isArray(v)) throw new AiSettingsError(200, "internal");
  return v.filter((x): x is string => typeof x === "string");
};

function parseSuggestion(json: unknown): TagSuggestion {
  const s = (json as { suggestion?: unknown } | null)?.suggestion;
  if (typeof s !== "object" || s === null || Array.isArray(s)) {
    throw new AiSettingsError(200, "internal");
  }
  const o = s as Record<string, unknown>;
  return {
    name: str(o.name),
    category: str(o.category),
    colors: strs(o.colors),
    seasons: strs(o.seasons),
    material: str(o.material),
    brand: str(o.brand),
    tags: strs(o.tags),
  };
}

/** Photo tagging through the Node API (`/api/ai/tag-photo`): the resized JPEG is the raw body. */
export function createHttpAiTagger(
  fetchFn: FetchFn = (...a) => fetch(...a),
  base = "/api",
  auth: AuthOptions = {},
): AiTagger {
  const authedFetch = createAuthedFetch({ fetchFn, ...auth });
  return {
    tag: async (image, signal) => {
      let res: Response;
      try {
        res = await authedFetch(`${base}/ai/tag-photo`, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "image/jpeg" },
          body: image,
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
      return parseSuggestion(json);
    },
  };
}
