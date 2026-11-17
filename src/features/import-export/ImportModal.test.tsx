import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/data/apiErrors";
import { BACKUP_CAPS, type Backup, type RestoreSummary } from "@/data/backup";
import type { ImportResult } from "@/data/useWardrobe";
import { fixtureBackup } from "@/test/fixtures";
import type { Item } from "@/types/item";
import { CSV_TEMPLATE } from "./csv/template";
import { IMPORT_EXPORT_COPY } from "./copy";
import { ImportModal } from "./ImportModal";

afterEach(cleanup);

type Opts = { onProgress: (done: number, total: number) => void; signal: AbortSignal };

function deferred() {
  let resolve!: (r: ImportResult[]) => void;
  const promise = new Promise<ImportResult[]>((r) => (resolve = r));
  return { promise, resolve };
}

function setup(importMany = vi.fn<(l: Item[], o: Opts) => Promise<ImportResult[]>>()) {
  const onClose = vi.fn();
  const onImported = vi.fn();
  const view = render(
    <ImportModal
      onClose={onClose}
      locations={[]}
      importMany={importMany}
      importPhotos={vi.fn()}
      onImported={onImported}
      restoreBackup={vi.fn()}
      onRestored={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "CSV / Excel" }));
  return { importMany, onClose, onImported, view };
}

const paste = (v: string) =>
  fireEvent.change(screen.getByPlaceholderText("Dán nội dung CSV tại đây…"), {
    target: { value: v },
  });

