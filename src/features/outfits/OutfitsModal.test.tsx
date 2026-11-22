import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AiSettingsError } from "@/data/aiSettings";
import type { AiSettingsView } from "@/shared/ai/catalog";
import type { AiSuggestInput, AiSuggestResult } from "@/data/aiOutfits";
import { candidatePool } from "./suggest";
import { OUTFITS_COPY } from "./copy";
import { OutfitsModal, WEATHER_WAIT_MS } from "./OutfitsModal";
import { WEATHER_PLACE_KEY } from "./weatherPlace";
import type { Weather, WeatherClient } from "@/data/weather";
import type { Item } from "@/types/item";

const NOW = Date.UTC(2026, 6, 15, 5);
const NOV = Date.UTC(2026, 10, 20, 5);
let n = 0;
const mk = (category: string, over: Partial<Item> = {}): Item => ({
  id: `m${++n}`,
  name: `${category} số ${n}`,
  category,
  status: "Đang dùng",
  colors: [],
  seasons: [],
  brand: "",
  size: "",
  location: "",
  price: 0,
  purchaseDate: "",
  material: "",
  tags: [],
  notes: "",
  photo: "",
  wearCount: 5,
  lastWorn: "2026-03-01",
  createdAt: "2026-01-01",
  ...over,
});
const dresses = (k: number, over: Partial<Item> = {}) =>
  Array.from({ length: k }, () => mk("Đầm", over));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});

const shown = () =>
  [...document.querySelectorAll(".outfit-name")].map((e) => e.textContent).join("|");
const renderModal = (items: Item[], onOpenItem = vi.fn(), onClose = vi.fn()) =>
  render(<OutfitsModal items={items} onClose={onClose} onOpenItem={onOpenItem} />);

test("shows 3 outfits", () => {
  renderModal([...dresses(6), mk("Giày/dép")]);
  expect(document.querySelectorAll(".outfit-card")).toHaveLength(3);
  expect(screen.getByRole("heading", { name: OUTFITS_COPY.title })).toBeTruthy();
});

test("shows reasons", () => {
  renderModal(dresses(1, { wearCount: 0, lastWorn: "" }));
  expect(screen.getByText(OUTFITS_COPY.reasons.neverWorn)).toBeTruthy();
});

test("Đổi gợi ý shows a different set", () => {
  renderModal(dresses(6));
  const before = shown();
  fireEvent.click(screen.getByRole("button", { name: OUTFITS_COPY.shuffle }));
  expect(shown()).not.toBe(before);
});

test("clicking a piece calls onOpenItem with that item", () => {
  const item = mk("Đầm", { name: "Đầm hoa" });
  const onOpenItem = vi.fn();
  renderModal([item], onOpenItem);
  fireEvent.click(screen.getByRole("button", { name: OUTFITS_COPY.openItem("Đầm hoa") }));
  expect(onOpenItem).toHaveBeenCalledWith(item);
});

test("shows the empty state", () => {
  renderModal([mk("Áo")]);
  expect(screen.getByText(OUTFITS_COPY.empty.title)).toBeTruthy();
  expect(screen.getByText(OUTFITS_COPY.empty.body)).toBeTruthy();
  expect(screen.queryByRole("button", { name: OUTFITS_COPY.shuffle })).toBeNull();
});

test("close button calls onClose", () => {
  const onClose = vi.fn();
  renderModal([], vi.fn(), onClose);
  fireEvent.click(screen.getByRole("button", { name: OUTFITS_COPY.close }));
  expect(onClose).toHaveBeenCalled();
});

test("shows the category icon when an item has no photo", () => {
  renderModal(dresses(1));
  expect(document.querySelector(".outfit-thumb img")).toBeNull();
  expect(document.querySelector(".outfit-thumb")?.textContent).toBe("❀");
});

const W = (over: Partial<Weather> = {}): Weather => ({
  place: "da-lat",
  date: "2026-07-15",
  minC: 15,
  maxC: 20,
  rainChance: 70,
  ...over,
});
const client = (impl: () => Promise<Weather>) => {
  const today = vi.fn(impl);
  return { today, client: { today } as WeatherClient };
};
const renderW = (items: Item[], weather?: WeatherClient) =>
  render(<OutfitsModal items={items} onClose={vi.fn()} onOpenItem={vi.fn()} weather={weather} />);
const settle = () => act(async () => {});

