import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { OUTFITS_COPY } from "@/features/outfits/copy";
import { Hero } from "./Hero";

afterEach(cleanup);

test("Hôm nay mặc gì? button calls onOutfits", () => {
  const onOutfits = vi.fn();
  render(<Hero items={[]} onImport={vi.fn()} onExport={vi.fn()} onOutfits={onOutfits} />);
  fireEvent.click(screen.getByRole("button", { name: OUTFITS_COPY.entry }));
  expect(onOutfits).toHaveBeenCalledTimes(1);
});
