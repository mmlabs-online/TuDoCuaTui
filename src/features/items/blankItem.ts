import type { Item } from "@/types/item";

export const blankItem = (): Item => ({
  id: "",
  name: "",
  category: "Áo",
  status: "Đang dùng",
  colors: [],
  seasons: [],
  brand: "",
  size: "",
  location: "",
  price: 0,
  purchaseDate: "",
  material: "",
  tags: [],
  notes: "",
  photo: "",
  wearCount: 0,
  lastWorn: "",
  createdAt: new Date().toISOString(),
});