test("no weather prop: picker hidden", () => {
  renderW(dresses(3));
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(document.querySelectorAll(".outfit-card")).toHaveLength(3);
});

test("off by default: no weather call", () => {
  const { today, client: c } = client(async () => W());
  renderW(dresses(3), c);
  expect(today).not.toHaveBeenCalled();
  expect(document.querySelectorAll(".outfit-card")).toHaveLength(3);
  expect((screen.getByRole("combobox") as HTMLSelectElement).selectedOptions[0].textContent).toBe(
    OUTFITS_COPY.weather.off,
  );
});

test("picking a place stores it and fetches weather", async () => {
  const { today, client: c } = client(async () => W());
  renderW(dresses(3), c);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "da-lat" } });
  await settle();
  expect(localStorage.getItem(WEATHER_PLACE_KEY)).toBe("da-lat");
  expect(today).toHaveBeenCalledTimes(1);
  expect(today).toHaveBeenCalledWith("da-lat");
});

test("shows the weather summary and credit", async () => {
  localStorage.setItem(WEATHER_PLACE_KEY, "da-lat");
  const { client: c } = client(async () => W());
  renderW(dresses(3), c);
  await settle();
  expect(screen.getByText(/Đà Lạt · 15–20°C · Mưa 70%/)).toBeTruthy();
  const link = screen.getByRole("link", { name: "Open-Meteo" });
  expect(link.getAttribute("href")).toBe("https://open-meteo.com/");
  expect(link.getAttribute("rel")).toContain("noopener");
});

test("cold weather adds Khoác in July", async () => {
  localStorage.setItem(WEATHER_PLACE_KEY, "da-lat");
  const { client: c } = client(async () => W({ maxC: 20 }));
  renderW([...dresses(3), mk("Khoác")], c);
  await settle();
  expect(screen.getAllByText("Khoác").length).toBeGreaterThan(0);
  // 3 chips plus the heading, which now also reads "Trời lạnh" (BUG-012).
  expect(screen.getAllByText(OUTFITS_COPY.reasons.cold).length).toBe(4);
});

test("failing weather client still shows outfits and a short note", async () => {
  localStorage.setItem(WEATHER_PLACE_KEY, "da-lat");
  const { client: c } = client(async () => {
    throw new Error("down");
  });
  renderW(dresses(3), c);
  await settle();
  expect(document.querySelectorAll(".outfit-card")).toHaveLength(3);
  expect(screen.getByText(OUTFITS_COPY.weather.unavailable)).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("slow weather client: outfits appear after WEATHER_WAIT_MS", async () => {
  localStorage.setItem(WEATHER_PLACE_KEY, "da-lat");
  const { client: c } = client(() => new Promise<Weather>(() => {}));
  renderW(dresses(3), c);
  expect(screen.getByText(OUTFITS_COPY.weather.loading)).toBeTruthy();
  expect(document.querySelectorAll(".outfit-card")).toHaveLength(0);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(WEATHER_WAIT_MS);
  });
  expect(document.querySelectorAll(".outfit-card")).toHaveLength(3);
  expect(screen.getByText(OUTFITS_COPY.weather.unavailable)).toBeTruthy();
});

// ---- F-704.5: AI toggle ----
const viewReady: AiSettingsView = {
  provider: "claude",
  model: "m",
  keyHint: "…abcd",
  hasKey: true,
  modelSupported: true,
  updatedAt: "2026-07-01T00:00:00Z",
};
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const aiProps = (get: () => Promise<AiSettingsView | null> = async () => viewReady) => ({
  settings: { get: vi.fn(get) },
  settingsRev: 0,
  outfits: {
    suggest: vi.fn<(i: AiSuggestInput, s?: AbortSignal) => Promise<AiSuggestResult>>(),
  },
});
type AiP = ReturnType<typeof aiProps>;
const renderAi = (items: Item[], ai: AiP | undefined, weather?: WeatherClient) =>
  render(
    <OutfitsModal items={items} onClose={vi.fn()} onOpenItem={vi.fn()} weather={weather} ai={ai} />,
  );
const sw = () => screen.getByRole("switch", { name: OUTFITS_COPY.ai.toggle }) as HTMLInputElement;
const aiItems = () => [...dresses(6), mk("Giày/dép")];
const ids = (items: Item[], weather?: Weather) =>
  candidatePool(items, { now: NOW, weather }).map((i) => i.id);
