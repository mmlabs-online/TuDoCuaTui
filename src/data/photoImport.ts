import { IMPORT_EXPORT_COPY } from "@/features/import-export/copy";
import { blankItem } from "@/features/items/blankItem";
import { fillEmpty, suggestionToFields, type AiFields } from "@/features/items/aiFill";
import { NAME_MAX } from "@/features/items/validate";
import type { Item, Status } from "@/types/item";
import { AiSettingsError } from "./aiSettings";
import type { TagSuggestion } from "./aiTagging";
import { API_ERROR_COPY, ApiError, PhotoSaveError } from "./apiErrors";
import { PhotoPrepError, withPhotoType } from "./photoPrep";
import type { SaveOptions } from "./repo";

/** Mirrors `PHOTO_LIMITS.dailyMax` in server/photoQuota.js (uploads per rolling 24 h). */
export const PHOTO_DAILY_LIMIT = 50;
const MAX_WAIT_SEC = 30;

export const exceedsDailyLimit = (count: number) => count > PHOTO_DAILY_LIMIT;

/** File name without its extension: NFC, trimmed, at most `NAME_MAX` characters. */
export function itemNameFromFile(
  fileName: string,
  fallback = IMPORT_EXPORT_COPY.import.photos.fallbackName,
): string {
  const base = fileName
    .replace(/\.[^./\\]*$/, "")
    .normalize("NFC")
    .trim();
  return [...base].slice(0, NAME_MAX).join("").trim() || fallback;
}

export type PhotoJobState = "pending" | "done" | "failed" | "photoFailed";

/** AI result per file: tagged and filled, tagged with nothing to fill, failed for this photo, or turned off for the batch. */
export type PhotoAiState = "filled" | "nothing" | "skipped" | "off";

/** AI error codes that would fail (or burn quota on) every later photo, so the rest of the batch runs without AI. */
export const AI_BATCH_OFF: ReadonlySet<string> = new Set([
  "rate_limited",
  "provider_rate_limited",
  "not_configured",
  "key_unreadable",
  "invalid_key",
  "key_forbidden",
  "invalid_model",
  "model_unavailable",
  "server_misconfigured",
  "credits_exhausted",
  "welcome_pending",
  "ai_cap_reached",
  "unauthorized",
  "not_available",
]);

/**
 * F-702 fill rule for a fresh batch item: name (file-derived), category (the blank default), colours, seasons,
 * material, brand and tags count as empty. Location and status are not AI fields.
 */
export function applyAiToBatchItem(item: Item, fields: AiFields): { item: Item; filled: number } {
  const { patch } = fillEmpty({ ...item, name: "" }, fields, { categoryFillable: true });
  return { item: { ...item, ...patch }, filled: Object.keys(patch).length };
}

export type PhotoJob = {
  key: string;
  file: File;
  name: string;
  /** Assigned when the file is picked: every attempt targets the same item, so a retry never duplicates it. */
  itemId: string;
  state: PhotoJobState;
  /** The saved item when only its photo failed, or after success. */
  item?: Item;
  error?: unknown;
  /** Set when AI was on for this file. */
  ai?: PhotoAiState;
  aiError?: string;
  /** The stored suggestion: a retry reuses it instead of tagging again. */
  aiFields?: AiFields;
};

export type PhotoStop = {
  code: "rate_limited" | "photo_quota_exceeded" | "unauthorized" | "network" | "unavailable";
  retryAfterSec?: number;
};

/** Errors that would fail every later file the same way: the batch stops and the rest stays pending. */
export function photoStopFor(err: ApiError | null): PhotoStop | null {
  if (!err) return null;
  if (err.code === "rate_limited")
    return { code: "rate_limited", retryAfterSec: err.retryAfterSec };
  if (err.code === "photo_quota_exceeded") return { code: "photo_quota_exceeded" };
  if (err.status === 401) return { code: "unauthorized" };
  if (err.status === 0 && err.code === "network") return { code: "network" };
  if (err.status === 503 && err.retryAfterSec === undefined) return { code: "unavailable" };
  return null;
}

/** The stop that means the photo quota is used up (uploads would fail again). */
export const isPhotoQuotaStop = (s?: PhotoStop | null) =>
  s?.code === "rate_limited" || s?.code === "photo_quota_exceeded";

/** Identity of a picked file: the same name, size and lastModified is the same file. */
export const photoFileKey = (f: File) => `${f.name}\u0000${f.size}\u0000${f.lastModified}`;

/** The files not yet in `existing` and not repeated earlier in `files`. */
export function newPhotoFiles(existing: PhotoJob[], files: File[]): File[] {
  const seen = new Set(existing.map((j) => photoFileKey(j.file)));
  return files.filter((f) => {
    const k = photoFileKey(f);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export type PhotoImportDeps = {
  save: (item: Item, opts?: SaveOptions) => Promise<Item>;
  /** Resolves after `ms`, or as soon as the signal aborts. */
  wait: (ms: number, signal?: AbortSignal) => Promise<void>;
  createUrl: (file: File) => string;
  revokeUrl: (url: string) => void;
};

export type PhotoImportOptions = {
  defaults: { location: string; status: Status };
  signal?: AbortSignal;
  onUpdate?: (jobs: PhotoJob[]) => void;
  onCurrent?: (index: number) => void;
  /** Tags the prepared JPEG. Omitted when AI is off: then no tag call is made. */
  tag?: (jpeg: Blob, signal?: AbortSignal) => Promise<TagSuggestion>;
  /** True while the tag call for job `index` is pending. */
  onTagging?: (index: number, on: boolean) => void;
  /** The previous run of this batch stopped on the photo quota: no tag call until an upload succeeds. */
  photoQuotaHit?: boolean;
};

export const abortableWait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done);
  });

