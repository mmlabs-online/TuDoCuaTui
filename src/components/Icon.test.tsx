import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { Icon } from "./Icon";

afterEach(cleanup);

const svgOf = (name: string) => render(<Icon name={name} />).container.querySelector("svg")!;

test('"ai" draws its own glyph, different from "sun" and "settings"', () => {
  const ai = svgOf("ai");
  expect(ai.children.length).toBeGreaterThan(0);
  expect(ai.querySelector("circle")).toBeNull();
  expect(ai.innerHTML).not.toBe(svgOf("sun").innerHTML);
  expect(ai.innerHTML).not.toBe(svgOf("settings").innerHTML);
});

test("sets data-icon to the icon name", () => {
  const svg = svgOf("moon");
  expect(svg.getAttribute("data-icon")).toBe("moon");
  expect(svg.getAttribute("aria-hidden")).toBe("true");
});
