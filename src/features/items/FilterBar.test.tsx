// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilterBar } from "./FilterBar";

afterEach(cleanup);

describe("FilterBar", () => {
  it("keeps the search box and the filter row as separate children of .toolbar", () => {
    const { container } = render(
      <FilterBar
        query=""
        onQuery={vi.fn()}
        filters={{ status: "", season: "", location: "", color: "", special: "" }}
        onFilter={vi.fn()}
        sort=""
        onSort={vi.fn()}
        category="Tất cả"
        onCategory={vi.fn()}
        locationOptions={[]}
        counts={{}}
        total={0}
      />,
    );
    const toolbar = container.querySelector(".toolbar")!;
    expect([...toolbar.children].map((c) => `${c.tagName.toLowerCase()}.${c.className}`)).toEqual([
      "label.searchbox",
      "div.filter-row",
    ]);
    const labels = [...toolbar.querySelectorAll(".filter-row > .filter-select")];
    expect(labels.map((l) => l.querySelector("option")?.textContent)).toEqual([
      "Trạng thái",
      "Mùa",
      "Vị trí lưu trữ",
      "Màu",
      "Sắp xếp",
    ]);
  });

  it("each filter select has an aria-label", () => {
    render(
      <FilterBar
        query=""
        onQuery={vi.fn()}
        filters={{ status: "", season: "", location: "", color: "", special: "" }}
        onFilter={vi.fn()}
        sort=""
        onSort={vi.fn()}
        category="Tất cả"
        onCategory={vi.fn()}
        locationOptions={[]}
        counts={{}}
        total={0}
      />,
    );
    for (const name of ["Trạng thái", "Mùa", "Vị trí lưu trữ", "Màu", "Sắp xếp"]) {
      expect(screen.getByRole("combobox", { name }).getAttribute("aria-label")).toBe(name);
    }
  });
});
