import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImportResult } from "@/data/useWardrobe";
import type { Item } from "@/types/item";
import { CSV_TEMPLATE } from "./csv/template";
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
      onImported={onImported}
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