const pick = (
  items: Item[],
  from: number,
  reason = "Hợp trời nóng",
): AiSuggestResult["outfits"][number] => ({
  itemIds: [ids(items)[from]],
  reason,
});
const three = (items: Item[], reason?: string): AiSuggestResult => ({
  outfits: [pick(items, 0, reason), pick(items, 1, reason), pick(items, 2, reason)],
});
const turnOn = async () => {
  fireEvent.click(sw());
  await settle();
};
const aiCards = () => [...document.querySelectorAll(".outfit-card")];
const hasChip = () => screen.queryAllByText(OUTFITS_COPY.ai.chip).length;

test.each([
  ["no ai prop", undefined],
  ["get pending", aiProps(() => new Promise<AiSettingsView | null>(() => {}))],
  ["no key", aiProps(async () => ({ ...viewReady, hasKey: false }))],
  ["model unsupported", aiProps(async () => ({ ...viewReady, modelSupported: false }))],
  [
    "load error",
    aiProps(async () => {
      throw new AiSettingsError(503, "server_misconfigured");
    }),
  ],
])("toggle hidden unless AI is ready: %s", async (_n, ai) => {
  renderAi(aiItems(), ai);
  await settle();
  expect(screen.queryByRole("switch")).toBeNull();
});

test("toggle is off on open and makes no call", async () => {
  const ai = aiProps();
  renderAi(aiItems(), ai);
  await settle();
  expect(sw().checked).toBe(false);
  expect(ai.outfits.suggest).not.toHaveBeenCalled();
});

test("AI on: sends pool ids, season DB id and weather flags", async () => {
  const items = aiItems();
  const ai = aiProps();
  ai.outfits.suggest.mockResolvedValue(three(items));
  renderAi(items, ai);
  await settle();
  await turnOn();
  expect(ai.outfits.suggest).toHaveBeenCalledTimes(1);
  const [input, signal] = ai.outfits.suggest.mock.calls[0];
  expect(input.candidateIds).toEqual(ids(items));
  expect(input.season).toBe("summer");
  expect(input.weather).toEqual({ cold: false, hot: false, rain: false });
  expect(input.avoidIds).toEqual([]);
  expect(signal).toBeInstanceOf(AbortSignal);
});

test("AI on: shows AI outfits with chip and reason", async () => {
  const items = aiItems();
  const ai = aiProps();
  ai.outfits.suggest.mockResolvedValue(three(items, "Nhẹ và mát"));
  renderAi(items, ai);
  await settle();
  await turnOn();
  expect(aiCards()).toHaveLength(3);
  expect(hasChip()).toBe(3);
  expect(screen.getAllByText("Nhẹ và mát")).toHaveLength(3);
  expect(screen.queryByText(OUTFITS_COPY.reasons.stale)).toBeNull();
  expect(screen.queryByText(OUTFITS_COPY.reasons.neverWorn)).toBeNull();
});

test("loading: cards stay dimmed, shuffle disabled", async () => {
  const items = aiItems();
  const ai = aiProps();
  const d = deferred<AiSuggestResult>();
  ai.outfits.suggest.mockReturnValue(d.promise);
  renderAi(items, ai);
  await settle();
  await turnOn();
  const list = document.querySelector(".outfit-list")!;
  expect(aiCards()).toHaveLength(3);
  expect(list.getAttribute("aria-busy")).toBe("true");
  expect(screen.getByRole("status").textContent).toBe(OUTFITS_COPY.ai.loading);
  const btn = screen.getByRole("button", { name: OUTFITS_COPY.shuffle }) as HTMLButtonElement;
  expect(btn.disabled).toBe(true);
  await act(async () => d.resolve(three(items)));
  expect(list.getAttribute("aria-busy")).toBe("false");
  expect(btn.disabled).toBe(false);
});

test.each([
  ["rate_limited", 429],
  ["provider_rate_limited", 429],
  ["ai_busy", 503],
  ["not_configured", 409],
  ["request_timeout", 408],
  ["provider_bad_response", 502],
  ["network", 0],
  ["internal", 500],
] as const)("AI error %s: rule cards plus note", async (code, status) => {
  const ai = aiProps();
  ai.outfits.suggest.mockRejectedValue(new AiSettingsError(status, code));
  renderAi(aiItems(), ai);
  await settle();
  await turnOn();
  expect(screen.getByRole("status").textContent).toBe(OUTFITS_COPY.ai.note(code));
  expect(aiCards()).toHaveLength(3);
  expect(hasChip()).toBe(0);
});

