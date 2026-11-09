/** Vietnamese error messages for CSV row validation (F-601.2). */
export const CSV_MAP_COPY = {
  nameRequired: "Thiếu tên món đồ",
  nameTooLong: (max: number) => `Tên dài quá ${max} ký tự`,
  unknownCategory: (v: string) => `Loại không hợp lệ: ${v}`,
  unknownStatus: (v: string) => `Trạng thái không hợp lệ: ${v}`,
  unknownColors: (v: string[]) => `Màu không hợp lệ: ${v.join(", ")}`,
  unknownSeasons: (v: string[]) => `Mùa không hợp lệ: ${v.join(", ")}`,
  badPrice: (v: string) => `Giá không hợp lệ: ${v}`,
  badDate: (v: string) => `Ngày mua không hợp lệ: ${v}`,
  futureDate: (v: string) => `Ngày mua không được ở tương lai: ${v}`,
};
