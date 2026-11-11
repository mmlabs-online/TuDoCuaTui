import { localToday } from "@/lib/dates";
import type { Item } from "@/types/item";
import { ApiError } from "./apiErrors";
import { isUuid, itemToRow, rowToItem } from "./mappers";
import type { WardrobeRepo, WearOutcome } from "./repo";

type ApiItemRow = Parameters<typeof rowToItem>[0];
type FetchFn = typeof fetch;

/** Items through the Node API (`/api`), same origin. Photos are not supported yet. */
export function createHttpRepo(
  fetchFn: FetchFn = (...a) => fetch(...a),
  base = "/api",
): WardrobeRepo {
  const call = async <T>(method: string, path: string, body?: unknown): Promise<T | null> => {
    let res: Response;
    try {
      res = await fetchFn(base + path, {
        method,
        headers: {
          Accept: "application/json",
          ...(body !== undefined && { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
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
      return r!.items.map((row) => rowToItem(row, ""));
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
      return rowToItem(r!.item, "");
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
