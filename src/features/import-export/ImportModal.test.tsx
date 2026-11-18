import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { aiErrorText } from "@/features/items/aiFill";
import { AiSettingsError } from "@/data/aiSettings";
import { ApiError } from "@/data/apiErrors";
import type { PhotoImportOptions, PhotoJob } from "@/data/photoImport";
import type { AiSettingsView } from "@/shared/ai/catalog";
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

describe("photos AI", () => {
  const view = (over: Partial<AiSettingsView> = {}): AiSettingsView => ({
    provider: "claude",
    model: "m",
    keyHint: "…abcd",
    hasKey: true,
    modelSupported: true,
    updatedAt: "2026-11-18T00:00:00Z",
    ...over,
  });
  const SUGGESTION = {
    name: null,
    category: null,
    colors: [],
    seasons: [],
    material: null,
    brand: null,
    tags: [],
  };
  const mount = (
    get: () => Promise<AiSettingsView | null>,
    importPhotos = vi.fn(async (jobs: PhotoJob[], _o: PhotoImportOptions) => ({ jobs })),
    withAi = true,
  ) => {
    const settings = { get: vi.fn(get) };
    const tagger = { tag: vi.fn(async () => SUGGESTION) };
    const onOpenSettings = vi.fn();
    const props = {
      onClose: vi.fn(),
      locations: [],
      importMany: vi.fn(),
      importPhotos,
      onImported: vi.fn(),
      restoreBackup: vi.fn(),
      onRestored: vi.fn(),
    };
    const ui = (rev: number) => (
      <ImportModal
        {...props}
        ai={withAi ? { settings, tagger, settingsRev: rev, onOpenSettings } : undefined}
      />
    );
    const r = render(ui(0));
    return {
      settings,
      tagger,
      onOpenSettings,
      importPhotos,
      rerender: (rev: number) => r.rerender(ui(rev)),
      r,
    };
  };
  const box = () => screen.getByRole("checkbox") as HTMLInputElement;

  it("without ai prop there is no checkbox", () => {
    mount(async () => view(), undefined, false);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("ready: checkbox enabled, unchecked, shows the provider disclosure", async () => {
    mount(async () => view());
    await screen.findByText("Ảnh sẽ được gửi tới Claude bằng key của bạn");
    expect(box().disabled).toBe(false);
    expect(box().checked).toBe(false);
  });

  it("no key: disabled + settings link calls onOpenSettings", async () => {
    const { onOpenSettings } = mount(async () => null);
    fireEvent.click(await screen.findByRole("button", { name: "Mở cài đặt" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(box().disabled).toBe(true);
    expect(box().checked).toBe(false);
  });

  it("model unsupported: disabled + link", async () => {
    mount(async () => view({ modelSupported: false }));
    await screen.findByText(/Model không còn hỗ trợ/);
    expect(screen.getByRole("button", { name: "Mở cài đặt" })).toBeTruthy();
    expect(box().disabled).toBe(true);
  });

  it("misconfigured: disabled, no link", async () => {
    mount(async () => {
      throw new AiSettingsError(503, "server_misconfigured");
    });
    await screen.findByText(aiErrorText("server_misconfigured"));
    expect(box().disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Mở cài đặt" })).toBeNull();
  });

  it("load error: retry reloads settings", async () => {
    let fail = true;
    const { settings } = mount(async () => {
      if (fail) throw new AiSettingsError(0, "network");
      return view();
    });
    const retry = await screen.findByRole("button", { name: "Thử lại" });
    fail = false;
    fireEvent.click(retry);
    await screen.findByText(/Ảnh sẽ được gửi tới Claude/);
    expect(settings.get).toHaveBeenCalledTimes(2);
    expect(box().disabled).toBe(false);
  });

  it("no AI settings request while the CSV or JSON tab is shown", async () => {
    const { settings, rerender } = mount(async () => view());
    await screen.findByText(/Ảnh sẽ được gửi tới Claude/);
    expect(settings.get).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "CSV / Excel" }));
    rerender(1);
    fireEvent.click(screen.getByRole("button", { name: "JSON (backup)" }));
    rerender(2);
    expect(settings.get).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Ảnh hàng loạt" }));
    await waitFor(() => expect(settings.get).toHaveBeenCalledTimes(2));
  });

  it("settingsRev bump reloads availability", async () => {
    let has = false;
    const { settings, rerender } = mount(async () => view({ hasKey: has }));
    await screen.findByRole("button", { name: "Mở cài đặt" });
    has = true;
    rerender(1);
    await screen.findByText(/Ảnh sẽ được gửi tới Claude/);
    expect(settings.get).toHaveBeenCalledTimes(2);
  });

  const runWith = async (check: boolean) => {
    const m = mount(async () => view());
    await screen.findByText(/Ảnh sẽ được gửi tới Claude/);
    if (check) fireEvent.click(box());
    fireEvent.change(m.r.container.querySelector("input[type=file]")!, {
      target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] },
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Nhập 1 ảnh" })));
    return m;
  };

  it("checked: importPhotos receives a tag function that calls the tagger", async () => {
    const m = await runWith(true);
    const opts = m.importPhotos.mock.calls[0][1] as PhotoImportOptions;
    expect(typeof opts.tag).toBe("function");
    await opts.tag!(new Blob(["j"]));
    expect(m.tagger.tag).toHaveBeenCalledTimes(1);
  });

  it("unchecked: importPhotos receives no tag", async () => {
    const m = await runWith(false);
    expect((m.importPhotos.mock.calls[0][1] as PhotoImportOptions).tag).toBeUndefined();
  });

  it("the checkbox is hidden while running", async () => {
    let release!: () => void;
    const importPhotos = vi.fn(
      (jobs: PhotoJob[], _o: PhotoImportOptions) =>
        new Promise<{ jobs: PhotoJob[] }>((r) => (release = () => r({ jobs }))),
    );
    const m = mount(async () => view(), importPhotos);
    await screen.findByText(/Ảnh sẽ được gửi tới Claude/);
    fireEvent.change(m.r.container.querySelector("input[type=file]")!, {
      target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Nhập 1 ảnh" }));
    expect(screen.queryByRole("checkbox")).toBeNull();
    await act(async () => release());
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
