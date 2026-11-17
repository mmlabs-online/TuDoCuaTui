import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { categoryNames } from "@/constants/wardrobe";
import type { Item } from "@/types/item";
import type { PhotoLoader } from "@/data/photoUrls";
import { PhotoLoaderContext } from "@/data/usePhotoUrl";
import { Editor } from "./Editor";
import { blankItem } from "./blankItem";
import { EDITOR_COPY } from "./copy";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderEditor = (update = vi.fn(), item: Item = blankItem(), isNew = true) => {
  render(
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
    />,
  );
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

  test("a file from the camera input sets the photo", async () => {
    const { camera, update } = renderEditor();
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    fireEvent.change(camera, { target: { files: [file] } });
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("photo", expect.stringMatching(/^data:image\/jpeg/)),
    );
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
