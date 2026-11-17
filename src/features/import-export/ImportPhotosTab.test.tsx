import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/data/apiErrors";
import type { PhotoImportOptions, PhotoJob, PhotoStop } from "@/data/photoImport";
import { ImportModal } from "./ImportModal";

afterEach(cleanup);

type Out = { jobs: PhotoJob[]; stopped?: PhotoStop };
type Fn = (jobs: PhotoJob[], opts: PhotoImportOptions) => Promise<Out>;

const photo = (name: string) => new File(["x"], name, { type: "image/jpeg" });
const allDone: Fn = async (jobs) => ({ jobs: jobs.map((j) => ({ ...j, state: "done" as const })) });

function setup(importPhotos: Fn = allDone, locations: string[] = ["Tủ A"]) {
  const onImported = vi.fn();
  const fn = vi.fn(importPhotos);
  const view = render(
    <ImportModal
      onClose={vi.fn()}
      locations={locations}
      importMany={vi.fn()}
      importPhotos={fn}
      onImported={onImported}
      restoreBackup={vi.fn()}
      onRestored={vi.fn()}
    />,
  );
  const pick = (...files: File[]) =>
    fireEvent.change(view.container.querySelector("input[type=file]")!, { target: { files } });
  return { fn, onImported, pick, view };
}

const names = (n: number) => Array.from({ length: n }, (_, i) => photo(`IMG_${i + 1}.jpg`));

const precedes = (a: Node, b: Node) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("ImportPhotosTab", () => {
  it('lists picked files and enables "Nhập N ảnh"', () => {
    const { pick } = setup();
    const btn = () => screen.getByRole("button", { name: /^Nhập \d+ ảnh$/ }) as HTMLButtonElement;
    expect(btn().disabled).toBe(true);
    pick(photo("IMG_1.jpg"), photo("IMG_2.jpg"));
    expect(screen.getByText("IMG_1.jpg")).toBeTruthy();
    expect(screen.getByText("IMG_2.jpg")).toBeTruthy();
    expect(btn().textContent).toBe("Nhập 2 ảnh");
    expect(btn().disabled).toBe(false);
  });

  it("accepts dropped files and ignores non-image files", () => {
    setup();
    const zone = screen.getByText("Kéo nhiều ảnh vào đây").closest(".bulk-drop")!;
    fireEvent.drop(zone, {
      dataTransfer: {
        files: [photo("a.jpg"), new File(["x"], "notes.pdf", { type: "application/pdf" })],
      },
    });
    expect(screen.getByText("a.jpg")).toBeTruthy();
    expect(screen.queryByText("notes.pdf")).toBeNull();
    expect(screen.getByRole("button", { name: "Nhập 1 ảnh" })).toBeTruthy();
  });

  it("passes the chosen location and status", async () => {
    const { fn, pick } = setup();
    pick(photo("a.jpg"));
    fireEvent.change(screen.getByPlaceholderText("Chọn vị trí…"), { target: { value: "Tủ A" } });
    fireEvent.change(screen.getByLabelText("Trạng thái mặc định"), {
      target: { value: "Cất kho" },
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Nhập 1 ảnh" })));
    const [jobs, opts] = fn.mock.calls[0];
    expect(opts.defaults).toEqual({ location: "Tủ A", status: "Cất kho" });
    expect(jobs[0].name).toBe("a");
  });

  it("warns when more than 50 photos are picked", () => {
    const { pick } = setup();
    pick(...names(50));
    expect(screen.queryByText(/Mỗi ngày chỉ tải lên được khoảng 50 ảnh/)).toBeNull();
    cleanup();
    const second = setup();
    second.pick(...names(51));
    expect(screen.getByText(/Mỗi ngày chỉ tải lên được khoảng 50 ảnh/)).toBeTruthy();
  });

  it('shows "Đang nhập k/N" and the current file name', async () => {
    let release!: (o: Out) => void;
    let opts!: PhotoImportOptions;
    const { pick } = setup((_j, o) => {
      opts = o;
      return new Promise<Out>((r) => (release = r));
    });
    pick(photo("a.jpg"), photo("b.jpg"));
    fireEvent.click(screen.getByRole("button", { name: "Nhập 2 ảnh" }));
    act(() => opts.onCurrent?.(1));
    expect(screen.getByText("Đang nhập 2/2: b")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Chọn ảnh từ máy" })).toBeNull();
    expect(precedes(screen.getByText("Đang nhập 2/2: b"), screen.getByText("a.jpg"))).toBe(true);
    await act(async () => release({ jobs: [] }));
  });

  it('failed files are listed and "Thử lại" re-runs them', async () => {
    let call = 0;
    const { fn, pick, onImported } = setup(async (jobs) => {
      call++;
      return {
        jobs: jobs.map((j, i) =>
          j.state === "done" || (call === 1 ? i === 0 : true)
            ? { ...j, state: "done" as const }
            : { ...j, state: "failed" as const, error: new ApiError(0, "network") },
        ),
      };
    });
    pick(photo("a.jpg"), photo("b.jpg"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Nhập 2 ảnh" })));
    expect(screen.getByText("Đã nhập: 1")).toBeTruthy();
    expect(screen.getByText("Lỗi: 1")).toBeTruthy();
    expect(screen.getByText(/b\.jpg: Không kết nối được máy chủ/)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Thử lại (1)" })));
    expect(fn).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Đã nhập: 2")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Thử lại/ })).toBeNull();
    expect(onImported.mock.calls).toEqual([[1], [1]]);
  });

  it("429 shows imported count and wait time", async () => {
    const { pick } = setup(async (jobs) => ({
      jobs: jobs.map((j, i) => ({
        ...j,
        state: i === 0 ? ("done" as const) : ("pending" as const),
      })),
      stopped: { code: "rate_limited", retryAfterSec: 7200 },
    }));
    pick(photo("a.jpg"), photo("b.jpg"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Nhập 2 ảnh" })));
    expect(screen.getByText(/Đã dừng: đã nhập 1 ảnh\..*thử lại sau 2 giờ nhé/)).toBeTruthy();
    expect(screen.getByText("Chưa xử lý: 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thử lại (1)" })).toBeTruthy();
    const note = screen.getByText(/Đã dừng: đã nhập 1 ảnh/);
    expect(precedes(note, screen.getByText("a.jpg"))).toBe(true);
    expect(
      precedes(screen.getByRole("button", { name: "Thử lại (1)" }), screen.getByText("a.jpg")),
    ).toBe(true);
  });

  it("tabs are disabled while running", async () => {
    let release!: (o: Out) => void;
    const { pick } = setup(() => new Promise<Out>((r) => (release = r)));
    pick(photo("a.jpg"));
    fireEvent.click(screen.getByRole("button", { name: "Nhập 1 ảnh" }));
    expect(
      (screen.getByRole("button", { name: "CSV / Excel" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Đang xử lý…" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await act(async () => release({ jobs: [] }));
  });

  it("calls onImported with the success count", async () => {
    const { pick, onImported } = setup();
    pick(...names(3));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Nhập 3 ảnh" })));
    expect(onImported).toHaveBeenCalledWith(3);
    expect(screen.getByRole("button", { name: "Xong" })).toBeTruthy();
  });
});
