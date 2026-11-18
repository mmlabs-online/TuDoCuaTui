import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { OUTFITS_COPY } from "./copy";
import { OutfitsModal, WEATHER_WAIT_MS } from "./OutfitsModal";
import { WEATHER_PLACE_KEY } from "./weatherPlace";
import type { Weather, WeatherClient } from "@/data/weather";
import type { Item } from "@/types/item";

const NOW = Date.UTC(2026, 6, 15, 5);
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
  expect(screen.getAllByText(OUTFITS_COPY.reasons.cold).length).toBe(3);
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
