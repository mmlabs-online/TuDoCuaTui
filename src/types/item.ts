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
  /** Displayable URL: `/api/photos/<id>` (API mode), a data:/blob: URL of a fresh upload, a demo/external URL (local mode), or "" */
  photo: string;
  /** API mode: `item_photos` id of the primary photo. */
  photoPath?: string;
  /** API mode: id of the stored photo the user explicitly removed in the editor (sent with the DELETE) */
  removedPhotoId?: string;
  wearCount: number;
  lastWorn: string;
  createdAt: string;
};
