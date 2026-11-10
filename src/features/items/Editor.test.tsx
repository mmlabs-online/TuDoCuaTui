import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Editor } from "./Editor";
import { blankItem } from "./blankItem";
import { EDITOR_COPY } from "./copy";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderEditor = (update = vi.fn(), showMockAi = true) => {
  render(
    <Editor
      item={blankItem()}
      locations={[]}
      isNew
      saving={false}
      update={update}
      onClose={vi.fn()}
      onSave={vi.fn()}
      onDelete={vi.fn()}
      onDuplicate={vi.fn()}
      onWorn={vi.fn()}
      showMockAi={showMockAi}
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

describe("mock AI", () => {
  test('hides "Tự điền từ ảnh" when showMockAi is false', () => {
    renderEditor(vi.fn(), false);
    expect(screen.queryByRole("button", { name: /Tự điền từ ảnh/ })).toBeNull();
  });

  test('shows "Tự điền từ ảnh" when showMockAi is true', () => {
    renderEditor(vi.fn(), true);
    expect(screen.getByRole("button", { name: /Tự điền từ ảnh/ })).toBeTruthy();
  });
});