test("AI error: a plain Error maps to internal", async () => {
  const ai = aiProps();
  ai.outfits.suggest.mockRejectedValue(new Error("boom"));
  renderAi(aiItems(), ai);
  await settle();
  await turnOn();
  expect(screen.getByRole("status").textContent).toBe(OUTFITS_COPY.ai.note("internal"));
});

test.each([
  ["no outfits", () => ({ outfits: [] })],
  ["unknown id", () => ({ outfits: [{ itemIds: ["nope"], reason: "x" }] })],
])("empty AI result: rule cards, no note (%s)", async (_n, answer) => {
  const ai = aiProps();
  ai.outfits.suggest.mockResolvedValue(answer());
  renderAi(aiItems(), ai);
  await settle();
  await turnOn();
  expect(aiCards()).toHaveLength(3);
  expect(hasChip()).toBe(0);
  expect(screen.getByRole("status").textContent).toBe("");
});

test("shuffle with AI on: sends avoidIds and shows the new set", async () => {
  const items = aiItems();
  const ai = aiProps();
  const a: AiSuggestResult = { outfits: [pick(items, 0, "Bộ A")] };
  const b: AiSuggestResult = { outfits: [pick(items, 3, "Bộ B")] };
  ai.outfits.suggest.mockResolvedValueOnce(a).mockResolvedValueOnce(b);
  renderAi(items, ai);
  await settle();
  await turnOn();
  expect(screen.getByText("Bộ A")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: OUTFITS_COPY.shuffle }));
  await settle();
  expect(ai.outfits.suggest).toHaveBeenCalledTimes(2);
  expect(ai.outfits.suggest.mock.calls[1][0].avoidIds).toEqual(a.outfits[0].itemIds);
  expect(screen.getByText("Bộ B")).toBeTruthy();
  expect(screen.queryByText("Bộ A")).toBeNull();
});

test("shuffle after an AI error: avoidIds are the rule ids", async () => {
  const items = aiItems();
  const ai = aiProps();
  ai.outfits.suggest
    .mockRejectedValueOnce(new AiSettingsError(500, "internal"))
    .mockResolvedValueOnce({ outfits: [] });
  renderAi(items, ai);
  await settle();
  await turnOn();
  const onScreen = [...document.querySelectorAll(".outfit-name")].map((e) => e.textContent);
  const ruleIds = items
    .filter((i) => onScreen.includes(i.name) && i.category === "Đầm")
    .map((i) => i.id);
  fireEvent.click(screen.getByRole("button", { name: OUTFITS_COPY.shuffle }));
  await settle();
  expect(ai.outfits.suggest.mock.calls[1][0].avoidIds).toEqual(expect.arrayContaining(ruleIds));
  expect(ai.outfits.suggest.mock.calls[1][0].avoidIds).toHaveLength(ruleIds.length);
});

test("late answer of an aborted call is ignored", async () => {
  const items = aiItems();
  const ai = aiProps();
  const first = deferred<AiSuggestResult>();
  ai.outfits.suggest
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce({ outfits: [pick(items, 3, "Bộ B")] });
  renderAi(items, ai);
  await settle();
  await turnOn();
  // Shuffle is disabled while loading, so the call is aborted by toggling off and on.
  fireEvent.click(sw());
  await settle();
  await turnOn();
  expect(ai.outfits.suggest.mock.calls[0][1]?.aborted).toBe(true);
  await act(async () => first.resolve({ outfits: [pick(items, 0, "Bộ A")] }));
  expect(screen.queryByText("Bộ A")).toBeNull();
  expect(screen.getByText("Bộ B")).toBeTruthy();
});

test("toggle off aborts, rule cards, no note", async () => {
  const items = aiItems();
  const ai = aiProps();
  const d = deferred<AiSuggestResult>();
  ai.outfits.suggest.mockReturnValue(d.promise);
  renderAi(items, ai);
  await settle();
  await turnOn();
  fireEvent.click(sw());
  await settle();
  expect(ai.outfits.suggest.mock.calls[0][1]?.aborted).toBe(true);
  expect(sw().checked).toBe(false);
  expect(aiCards()).toHaveLength(3);
  expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
  await act(async () => d.reject(new DOMException("aborted", "AbortError")));
  expect(screen.queryByRole("status")).toBeNull();
  expect(hasChip()).toBe(0);
});

