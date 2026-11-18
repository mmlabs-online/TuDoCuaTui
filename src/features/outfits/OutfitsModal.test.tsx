import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { OUTFITS_COPY } from "./copy";
import { OutfitsModal } from "./OutfitsModal";
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
