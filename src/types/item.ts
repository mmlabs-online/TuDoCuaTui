export type Status = "Đang dùng" | "Cất kho" | "Đang giặt-sửa" | "Cho mượn" | "Muốn thanh lý";

/** UI-facing item. Labels are Vietnamese; `src/data/mappers.ts` converts to/from DB ids. */
export type Item = {
  id: string;
  name: string;
  category: string;
  status: Status;
  colors: string[];
  seasons: string[];
  brand: string;
  size: string;
  location: string;
  price: number;
  purchaseDate: string;
  material: string;
  tags: string[];
  notes: string;
  /** Displayable URL: signed Storage URL, data: URL of a fresh upload, or "" */
  photo: string;
  /** Storage path of the current primary photo (Supabase mode only) */
  photoPath?: string;
  wearCount: number;
  lastWorn: string;
  createdAt: string;
};
