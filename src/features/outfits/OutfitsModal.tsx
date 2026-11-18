import { useEffect, useMemo, useState } from "react";
import { Btn } from "@/components/Btn";
import { Icon } from "@/components/Icon";
import { ItemPhoto } from "@/components/ItemPhoto";
import { Modal } from "@/components/Modal";
import { categoryIcons } from "@/constants/wardrobe";
import { WEATHER_PLACES } from "@/constants/weather";
import type { Weather, WeatherClient } from "@/data/weather";
import { OUTFITS_COPY as COPY } from "@/features/outfits/copy";
import { suggestOutfits } from "@/features/outfits/suggest";
import { loadWeatherPlace, saveWeatherPlace } from "@/features/outfits/weatherPlace";
import type { Item } from "@/types/item";

/** Suggestions wait this long for the weather, then fall back to the season rules. */
export const WEATHER_WAIT_MS = 5000;

type WeatherStatus = "off" | "loading" | "ready" | "failed";

const icon = (item: Item) => <span>{categoryIcons[item.category]}</span>;

export function OutfitsModal({
  items,
  onClose,
  onOpenItem,
  weather,
}: {
  items: Item[];
  onClose: () => void;
  onOpenItem: (item: Item) => void;
  weather?: WeatherClient;
}) {
  const [now] = useState(() => Date.now());
  const [seed, setSeed] = useState(() => now);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [place, setPlace] = useState<string | null>(loadWeatherPlace);
  const [status, setStatus] = useState<WeatherStatus>(weather && place ? "loading" : "off");
  const [data, setData] = useState<Weather | null>(null);
  useEffect(() => {
    if (!weather || !place) {
      setStatus("off");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), WEATHER_WAIT_MS),
    );
    Promise.race([weather.today(place), timeout]).then(
      (w) => {
        if (cancelled) return;
        setData(w);
        setStatus("ready");
      },
      () => {
        if (!cancelled) setStatus("failed");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [weather, place]);
  const { season, outfits } = useMemo(
    () =>
      suggestOutfits(items, {
        now,
        seed,
        avoid,
        weather: status === "ready" ? (data ?? undefined) : undefined,
      }),
    [items, now, seed, avoid, status, data],
  );
  const placeName = WEATHER_PLACES.find((p) => p.id === place)?.name ?? "";
  const pickPlace = (id: string) => {
    const next = id || null;
    saveWeatherPlace(next);
    setPlace(next);
  };
  const shuffle = () => {
    setAvoid(outfits.flatMap((o) => o.main.map((i) => i.id)));
    setSeed((s) => s + 1);
  };

  return (
    <Modal onClose={onClose}>
      <div className="modal-header">
        <div>
          <p className="eyebrow">{COPY.eyebrow}</p>
          <h2>{COPY.title}</h2>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label={COPY.close}>
          <Icon name="close" />
        </button>
      </div>
      <div className="outfit-body">
        {weather && (
          <div className="outfit-weather">
            <label>
              {COPY.weather.label}{" "}
              <select value={place ?? ""} onChange={(e) => pickPlace(e.target.value)}>
                <option value="">{COPY.weather.off}</option>
                {WEATHER_PLACES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {status === "ready" && data && (
              <span>
                {COPY.weather.summary(placeName, data.minC, data.maxC, data.rainChance)}
                {" · "}
                <a href={COPY.weather.creditUrl} target="_blank" rel="noopener noreferrer">
                  {COPY.weather.credit}
                </a>
              </span>
            )}
            {status === "failed" && <span>{COPY.weather.unavailable}</span>}
          </div>
        )}
        {status === "loading" ? (
          <p className="outfit-season">{COPY.weather.loading}</p>
        ) : outfits.length === 0 ? (
          <div className="outfit-empty">
            <b>{COPY.empty.title}</b>
            <p>{COPY.empty.body}</p>
          </div>
        ) : (
          <>
            <p className="outfit-season">{COPY.season(season)}</p>
            {outfits.map((outfit, n) => (
              <section className="outfit-card" key={outfit.main.map((i) => i.id).join("+")}>
                <div className="outfit-head">
                  <b>{COPY.outfitLabel(n + 1)}</b>
                  {outfit.reasons.map((r) => (
                    <span className="outfit-chip" key={r}>
                      {r === "season" ? COPY.reasons.season(season) : COPY.reasons[r]}
                    </span>
                  ))}
                </div>
                <div className="outfit-pieces">
                  {outfit.pieces.map((item) => (
                    <button
                      className="outfit-piece"
                      key={item.id}
                      aria-label={COPY.openItem(item.name || item.category)}
                      onClick={() => onOpenItem(item)}
                    >
                      <span className="outfit-thumb">
                        {item.photo ? (
                          <ItemPhoto src={item.photo} alt="" fallback={icon(item)} />
                        ) : (
                          icon(item)
                        )}
                      </span>
                      <span className="outfit-name">{item.name || item.category}</span>
                      <small>{item.category}</small>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            <Btn kind="primary" onClick={shuffle}>
              {COPY.shuffle}
            </Btn>
          </>
        )}
      </div>
    </Modal>
  );
}
