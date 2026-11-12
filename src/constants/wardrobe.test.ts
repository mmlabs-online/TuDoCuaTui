import { describe, expect, it } from "vitest";

import {
  categoryIcons,
  categoryNames,
  colorMap,
  colors,
  frameColors,
  seasons,
  sortOptions,
  statuses,
} from "./wardrobe";

describe("wardrobe constants", () => {
  it("categoryNames is the D29 list in order", () => {
    expect(categoryNames).toEqual([
      "Áo",
      "Quần/váy",
      "Đầm",
      "Set đồ",
      "Giày/dép",
      "Áo dài",
      "Khoác",
      "Bikini",
      "Phụ kiện",
      "Loại khác",
    ]);
  });

  it("statuses keeps the original labels and order", () => {
    expect(statuses).toEqual([
      "Đang dùng",
      "Cất kho",
      "Đang giặt-sửa",
      "Cho mượn",
      "Muốn thanh lý",
    ]);
  });

  it("seasons keeps the original labels and order", () => {
    expect(seasons).toEqual(["Xuân", "Hạ", "Thu", "Đông"]);
  });

  it("colors keeps the original labels and order", () => {
    expect(colors).toEqual([
      "Đen",
      "Trắng",
      "Xám",
      "Kem",
      "Be",
      "Nâu",
      "Đỏ",
      "Hồng",
      "Cam",
      "Vàng",
      "Xanh lá",
      "Xanh rêu",
      "Xanh dương",
      "Navy",
      "Tím",
      "Hoạ tiết",
    ]);
  });

  it("colorMap has a swatch for every colour label and nothing else", () => {
    expect(Object.keys(colorMap)).toEqual(colors);
  });

  it('categoryIcons covers "Tất cả" and every category', () => {
    expect(Object.keys(categoryIcons)).toEqual(["Tất cả", ...categoryNames]);
  });

  it("sortOptions keeps the original labels and order", () => {
    expect(sortOptions).toEqual([
      "Mới thêm",
      "Tên A→Z",
      "Mặc nhiều nhất",
      "Lâu chưa mặc",
      "Giá cao → thấp",
    ]);
  });

  it("frameColors is unchanged", () => {
    expect(frameColors).toEqual(["#F9D86B", "#B08CF5", "#BFE3C5", "#F7C6C0", "#BFDDF5", "#FFC9A3"]);
  });
});
