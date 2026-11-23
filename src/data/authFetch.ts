import { ApiError } from "./apiErrors";

/** `rejected`: the token the last request got 401 for, so the provider can refresh only if it is still current. */
export type GetToken = (rejected?: string) => Promise<string | null>;

export interface AuthOptions {
  getToken?: GetToken;
  /** A request got 401 again with a freshly fetched token. Called once per failing request.
   * A 403 (e.g. `forbidden_origin`) or any other status never calls it (D55). */
  onAuthLost?: () => void;
}

/** Same-origin API paths only (`/api/...`); never `//host` or an absolute URL. */
const isSameOriginPath = (url: string) => url.startsWith("/") && !url.startsWith("//");

/**
 * Wraps `fetch` for the Node API in identity mode: adds `Authorization: Bearer` to same-origin paths and
 * retries once after a 401 with a refreshed token. Every non-401 response, including 403, is returned to the caller unchanged, with no
 * retry (D55); only a repeated 401 signs out. Without `getToken` the request is passed through untouched.
 */
export function createAuthedFetch({
  fetchFn,
  getToken,
  onAuthLost,
}: { fetchFn: typeof fetch } & AuthOptions): (url: string, init: RequestInit) => Promise<Response> {
  if (!getToken) return (url, init) => fetchFn(url, init);
  const send = (url: string, init: RequestInit, token: string) =>
    fetchFn(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
    });
  const tokenFor = async (rejected?: string): Promise<string> => {
    let t: string | null;
    try {
      t = await getToken(rejected);
    } catch {
      throw new ApiError(0, "network");
    }
    if (!t) throw new ApiError(401, "unauthorized");
    return t;
  };
  return async (url, init) => {
    if (!isSameOriginPath(url)) return fetchFn(url, init);
    const first = await tokenFor();
    const res = await send(url, init, first);
    if (res.status !== 401) return res;
    const second = await tokenFor(first);
    const retry = await send(url, init, second);
    if (retry.status !== 401) return retry;
    onAuthLost?.();
    throw new ApiError(401, "unauthorized");
  };
}
