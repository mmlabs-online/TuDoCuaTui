/** Cities offered for weather (F-704.2). Ids match `server/weather.js` (a test keeps them equal). */
export const WEATHER_PLACES: readonly { id: string; name: string }[] = [
  { id: "ha-noi", name: "Hà Nội" },
  { id: "hai-phong", name: "Hải Phòng" },
  { id: "ha-long", name: "Hạ Long" },
  { id: "sa-pa", name: "Sa Pa" },
  { id: "thanh-hoa", name: "Thanh Hóa" },
  { id: "vinh", name: "Vinh" },
  { id: "hue", name: "Huế" },
  { id: "da-nang", name: "Đà Nẵng" },
  { id: "quy-nhon", name: "Quy Nhơn" },
  { id: "nha-trang", name: "Nha Trang" },
  { id: "da-lat", name: "Đà Lạt" },
  { id: "buon-ma-thuot", name: "Buôn Ma Thuột" },
  { id: "ho-chi-minh", name: "TP. Hồ Chí Minh" },
  { id: "vung-tau", name: "Vũng Tàu" },
  { id: "can-tho", name: "Cần Thơ" },
];

export const isWeatherPlaceId = (id: unknown): id is string =>
  typeof id === "string" && WEATHER_PLACES.some((p) => p.id === id);
