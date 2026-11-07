/** Lowercase, strip Vietnamese diacritics (đ → d), collapse and trim whitespace. Used for search and for matching names (D8). */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
