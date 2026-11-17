import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { PhotoPrepError, preparePhoto } from "@/data/photoPrep";
import { categoryNames } from "@/constants/wardrobe";
import type { Item } from "@/types/item";
import type { PhotoLoader } from "@/data/photoUrls";
import { PhotoLoaderContext } from "@/data/usePhotoUrl";
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
