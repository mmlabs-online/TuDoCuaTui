import { localToday } from "@/lib/dates";
import type { Item } from "@/types/item";
import { ApiError, PhotoSaveError } from "./apiErrors";
import { isUuid, itemToRow, rowToItem } from "./mappers";
import { resizeImage, urlToBlob } from "./photos";
import type { WardrobeRepo, WearOutcome } from "./repo";

type ApiItemRow = Parameters<typeof rowToItem>[0] & { primary_photo_id?: string | null };
type FetchFn = typeof fetch;

/** `photo` stays "" until T-005.3 serves images; `photoPath` is the item_photos id. */
const toItem = (row: ApiItemRow): Item => ({
  ...rowToItem(row, ""),
  photoPath: row.primary_photo_id ?? undefined,
});

/** Items and photos through the Node API (`/api`), same origin. */
export function createHttpRepo(
  fetchFn: FetchFn = (...a) => fetch(...a),
  base = "/api",
  resize: (src: Blob) => Promise<{ blob: Blob }> = resizeImage,
): WardrobeRepo {
  const call = async <T>(
    method: string,
    path: string,
    body?: unknown | Blob,
  ): Promise<T | null> => {
    const isBlob = body instanceof Blob;
    let res: Response;
    try {
      res = await fetchFn(base + path, {
        method,
        headers: {
          Accept: "application/json",
          ...(body !== undefined && { "Content-Type": isBlob ? "image/jpeg" : "application/json" }),
        },
        body: body === undefined ? undefined : isBlob ? body : JSON.stringify(body),
        cache: "no-store",
        credentials: "same-origin",
        redirect: "manual",
      });
    } catch {
      throw new ApiError(0, "network");
    }
    if (res.type === "opaqueredirect") throw new ApiError(401, "unauthorized");
    if (res.status === 204) return null;
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new ApiError(res.status, "unexpected");
    }
    if (!res.ok) {
      const e = (json as { error?: Record<string, string> } | null)?.error;
      if (!e?.code) throw new ApiError(res.status, "unexpected");
      throw new ApiError(res.status, e.code, e.field, e.reason, e.requestId);
    }
    return json as T;
  };

  return {
    mode: "api",
    async list() {
      const r = await call<{ items: ApiItemRow[] }>("GET", "/items");
      return r!.items.map(toItem);
    },
    async locations() {
      const r = await call<{ locations: string[] }>("GET", "/locations");
      return r!.locations;
    },
    async save(item: Item) {
      const id = isUuid(item.id) ? item.id : crypto.randomUUID();
      const { id: _i, location_id: _l, ...row } = itemToRow(item, null);
      const r = await call<{ item: ApiItemRow }>("PUT", `/items/${id}`, {
        ...row,
        location_name: item.location.trim() || null,
      });
      let saved = r!.item;
      try {
        if (item.photo.startsWith("data:") || item.photo.startsWith("blob:")) {
          const { blob } = await resize(await urlToBlob(item.photo));
          saved = (await call<{ item: ApiItemRow }>("PUT", `/items/${id}/photo`, blob))!.item;
        } else if (item.removedPhotoId && !item.photoPath) {
          // Only an explicit removal in the editor; the server ignores the id if it is no longer the primary photo.
          await call("DELETE", `/items/${id}/photo?photo=${item.removedPhotoId}`);
          if (saved.primary_photo_id === item.removedPhotoId) {
            saved = { ...saved, primary_photo_id: null };
          }
        }
      } catch (cause) {
        throw new PhotoSaveError(toItem(saved), cause);
      }
      return toItem(saved);
    },
    async remove(item) {
      await call("DELETE", `/items/${item.id}`);
    },
    async wear(item, delta): Promise<WearOutcome> {
      const r = await call<{ wear_count?: number; last_worn?: string | null; already?: boolean }>(
        "POST",
        `/items/${item.id}/wear`,
        { delta, today: localToday() },
      );
      return {
        wearCount: r!.wear_count ?? 0,
        lastWorn: r!.last_worn ?? "",
        already: !!r!.already,
      };
    },
  };
}
