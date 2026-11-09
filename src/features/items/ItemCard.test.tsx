import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Item } from "@/types/item";
import { ItemCard } from "./ItemCard";
import { ageInDays } from "./filters";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const makeItem = (over: Partial<Item> = {}): Item => ({
  id: "a",
  name: "Áo",
  category: "Áo",
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
  wearCount: 1,
  lastWorn: "",
  createdAt: "",
  ...over,
});

const renderAt = (now: string, lastWorn: string) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  render(<ItemCard item={makeItem({ lastWorn })} age={ageInDays} onClick={() => {}} />);
};

describe("ItemCard wear pill", () => {
  test('shows "hôm nay" at 02:00 UTC+7 for an item worn today', () => {
    renderAt("2026-11-07T02:00:00+07:00", "2026-11-07");
    expect(screen.getByText(/hôm nay/)).toBeTruthy();
    expect(screen.queryByText(/-1 ngày/)).toBeNull();
  });

  test('shows "1 ngày" at 00:30 UTC+7 for an item worn yesterday', () => {
    renderAt("2026-11-07T00:30:00+07:00", "2026-11-06");
    expect(screen.getByText(/1 ngày/)).toBeTruthy();
  });
});
