import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  test('shows "hơn 1 năm" for an item worn over 365 days ago', () => {
    renderAt("2026-11-07T02:00:00+07:00", "2025-11-01");
    expect(screen.getByText(/hơn 1 năm/)).toBeTruthy();
  });

  test('shows "1 ngày" at 00:30 UTC+7 for an item worn yesterday', () => {
    renderAt("2026-11-07T00:30:00+07:00", "2026-11-06");
    expect(screen.getByText(/1 ngày/)).toBeTruthy();
  });
});

describe("ItemCard never-worn", () => {
  test("never-worn item shows chưa mặc", () => {
    const { container } = render(
      <ItemCard
        item={makeItem({ wearCount: 0, lastWorn: "" })}
        age={ageInDays}
        onClick={() => {}}
      />,
    );
    expect(container.querySelector(".wear-pill")?.textContent).toBe("👕 0× · chưa mặc");
  });
});

describe("ItemCard photo", () => {
  test("renders the photo lazily", () => {
    render(
      <ItemCard item={makeItem({ photo: "/api/photos/p" })} age={ageInDays} onClick={() => {}} />,
    );
    const img = screen.getByAltText("Áo");
    expect(img.getAttribute("src")).toBe("/api/photos/p");
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  test('img error shows the "Chưa có ảnh" placeholder', () => {
    render(
      <ItemCard item={makeItem({ photo: "/api/photos/p" })} age={ageInDays} onClick={() => {}} />,
    );
    expect(screen.queryByText("Chưa có ảnh")).toBeNull();
    fireEvent.error(screen.getByAltText("Áo"));
    expect(screen.getByText("Chưa có ảnh")).toBeTruthy();
  });
});
