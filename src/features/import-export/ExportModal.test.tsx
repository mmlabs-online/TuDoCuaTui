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
