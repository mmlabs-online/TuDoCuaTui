import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { ItemPhoto } from "./ItemPhoto";

afterEach(cleanup);

test('img has loading="lazy" and decoding="async"; error -> fallback; new src -> img again', () => {
  const ui = (src: string) => <ItemPhoto src={src} alt="Áo" fallback={<p>fallback</p>} />;
  const { rerender } = render(ui("/a.jpg"));
  const img = screen.getByAltText("Áo");
  expect(img.getAttribute("loading")).toBe("lazy");
  expect(img.getAttribute("decoding")).toBe("async");
  fireEvent.error(img);
  expect(screen.getByText("fallback")).toBeTruthy();
  expect(screen.queryByAltText("Áo")).toBeNull();
  rerender(ui("/b.jpg"));
  expect(screen.getByAltText("Áo").getAttribute("src")).toBe("/b.jpg");
  expect(screen.queryByText("fallback")).toBeNull();
});