test("close aborts the call", async () => {
  const ai = aiProps();
  ai.outfits.suggest.mockReturnValue(new Promise(() => {}));
  const { unmount } = renderAi(aiItems(), ai);
  await settle();
  await turnOn();
  unmount();
  expect(ai.outfits.suggest.mock.calls[0][1]?.aborted).toBe(true);
});

test("reopen: toggle off again, no new call", async () => {
  const items = aiItems();
  const ai = aiProps();
  ai.outfits.suggest.mockResolvedValue(three(items));
  const first = renderAi(items, ai);
  await settle();
  await turnOn();
  first.unmount();
  renderAi(items, ai);
  await settle();
  expect(sw().checked).toBe(false);
  expect(ai.outfits.suggest).toHaveBeenCalledTimes(1);
});

test("toggle off then on: fresh call, old result not shown while loading", async () => {
  const items = aiItems();
  const ai = aiProps();
  const second = deferred<AiSuggestResult>();
  ai.outfits.suggest.mockResolvedValueOnce(three(items)).mockReturnValueOnce(second.promise);
  renderAi(items, ai);
  await settle();
  await turnOn();
  expect(hasChip()).toBe(3);
  fireEvent.click(sw());
  await settle();
  await turnOn();
  expect(ai.outfits.suggest).toHaveBeenCalledTimes(2);
  expect(hasChip()).toBe(0);
});

test("reason renders as plain text", async () => {
  const items = aiItems();
  const ai = aiProps();
  ai.outfits.suggest.mockResolvedValue({
    outfits: [pick(items, 0, "<b>x</b>\u202Eabc\u200B")],
  });
  const { container } = renderAi(items, ai);
  await settle();
  await turnOn();
  expect(screen.getByText("<b>x</b>abc")).toBeTruthy();
  expect(container.querySelector(".outfit-reason b")).toBeNull();
  expect(document.querySelector(".outfit-reason b")).toBeNull();
});

test("too few candidates: no call, no note", async () => {
  const ai = aiProps();
  renderAi([mk("Đầm")], ai);
  await settle();
  await turnOn();
  expect(ai.outfits.suggest).not.toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toBe("");
  expect(document.querySelector('[aria-busy="true"]')).toBeNull();
});

test("weather: waits for weather, then one call with its flags", async () => {
  localStorage.setItem(WEATHER_PLACE_KEY, "da-lat");
  const items = aiItems();
  const ai = aiProps();
  ai.outfits.suggest.mockResolvedValue({ outfits: [] });
  const d = deferred<Weather>();
  const { client: c } = client(() => d.promise);
  renderAi(items, ai, c);
  await settle();
  await turnOn();
  expect(ai.outfits.suggest).not.toHaveBeenCalled();
  const w = W({ minC: 15, maxC: 20, rainChance: 80 });
  await act(async () => d.resolve(w));
  await settle();
  expect(ai.outfits.suggest).toHaveBeenCalledTimes(1);
  const [input] = ai.outfits.suggest.mock.calls[0];
  expect(input.weather).toEqual({ cold: true, hot: false, rain: true });
  expect(input.candidateIds).toEqual(ids(items, w));
});

test("AI answer shown: picking a place whose weather fails makes no second call", async () => {
  const items = aiItems();
  const ai = aiProps();
  ai.outfits.suggest.mockResolvedValue(three(items));
  const { client: c } = client(() => Promise.reject(new Error("down")));
  renderAi(items, ai, c);
  await settle();
  await turnOn();
  expect(ai.outfits.suggest).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "da-lat" } });
  await settle();
  await settle();
  expect(ai.outfits.suggest).toHaveBeenCalledTimes(1);
  expect(hasChip()).toBe(3);
});

test("AI answer shown: switching between two places with the same flags makes no second call", async () => {
  const items = aiItems();
  const ai = aiProps();
  ai.outfits.suggest.mockResolvedValue(three(items));
  const { client: c } = client(() => Promise.resolve(W({ minC: 22, maxC: 28, rainChance: 10 })));
  renderAi(items, ai, c);
  await settle();
  await turnOn();
  expect(ai.outfits.suggest).toHaveBeenCalledTimes(1);
  const select = screen.getByRole("combobox");
  fireEvent.change(select, { target: { value: "da-lat" } });
  await settle();
  await settle();
  fireEvent.change(select, { target: { value: "ha-noi" } });
  await settle();
  await settle();
  expect(ai.outfits.suggest).toHaveBeenCalledTimes(1);
  expect(hasChip()).toBe(3);
});

