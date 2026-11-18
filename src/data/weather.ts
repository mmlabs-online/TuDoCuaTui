import { createAuthedFetch, type AuthOptions } from "./authFetch";

type FetchFn = typeof fetch;

export type Weather = {
  place: string;
  date: string;
  minC: number;
  maxC: number;
  rainChance: number | null;
};

export class WeatherError extends Error {
  constructor(public status: number) {
    super("weather");
    this.name = "WeatherError";
  }
}

export interface WeatherClient {
  today(placeId: string): Promise<Weather>;
}

const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);

/** Today's weather through the Node API (`/api/weather`). Not wardrobe data: injected like aiSettings. */
export function createHttpWeather(
  fetchFn: FetchFn = (...a) => fetch(...a),
  base = "/api",
  auth: AuthOptions = {},
): WeatherClient {
  const authedFetch = createAuthedFetch({ fetchFn, ...auth });
  return {
    async today(placeId) {
      let res: Response;
      try {
        res = await authedFetch(`${base}/weather?place=${encodeURIComponent(placeId)}`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
          credentials: "same-origin",
          redirect: "manual",
        });
      } catch {
        throw new WeatherError(0);
      }
      if (!res.ok) throw new WeatherError(res.status);
      let json: unknown;
      try {
        json = await res.json();
      } catch {
        throw new WeatherError(res.status);
      }
      const w = (json as { weather?: Partial<Weather> } | null)?.weather;
      if (
        !w ||
        typeof w.place !== "string" ||
        typeof w.date !== "string" ||
        !num(w.minC) ||
        !num(w.maxC) ||
        !(w.rainChance === null || num(w.rainChance))
      ) {
        throw new WeatherError(200);
      }
      return w as Weather;
    },
  };
}
