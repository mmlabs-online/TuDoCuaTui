import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/data/apiErrors";
import { aiErrorText } from "@/features/items/aiFill";
import type { PhotoImportOptions, PhotoJob, PhotoStop } from "@/data/photoImport";
import { ImportModal } from "./ImportModal";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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
    const retry = screen.getByRole("button", { name: "Thử lại sau 2 giờ" }) as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    const note = screen.getByText(/Đã dừng: đã nhập 1 ảnh/);
    expect(precedes(note, screen.getByText("a.jpg"))).toBe(true);
    expect(precedes(retry, screen.getByText("a.jpg"))).toBe(true);
  });

  it("a non-API error shows Vietnamese text in the failed list", async () => {
    const { pick } = setup(async (jobs) => ({
      jobs: jobs.map((j) => ({
        ...j,
        state: "failed" as const,
        error: new TypeError("Failed to fetch"),
      })),
    }));
    pick(photo("a.jpg"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Nhập 1 ảnh" })));
    expect(screen.getByText("a.jpg: Có lỗi xảy ra, thử lại nhé")).toBeTruthy();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });

  describe("stops (T-027.1)", () => {
    it("429 stop message counts down with the button", async () => {
      vi.useFakeTimers();
      const { pick } = setup(async (jobs) => ({
        jobs: jobs.map((j, i) => ({
          ...j,
          state: i === 0 ? ("done" as const) : ("pending" as const),
        })),
        stopped: { code: "rate_limited", retryAfterSec: 90 },
      }));
      pick(photo("a.jpg"), photo("b.jpg"));
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Nhập 2 ảnh" })));
      expect(screen.getByText(/thử lại sau 2 phút nhé/)).toBeTruthy();
      expect(screen.getByRole("button", { name: "Thử lại sau 2 phút" })).toBeTruthy();
      await act(async () => {
        vi.advanceTimersByTime(30_000);
      });
      expect(screen.getByText(/thử lại sau 1 phút nhé/)).toBeTruthy();
      expect(screen.getByRole("button", { name: "Thử lại sau 1 phút" })).toBeTruthy();
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      const note = screen.getByText(/Đã dừng: đã nhập 1 ảnh/);
      expect(note.textContent).toContain("bấm Thử lại để tiếp tục");
      expect(note.textContent).not.toContain("thử lại sau");
      expect(screen.getByRole("button", { name: "Thử lại (1)" })).toBeTruthy();
    });

    const stopWith =
      (stopped: PhotoStop): Fn =>
      async (jobs) => ({
        jobs: jobs.map((j, i) => ({
          ...j,
          state: i === 0 ? ("done" as const) : ("pending" as const),
        })),
        stopped,
      });

    it('429 stop keeps "Thử lại" disabled until Retry-After has passed', async () => {
      vi.useFakeTimers();
      let call = 0;
      const { fn, pick } = setup(async (jobs) => {
        call++;
        if (call === 1)
          return stopWith({ code: "rate_limited", retryAfterSec: 90 })(jobs, {} as never);
        return allDone(jobs, {} as never);
      });
      pick(photo("a.jpg"), photo("b.jpg"));
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Nhập 2 ảnh" })));
      const waiting = () =>
        screen.getByRole("button", { name: /^Thử lại sau/ }) as HTMLButtonElement;
      expect(waiting().textContent).toBe("Thử lại sau 2 phút");
      expect(waiting().disabled).toBe(true);
      await act(async () => fireEvent.click(waiting()));
      expect(fn).toHaveBeenCalledTimes(1);
      await act(async () => {
        vi.advanceTimersByTime(30_000);
      });
      expect(waiting().textContent).toBe("Thử lại sau 1 phút");
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      const retry = screen.getByRole("button", { name: "Thử lại (1)" }) as HTMLButtonElement;
      expect(retry.disabled).toBe(false);
      await act(async () => fireEvent.click(retry));
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('429 without Retry-After leaves "Thử lại" enabled', async () => {
      const { pick } = setup(stopWith({ code: "rate_limited" }));
      pick(photo("a.jpg"), photo("b.jpg"));
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Nhập 2 ảnh" })));
      const retry = screen.getByRole("button", { name: "Thử lại (1)" }) as HTMLButtonElement;
      expect(retry.disabled).toBe(false);
    });

    it.each([
      ["unauthorized", /Phiên đăng nhập đã hết hạn/],
      ["network", /Không kết nối được máy chủ — kiểm tra mạng/],
      ["unavailable", /Máy chủ tạm thời chưa lưu được/],
    ] as const)("%s stop shows its message", async (code, text) => {
      const { pick } = setup(stopWith({ code }));
      pick(photo("a.jpg"), photo("b.jpg"));
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Nhập 2 ảnh" })));
      expect(screen.getByText(/Đã dừng: đã nhập 1 ảnh\./)).toBeTruthy();
      expect(screen.getByText(text)).toBeTruthy();
      expect(screen.getByText(/Các ảnh còn lại vẫn nằm trong danh sách/)).toBeTruthy();
      expect(
        (screen.getByRole("button", { name: "Thử lại (1)" }) as HTMLButtonElement).disabled,
      ).toBe(false);
    });

    it('network stop shows its message and "Thử lại" re-runs', async () => {
      let call = 0;
      const { fn, pick, onImported } = setup(async (jobs, o) => {
        call++;
        return call === 1 ? stopWith({ code: "network" })(jobs, o) : allDone(jobs, o);
      });
      pick(photo("a.jpg"), photo("b.jpg"));
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Nhập 2 ảnh" })));
      expect(screen.getByText(/Không kết nối được máy chủ — kiểm tra mạng/)).toBeTruthy();
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Thử lại (1)" })));
      expect(fn).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Đã nhập: 2")).toBeTruthy();
      expect(onImported.mock.calls).toEqual([[1], [1]]);
    });

    it("picking the same file twice lists it once", () => {
      const { pick, view } = setup();
      const a = photo("a.jpg");
      pick(a);
      pick(a, a);
      const zone = screen.getByText("Kéo nhiều ảnh vào đây").closest(".bulk-drop")!;
      fireEvent.drop(zone, { dataTransfer: { files: [a] } });
      expect(screen.getByText("1 ảnh đã chọn")).toBeTruthy();
      expect(view.container.querySelectorAll(".photo-files li")).toHaveLength(1);
    });

    it("after a photo-quota stop the retry passes photoQuotaHit", async () => {
      let call = 0;
      const { fn, pick } = setup(async (jobs) => {
        call++;
        const first = jobs.findIndex((j) => j.state !== "done");
        const stop = (s: PhotoStop, add: boolean): Out => ({
          jobs: jobs.map((j, i) => ({
            ...j,
            state:
              add && i === first
                ? ("done" as const)
                : j.state === "done"
                  ? j.state
                  : ("pending" as const),
          })),
          stopped: s,
        });
        if (call === 1) return stop({ code: "photo_quota_exceeded" }, false);
        if (call === 2) return stop({ code: "network" }, false);
        return stop({ code: "network" }, true);
      });
      pick(photo("a.jpg"), photo("b.jpg"), photo("c.jpg"));
      const run = async (name: RegExp) =>
        act(async () => fireEvent.click(screen.getByRole("button", { name })));
      await run(/^Nhập 3 ảnh$/);
      await run(/^Thử lại/);
      await run(/^Thử lại/);
      await run(/^Thử lại/);
      expect(fn.mock.calls.map((c) => !!c[1].photoQuotaHit)).toEqual([false, true, true, false]);
    });
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

describe("ImportPhotosTab AI", () => {
  const settings = {
    get: async () => ({
      provider: "claude" as const,
      model: "m",
      keyHint: null,
      hasKey: true,
      modelSupported: true,
      updatedAt: "",
    }),
  };
  const tagger = { tag: vi.fn() };
  function setupAi(importPhotos: Fn) {
    const fn = vi.fn(importPhotos);
    const onOpenSettings = vi.fn();
    const view = render(
      <ImportModal
        onClose={vi.fn()}
        locations={[]}
        importMany={vi.fn()}
        importPhotos={fn}
        onImported={vi.fn()}
        restoreBackup={vi.fn()}
        onRestored={vi.fn()}
        ai={{ settings, tagger, settingsRev: 0, onOpenSettings }}
      />,
    );
    const pick = (...files: File[]) =>
      fireEvent.change(view.container.querySelector("input[type=file]")!, { target: { files } });
    return { fn, pick, onOpenSettings };
  }
  const ready = () => screen.findByText(/Ảnh sẽ được gửi tới Claude/);

  it("shows tagging progress while tag is pending", async () => {
    let release!: (o: Out) => void;
    let opts!: PhotoImportOptions;
    const { pick } = setupAi((_j, o) => {
      opts = o;
      return new Promise<Out>((r) => (release = r));
    });
    await ready();
    pick(photo("a.jpg"), photo("b.jpg"));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Nhập 2 ảnh" }));
    act(() => opts.onCurrent?.(1));
    act(() => opts.onTagging?.(1, true));
    expect(screen.getByText("Đang nhờ AI xem ảnh 2/2: b")).toBeTruthy();
    act(() => opts.onTagging?.(1, false));
    expect(screen.getByText("Đang nhập 2/2: b")).toBeTruthy();
    await act(async () => release({ jobs: [] }));
  });

  it("row AI label changes during the run", async () => {
    let release!: (o: Out) => void;
    let opts!: PhotoImportOptions;
    let jobs0: PhotoJob[] = [];
    const { pick } = setupAi((jobs, o) => {
      jobs0 = jobs;
      opts = o;
      return new Promise<Out>((r) => (release = r));
    });
    await ready();
    pick(photo("a.jpg"), photo("b.jpg"));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Nhập 2 ảnh" }));
    act(() => opts.onCurrent?.(0));
    act(() => opts.onTagging?.(0, true));
    expect(screen.getByText("Chờ · AI đang xem ảnh")).toBeTruthy();
    act(() => opts.onTagging?.(0, false));
    act(() =>
      opts.onUpdate?.(jobs0.map((j, i) => (i === 0 ? { ...j, ai: "filled" as const } : j))),
    );
    expect(screen.getByText("Chờ · AI đã điền")).toBeTruthy();
    expect(screen.queryByText("Chờ · AI đang xem ảnh")).toBeNull();
    expect(screen.getByText("b.jpg").nextElementSibling?.textContent).toBe("Chờ");
    await act(async () => release({ jobs: [] }));
  });

  const finished = (jobs: PhotoJob[], extra: Partial<Out & { aiStopped: string }> = {}) =>
    ({ jobs, ...extra }) as Out;

  it("row labels: filled / nothing / skipped / off", async () => {
    const { pick } = setupAi(async (jobs) =>
      finished(
        jobs.map((j, i) => ({
          ...j,
          state: "done" as const,
          ai: (["filled", "nothing", "skipped", "off"] as const)[i],
          aiError: i === 2 ? "provider_unavailable" : undefined,
        })),
      ),
    );
    await ready();
    pick(photo("a.jpg"), photo("b.jpg"), photo("c.jpg"), photo("d.jpg"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Nhập 4 ảnh" })));
    expect(screen.getByText("Xong · AI đã điền")).toBeTruthy();
    expect(screen.getByText("Xong · AI không có gì để điền")).toBeTruthy();
    expect(screen.getByText("Xong · Không dùng được AI")).toBeTruthy();
    expect(screen.getByText("Xong · Không dùng AI")).toBeTruthy();
    expect(screen.getByText("AI đã điền: 1")).toBeTruthy();
  });

  it("skipped file lists its reason (aiErrorText)", async () => {
    const { pick } = setupAi(async (jobs) =>
      finished(
        jobs.map((j) => ({
          ...j,
          state: "done" as const,
          ai: "skipped" as const,
          aiError: "provider_unavailable",
        })),
      ),
    );
    await ready();
    pick(photo("a.jpg"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Nhập 1 ảnh" })));
    expect(screen.getByText(`a.jpg: ${aiErrorText("provider_unavailable")}`)).toBeTruthy();
  });

  it("shows the AI-off banner for rate_limited, and a settings link for a settings error", async () => {
    const first = setupAi(async (jobs) =>
      finished(
        jobs.map((j) => ({ ...j, state: "done" as const, ai: "off" as const })),
        { aiStopped: "rate_limited" },
      ),
    );
    await ready();
    first.pick(photo("a.jpg"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Nhập 1 ảnh" })));
    expect(screen.getByText(/Đã hết lượt dùng AI trong 24 giờ/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mở cài đặt" })).toBeNull();
    cleanup();

    const second = setupAi(async (jobs) =>
      finished(
        jobs.map((j) => ({ ...j, state: "done" as const, ai: "off" as const })),
        { aiStopped: "invalid_key" },
      ),
    );
    await ready();
    second.pick(photo("a.jpg"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Nhập 1 ảnh" })));
    expect(screen.getByText(/các ảnh còn lại được nhập không có AI/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mở cài đặt" }));
    expect(second.onOpenSettings).toHaveBeenCalled();
  });
});
