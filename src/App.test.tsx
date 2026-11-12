import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import App from "@/App";
import { starter } from "@/data/demo";
import { IMPORT_EXPORT_COPY } from "@/features/import-export/copy";
import { CSV_TEMPLATE } from "@/features/import-export/csv/template";

vi.mock("@/data/photos", () => ({
  resizeImage: async () => ({ blob: new Blob(["jpeg"], { type: "image/jpeg" }) }),
  urlToBlob: async () => new Blob(["raw"]),
}));

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
  it('shows "Phiên bản dev" in local mode', async () => {
    await renderApp();
    expect(screen.getByText("Phiên bản dev")).toBeTruthy();
  });

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

  it('Mặc hôm nay twice counts once and shows "Đã ghi nhận hôm nay rồi"', async () => {
    await renderApp();
    fireEvent.click(cards()[0]);
    const worn = () => Number(screen.getByText(/Đã mặc \d+ lần/).textContent!.match(/\d+/)![0]);
    const n = worn();
    fireEvent.click(screen.getByRole("button", { name: "Mặc hôm nay" }));
    await screen.findByText(`Đã mặc ${n + 1} lần`);
    fireEvent.click(screen.getByRole("button", { name: "Mặc hôm nay" }));
    await screen.findByText("Đã ghi nhận hôm nay rồi");
    expect(worn()).toBe(n + 1);
  });

  it("duplicate resets wear count and last worn", async () => {
    await renderApp();
    fireEvent.click(cards()[0]);
    fireEvent.click(screen.getByRole("button", { name: "Mặc hôm nay" }));
    await screen.findByText("Đã ghi nhận mặc hôm nay");
    fireEvent.click(screen.getByRole("button", { name: "Nhân bản" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu món đồ" }));
    await screen.findByText("Đã thêm vào tủ");
    await waitFor(() => expect(cards()).toHaveLength(17));
    const copy = cards().find((c) => c.textContent?.includes("(bản sao)"))!;
    expect(copy.textContent).toContain("0×");
    expect(copy.textContent).not.toContain("hôm nay");
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

  it("saving a new item without a name shows an inline error", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Thêm món đồ" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu món đồ" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Vui lòng nhập tên món đồ");
    expect(screen.getByRole("heading", { name: "Món đồ mới" })).toBeTruthy();
  });
});

describe("F-201 editor", () => {
  const nameInput = () =>
    screen.getByPlaceholderText("Ví dụ: Áo sơ mi linen trắng") as HTMLInputElement;
  const priceInput = () => screen.getByPlaceholderText("0") as HTMLInputElement;
  const dateInput = () => document.querySelector<HTMLInputElement>('input[type="date"]')!;
  const openFirst = () => fireEvent.click(cards()[0]);
  const saveBtn = () => screen.getByRole("button", { name: /Lưu món đồ|Đang lưu…/ });
  const editorOpen = () => screen.queryByText("CHI TIẾT MÓN ĐỒ") !== null;
  const closePaths: Record<string, () => void> = {
    "X button": () =>
      fireEvent.click(document.querySelector<HTMLElement>(".editor-header .icon-btn")!),
    Huỷ: () => fireEvent.click(screen.getByRole("button", { name: "Huỷ" })),
    Escape: () => fireEvent.keyDown(window, { key: "Escape" }),
    "backdrop click": () => fireEvent.mouseDown(document.querySelector(".modal-backdrop")!),
  };

  it('double-clicking save adds one item and shows "Đang lưu…"', async () => {
    await renderApp();
    openFirst();
    fireEvent.click(screen.getByRole("button", { name: "Nhân bản" }));
    const btn = saveBtn();
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(saveBtn().textContent).toBe("Đang lưu…");
    expect((saveBtn() as HTMLButtonElement).disabled).toBe(true);
    await screen.findByText("Đã thêm vào tủ");
    await waitFor(() => expect(cards()).toHaveLength(17));
  });

  it("a failed save shows the repo error as a toast", async () => {
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Thêm món đồ" }));
    fireEvent.change(nameInput(), { target: { value: "Áo mới" } });
    // The local repo swallows storage errors, so fail the id generation inside App.save's try.
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => {
      throw new Error("Hết dung lượng");
    });
    fireEvent.click(saveBtn());
    await screen.findByText("Hết dung lượng");
    expect(screen.getByRole("heading", { name: "Món đồ mới" })).toBeTruthy();
    await waitFor(() => expect(saveBtn().textContent).toBe("Lưu món đồ"));
  });

  describe("unsaved-changes guard", () => {
    for (const [path, close] of Object.entries(closePaths)) {
      it(path, async () => {
        await renderApp();
        openFirst();
        const oldName = nameInput().value;
        fireEvent.change(nameInput(), { target: { value: "Tên khác" } });
        close();
        expect(screen.getByText("Bỏ thay đổi?")).toBeTruthy();
        if (path === "Escape") {
          fireEvent.keyDown(window, { key: "Escape" });
          expect(screen.queryByText("Bỏ thay đổi?")).toBeNull();
          expect(editorOpen()).toBe(true);
          close();
        }
        fireEvent.click(screen.getByRole("button", { name: "Tiếp tục sửa" }));
        expect(screen.queryByText("Bỏ thay đổi?")).toBeNull();
        expect(nameInput().value).toBe("Tên khác");
        close();
        fireEvent.click(screen.getByRole("button", { name: "Bỏ thay đổi" }));
        expect(editorOpen()).toBe(false);
        expect(cards()[0].querySelector("h3")?.textContent).toBe(oldName);
      });
    }
  });

  it("closes without asking when nothing changed", async () => {
    await renderApp();
    for (const close of Object.values(closePaths)) {
      openFirst();
      close();
      expect(screen.queryByText("Bỏ thay đổi?")).toBeNull();
      expect(editorOpen()).toBe(false);
    }
  });

  it("wear +1 alone does not count as an unsaved change", async () => {
    await renderApp();
    openFirst();
    fireEvent.click(screen.getByRole("button", { name: "Mặc hôm nay" }));
    await screen.findByText("Đã ghi nhận mặc hôm nay");
    closePaths.Huỷ();
    expect(screen.queryByText("Bỏ thay đổi?")).toBeNull();
    expect(editorOpen()).toBe(false);
  });

  it("a negative price shows an inline error and is not saved", async () => {
    await renderApp();
    openFirst();
    fireEvent.change(priceInput(), { target: { value: "-1" } });
    fireEvent.click(saveBtn());
    expect((await screen.findByRole("alert")).textContent).toBe("Giá không được âm");
    expect(screen.queryByText("Đã lưu thay đổi")).toBeNull();
    expect(editorOpen()).toBe(true);
    fireEvent.change(priceInput(), { target: { value: "0" } });
    fireEvent.click(saveBtn());
    await screen.findByText("Đã lưu thay đổi");
  });

  it("name and future-date errors are inline", async () => {
    await renderApp();
    openFirst();
    fireEvent.change(nameInput(), { target: { value: "a".repeat(121) } });
    const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    fireEvent.change(dateInput(), { target: { value: tomorrow } });
    fireEvent.click(saveBtn());
    await screen.findByText("Tên tối đa 120 ký tự");
    expect(screen.getByText("Ngày mua không được ở tương lai")).toBeTruthy();
    expect(screen.queryByText("Đã lưu thay đổi")).toBeNull();
  });

  it("Escape on the delete confirm closes only the confirm", async () => {
    await renderApp();
    openFirst();
    fireEvent.click(screen.getByRole("button", { name: "Xoá" }));
    expect(screen.getByText("Xoá món đồ này?")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("Xoá món đồ này?")).toBeNull();
    expect(editorOpen()).toBe(true);
  });
});

describe("App import/export (local mode)", () => {
  const openImport = () => fireEvent.click(screen.getAllByRole("button", { name: "Import" })[0]);
  const openExport = () => fireEvent.click(screen.getAllByRole("button", { name: "Export" })[0]);
  const exportOption = (i: number) =>
    document.querySelectorAll<HTMLElement>(".export-options button")[i];
  const tabButton = (name: string) =>
    Array.from(document.querySelectorAll<HTMLElement>(".tabs button")).find(
      (b) => b.textContent === name,
    )!;

  it("import modal switches tabs and keeps pasted CSV across tabs", async () => {
    await renderApp();
    openImport();
    expect(screen.getByText("Kéo nhiều ảnh vào đây")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bắt đầu import" })).toBeTruthy();
    expect(tabButton("Ảnh hàng loạt").className).toContain("active");

    fireEvent.click(tabButton("CSV / Excel"));
    expect(tabButton("CSV / Excel").className).toContain("active");
    expect(tabButton("Ảnh hàng loạt").className).not.toContain("active");
    expect(screen.getByText("Nhập danh sách từ bảng tính")).toBeTruthy();
    expect(document.querySelector("pre")!.textContent).toBe(CSV_TEMPLATE);
    const area = () =>
      screen.getByPlaceholderText("Dán nội dung CSV tại đây…") as HTMLTextAreaElement;
    fireEvent.change(area(), { target: { value: "a\nb\nc" } });
    expect(screen.getByText("Bỏ qua 2 dòng lỗi")).toBeTruthy();

    fireEvent.click(tabButton("JSON (backup)"));
    expect(screen.getByText("Khôi phục từ bản sao lưu")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kiểm tra & import" })).toBeTruthy();

    fireEvent.click(tabButton("CSV / Excel"));
    expect(area().value).toBe("a\nb\nc");

    fireEvent.click(screen.getByRole("button", { name: "Huỷ" }));
    expect(screen.queryByText("THÊM NHIỀU MÓN")).toBeNull();
  });

  it('"Copy mẫu" copies the CSV template', async () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await renderApp();
    openImport();
    fireEvent.click(tabButton("CSV / Excel"));
    fireEvent.click(screen.getByRole("button", { name: /Copy mẫu/ }));
    expect(writeText).toHaveBeenCalledWith(CSV_TEMPLATE);
  });

  const area = () =>
    screen.getByPlaceholderText("Dán nội dung CSV tại đây…") as HTMLTextAreaElement;
  const primary = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

  it("CSV tab imports the template: preview, progress, summary, item visible", async () => {
    await renderApp();
    openImport();
    fireEvent.click(tabButton("CSV / Excel"));
    fireEvent.change(area(), { target: { value: CSV_TEMPLATE } });
    expect(screen.getByText("Sẽ nhập 1 món")).toBeTruthy();
    fireEvent.click(primary("Nhập 1 món"));
    await screen.findByText("Đã nhập: 1");
    fireEvent.click(primary("Xong"));
    expect(screen.queryByText("THÊM NHIỀU MÓN")).toBeNull();
    await screen.findByText("Đã thêm 1 món vào tủ");
    await waitFor(() => expect(cards()).toHaveLength(17));
    expect(cards().some((c) => c.textContent?.includes("Áo sơ mi trắng"))).toBe(true);
  });

  it("CSV tab reports invalid rows and imports only the valid ones", async () => {
    await renderApp();
    openImport();
    fireEvent.click(tabButton("CSV / Excel"));
    fireEvent.change(area(), {
      target: { value: "name,category\nA1,Áo\n,Áo\nA3,Áo\nA4,Xyz\nA5,Áo" },
    });
    expect(screen.getByText("Sẽ nhập 3 món")).toBeTruthy();
    expect(screen.getByText("Bỏ qua 2 dòng lỗi")).toBeTruthy();
    expect(screen.getByText("Thiếu tên món đồ")).toBeTruthy();
    expect(screen.getByText("Loại không hợp lệ: Xyz")).toBeTruthy();
    fireEvent.click(primary("Nhập 3 món"));
    await screen.findByText("Đã nhập: 3");
    fireEvent.click(primary("Xong"));
    await waitFor(() => expect(cards()).toHaveLength(19));
  });

  it("CSV tab disables import for empty, header-only and broken CSV", async () => {
    await renderApp();
    openImport();
    fireEvent.click(tabButton("CSV / Excel"));
    expect(primary("Nhập 0 món").disabled).toBe(true);
    fireEvent.change(area(), { target: { value: "name,category" } });
    expect(screen.getByText("Không có dòng dữ liệu nào")).toBeTruthy();
    expect(primary("Nhập 0 món").disabled).toBe(true);
    fireEvent.change(area(), { target: { value: 'name\n"abc' } });
    expect(screen.getByText(/dấu ngoặc kép chưa đóng ở dòng 2/)).toBeTruthy();
    expect(primary("Nhập 0 món").disabled).toBe(true);
  });

  it("picking a .csv file fills the text and shows the preview", async () => {
    await renderApp();
    openImport();
    fireEvent.click(tabButton("CSV / Excel"));
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([CSV_TEMPLATE], "mau.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByText("Sẽ nhập 1 món");
    expect(area().value).toBe(CSV_TEMPLATE);
  });

  it("Photos and JSON tabs are disabled until F-603 / F-602 and add nothing", async () => {
    await renderApp();
    openImport();
    expect(primary("Bắt đầu import").disabled).toBe(true);
    expect(screen.getByText("Sắp có — hiện chỉ nhập được bằng CSV.")).toBeTruthy();
    fireEvent.click(tabButton("JSON (backup)"));
    expect(primary("Kiểm tra & import").disabled).toBe(true);
    expect(screen.getByText("Sắp có — hiện chỉ nhập được bằng CSV.")).toBeTruthy();
    fireEvent.click(primary("Kiểm tra & import"));
    fireEvent.click(screen.getByRole("button", { name: "Huỷ" }));
    expect(cards()).toHaveLength(16);
  });

  it("shows the mock AI controls in local mode", async () => {
    await renderApp();
    fireEvent.click(cards()[0]);
    expect(screen.getByRole("button", { name: /Tự điền từ ảnh/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Huỷ" }));
    openImport();
    expect(screen.getByText(IMPORT_EXPORT_COPY.import.photos.aiTitle)).toBeTruthy();
  });

  it("export JSON and CSV download files and keep the modal open", async () => {
    const blobs: Blob[] = [];
    const createObjectURL = vi.fn((b: Blob) => {
      blobs.push(b);
      return "blob:x";
    });
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true });
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    const read = (b: Blob) =>
      new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () =>
          resolve(new TextDecoder("utf-8", { ignoreBOM: true }).decode(r.result as ArrayBuffer));
        r.readAsArrayBuffer(b);
      });

    await renderApp();
    openExport();
    fireEvent.click(exportOption(0));
    expect(names).toEqual(["tu-do-cua-toi.json"]);
    expect(blobs[0].type).toBe("application/json");
    expect(JSON.parse(await read(blobs[0]))).toHaveLength(16);
    await screen.findByText("Đã xuất JSON");

    fireEvent.click(exportOption(1));
    expect(names).toEqual(["tu-do-cua-toi.json", "tu-do-cua-toi.csv"]);
    expect(blobs[1].type).toBe("text/csv;charset=utf-8");
    expect(await read(blobs[1])).toMatch(/^\uFEFFname,/);
    await screen.findByText("Đã xuất CSV");
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(screen.getByText("SAO LƯU & CHIA SẺ")).toBeTruthy();
  });

  it("Escape and the close button close the modals", async () => {
    await renderApp();
    openExport();
    expect(screen.getByText("SAO LƯU & CHIA SẺ")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("SAO LƯU & CHIA SẺ")).toBeNull();

    openImport();
    fireEvent.click(document.querySelector<HTMLElement>(".import-header .icon-btn")!);
    expect(screen.queryByText("THÊM NHIỀU MÓN")).toBeNull();
  });
});

describe("App (API mode photos)", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  it("a failed photo step keeps the editor open and the retry PUTs the same item id", async () => {
    const calls: { method: string; url: string }[] = [];
    let photoAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        calls.push({ method, url });
        if (method === "GET")
          return json(url.endsWith("/items") ? { items: [] } : { locations: [] });
        const id = /\/items\/([^/]+)/.exec(url)![1];
        const row = {
          id,
          name: "Áo mới",
          category: "top",
          status: "active",
          colors: [],
          seasons: [],
          tags: [],
          created_at: "2026-01-01T00:00:00Z",
          wear_count: 0,
          last_worn: null,
        };
        if (!url.endsWith("/photo")) return json({ item: row });
        return ++photoAttempts === 1
          ? json({ error: { code: "photo_upload_failed" } }, 502)
          : json({ item: { ...row, primary_photo_id: "22222222-2222-4222-8222-222222222222" } });
      }),
    );
    try {
      render(<App mode="api" />);
      await screen.findByText("0 kết quả");
      fireEvent.click(screen.getAllByRole("button", { name: "Thêm món đồ" })[0]);
      fireEvent.change(screen.getByPlaceholderText("Ví dụ: Áo sơ mi linen trắng"), {
        target: { value: "Áo mới" },
      });
      const input = document.querySelector<HTMLInputElement>("input[type=file]:not([capture])")!;
      fireEvent.change(input, {
        target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] },
      });
      await waitFor(() => expect(document.querySelector(".upload-zone img")).toBeTruthy());
      const save = () => screen.getByRole("button", { name: /Lưu món đồ/ });
      fireEvent.click(save());
      await screen.findByText(/Đã lưu món đồ nhưng chưa lưu được ảnh/);
      expect(screen.getByText("CHI TIẾT MÓN ĐỒ")).toBeTruthy();
      await waitFor(() => expect((save() as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(save());
      await screen.findByText("Đã lưu thay đổi");
      const itemPuts = calls.filter((c) => c.method === "PUT" && !c.url.endsWith("/photo"));
      expect(new Set(itemPuts.map((c) => c.url)).size).toBe(1);
      expect(calls.filter((c) => c.url.endsWith("/photo"))).toHaveLength(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
