import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { StatsRow } from "./StatsRow";
import { blankItem } from "./blankItem";

afterEach(cleanup);

test("total value keeps ₫ on the same line", () => {
  const { container } = render(
    <StatsRow items={[{ ...blankItem(), price: 1500000 }]} special="" onToggleSpecial={vi.fn()} />,
  );
  expect(container.querySelector(".money")?.textContent?.endsWith(" ₫")).toBe(true);
});

test("a new never-worn item counts as never worn but not as stale", () => {
  const dayMs = 86400000;
  const fresh = { ...blankItem(), id: "n1", createdAt: new Date().toISOString() };
  const old = {
    ...blankItem(),
    id: "n2",
    createdAt: new Date(Date.now() - 100 * dayMs).toISOString(),
  };
  const counts = (items: (typeof fresh)[]) => {
    const { container, unmount } = render(
      <StatsRow items={items} special="" onToggleSpecial={vi.fn()} />,
    );
    const read = (label: string) =>
      [...container.querySelectorAll(".stat-card")]
        .find((c) => c.querySelector("span")?.textContent === label)
        ?.querySelector("strong")?.textContent;
    const out = [read("≥ 90 ngày chưa mặc"), read("Chưa mặc lần nào")];
    unmount();
    return out;
  };
  expect(counts([fresh])).toEqual(["0", "1"]);
  expect(counts([fresh, old])).toEqual(["1", "2"]);
});
