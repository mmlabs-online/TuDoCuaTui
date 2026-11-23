// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { nextTrapFocus, tabbables } from "./focusTrap";

const html = (s: string) => {
  const root = document.createElement("div");
  root.innerHTML = s;
  return root;
};
const el = (n: number) => Array.from({ length: n }, () => document.createElement("button"));

describe("tabbables", () => {
  it("skips disabled, tabindex -1, hidden and inert elements", () => {
    const root = html(`
      <button id="ok">ok</button>
      <button disabled>d</button>
      <button tabindex="-1">m</button>
      <input type="hidden" />
      <input type="file" hidden />
      <div hidden><button>in hidden</button></div>
      <div inert><button>in inert</button></div>
    `);
    expect(tabbables(root).map((e) => e.id)).toEqual(["ok"]);
  });

  it("keeps DOM order and includes tabindex 0", () => {
    const root = html(
      `<a href="#" id="a"></a><div tabindex="0" id="b"></div><input id="c" /><select id="d"></select>`,
    );
    expect(tabbables(root).map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("nextTrapFocus", () => {
  const [a, b, c] = el(3);
  const list = [a, b, c];

  it("wraps at both ends and returns null in the middle", () => {
    expect(nextTrapFocus(list, c, false)).toBe(a);
    expect(nextTrapFocus(list, a, true)).toBe(c);
    expect(nextTrapFocus(list, b, false)).toBeNull();
    expect(nextTrapFocus(list, b, true)).toBeNull();
  });

  it("with focus outside or on the container goes to the first (last with Shift)", () => {
    const outside = document.createElement("div");
    expect(nextTrapFocus(list, outside, false)).toBe(a);
    expect(nextTrapFocus(list, null, true)).toBe(c);
  });

  it("with an empty list returns null", () => {
    expect(nextTrapFocus([], null, false)).toBeNull();
  });
});
