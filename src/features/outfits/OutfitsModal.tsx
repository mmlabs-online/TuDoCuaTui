import { useEffect, useMemo, useState } from "react";
import { Btn } from "@/components/Btn";
import { Icon } from "@/components/Icon";
import { ItemPhoto } from "@/components/ItemPhoto";
import { Modal } from "@/components/Modal";
import { categoryIcons } from "@/constants/wardrobe";
import { WEATHER_PLACES } from "@/constants/weather";
import { AiSettingsError, type AiSettingsClient } from "@/data/aiSettings";
import type { AiOutfitSuggester, AiSuggestResult } from "@/data/aiOutfits";
import { SEASON_TO_DB } from "@/data/mappers";
import type { Weather, WeatherClient } from "@/data/weather";
import { aiAvailability } from "@/features/items/aiFill";
import { useAiLoad } from "@/features/items/useAiLoad";
import { OUTFITS_COPY as COPY } from "@/features/outfits/copy";
import {
  candidatePool,
  suggestOutfits,
  toAiOutfits,
  weatherKind,
} from "@/features/outfits/suggest";
import { loadWeatherPlace, saveWeatherPlace } from "@/features/outfits/weatherPlace";
import type { Item } from "@/types/item";

/** Suggestions wait this long for the weather, then fall back to the season rules. */
export const WEATHER_WAIT_MS = 5000;

type WeatherStatus = "off" | "loading" | "ready" | "failed";

const icon = (item: Item) => <span>{categoryIcons[item.category]}</span>;

function PieceButton({ item, onOpenItem }: { item: Item; onOpenItem: (item: Item) => void }) {
  return (
    <button
      className="outfit-piece"
      aria-label={COPY.openItem(item.name || item.category)}
      onClick={() => onOpenItem(item)}
    >
      <span className="outfit-thumb">
        {item.photo ? <ItemPhoto src={item.photo} alt="" fallback={icon(item)} /> : icon(item)}
      </span>
      <span className="outfit-name">{item.name || item.category}</span>
      <small>{item.category}</small>
    </button>
  );
}

export function OutfitsModal({
  items,
  onClose,
  onOpenItem,
  weather,
  ai,
}: {
  items: Item[];
  onClose: () => void;
  onOpenItem: (item: Item) => void;
  weather?: WeatherClient;
  ai?: {
    settings: Pick<AiSettingsClient, "get">;
    settingsRev: number;
    outfits: AiOutfitSuggester;
  };
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), WEATHER_WAIT_MS);
    });
    Promise.race([weather.today(place), timeout])
      .then(
        (w) => {
          if (cancelled) return;
          setData(w);
          setStatus("ready");
        },
        () => {
          if (!cancelled) setStatus("failed");
        },
      )
      .finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [weather, place]);
  const w = status === "ready" ? (data ?? undefined) : undefined;
  const { season, outfits } = useMemo(
    () => suggestOutfits(items, { now, seed, avoid, weather: w }),
    [items, now, seed, avoid, w],
  );

  const { load } = useAiLoad(ai?.settings, ai?.settingsRev);
  const ready = !!ai && aiAvailability(load, true).kind === "ready";
  const suggester = ai?.outfits;
  const [aiOn, setAiOn] = useState(false);
  const aiActive = aiOn && ready;
  const pool = useMemo(() => candidatePool(items, { now, weather: w }), [items, now, w]);
  const poolKey = pool.map((i) => i.id).join(",");
  const { cold, hot, rain } = weatherKind(w);
  const seasonId: string | undefined = SEASON_TO_DB[season];
  const eligible =
    aiActive && status !== "loading" && !!seasonId && pool.length >= 2 && outfits.length > 0;
  const key = [poolKey, seasonId, cold, hot, rain, seed].join("|");
  const [aiOutcome, setAiOutcome] = useState<{
    key: string;
    result?: AiSuggestResult;
    error?: string;
  } | null>(null);
  const [aiAvoid, setAiAvoid] = useState<string[]>([]);
  const aiLoading = eligible && aiOutcome?.key !== key;
  const aiOutfits = useMemo(
    () => (aiOutcome?.result ? toAiOutfits(aiOutcome.result, items) : []),
    [aiOutcome, items],
  );
  const showAi = aiActive && aiOutfits.length > 0 && (aiOutcome?.key === key || aiLoading);
  const aiNote =
    aiActive && !aiLoading && aiOutcome?.key === key && aiOutcome.error
      ? COPY.ai.note(aiOutcome.error)
      : null;

  useEffect(() => {
    if (!eligible || !suggester || !seasonId) return;
    const ac = new AbortController();
    suggester
      .suggest(
        {
          candidateIds: poolKey.split(","),
          season: seasonId,
          weather: { cold, hot, rain },
          avoidIds: aiAvoid.slice(0, 40),
        },
        ac.signal,
      )
      .then(
        (result) => {
          if (!ac.signal.aborted) setAiOutcome({ key, result });
        },
        (e) => {
          if (ac.signal.aborted) return;
          setAiOutcome({ key, error: e instanceof AiSettingsError ? e.code : "internal" });
        },
      );
    return () => ac.abort();
  }, [eligible, suggester, key, poolKey, seasonId, cold, hot, rain, aiAvoid]);
  const placeName = WEATHER_PLACES.find((p) => p.id === place)?.name ?? "";
  const pickPlace = (id: string) => {
    const next = id || null;
    saveWeatherPlace(next);
    setPlace(next);
  };
  const shuffle = () => {
    const ruleIds = outfits.flatMap((o) => o.main.map((i) => i.id));
    setAvoid(ruleIds);
    setAiAvoid(
      aiActive ? (showAi ? aiOutfits.flatMap((o) => o.pieces.map((i) => i.id)) : ruleIds) : [],
    );
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
        {ready && (
          <label className="outfit-ai-toggle">
            <input
              type="checkbox"
              role="switch"
              checked={aiOn}
              onChange={(e) => {
                setAiOn(e.target.checked);
                setAiOutcome(null);
                setAiAvoid((a) => (a.length ? [] : a));
              }}
            />
            <span>
              <span aria-hidden="true">{COPY.ai.icon}</span> {COPY.ai.toggle}
            </span>
          </label>
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
            {aiActive && (
              <p className="outfit-ai-note" role="status">
                {aiLoading ? COPY.ai.loading : (aiNote ?? "")}
              </p>
            )}
            <div
              className={"outfit-list" + (aiLoading ? " outfit-list--loading" : "")}
              aria-busy={aiLoading}
            >
              {showAi
                ? aiOutfits.map((o, n) => (
                    <section
                      className="outfit-card"
                      key={"ai-" + o.pieces.map((i) => i.id).join("+")}
                    >
                      <div className="outfit-head">
                        <span className="outfit-chip outfit-chip--ai">{COPY.ai.chip}</span>
                        <b>{COPY.outfitLabel(n + 1)}</b>
                      </div>
                      <p className="outfit-reason">{o.reason}</p>
                      <div className="outfit-pieces">
                        {o.pieces.map((item) => (
                          <PieceButton key={item.id} item={item} onOpenItem={onOpenItem} />
                        ))}
                      </div>
                    </section>
                  ))
                : outfits.map((outfit, n) => (
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
                          <PieceButton key={item.id} item={item} onOpenItem={onOpenItem} />
                        ))}
                      </div>
                    </section>
                  ))}
            </div>
            <Btn kind="primary" onClick={shuffle} disabled={aiLoading}>
              {COPY.shuffle}
            </Btn>
          </>
        )}
      </div>
    </Modal>
  );
}
