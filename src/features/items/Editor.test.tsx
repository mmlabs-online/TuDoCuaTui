import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi, type Mock } from "vitest";
import { PhotoPrepError, preparePhoto } from "@/data/photoPrep";
import { categoryNames } from "@/constants/wardrobe";
import type { Item } from "@/types/item";
import { AiSettingsError } from "@/data/aiSettings";
import type { TagSuggestion } from "@/data/aiTagging";
import type { PhotoLoader } from "@/data/photoUrls";
import { PhotoLoaderContext } from "@/data/usePhotoUrl";
import type { AiSettingsView } from "@/shared/ai/catalog";
import type { AiErrorCode } from "@/shared/ai/errors";
import { Editor } from "./Editor";
import { blankItem } from "./blankItem";
import { EDITOR_COPY } from "./copy";

vi.mock("@/data/photoPrep", async (orig) => ({
  ...(await orig<typeof import("@/data/photoPrep")>()),
  preparePhoto: vi.fn(),
}));
const prep = vi.mocked(preparePhoto);
const pic = (name = "a.jpg", type = "image/jpeg") => new File(["x"], name, { type });

beforeEach(() => {
  let n = 0;
  prep.mockReset();
  prep.mockResolvedValue({ blob: new Blob(["j"], { type: "image/jpeg" }), width: 1, height: 1 });
  Object.defineProperty(URL, "createObjectURL", {
    value: vi.fn(() => `blob:${++n}`),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: vi.fn(),
    configurable: true,
    writable: true,
  });
});

const photos = vi.hoisted(() => ({ urlToBlob: vi.fn(), resizeImage: vi.fn() }));
vi.mock("@/data/photos", () => photos);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const props = (item: Item, saving = false, update = vi.fn()) => ({
  item,
  locations: [],
  isNew: true,
  saving,
  update,
  onClose: vi.fn(),
  onSave: vi.fn(),
  onDelete: vi.fn(),
  onDuplicate: vi.fn(),
  onWorn: vi.fn(),
});

const renderEditor = (update = vi.fn(), item: Item = blankItem(), isNew = true) => {
  render(<Editor {...props(item, false, update)} isNew={isNew} />);
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[type=file]"));
  const camera = inputs.find((i) => i.hasAttribute("capture"))!;
  const gallery = inputs.find((i) => !i.hasAttribute("capture"))!;
  return { inputs, camera, gallery, update };
};

describe("photo inputs", () => {
  test("has one camera input and one gallery input", () => {
    const { inputs, camera, gallery } = renderEditor();
    expect(inputs).toHaveLength(2);
    for (const i of inputs) {
      expect(i.getAttribute("accept")).toBe("image/*");
      expect(i.multiple).toBe(false);
    }
    expect(camera.getAttribute("capture")).toBe("environment");
    expect(gallery.hasAttribute("capture")).toBe(false);
  });

  test('"Chụp ảnh" clicks the camera input', () => {
    const { camera } = renderEditor();
    const spy = vi.spyOn(HTMLInputElement.prototype, "click");
    fireEvent.click(screen.getByRole("button", { name: EDITOR_COPY.photo.takePhoto }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.contexts[0]).toBe(camera);
  });

  test('"Chọn từ thư viện" and the upload zone click the gallery input', () => {
    const { gallery } = renderEditor();
    const spy = vi.spyOn(HTMLInputElement.prototype, "click");
    fireEvent.click(screen.getByRole("button", { name: EDITOR_COPY.photo.pickFromLibrary }));
    fireEvent.click(screen.getByRole("button", { name: /Thêm ảnh món đồ/ }));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.contexts[0]).toBe(gallery);
    expect(spy.mock.contexts[1]).toBe(gallery);
  });

  test("a picked file sets a blob: URL of the prepared JPEG", async () => {
    const { camera, update } = renderEditor();
    const prepared = new Blob(["j"], { type: "image/jpeg" });
    prep.mockResolvedValueOnce({ blob: prepared, width: 1, height: 1 });
    fireEvent.change(camera, { target: { files: [pic()] } });
    await waitFor(() => expect(update).toHaveBeenCalledWith("photo", "blob:1"));
    expect(URL.createObjectURL).toHaveBeenCalledWith(prepared);
  });
});

