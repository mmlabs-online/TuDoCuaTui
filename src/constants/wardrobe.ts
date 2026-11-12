import { CATEGORY_TO_DB, COLOR_TO_DB, SEASON_TO_DB, STATUS_TO_DB } from "@/data/mappers";
import type { Status } from "@/types/item";

export const categoryNames = Object.keys(CATEGORY_TO_DB);
export const statuses = Object.keys(STATUS_TO_DB) as Status[];
export const seasons = Object.keys(SEASON_TO_DB);
export const colors = Object.keys(COLOR_TO_DB);
export const sortOptions = [
  "Mới thêm",
  "Tên A→Z",
  "Mặc nhiều nhất",
  "Lâu chưa mặc",
  "Giá cao → thấp",
];

export const colorMap: Record<string, string> = {
  Đen: "#242321",
  Trắng: "#fff",
  Xám: "#9b9b98",
  Kem: "#eee7d5",
  Be: "#c9b28f",
  Nâu: "#795b45",
  Đỏ: "#b8423b",
  Hồng: "#dda3ad",
  Cam: "#d77c3f",
  Vàng: "#e0b94f",
  "Xanh lá": "#568466",
  "Xanh rêu": "#637052",
  "Xanh dương": "#6593bd",
  Navy: "#283a55",
  Tím: "#846a9c",
  "Hoạ tiết":
    "linear-gradient(135deg,#d5c0a4 25%,#fff 25%,#fff 50%,#677b72 50%,#677b72 75%,#fff 75%)",
};
export const categoryIcons: Record<string, string> = {
  "Tất cả": "✦",
  Áo: "♧",
  "Quần/váy": "♢",
  Đầm: "❀",
  "Set đồ": "◫",
  "Giày/dép": "◡",
  "Áo dài": "❦",
  Khoác: "♤",
  Bikini: "☼",
  "Phụ kiện": "✺",
  "Loại khác": "＋",
};
export const frameColors = ["#F9D86B", "#B08CF5", "#BFE3C5", "#F7C6C0", "#BFDDF5", "#FFC9A3"];