const baseTimers = () => {
  const { unmount } = renderAi(aiItems(), undefined);
  const n = vi.getTimerCount();
  unmount();
  return n;
};

test("weather timer cleared on close", async () => {
  localStorage.setItem(WEATHER_PLACE_KEY, "da-lat");
  const base = baseTimers();
  const { client: c } = client(() => new Promise<Weather>(() => {}));
  const { unmount } = renderAi(aiItems(), undefined, c);
  await settle();
  expect(vi.getTimerCount()).toBeGreaterThan(base);
  unmount();
  expect(vi.getTimerCount()).toBe(base);
});

test("weather timer cleared after the weather arrives", async () => {
  localStorage.setItem(WEATHER_PLACE_KEY, "da-lat");
  const base = baseTimers();
  const { client: c } = client(async () => W());
  renderAi(aiItems(), undefined, c);
  await settle();
  expect(vi.getTimerCount()).toBe(base);
});

// ---- BUG-012: heading follows the weather actually used ----
const heading = () => document.querySelector(".outfit-season")?.textContent;
const novWeather = async (over: Partial<Weather>, items: Item[] = dresses(3)) => {
  vi.setSystemTime(NOV);
  localStorage.setItem(WEATHER_PLACE_KEY, "ho-chi-minh");
  const { client: c } = client(async () => W({ place: "ho-chi-minh", ...over }));
  renderW(items, c);
  await settle();
};

test("hot weather in November: heading is Trời nóng, not Mùa Đông", async () => {
  await novWeather({ minC: 25, maxC: 34, rainChance: 84 });
  expect(heading()).toBe(OUTFITS_COPY.reasons.hot);
});

test("cold weather: heading is Trời lạnh", async () => {
  await novWeather({ minC: 15, maxC: 20 });
  expect(heading()).toBe(OUTFITS_COPY.reasons.cold);
});

test("weather off in November: heading stays Mùa Đông", () => {
  vi.setSystemTime(NOV);
  renderW(dresses(3), client(async () => W()).client);
  expect(heading()).toBe("Mùa Đông");
});

test("weather failed in November: heading stays Mùa Đông", async () => {
  vi.setSystemTime(NOV);
  localStorage.setItem(WEATHER_PLACE_KEY, "ho-chi-minh");
  const { client: c } = client(async () => {
    throw new Error("down");
  });
  renderW(dresses(3), c);
  await settle();
  expect(heading()).toBe("Mùa Đông");
});

test("mild rainy day in November: heading stays Mùa Đông", async () => {
  await novWeather({ minC: 25, maxC: 30, rainChance: 84 });
  expect(heading()).toBe("Mùa Đông");
});

test("hot weather chip says Hợp mùa, never Hợp mùa Đông", async () => {
  await novWeather({ minC: 25, maxC: 34, rainChance: 84 }, dresses(3, { seasons: ["Hạ"] }));
  expect(screen.getAllByText(OUTFITS_COPY.reasons.seasonFit).length).toBe(3);
  expect(screen.queryByText("Hợp mùa Đông")).toBeNull();
});

test("AI on, hot in November: still sends the calendar season with hot=true", async () => {
  vi.setSystemTime(NOV);
  localStorage.setItem(WEATHER_PLACE_KEY, "ho-chi-minh");
  const { client: c } = client(async () => W({ place: "ho-chi-minh", minC: 25, maxC: 34 }));
  const items = aiItems();
  const ai = aiProps();
  ai.outfits.suggest.mockResolvedValue(three(items));
  renderAi(items, ai, c);
  await settle();
  await turnOn();
  const [input] = ai.outfits.suggest.mock.calls[0];
  expect(input.season).toBe("winter");
  expect(input.weather.hot).toBe(true);
});

// ---- BUG-013: fallback note when no item fits the wanted seasons ----
test("cold weather with no cold items shows fallback note", async () => {
  await novWeather({ minC: 15, maxC: 20 }, dresses(3, { seasons: ["Hạ"] }));
  expect(document.querySelector(".outfit-fallback-note")?.textContent).toBe(
    OUTFITS_COPY.fallbackNote("Đông", { cold: true, hot: false }),
  );
});

test("cold weather with cold items does not show fallback note", async () => {
  await novWeather({ minC: 15, maxC: 20 }, dresses(3, { seasons: ["Đông"] }));
  expect(document.querySelector(".outfit-fallback-note")).toBeNull();
});
