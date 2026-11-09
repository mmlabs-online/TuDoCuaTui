import type { Item } from "@/types/item";
import { toDateOnly } from "@/features/import-export/csv/serialize";

/** DB check: char_length(name) between 1 and 120. */
export const NAME_MAX = 120;

export type ItemErrorCode =
  | "nameRequired"
  | "nameTooLong"
  | "priceNegative"
  | "priceInvalid"
  | "dateInvalid"
  | "dateFuture";

export type ItemErrors = Partial<Record<"name" | "price" | "purchaseDate", ItemErrorCode>>;

export function nameError(name: string): ItemErrorCode | null {
  const n = name.trim();
  if (n === "") return "nameRequired";
  // Code points, like Postgres char_length.
  if ([...n].length > NAME_MAX) return "nameTooLong";
  return null;
}

export function priceError(price: number): ItemErrorCode | null {
  if (!Number.isFinite(price)) return "priceInvalid";
  if (price < 0) return "priceNegative";
  return null;
}

/** `today` is a YYYY-MM-DD date (UTC+7), passed in so callers and tests control the clock. */
export function dateError(date: string, today: string): ItemErrorCode | null {
  if (date === "") return null;
  const d = toDateOnly(date);
  if (d === "") return "dateInvalid";
  return d > today ? "dateFuture" : null;
}

export function validateItem(
  item: Pick<Item, "name" | "price" | "purchaseDate">,
  today: string,
): ItemErrors {
  const errors: ItemErrors = {};
  const name = nameError(item.name);
  const price = priceError(item.price);
  const date = dateError(item.purchaseDate, today);
  if (name) errors.name = name;
  if (price) errors.price = price;
  if (date) errors.purchaseDate = date;
  return errors;
}

export const hasErrors = (e: ItemErrors) => Object.keys(e).length > 0;