describe("photo preparation", () => {
  const pick = (input: HTMLInputElement, f = pic()) =>
    fireEvent.change(input, { target: { files: [f] } });

  const deferred = () => {
    let resolve!: (v: { blob: Blob; width: number; height: number }) => void;
    const promise = new Promise<{ blob: Blob; width: number; height: number }>((r) => {
      resolve = r;
    });
    return { promise, resolve };
  };
  const done = { blob: new Blob(["j"], { type: "image/jpeg" }), width: 1, height: 1 };

  test("closing during a pick ignores its result", async () => {
    const d = deferred();
    prep.mockReturnValueOnce(d.promise);
    const { gallery, update } = renderEditor();
    pick(gallery);
    cleanup();
    d.resolve(done);
    await d.promise;
    await Promise.resolve();
    expect(update).not.toHaveBeenCalledWith("photo", expect.anything());
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  test("duplicate frees the picked photo URL", async () => {
    const { gallery, update } = renderEditor(vi.fn(), blankItem(), false);
    pick(gallery);
    await waitFor(() => expect(update).toHaveBeenCalledWith("photo", "blob:1"));
    fireEvent.click(screen.getByRole("button", { name: EDITOR_COPY.duplicate }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
  });

  test("duplicate during a pick ignores its result", async () => {
    const d = deferred();
    prep.mockReturnValueOnce(d.promise);
    const { gallery, update } = renderEditor(vi.fn(), blankItem(), false);
    pick(gallery);
    fireEvent.click(screen.getByRole("button", { name: EDITOR_COPY.duplicate }));
    d.resolve(done);
    await d.promise;
    await Promise.resolve();
    expect(update).not.toHaveBeenCalledWith("photo", expect.anything());
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  test("a file over 10 MB shows the size message and does not set the photo", async () => {
    const { gallery, update } = renderEditor();
    prep.mockRejectedValueOnce(new PhotoPrepError("tooLarge"));
    pick(gallery);
    expect((await screen.findByRole("alert")).textContent).toBe(EDITOR_COPY.photo.errors.tooLarge);
    expect(update).not.toHaveBeenCalledWith("photo", expect.anything());
  });

  test("an undecodable HEIC shows the HEIC message", async () => {
    const { gallery } = renderEditor();
    prep.mockRejectedValueOnce(new PhotoPrepError("heicUnsupported"));
    pick(gallery, pic("a.heic", "image/heic"));
    expect((await screen.findByRole("alert")).textContent).toBe(
      EDITOR_COPY.photo.errors.heicUnsupported,
    );
  });

  test("an unexpected error shows the unreadable message", async () => {
    const { gallery } = renderEditor();
    prep.mockRejectedValueOnce(new Error("boom"));
    pick(gallery);
    expect((await screen.findByRole("alert")).textContent).toBe(
      EDITOR_COPY.photo.errors.unreadable,
    );
  });

  test("a new pick clears the previous error", async () => {
    const { gallery } = renderEditor();
    prep.mockRejectedValueOnce(new PhotoPrepError("tooLarge"));
    pick(gallery);
    await screen.findByRole("alert");
    prep.mockReturnValueOnce(new Promise(() => {}));
    pick(gallery);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  test("shows the preparing state while a pick is processed and disables Save", async () => {
    const { gallery } = renderEditor();
    prep.mockReturnValueOnce(new Promise(() => {}));
    pick(gallery);
    expect((await screen.findByRole("status")).textContent).toBe(EDITOR_COPY.photo.preparing);
    expect(
      (screen.getByRole("button", { name: EDITOR_COPY.save }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  test("shows the uploading state while saving a new photo", () => {
    const base = { ...blankItem(), photo: "blob:abc" };
    const { rerender } = render(<Editor {...props(base, true)} />);
    expect(screen.getByRole("status").textContent).toBe(EDITOR_COPY.photo.uploading);
    rerender(<Editor {...props({ ...base, photo: "/api/photos/p" }, true)} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  test("replacing or removing the photo revokes the previous object URL", async () => {
    const { gallery } = renderEditor(vi.fn(), { ...blankItem(), photo: "blob:x" });
    pick(gallery);
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    pick(gallery);
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1"));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Bỏ ảnh" }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:2");
  });

  test("unmount revokes the object URL", async () => {
    const { gallery } = renderEditor();
    pick(gallery);
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    cleanup();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
  });

  test("a stale pick that finishes after a newer pick is ignored", async () => {
    const { gallery, update } = renderEditor();
    let first!: (v: { blob: Blob; width: number; height: number }) => void;
    prep.mockReturnValueOnce(new Promise((r) => (first = r)));
    pick(gallery);
    const second = new Blob(["2"], { type: "image/jpeg" });
    prep.mockResolvedValueOnce({ blob: second, width: 1, height: 1 });
    pick(gallery);
    await waitFor(() => expect(update).toHaveBeenCalledWith("photo", "blob:1"));
    first({ blob: new Blob(["1"]), width: 1, height: 1 });
    await Promise.resolve();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  test("the hint lists the accepted formats", () => {
    renderEditor();
    expect(screen.getByText(EDITOR_COPY.photo.hint, { exact: false })).toBeTruthy();
  });
});

describe("photos", () => {
  const stored = { ...blankItem(), id: "x", name: "Áo", photoPath: "photo-id" };

  test('shows the real picker and no "Sắp có"', () => {
    const { inputs } = renderEditor(vi.fn());
    expect(screen.queryByText(/Sắp có/)).toBeNull();
    expect(screen.getByRole("button", { name: EDITOR_COPY.photo.takePhoto })).toBeTruthy();
    expect(inputs).toHaveLength(2);
  });

  const withPhoto = { ...stored, photo: "/api/photos/photo-id" };

  test("API item with a photo URL shows the image and Bỏ ảnh", () => {
    renderEditor(vi.fn(), withPhoto, false);
    expect(document.querySelector(".upload-zone.has-photo img")?.getAttribute("src")).toBe(
      "/api/photos/photo-id",
    );
    expect(screen.getByRole("button", { name: "Bỏ ảnh" })).toBeTruthy();
  });

  test("img error shows loadFailed copy, keeps Bỏ ảnh", () => {
    renderEditor(vi.fn(), withPhoto, false);
    fireEvent.error(document.querySelector(".upload-zone img")!);
    expect(screen.getByText(EDITOR_COPY.photo.loadFailed)).toBeTruthy();
    expect(document.querySelector(".upload-zone.has-photo")).toBeNull();
    expect(screen.getByRole("button", { name: "Bỏ ảnh" })).toBeTruthy();
  });

  test("Bỏ ảnh clears photo and photoPath", () => {
    const { update } = renderEditor(vi.fn(), withPhoto, false);
    fireEvent.click(screen.getByRole("button", { name: "Bỏ ảnh" }));
    expect(update).toHaveBeenCalledWith("photo", "");
    expect(update).toHaveBeenCalledWith("photoPath", undefined);
    expect(update).toHaveBeenCalledWith("removedPhotoId", "photo-id");
  });
});

describe("category select", () => {
  test("lists the 10 categories in order", () => {
    renderEditor();
    const select = screen.getByDisplayValue("Áo") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(categoryNames);
    expect(categoryNames).toHaveLength(10);
  });
});

describe("photo loader", () => {
  const PID = "11111111-1111-4111-8111-111111111111";
  const renderWithLoader = (photo: string, promise: Promise<string>) => {
    const acquire = vi.fn(() => ({ promise, release: vi.fn() }));
    const loader: PhotoLoader = {
      handles: (s) => s.startsWith("/api/photos/"),
      acquire,
      clear: vi.fn(),
    };
    render(
      <PhotoLoaderContext.Provider value={loader}>
        <Editor
          item={{ ...blankItem(), id: "x", photo, photoPath: PID }}
          locations={[]}
          isNew={false}
          saving={false}
          update={vi.fn()}
          onClose={vi.fn()}
          onSave={vi.fn()}
          onDelete={vi.fn()}
          onDuplicate={vi.fn()}
          onWorn={vi.fn()}
        />
      </PhotoLoaderContext.Provider>,
    );
    return acquire;
  };

  test("a stored photo is shown from the blob: URL", async () => {
    renderWithLoader(`/api/photos/${PID}`, Promise.resolve("blob:x/1"));
    await waitFor(() =>
      expect(document.querySelector(".upload-zone.has-photo img")?.getAttribute("src")).toBe(
        "blob:x/1",
      ),
    );
  });

  test("a loader failure shows the loadFailed copy", async () => {
    renderWithLoader(`/api/photos/${PID}`, Promise.reject(new Error("x")));
    expect(await screen.findByText(EDITOR_COPY.photo.loadFailed)).toBeTruthy();
  });

  test("a new data: photo is shown as is, with no acquire", () => {
    const acquire = renderWithLoader("data:image/jpeg;base64,AAAA", new Promise(() => {}));
    expect(document.querySelector(".upload-zone img")?.getAttribute("src")).toBe(
      "data:image/jpeg;base64,AAAA",
    );
    expect(acquire).not.toHaveBeenCalled();
  });
});

describe("photo privacy notice", () => {
  test("no photo privacy notice", () => {
    renderEditor();
    expect(screen.queryByText(/Google Drive/)).toBeNull();
  });
});

describe("header", () => {
  test('close button is named "Đóng"', () => {
    const onClose = vi.fn();
    render(
      <Editor
        item={blankItem()}
        locations={[]}
        isNew
        saving={false}
        update={vi.fn()}
        onClose={onClose}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onWorn={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: EDITOR_COPY.close }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("footer", () => {
  const edit = (onDuplicate = vi.fn()) => {
    const item = { ...blankItem(), id: "x1", name: "Áo" };
    render(
      <Editor
        item={item}
        locations={[]}
        isNew={false}
        saving={false}
        update={vi.fn()}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={onDuplicate}
        onWorn={vi.fn()}
      />,
    );
  };

  test("edit mode exposes the mobile layout hooks", () => {
    const onDuplicate = vi.fn();
    edit(onDuplicate);
    expect(document.querySelector(".editor-footer")).not.toBeNull();
    expect(document.querySelector(".editor-cancel")).not.toBeNull();
    expect(document.querySelector(".editor-save")).not.toBeNull();
    expect(document.querySelector(".editor-duplicate .btn-label")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: EDITOR_COPY.duplicate }));
    expect(onDuplicate).toHaveBeenCalled();
  });

  test("new mode has no duplicate button", () => {
    renderEditor();
    expect(document.querySelector(".editor-duplicate")).toBeNull();
    expect(document.querySelector(".editor-save")).not.toBeNull();
  });
});

describe("AI fill", () => {
  const DATA = "data:image/jpeg;base64,AAAA";
  const SUG: TagSuggestion = {
    name: "Áo AI",
    category: "dress",
    colors: ["trang"],
    seasons: ["summer"],
    material: "Cotton",
    brand: "Zara",
    tags: ["đi làm"],
  };
  const view = (o: Partial<AiSettingsView> = {}): AiSettingsView => ({
    provider: "claude",
    model: "claude-haiku-5-5",
    keyHint: "••••wxyz",
    hasKey: true,
    modelSupported: true,
    updatedAt: "2026-11-17T00:00:00Z",
    ...o,
  });
  const mkAi = (
    get: () => Promise<AiSettingsView | null> = async () => view(),
    tag: (b: Blob, s?: AbortSignal) => Promise<TagSuggestion> = async () => SUG,
  ) => ({
    settings: { get: vi.fn(get) },
    tagger: { tag: vi.fn(tag) },
    settingsRev: 0,
    onOpenSettings: vi.fn(),
  });
  type Ai = ReturnType<typeof mkAi>;

  const jpeg = new Blob(["jpeg"], { type: "image/jpeg" });
  beforeEach(() => {
    photos.urlToBlob.mockReset().mockImplementation(async () => new Blob(["raw"]));
    photos.resizeImage.mockReset().mockImplementation(async () => ({ blob: jpeg }));
  });

  function Harness({
    initial,
    isNew,
    ai,
    spy,
  }: {
    initial: Item;
    isNew: boolean;
    ai: Ai;
    spy: Mock;
  }) {
    const [item, setItem] = useState(initial);
    const update = <K extends keyof Item>(k: K, v: Item[K]) => {
      spy(k, v);
      setItem((p) => ({ ...p, [k]: v }));
    };
    return (
      <Editor
        item={item}
        locations={[]}
        isNew={isNew}
        saving={false}
        update={update}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onWorn={vi.fn()}
        ai={ai}
      />
    );
  }
  const setup = (o: { item?: Partial<Item>; isNew?: boolean; ai?: Ai } = {}) => {
    const ai = o.ai ?? mkAi();
    const spy = vi.fn();
    const initial = { ...blankItem(), photo: DATA, ...o.item };
    const isNew = o.isNew ?? true;
    const ui = render(<Harness initial={initial} isNew={isNew} ai={ai} spy={spy} />);
    const rerender = (next: Ai) =>
      ui.rerender(<Harness initial={initial} isNew={isNew} ai={next} spy={spy} />);
    return { ai, spy, rerender, unmount: ui.unmount };
  };
  const aiBtn = () =>
    screen.getByRole("button", { name: /Tự điền từ ảnh|Đang phân tích ảnh/ }) as HTMLButtonElement;
  const ready = () => screen.findByText(/Ảnh sẽ được gửi tới/);
  const keysOf = (spy: Mock) => spy.mock.calls.map((c) => c[0]);
  const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  };

  test("disclosure names Claude", async () => {
    setup();
    expect((await ready()).textContent).toBe("Ảnh sẽ được gửi tới Claude bằng key của bạn");
    expect(aiBtn().disabled).toBe(false);
  });

  test("disclosure names Gemini", async () => {
    setup({ ai: mkAi(async () => view({ provider: "gemini" })) });
    expect((await ready()).textContent).toBe("Ảnh sẽ được gửi tới Gemini bằng key của bạn");
  });

  test.each([
    ["no settings", null],
    ["no key", view({ hasKey: false })],
  ])("%s: button disabled, explains setup, opens settings", async (_n, v) => {
    const { ai } = setup({ ai: mkAi(async () => v) });
    await screen.findByText(new RegExp(EDITOR_COPY.ai.notConfigured));
    expect(aiBtn().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: EDITOR_COPY.ai.openSettings }));
    expect(ai.onOpenSettings).toHaveBeenCalledTimes(1);
    fireEvent.click(aiBtn());
    expect(ai.tagger.tag).not.toHaveBeenCalled();
  });

  test("no photo", async () => {
    setup({ item: { photo: "" } });
    await screen.findByText(EDITOR_COPY.ai.noPhoto);
    expect(aiBtn().disabled).toBe(true);
  });

  test("resizes the photo before posting", async () => {
    const { ai } = setup();
    await ready();
    fireEvent.click(aiBtn());
    await waitFor(() => expect(ai.tagger.tag).toHaveBeenCalled());
    expect(photos.urlToBlob).toHaveBeenCalledWith(DATA);
    expect(photos.resizeImage).toHaveBeenCalledWith(await photos.urlToBlob.mock.results[0].value);
    expect(ai.tagger.tag.mock.calls[0][0]).toBe(jpeg);
  });

  test("fills only empty fields", async () => {
    const { spy } = setup({
      item: { id: "x", name: "Áo của tôi", colors: ["Đen"] },
      isNew: false,
    });
    await ready();
    fireEvent.click(aiBtn());
    await screen.findByText(new RegExp(EDITOR_COPY.ai.filled(4)));
    expect(keysOf(spy).sort()).toEqual(["brand", "material", "seasons", "tags"]);
  });

  test("new item: category filled unless the user picked one", async () => {
    const first = setup();
    await ready();
    fireEvent.click(aiBtn());
    await screen.findByText(new RegExp(EDITOR_COPY.ai.filled(7)));
    expect(first.spy).toHaveBeenCalledWith("category", "Đầm");
    cleanup();

    const { spy } = setup();
    await ready();
    fireEvent.change(screen.getByDisplayValue("Áo"), { target: { value: "Giày/dép" } });
    fireEvent.click(aiBtn());
    await screen.findByText(new RegExp(EDITOR_COPY.ai.filled(6)));
    expect(spy.mock.calls.filter((c) => c[0] === "category")).toEqual([["category", "Giày/dép"]]);
  });

  test('"Hoàn tác" restores the previous values', async () => {
    const { spy } = setup();
    await ready();
    fireEvent.click(aiBtn());
    fireEvent.click(await screen.findByRole("button", { name: EDITOR_COPY.ai.undo }));
    expect(spy).toHaveBeenCalledWith("name", "");
    expect(spy).toHaveBeenCalledWith("category", "Áo");
    expect(spy).toHaveBeenCalledWith("colors", []);
    expect(spy).toHaveBeenCalledWith("tags", []);
    expect(screen.queryByRole("button", { name: EDITOR_COPY.ai.undo })).toBeNull();
  });

  test('"Hoàn tác" right after the fill renders restores the previous values', async () => {
    const { spy } = setup();
    await ready();
    // Click the moment the button is inserted: a microtask after the commit, before passive effects flush.
    let clicked = false;
    const mo = new MutationObserver(() => {
      const btn = screen.queryByRole("button", { name: EDITOR_COPY.ai.undo });
      if (btn && !clicked) {
        clicked = true;
        fireEvent.click(btn);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    fireEvent.click(aiBtn());
    await waitFor(() => expect(clicked).toBe(true));
    mo.disconnect();
    expect(spy).toHaveBeenCalledWith("name", "");
    expect(spy).toHaveBeenCalledWith("category", "Áo");
    expect(spy).toHaveBeenCalledWith("colors", []);
    expect(spy).toHaveBeenCalledWith("tags", []);
  });

  test("a second tap while pending sends nothing", async () => {
    const { ai } = setup({ ai: mkAi(undefined, () => new Promise(() => {})) });
    await ready();
    fireEvent.click(aiBtn());
    await waitFor(() => expect(ai.tagger.tag).toHaveBeenCalledTimes(1));
    expect(aiBtn().getAttribute("aria-busy")).toBe("true");
    expect(aiBtn().disabled).toBe(true);
    expect(aiBtn().textContent).toContain(EDITOR_COPY.ai.busy);
    fireEvent.click(aiBtn());
    expect(ai.tagger.tag).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["not_configured", EDITOR_COPY.ai.notConfigured, true],
    ["invalid_key", "Key không hợp lệ hoặc đã bị thu hồi", true],
    ["ai_busy", "AI đang bận, thử lại sau vài giây", false],
    ["provider_unavailable", "Nhà cung cấp AI đang gặp sự cố, thử lại sau", false],
    ["network", "Không kết nối được máy chủ", false],
  ])("error %s shows its Vietnamese message", async (code, text, link) => {
    const { spy } = setup({
      ai: mkAi(undefined, async () => {
        throw new AiSettingsError(0, code as AiErrorCode);
      }),
    });
    await ready();
    fireEvent.click(aiBtn());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(text);
    expect(!!within(alert).queryByRole("button", { name: EDITOR_COPY.ai.openSettings })).toBe(link);
    expect(spy).not.toHaveBeenCalled();
  });

  test("nothing to fill", async () => {
    setup({
      item: {
        id: "x",
        name: "A",
        brand: "B",
        material: "M",
        colors: ["Đen"],
        seasons: ["Hạ"],
        tags: ["t"],
      },
      isNew: false,
    });
    await ready();
    fireEvent.click(aiBtn());
    await screen.findByText(EDITOR_COPY.ai.nothing);
    expect(screen.queryByRole("button", { name: EDITOR_COPY.ai.undo })).toBeNull();
  });

  test("a result for a replaced photo is ignored", async () => {
    const d = deferred<TagSuggestion>();
    const { ai, spy } = setup({ ai: mkAi(undefined, () => d.promise) });
    await ready();
    fireEvent.click(aiBtn());
    await waitFor(() => expect(ai.tagger.tag).toHaveBeenCalled());
    const gallery = document.querySelector<HTMLInputElement>("input[type=file]:not([capture])")!;
    fireEvent.change(gallery, {
      target: { files: [new File(["y"], "b.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(spy).toHaveBeenCalledWith("photo", expect.stringMatching(/^blob:/)));
    d.resolve(SUG);
    await waitFor(() => expect(aiBtn().getAttribute("aria-busy")).toBe("false"));
    expect(keysOf(spy)).toEqual(["photo"]);
  });

  test("a result arriving right after the photo is replaced is ignored", async () => {
    const d = deferred<TagSuggestion>();
    let signal: AbortSignal | undefined;
    const { ai, spy } = setup({
      ai: mkAi(undefined, (_b, s) => {
        signal = s;
        return d.promise;
      }),
    });
    spy.mockImplementation((k: string) => {
      if (k === "photo") d.resolve(SUG);
    });
    await ready();
    fireEvent.click(aiBtn());
    await waitFor(() => expect(ai.tagger.tag).toHaveBeenCalled());
    const gallery = document.querySelector<HTMLInputElement>("input[type=file]:not([capture])")!;
    fireEvent.change(gallery, {
      target: { files: [new File(["y"], "b.jpg", { type: "image/jpeg" })] },
    });
    await waitFor(() => expect(aiBtn().getAttribute("aria-busy")).toBe("false"));
    // Flush the microtasks a late result would run in before asserting it changed nothing.
    await act(async () => {});
    expect(keysOf(spy)).toEqual(["photo"]);
    expect(signal!.aborted).toBe(true);
    expect(screen.queryByRole("button", { name: EDITOR_COPY.ai.undo })).toBeNull();
  });

  test("removing the photo while pending cancels the request", async () => {
    const d = deferred<TagSuggestion>();
    let signal: AbortSignal | undefined;
    const { ai, spy } = setup({
      ai: mkAi(undefined, (_b, s) => {
        signal = s;
        return d.promise;
      }),
    });
    await ready();
    fireEvent.click(aiBtn());
    await waitFor(() => expect(ai.tagger.tag).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Bỏ ảnh" }));
    expect(signal!.aborted).toBe(true);
    expect(aiBtn().getAttribute("aria-busy")).toBe("false");
    d.resolve(SUG);
    await act(async () => {});
    expect(keysOf(spy)).toEqual(["photo", "removedPhotoId", "photoPath"]);
  });

  test("unmount aborts the request", async () => {
    let signal: AbortSignal | undefined;
    const { ai, unmount } = setup({
      ai: mkAi(undefined, (_b, s) => {
        signal = s;
        return new Promise(() => {});
      }),
    });
    await ready();
    fireEvent.click(aiBtn());
    await waitFor(() => expect(ai.tagger.tag).toHaveBeenCalled());
    expect(signal!.aborted).toBe(false);
    unmount();
    expect(signal!.aborted).toBe(true);
  });

  test("settings load error: retry; misconfigured has no retry", async () => {
    let n = 0;
    const { ai } = setup({
      ai: mkAi(async () => {
        if (++n === 1) throw new AiSettingsError(0, "network");
        return view();
      }),
    });
    await screen.findByText(new RegExp(EDITOR_COPY.ai.loadFailed));
    expect(aiBtn().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: EDITOR_COPY.ai.retry }));
    await ready();
    expect(ai.settings.get).toHaveBeenCalledTimes(2);
    expect(aiBtn().disabled).toBe(false);
    cleanup();

    setup({
      ai: mkAi(async () => {
        throw new AiSettingsError(503, "server_misconfigured");
      }),
    });
    await screen.findByText("AI chưa được cấu hình trên máy chủ");
    expect(screen.queryByRole("button", { name: EDITOR_COPY.ai.retry })).toBeNull();
    expect(screen.queryByRole("button", { name: EDITOR_COPY.ai.openSettings })).toBeNull();
  });

  test("settingsRev change reloads settings", async () => {
    const { ai, rerender } = setup();
    await ready();
    expect(ai.settings.get).toHaveBeenCalledTimes(1);
    rerender({ ...ai, settingsRev: 1 });
    await waitFor(() => expect(ai.settings.get).toHaveBeenCalledTimes(2));
  });
});

describe("wear bar", () => {
  const wornItem = (wearCount: number): Item => ({ ...blankItem(), id: "i1", wearCount });

  test("−1 is disabled at 0 wears", () => {
    const onWorn = vi.fn();
    render(<Editor {...props(wornItem(0))} isNew={false} onWorn={onWorn} />);
    const btn = screen.getByRole("button", { name: "−1" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onWorn).not.toHaveBeenCalled();
  });

  test("−1 is enabled above 0 wears and calls onWorn(-1)", () => {
    const onWorn = vi.fn();
    render(<Editor {...props(wornItem(2))} isNew={false} onWorn={onWorn} />);
    const btn = screen.getByRole("button", { name: "−1" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onWorn).toHaveBeenCalledTimes(1);
    expect(onWorn).toHaveBeenCalledWith(-1);
  });

  test("Mặc hôm nay stays enabled at 0 wears", () => {
    const onWorn = vi.fn();
    render(<Editor {...props(wornItem(0))} isNew={false} onWorn={onWorn} />);
    const btn = screen.getByRole("button", { name: /Mặc hôm nay/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onWorn).toHaveBeenCalledWith(1);
  });
});
