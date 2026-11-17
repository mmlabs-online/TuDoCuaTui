import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { IMPORT_EXPORT_COPY } from "./copy";
import { ExportModal } from "./ExportModal";

afterEach(cleanup);

test('close button is named "Đóng" and closes', () => {
  const onClose = vi.fn();
  render(<ExportModal onClose={onClose} onExport={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: IMPORT_EXPORT_COPY.export.close }));
  expect(onClose).toHaveBeenCalled();
});

test("busy disables both export options", () => {
  const onExport = vi.fn();
  render(<ExportModal onClose={vi.fn()} onExport={onExport} busy />);
  const options = document.querySelectorAll<HTMLButtonElement>(".export-options button");
  expect(options).toHaveLength(2);
  for (const b of options) {
    expect(b.disabled).toBe(true);
    fireEvent.click(b);
  }
  expect(onExport).not.toHaveBeenCalled();
});
