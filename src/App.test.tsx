import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import App from "@/App";
import { starter } from "@/data/demo";

afterEach(cleanup);

const cards = () => Array.from(document.querySelectorAll<HTMLElement>(".item-card"));

async function renderApp() {
  const view = render(<App />);
  await waitFor(() => expect(cards()).toHaveLength(starter.length));
  return view;
}

const chip = (name: string) => {
  const chips = Array.from(document.querySelectorAll<HTMLElement>(".categories button"));
  const found = chips.find((b) => b.childNodes[1]?.textContent === name);
  if (!found) throw new Error(`No chip ${name}`);
  return found;
};

const selectWithLabel = (label: string) =>
  screen.getByRole("option", { name: label }).closest("select") as HTMLSelectElement;

const statCard = (label: RegExp) => screen.getByRole("button", { name: label });

describe("App (local mode)", () => {
  it("renders the 16 demo items in local mode", async () => {
    await renderApp();
    expect(cards()).toHaveLength(16);
    expect(screen.getByText("16 kết quả")).toBeTruthy();
    expect(screen.getByText("16 món")).toBeTruthy();
  });

  it('search narrows the grid and "Xoá bộ lọc" resets it', async () => {
    await renderApp();
    const box = screen.getByPlaceholderText(/Tìm theo tên/);
    fireEvent.change(box, { target: { value: "zzz" } });
    expect(screen.getByText("Không tìm thấy món đồ")).toBeTruthy();
    expect(cards()).toHaveLength(0);
    const noResults = document.querySelector<HTMLElement>(".no-results")!;
    fireEvent.click(within(noResults).getByRole("button", { name: "Xoá bộ lọc" }));
    expect(cards()).toHaveLength(16);

    fireEvent.change(box, { target: { value: "so mi linen" } });
    expect(cards().map((c) => c.querySelector("h3")?.textContent)).toContain(
      "Áo sơ mi linen trắng",
    );
  });

  it("category chip filters and shows its count", async () => {
    await renderApp();
    const quan = chip("Quần");
    const shown = Number(quan.querySelector("span")!.textContent);
    expect(shown).toBe(starter.filter((i) => i.category === "Quần").length);
    fireEvent.click(quan);
    expect(cards()).toHaveLength(shown);
    expect(chip("Quần").className).toContain("active");
    fireEvent.click(chip("Tất cả"));
    expect(cards()).toHaveLength(16);
  });

  it("status select filters", async () => {
    await renderApp();
    fireEvent.change(selectWithLabel("Trạng thái"), { target: { value: "Cất kho" } });
    const expected = starter.filter((i) => i.status === "Cất kho").length;
    expect(cards()).toHaveLength(expected);
    for (const c of cards()) expect(c.querySelector(".badge")?.textContent).toBe("Cất kho");
  });

  it('sort "Tên A→Z" orders cards by Vietnamese name', async () => {
    await renderApp();
    fireEvent.change(selectWithLabel("Sắp xếp"), { target: { value: "Tên A→Z" } });
    expect(cards().map((c) => c.querySelector("h3")?.textContent)).toEqual(
      starter.map((n) => n.name).sort((a, b) => a.localeCompare(b, "vi")),
    );
  });

  it("stale and never stat cards toggle a filter", async () => {
    await renderApp();
    for (const label of [/≥ 90 ngày chưa mặc/, /Chưa mặc lần nào/]) {
      const card = statCard(label);
      const n = Number(card.querySelector("strong")!.textContent);
      fireEvent.click(card);
      expect(cards()).toHaveLength(n);
      expect(statCard(label).className).toContain("active");
      fireEvent.click(statCard(label));
      expect(cards()).toHaveLength(16);
    }
  });

  it("wear +1 and −1 from the editor", async () => {
    await renderApp();
    fireEvent.click(cards()[0]);
    const worn = () => Number(screen.getByText(/Đã mặc \d+ lần/).textContent!.match(/\d+/)![0]);
    const n = worn();
    fireEvent.click(screen.getByRole("button", { name: "Mặc hôm nay" }));
    await screen.findByText(`Đã mặc ${n + 1} lần`);
    await screen.findByText("Đã ghi nhận mặc hôm nay");
    fireEvent.click(screen.getByRole("button", { name: "−1" }));
    await screen.findByText(`Đã mặc ${n} lần`);
    await screen.findByText("Đã điều chỉnh số lần mặc");
  });

  it("duplicate creates a new item on save", async () => {
    await renderApp();
    fireEvent.click(cards()[0]);
    fireEvent.click(screen.getByRole("button", { name: "Nhân bản" }));
    expect(screen.getByRole("heading", { name: "Món đồ mới" })).toBeTruthy();
    const name = screen.getByPlaceholderText("Ví dụ: Áo sơ mi linen trắng") as HTMLInputElement;
    expect(name.value.endsWith(" (bản sao)")).toBe(true);
    await screen.findByText("Đã tạo bản sao");
    fireEvent.click(screen.getByRole("button", { name: "Lưu món đồ" }));
    await screen.findByText("Đã thêm vào tủ");
    await waitFor(() => expect(cards()).toHaveLength(17));
  });

  it("delete asks for confirmation and removes the item", async () => {
    await renderApp();
    fireEvent.click(cards()[0]);
    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));
    expect(screen.getByText("Xoá món đồ này?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Giữ lại" }));
    expect(screen.queryByText("Xoá món đồ này?")).toBeNull();
    expect(cards()).toHaveLength(16);
    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));
    fireEvent.click(screen.getByRole("button", { name: "Xoá món đồ" }));
    await screen.findByText("Đã xoá món đồ");
    await waitFor(() => expect(cards()).toHaveLength(15));
    expect(screen.queryByText("CHI TIẾT MÓN ĐỒ")).toBeNull();
  });

  it("saving a new item without a name shows a validation toast", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Thêm món đồ" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu món đồ" }));
    await screen.findByText("Vui lòng nhập tên món đồ");
    expect(screen.getByRole("heading", { name: "Món đồ mới" })).toBeTruthy();
  });
});
