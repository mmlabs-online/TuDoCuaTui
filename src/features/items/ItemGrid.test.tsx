import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Item } from "@/types/item";
import { ItemGrid } from "./ItemGrid";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const makeItem = (i: number, name = `Áo ${i}`): Item => ({
  id: `i${i}`,
  name,
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
  wearCount: 0,
  lastWorn: "",
  createdAt: "",
});
const makeItems = (n: number) => Array.from({ length: n }, (_, k) => makeItem(k + 1));

type Cb = (e: { isIntersecting: boolean }[]) => void;

/** Stubs IntersectionObserver; `fire()` reports the sentinel as intersecting. */
function stubObserver(autoFire = false) {
  const live = new Set<Cb>();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      cb: Cb;
      constructor(c: Cb) {
        this.cb = c;
      }
      observe() {
        live.add(this.cb);
        if (autoFire) queueMicrotask(() => act(() => this.cb([{ isIntersecting: true }])));
      }
      disconnect() {
        live.delete(this.cb);
      }
    },
  );
  return { fire: () => act(() => [...live].forEach((c) => c([{ isIntersecting: true }]))) };
}

const renderGrid = (visible: Item[], resetKey = "k") => {
  const props = {
    loading: false,
    total: visible.length,
    onOpen: () => {},
    onAdd: () => {},
    onImport: () => {},
    onReset: () => {},
  };
  const ui = (v: Item[], key: string) => <ItemGrid {...props} visible={v} resetKey={key} />;
  const view = render(ui(visible, resetKey));
  return {
    ...view,
    rerenderWith: (v: Item[], key: string) => view.rerender(ui(v, key)),
    cards: () => view.container.querySelectorAll(".item-grid > *").length,
  };
};

describe("ItemGrid progressive rendering (BUG-002)", () => {
  test("renders 12 of 40 items, then 12 more each time the sentinel intersects", () => {
    const io = stubObserver();
    const g = renderGrid(makeItems(40));
    expect(g.cards()).toBe(12);
    io.fire();
    expect(g.cards()).toBe(24);
    io.fire();
    expect(g.cards()).toBe(36);
    io.fire();
    expect(g.cards()).toBe(40);
    expect(g.container.querySelector(".grid-more")).toBeNull();
  });

  test('without IntersectionObserver shows a "Xem thêm" button that adds 12', () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const g = renderGrid(makeItems(40));
    expect(g.cards()).toBe(12);
    fireEvent.click(screen.getByRole("button", { name: "Xem thêm" }));
    expect(g.cards()).toBe(24);
    fireEvent.click(screen.getByRole("button", { name: "Xem thêm" }));
    fireEvent.click(screen.getByRole("button", { name: "Xem thêm" }));
    expect(g.cards()).toBe(40);
    expect(screen.queryByRole("button", { name: "Xem thêm" })).toBeNull();
  });

  test("resets to 12 when resetKey changes", () => {
    const io = stubObserver();
    const items = makeItems(40);
    const g = renderGrid(items, "a");
    io.fire();
    expect(g.cards()).toBe(24);
    g.rerenderWith(items, "b");
    expect(g.cards()).toBe(12);
  });

  test("keeps the shown count when the list changes but resetKey does not", () => {
    const io = stubObserver();
    const items = makeItems(40);
    const g = renderGrid(items, "a");
    io.fire();
    expect(g.cards()).toBe(24);
    g.rerenderWith([makeItem(1, "Đổi tên"), ...items.slice(1)], "a");
    expect(g.cards()).toBe(24);
  });

  test("re-observes after each page so a still-visible sentinel loads the next page", async () => {
    stubObserver(true);
    const g = renderGrid(makeItems(40));
    await waitFor(() => expect(g.cards()).toBe(40));
  });

  test("with 12 or fewer items renders all and no load-more control", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const g = renderGrid(makeItems(12));
    expect(g.cards()).toBe(12);
    expect(g.container.querySelector(".grid-more")).toBeNull();
    expect(screen.queryByRole("button", { name: "Xem thêm" })).toBeNull();
  });
});