describe("ImportModal", () => {
  it('import button shows "Nhập N món" and calls importMany with the valid items only', async () => {
    const { importMany } = setup(vi.fn(async () => []));
    paste("name,category\nA,Áo\n,Áo\nC,Quần");
    fireEvent.click(screen.getByRole("button", { name: "Nhập 2 món" }));
    expect(importMany).toHaveBeenCalledTimes(1);
    expect(importMany.mock.calls[0][0].map((i) => i.name)).toEqual(["A", "C"]);
    await screen.findByRole("button", { name: "Xong" });
  });

  it("while running: progress shown, primary disabled, tabs disabled", async () => {
    const d = deferred();
    let opts!: Opts;
    setup(
      vi.fn((_l, o) => {
        opts = o;
        return d.promise;
      }),
    );
    paste(CSV_TEMPLATE);
    fireEvent.click(screen.getByRole("button", { name: "Nhập 1 món" }));
    act(() => opts.onProgress(1, 4));
    expect(screen.getByText("Đang nhập 1/4")).toBeTruthy();
    expect(screen.getByText("25%")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Đang xử lý…" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "JSON (backup)" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await act(async () => d.resolve([]));
  });

  it("closing the modal during an import aborts the signal passed to importMany", async () => {
    const d = deferred();
    let opts!: Opts;
    const { view } = setup(
      vi.fn((_l, o) => {
        opts = o;
        return d.promise;
      }),
    );
    paste(CSV_TEMPLATE);
    fireEvent.click(screen.getByRole("button", { name: "Nhập 1 món" }));
    expect(opts.signal.aborted).toBe(false);
    view.unmount();
    expect(opts.signal.aborted).toBe(true);
    await act(async () => d.resolve([]));
  });

  it("Escape during an import aborts too", async () => {
    const d = deferred();
    let opts!: Opts;
    const { onClose, view } = setup(
      vi.fn((_l, o) => {
        opts = o;
        return d.promise;
      }),
    );
    paste(CSV_TEMPLATE);
    fireEvent.click(screen.getByRole("button", { name: "Nhập 1 món" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    view.unmount(); // the parent unmounts the modal when onClose fires
    expect(opts.signal.aborted).toBe(true);
    await act(async () => d.resolve([]));
  });

  it("summary shows imported, skipped and failed rows with reasons and row numbers; calls onImported(count)", async () => {
    const item = { name: "A" } as Item;
    const { onImported } = setup(
      vi.fn(async () => [
        { index: 0, ok: true as const, item },
        { index: 1, ok: false as const, error: "Dữ liệu bị trùng" },
        { index: 2, ok: true as const, item },
      ]),
    );
    paste("name,category\nA,Áo\n,Áo\nC,Áo\nD,Áo");
    fireEvent.click(screen.getByRole("button", { name: "Nhập 3 món" }));
    await screen.findByText("Đã nhập: 2");
    expect(screen.getByText("Bỏ qua (lỗi dữ liệu): 1")).toBeTruthy();
    expect(screen.getByText("Lỗi khi lưu: 1")).toBeTruthy();
    // failed result index 1 → itemRows[1] = data row 3 → shown as row 4
    expect(screen.getByText("Dòng 4: Dữ liệu bị trùng")).toBeTruthy();
    expect(onImported).toHaveBeenCalledWith(2);
  });
});

describe("photos tab", () => {
  it("Photos tab shows no AI checkbox", () => {
    render(
      <ImportModal
        onClose={vi.fn()}
        locations={[]}
        importMany={vi.fn()}
        importPhotos={vi.fn()}
        onImported={vi.fn()}
        restoreBackup={vi.fn()}
        onRestored={vi.fn()}
      />,
    );
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

describe("JSON tab (restore)", () => {
  const summary: RestoreSummary = {
    locations: { inserted: 2, updated: 0, unchanged: 0, merged: 0, remapped: 0 },
    items: { inserted: 3, updated: 0, unchanged: 0, remapped: 0 },
    wearLogs: { inserted: 2, unchanged: 0 },
    photosMissing: 1,
  };
  const valid = JSON.stringify(fixtureBackup);
  const JSON_COPY = IMPORT_EXPORT_COPY.import.json;
  const DATE_LINE = "Bản sao lưu ngày 18/11/2026"; // 2026-11-17T18:30Z is the 18th in UTC+7

  function setupJson(restoreBackup = vi.fn<(b: Backup) => Promise<RestoreSummary>>()) {
    const onClose = vi.fn();
    const onRestored = vi.fn();
    render(
      <ImportModal
        onClose={onClose}
        locations={[]}
        importMany={vi.fn()}
        importPhotos={vi.fn()}
        onImported={vi.fn()}
        restoreBackup={restoreBackup}
        onRestored={onRestored}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "JSON (backup)" }));
    return { restoreBackup, onClose, onRestored };
  }
  const pasteJson = (v: string) =>
    fireEvent.change(screen.getByPlaceholderText(JSON_COPY.pastePlaceholder), {
      target: { value: v },
    });
  const checkBtn = () => screen.getByRole("button", { name: "Kiểm tra & import" });
  const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;
  const pick = (file: File) => fireEvent.change(fileInput(), { target: { files: [file] } });

  it("paste a valid backup, check: confirm shows date, counts and warnings; restore not called yet", () => {
    const { restoreBackup } = setupJson();
    pasteJson(valid);
    fireEvent.click(checkBtn());
    expect(screen.getByText(DATE_LINE)).toBeTruthy();
    expect(screen.getByText("3 món · 2 vị trí · 2 lượt mặc")).toBeTruthy();
    expect(screen.getByText(JSON_COPY.warning)).toBeTruthy();
    expect(screen.getByText(JSON_COPY.photoNote(1))).toBeTruthy();
    expect(screen.getByRole("button", { name: "Khôi phục" })).toBeTruthy();
    expect(restoreBackup).not.toHaveBeenCalled();
  });

  it("confirm, restore: tabs disabled while running, summary with counts and photos, Xong closes", async () => {
    let resolve!: (s: RestoreSummary) => void;
    const { restoreBackup, onClose, onRestored } = setupJson(
      vi.fn(() => new Promise<RestoreSummary>((r) => (resolve = r))),
    );
    pasteJson(valid);
    fireEvent.click(checkBtn());
    fireEvent.click(screen.getByRole("button", { name: "Khôi phục" }));
    expect(restoreBackup).toHaveBeenCalledWith(fixtureBackup);
    expect(screen.getByText("Đang khôi phục…")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "CSV / Excel" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Đang xử lý…" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await act(async () => resolve(summary));
    expect(screen.getByText("Món thêm mới: 3")).toBeTruthy();
    expect(screen.getByText("Vị trí thêm mới: 2")).toBeTruthy();
    expect(screen.getByText("Lượt mặc thêm mới: 2")).toBeTruthy();
    expect(screen.getByText("1 món chưa có ảnh")).toBeTruthy();
    expect(onRestored).toHaveBeenCalledWith(summary);
    fireEvent.click(screen.getByRole("button", { name: "Xong" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("an oversized file shows the size message, is never read, restore is not called", () => {
    const { restoreBackup } = setupJson();
    const read = vi.spyOn(FileReader.prototype, "readAsText");
    const big = new File(["{}"], "big.json", { type: "application/json" });
    Object.defineProperty(big, "size", { value: BACKUP_CAPS.bytes + 1 });
    pick(big);
    expect(screen.getByRole("alert").textContent).toBe(JSON_COPY.precheck.tooLarge(8));
    expect(read).not.toHaveBeenCalled();
    expect(restoreBackup).not.toHaveBeenCalled();
    read.mockRestore();
  });

  it("invalid pasted text shows the Vietnamese message and restore is not called", () => {
    const { restoreBackup } = setupJson();
    const P = JSON_COPY.precheck;
    const tooManyItems = {
      ...fixtureBackup,
      items: Array.from({ length: BACKUP_CAPS.items + 1 }, () => ({})),
    };
    const cases: [string, string][] = [
      ["{", P.notJson],
      ['[{"name":"Áo"}]', P.legacyArray],
      [JSON.stringify({ ...fixtureBackup, version: 2 }), P.versionUnsupported],
      [JSON.stringify(tooManyItems), P.tooMany("items", BACKUP_CAPS.items)],
    ];
    for (const [text, message] of cases) {
      pasteJson(text);
      fireEvent.click(checkBtn());
      expect(screen.getByRole("alert").textContent).toBe(message);
    }
    expect(restoreBackup).not.toHaveBeenCalled();
  });

  it("picking a valid file shows its name and enables the check; Bỏ chọn returns to paste", async () => {
    setupJson();
    expect((checkBtn() as HTMLButtonElement).disabled).toBe(true);
    pick(new File([valid], "tu-do-cua-toi.json", { type: "application/json" }));
    await screen.findByText(/tu-do-cua-toi\.json/);
    expect((checkBtn() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(checkBtn());
    expect(screen.getByText(DATE_LINE)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Bỏ chọn" }));
    expect(screen.queryByText(DATE_LINE)).toBeNull();
    expect(screen.getByPlaceholderText(JSON_COPY.pastePlaceholder)).toBeTruthy();
  });

  it("server 400 invalid_input shows field and reason; 503 restore_busy keeps Khôi phục enabled to retry", async () => {
    const restoreBackup = vi
      .fn<(b: Backup) => Promise<RestoreSummary>>()
      .mockRejectedValueOnce(new ApiError(400, "invalid_input", "items[3].name", "nameRequired"))
      .mockRejectedValueOnce(new ApiError(503, "restore_busy"));
    setupJson(restoreBackup);
    pasteJson(valid);
    fireEvent.click(checkBtn());
    fireEvent.click(screen.getByRole("button", { name: "Khôi phục" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("món #4");
    expect(alert.textContent).toContain("Vui lòng nhập tên món đồ");
    fireEvent.click(screen.getByRole("button", { name: "Khôi phục" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("khôi phục khác"));
    expect((screen.getByRole("button", { name: "Khôi phục" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("editing the text after a check returns to edit and clears the confirm", () => {
    setupJson();
    pasteJson(valid);
    fireEvent.click(checkBtn());
    expect(screen.getByRole("button", { name: "Khôi phục" })).toBeTruthy();
    pasteJson(valid + " ");
    expect(screen.queryByRole("button", { name: "Khôi phục" })).toBeNull();
    expect(screen.queryByText(DATE_LINE)).toBeNull();
    expect(checkBtn()).toBeTruthy();
  });
});

describe("close button", () => {
  it('is named "Đóng"', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: IMPORT_EXPORT_COPY.import.close }));
    expect(onClose).toHaveBeenCalled();
  });
});
