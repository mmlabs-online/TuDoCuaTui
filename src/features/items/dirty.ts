import type { Item } from "@/types/item";

/** Fields the user edits in the form. Wear stats, id and createdAt are not form edits. */
export const EDITABLE_FIELDS = [
  "name",
  "category",
  "status",
  "colors",
  "seasons",
  "brand",
  "size",
  "location",
  "price",
  "purchaseDate",
  "material",
  "tags",
  "notes",
  "photo",
] as const satisfies readonly (keyof Item)[];

export function isDirty(initial: Item, current: Item): boolean {
  return EDITABLE_FIELDS.some((k) => {
    const a = initial[k];
    const b = current[k];
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length !== b.length || a.some((x, i) => x !== b[i]);
    }
    return a !== b;
  });
}
