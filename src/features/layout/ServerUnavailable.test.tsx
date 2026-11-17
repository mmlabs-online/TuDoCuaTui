import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ServerUnavailable } from "./ServerUnavailable";
import { LAYOUT_COPY } from "./copy";

afterEach(cleanup);

const COPY = LAYOUT_COPY.serverUnavailable;

test("renders the Vietnamese error and Thử lại; no item cards", () => {
  const { container } = render(<ServerUnavailable onRetry={vi.fn()} />);
  expect(screen.getByRole("alert").textContent).toContain(COPY.title);
  expect(screen.getByText(COPY.body)).toBeTruthy();
  expect(screen.getByRole("button", { name: COPY.retry })).toBeTruthy();
  expect(container.querySelector(".card, .item-card")).toBeNull();
});

test("Thử lại calls onRetry and is disabled while it runs", async () => {
  let done!: () => void;
  const onRetry = vi.fn(() => new Promise<void>((r) => (done = r)));
  render(<ServerUnavailable onRetry={onRetry} />);
  fireEvent.click(screen.getByRole("button", { name: COPY.retry }));
  expect(onRetry).toHaveBeenCalledTimes(1);
  const busy = (await screen.findByRole("button", { name: COPY.retrying })) as HTMLButtonElement;
  expect(busy.disabled).toBe(true);
  done();
  expect(await screen.findByRole("button", { name: COPY.retry })).toBeTruthy();
});

test("dev hint only when dev", () => {
  const { rerender } = render(<ServerUnavailable onRetry={vi.fn()} />);
  expect(screen.queryByText(COPY.devHint)).toBeNull();
  rerender(<ServerUnavailable dev onRetry={vi.fn()} />);
  expect(screen.getByText(COPY.devHint)).toBeTruthy();
});
