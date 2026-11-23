import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Item } from "@/types/item";
import { Editor } from "./Editor";
import { blankItem } from "./blankItem";

const photos = vi.hoisted(() => ({ urlToBlob: vi.fn(), resizeImage: vi.fn() }));
vi.mock("@/data/photos", () => photos);

afterEach(cleanup);

const renderEditor = (item: Item, isNew: boolean) =>
  render(
    <Editor
      item={item}
      locations={[]}
      isNew={isNew}
      saving={false}
      update={vi.fn()}
      onClose={vi.fn()}
      onSave={vi.fn()}
      onDelete={vi.fn()}
      onDuplicate={vi.fn()}
      onWorn={vi.fn()}
    />,
  );

describe("Editor initial focus", () => {
  test("new item focuses the name field", () => {
    renderEditor(blankItem(), true);
    expect(screen.getByRole("dialog", { name: "Món đồ mới" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Tên món đồ"));
  });

  test("existing item focuses the dialog, not the name field", () => {
    renderEditor({ ...blankItem(), name: "Áo thun" }, false);
    const dialog = screen.getByRole("dialog", { name: "Áo thun" });
    expect(document.activeElement).toBe(dialog);
  });
});
