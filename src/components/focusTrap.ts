const TABBABLE =
  'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';

/** Tabbable descendants in DOM order. Attribute-based: jsdom has no layout, so CSS-hidden elements are not detected. */
export function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) =>
      !el.matches(":disabled") &&
      el.getAttribute("tabindex") !== "-1" &&
      !el.closest("[hidden], [inert]"),
  );
}

/** The element to focus for a Tab press, or null to let the browser move focus. */
export function nextTrapFocus(
  list: HTMLElement[],
  active: Element | null,
  shift: boolean,
): HTMLElement | null {
  if (list.length === 0) return null;
  const first = list[0];
  const last = list[list.length - 1];
  const i = active ? list.indexOf(active as HTMLElement) : -1;
  if (i === -1) return shift ? last : first;
  if (shift && i === 0) return last;
  if (!shift && i === list.length - 1) return first;
  return null;
}