const apiError = (e: unknown): ApiError | null => {
  const cause = e instanceof PhotoSaveError ? e.cause : e;
  return cause instanceof ApiError ? cause : null;
};

/** Vietnamese text for a failed file: API and prep errors carry their own; anything else gets generic copy. */
export function photoJobErrorText(error: unknown): string {
  if (error instanceof PhotoSaveError)
    return error.cause instanceof ApiError ? error.message : API_ERROR_COPY.photoNotSaved;
  if (error instanceof ApiError || error instanceof PhotoPrepError) return error.message;
  return API_ERROR_COPY.generic;
}

/**
 * Creates one item per photo, in order. `save` is `repo.save`: it prepares the photo first (D48), then
 * upserts the item and uploads the photo. Stops on the photo limits, 401, a network error and a 503 without
 * Retry-After; waits and retries once on a 503 with Retry-After.
 */
export async function runPhotoImport(
  jobs: PhotoJob[],
  deps: PhotoImportDeps,
  opts: PhotoImportOptions,
): Promise<{ jobs: PhotoJob[]; stopped?: PhotoStop; aiStopped?: string }> {
  let cur = jobs;
  let aiOff: string | null = null;
  let quotaHeld = !!opts.photoQuotaHit;
  const withAiStop = <T extends object>(r: T) => (aiOff ? { ...r, aiStopped: aiOff } : r);
  const patch = (i: number, p: Partial<PhotoJob>) => {
    cur = cur.map((j, k) => (k === i ? { ...j, ...p } : j));
    opts.onUpdate?.(cur);
  };
  const itemFor = (job: PhotoJob, photo: string): Item =>
    job.state === "photoFailed" && job.item
      ? { ...job.item, photo }
      : {
          ...blankItem(),
          id: job.itemId,
          name: job.name,
          location: opts.defaults.location.trim(),
          status: opts.defaults.status,
          photo,
        };

  /** Runs inside `save` on the prepared JPEG; never throws, so an AI failure cannot fail the import. */
  const withPrepared =
    (i: number) =>
    async (jpeg: Blob, item: Item): Promise<Item> => {
      const job = cur[i];
      if (job.state === "photoFailed") return item;
      if (job.aiFields) return applyAiToBatchItem(item, job.aiFields).item;
      if (job.ai === "filled" || job.ai === "nothing" || job.ai === "skipped") return item;
      if (aiOff || quotaHeld) {
        patch(i, { ai: "off" });
        return item;
      }
      opts.onTagging?.(i, true);
      try {
        const fields = suggestionToFields(await opts.tag!(jpeg, opts.signal));
        const out = applyAiToBatchItem(item, fields);
        patch(i, { ai: out.filled ? "filled" : "nothing", aiFields: fields, aiError: undefined });
        return out.item;
      } catch (e) {
        if (opts.signal?.aborted) return item;
        const code = e instanceof AiSettingsError ? e.code : "internal";
        patch(i, { ai: "skipped", aiError: code });
        if (AI_BATCH_OFF.has(code)) aiOff = code;
        return item;
      } finally {
        opts.onTagging?.(i, false);
      }
    };

  for (let i = 0; i < cur.length; i++) {
    if (cur[i].state === "done") continue;
    if (opts.signal?.aborted) break;
    opts.onCurrent?.(i);
    for (let attempt = 0; ; attempt++) {
      const url = deps.createUrl(withPhotoType(cur[i].file));
      try {
        const saved = await (opts.tag
          ? deps.save(itemFor(cur[i], url), { withPrepared: withPrepared(i) })
          : deps.save(itemFor(cur[i], url)));
        quotaHeld = false;
        patch(i, { state: "done", item: saved, error: undefined });
        break;
      } catch (e) {
        const err = apiError(e);
        const stop = photoStopFor(err);
        if (e instanceof PhotoSaveError) patch(i, { state: "photoFailed", item: e.item, error: e });
        else if (cur[i].state === "photoFailed") patch(i, { error: e });
        else patch(i, { state: stop ? "pending" : "failed", error: e });
        if (stop) {
          return withAiStop({ jobs: cur, stopped: stop });
        }
        if (err?.status !== 503 || attempt > 0) break;
        await deps.wait(Math.min(err.retryAfterSec!, MAX_WAIT_SEC) * 1000, opts.signal);
        if (opts.signal?.aborted) return withAiStop({ jobs: cur });
      } finally {
        deps.revokeUrl(url);
      }
    }
  }
  return withAiStop({ jobs: cur });
}
