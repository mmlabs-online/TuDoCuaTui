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
