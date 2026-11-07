import { useEffect, useMemo, useRef, useState } from "react";

import type { Item, Status } from "@/types/item";
import { useWardrobe } from "@/data/useWardrobe";
import { toCsv } from "@/features/import-export/csv/serialize";
import { ageInDays, isStale, matchesFilters, sortItems } from "@/features/items/filters";

const photos = [
  "https://images.unsplash.com/photo-1516762689617-e1cffcef479d?auto=format&fit=crop&w=700&q=85",
  "https://images.unsplash.com/photo-1467043237213-65f2da53396f?auto=format&fit=crop&w=700&q=85",
  "https://images.unsplash.com/photo-1479064555552-3ef4979f8908?auto=format&fit=crop&w=700&q=85",
  "https://images.unsplash.com/photo-1687541160824-366bd3581699?auto=format&fit=crop&w=700&q=85",
  "https://images.unsplash.com/photo-1586084611164-a9accaeab607?auto=format&fit=crop&w=700&q=85",
  "https://images.unsplash.com/photo-1632469188022-b5db09a70fbc?auto=format&fit=crop&w=700&q=85",
  "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=700&q=85",
  "https://images.unsplash.com/photo-1633008004535-b255bab275cc?auto=format&fit=crop&w=700&q=85",
  "https://images.unsplash.com/photo-1625517528908-0290a45b8abe?auto=format&fit=crop&w=700&q=85",
  "https://images.unsplash.com/photo-1739384879592-79903b12b2a6?auto=format&fit=crop&w=700&q=85",
  "https://images.unsplash.com/photo-1621198059871-0d5f9b449233?auto=format&fit=crop&w=700&q=85",
];

const locations = [
  "Tủ phòng ngủ – ngăn 1",
  "Tủ phòng ngủ – ngăn 2",
  "Hộp dưới gầm giường",
  "Kệ giày cửa ra vào",
];
const colorMap: Record<string, string> = {
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
const colors = Object.keys(colorMap);
const seasons = ["Xuân", "Hạ", "Thu", "Đông"];
const statuses: Status[] = ["Đang dùng", "Cất kho", "Đang giặt-sửa", "Cho mượn", "Muốn thanh lý"];
const categoryNames = [
  "Áo",
  "Quần",
  "Váy/Đầm",
  "Áo khoác",
  "Giày dép",
  "Túi",
  "Phụ kiện",
  "Đồ thể thao",
  "Đồ ngủ/ở nhà",
  "Khác",
];
const categoryIcons: Record<string, string> = {
  "Tất cả": "✦",
  Áo: "♧",
  Quần: "♢",
  "Váy/Đầm": "❀",
  "Áo khoác": "♤",
  "Giày dép": "◡",
  Túi: "▢",
  "Phụ kiện": "✺",
  "Đồ thể thao": "◌",
  "Đồ ngủ/ở nhà": "☾",
  Khác: "＋",
};
const frameColors = ["#F9D86B", "#B08CF5", "#BFE3C5", "#F7C6C0", "#BFDDF5", "#FFC9A3"];

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
const starter: Item[] = [
  [
    "Áo sơ mi linen trắng",
    "Áo",
    "Đang dùng",
    ["Trắng", "Kem"],
    ["Hạ"],
    "Uniqlo",
    "M",
    "Tủ phòng ngủ – ngăn 1",
    890000,
    12,
    3,
  ],
  [
    "Quần jeans 501 xanh",
    "Quần",
    "Đang dùng",
    ["Xanh dương"],
    ["Xuân", "Thu"],
    "Levi's",
    "28",
    "Tủ phòng ngủ – ngăn 2",
    1850000,
    21,
    8,
  ],
  [
    "Váy midi hoa nhí",
    "Váy/Đầm",
    "Đang dùng",
    ["Hoạ tiết", "Kem"],
    ["Xuân", "Hạ"],
    "Zara",
    "S",
    "Tủ phòng ngủ – ngăn 1",
    1290000,
    7,
    97,
  ],
  [
    "Blazer nâu cà phê",
    "Áo khoác",
    "Cất kho",
    ["Nâu"],
    ["Thu", "Đông"],
    "Routine",
    "M",
    "Hộp dưới gầm giường",
    1490000,
    5,
    126,
  ],
  [
    "Giày sneaker trắng",
    "Giày dép",
    "Đang dùng",
    ["Trắng"],
    ["Xuân", "Hạ", "Thu"],
    "Nike",
    "38",
    "Kệ giày cửa ra vào",
    2190000,
    34,
    1,
  ],
  [
    "Túi đeo vai da đen",
    "Túi",
    "Đang dùng",
    ["Đen"],
    ["Xuân", "Hạ", "Thu", "Đông"],
    "Zara",
    "",
    "Tủ phòng ngủ – ngăn 2",
    1790000,
    18,
    5,
  ],
  [
    "Áo thun cotton rêu",
    "Áo",
    "Đang giặt-sửa",
    ["Xanh rêu"],
    ["Hạ"],
    "Uniqlo",
    "M",
    "Tủ phòng ngủ – ngăn 1",
    490000,
    16,
    12,
  ],
  [
    "Quần tây ống suông",
    "Quần",
    "Đang dùng",
    ["Đen"],
    ["Xuân", "Thu", "Đông"],
    "Owen",
    "M",
    "Tủ phòng ngủ – ngăn 2",
    990000,
    9,
    34,
  ],
  [
    "Đầm lụa xanh navy",
    "Váy/Đầm",
    "Cho mượn",
    ["Navy"],
    ["Hạ", "Thu"],
    "Zara",
    "S",
    "Tủ phòng ngủ – ngăn 1",
    1590000,
    4,
    62,
  ],
  [
    "Áo cardigan kem",
    "Áo khoác",
    "Đang dùng",
    ["Kem"],
    ["Thu", "Đông"],
    "Uniqlo",
    "M",
    "Hộp dưới gầm giường",
    1090000,
    11,
    6,
  ],
  [
    "Mũ lưỡi trai beige",
    "Phụ kiện",
    "Đang dùng",
    ["Be"],
    ["Hạ"],
    "Nike",
    "",
    "Tủ phòng ngủ – ngăn 2",
    550000,
    8,
    22,
  ],
  [
    "Quần jogger xám",
    "Đồ thể thao",
    "Đang dùng",
    ["Xám"],
    ["Xuân", "Thu"],
    "Nike",
    "M",
    "Tủ phòng ngủ – ngăn 2",
    1190000,
    19,
    4,
  ],
  [
    "Bộ pyjama cotton",
    "Đồ ngủ/ở nhà",
    "Đang dùng",
    ["Hồng"],
    ["Xuân", "Hạ"],
    "Routine",
    "M",
    "Tủ phòng ngủ – ngăn 1",
    650000,
    0,
    180,
  ],
  [
    "Khăn lụa hoạ tiết",
    "Phụ kiện",
    "Muốn thanh lý",
    ["Hoạ tiết", "Đỏ"],
    ["Thu"],
    "Zara",
    "",
    "Hộp dưới gầm giường",
    790000,
    2,
    154,
  ],
  [
    "Áo polo navy",
    "Áo",
    "Đang dùng",
    ["Navy"],
    ["Hạ"],
    "Owen",
    "M",
    "Tủ phòng ngủ – ngăn 1",
    690000,
    10,
    14,
  ],
  [
    "Sandal quai mảnh",
    "Giày dép",
    "Cất kho",
    ["Nâu"],
    ["Hạ"],
    "Zara",
    "38",
    "Kệ giày cửa ra vào",
    990000,
    0,
    200,
  ],
].map((x, i) => ({
  id: String(i + 1),
  name: x[0] as string,
  category: x[1] as string,
  status: x[2] as Status,
  colors: x[3] as string[],
  seasons: x[4] as string[],
  brand: x[5] as string,
  size: x[6] as string,
  location: x[7] as string,
  price: x[8] as number,
  purchaseDate: `202${2 + (i % 3)}-${String((i % 9) + 1).padStart(2, "0")}-12`,
  material: i % 3 === 0 ? "Cotton" : i % 3 === 1 ? "Denim" : "Linen",
  tags: i % 2 ? ["đi chơi"] : ["đi làm"],
  notes: "",
  photo: i === 13 || i === 15 ? "" : photos[i % photos.length],
  wearCount: x[9] as number,
  lastWorn: daysAgo(x[10] as number),
  createdAt: daysAgo(i * 3),
}));

const blankItem = (): Item => ({
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

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    logout: (
      <>
        <path d="M9 4H5v16h4" />
        <path d="m14 7 5 5-5 5" />
        <path d="M19 12H9" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    import: (
      <>
        <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
        <path d="M5 19h14" />
      </>
    ),
    export: (
      <>
        <path d="M12 16V4m0 0 4 4m-4-4L8 8" />
        <path d="M5 20h14" />
      </>
    ),
    moon: <path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4m0 0 4 4m-4-4L8 8" />
        <path d="M4 15v5h16v-5" />
      </>
    ),
    chevron: <path d="m8 10 4 4 4-4" />,
    shirt: <path d="m8 4-5 3 3 5 2-1v9h8v-9l2 1 3-5-5-3c-.7 2.4-7.3 2.4-8 0Z" />,
    image: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="2" />
        <path d="m21 15-5-5L5 20" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7" />
        <path d="M10 11v6m4-6v6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    sparkle: (
      <>
        <path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8L12 3Z" />
        <path d="m19 15 .7 2.3L22 18.5l-2.3 1.2L19 22l-.7-2.3-2.3-1.2 2.3-1.2L19 15Z" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
}

function Btn({
  children,
  kind = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: string }) {
  return (
    <button className={`btn btn-${kind} ${className}`} {...props}>
      {children}
    </button>
  );
}

function Modal({
  children,
  onClose,
  wide = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "modal-wide" : ""}`}>{children}</div>
    </div>
  );
}

function App() {
  const wardrobe = useWardrobe(starter, locations);
  const { items, loading } = wardrobe;
  const locationOptions = wardrobe.locations;
  const [dark, setDark] = useState(() => localStorage.getItem("tu-do-theme") === "dark");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tất cả");
  const [filters, setFilters] = useState({
    status: "",
    season: "",
    location: "",
    color: "",
    special: "",
  });
  const [sort, setSort] = useState("Mới thêm");
  const [editor, setEditor] = useState<Item | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("tu-do-theme", dark ? "dark" : "light");
  }, [dark]);
  const notify = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(""), 2400);
  };
  const counts = useMemo(
    () =>
      Object.fromEntries(
        categoryNames.map((c) => [c, items.filter((i) => i.category === c).length]),
      ),
    [items],
  );
  const visible = useMemo(() => {
    return sortItems(
      items.filter((i) => matchesFilters(i, { query, category, filters })),
      sort,
    );
  }, [items, query, category, filters, sort]);

  const most = [...items].sort((a, b) => b.wearCount - a.wearCount)[0];
  const openNew = () => {
    setEditor(blankItem());
    setIsNew(true);
  };
  const save = async () => {
    if (!editor?.name.trim()) return notify("Vui lòng nhập tên món đồ");
    if (saving) return;
    setSaving(true);
    try {
      await wardrobe.save(isNew ? { ...editor, id: crypto.randomUUID() } : editor);
      notify(isNew ? "Đã thêm vào tủ" : "Đã lưu thay đổi");
      setEditor(null);
    } catch (e) {
      notify(wardrobe.message(e));
    } finally {
      setSaving(false);
    }
  };
  const update = <K extends keyof Item>(key: K, val: Item[K]) =>
    setEditor((p) => (p ? { ...p, [key]: val } : p));
  const resetFilters = () => {
    setQuery("");
    setCategory("Tất cả");
    setFilters({ status: "", season: "", location: "", color: "", special: "" });
  };
  const toggleSpecial = (s: string) =>
    setFilters((f) => ({ ...f, special: f.special === s ? "" : s }));

  const download = (type: "json" | "csv") => {
    const blob = new Blob([type === "json" ? JSON.stringify(items, null, 2) : toCsv(items)], {
      type: type === "json" ? "application/json" : "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tu-do-cua-toi.${type}`;
    a.click();
    URL.revokeObjectURL(a.href);
    notify(`Đã xuất ${type.toUpperCase()}`);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brandmark">
          <span className="brand-icon">
            <Icon name="shirt" size={21} />
          </span>
          <div>
            <b>Tủ đồ</b>
            <span>{items.length} món</span>
          </div>
        </div>
        <div className="header-actions">
          <button className="icon-btn" onClick={() => setDark(!dark)} aria-label="Đổi giao diện">
            <Icon name={dark ? "sun" : "moon"} />
          </button>
          {wardrobe.mode === "supabase" && (
            <button
              className="icon-btn"
              onClick={wardrobe.signOut}
              aria-label="Đăng xuất"
              title="Đăng xuất"
            >
              <Icon name="logout" />
            </button>
          )}
          <Btn className="desktop-btn" onClick={() => setImportOpen(true)}>
            <Icon name="import" /> Import
          </Btn>
          <Btn className="desktop-btn" onClick={() => setExportOpen(true)}>
            <Icon name="export" /> Export
          </Btn>
          <Btn kind="primary" onClick={openNew}>
            <Icon name="plus" /> <span>Thêm món đồ</span>
          </Btn>
        </div>
      </header>

      {wardrobe.error && (
        <div
          role="alert"
          className="mx-auto my-3 flex max-w-5xl items-center justify-between gap-3 rounded-2xl px-4 py-3"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--danger)",
            color: "var(--danger)",
          }}
        >
          <span>Không tải được tủ đồ: {wardrobe.error}</span>
          <Btn onClick={wardrobe.refresh}>Thử lại</Btn>
        </div>
      )}
      <main>
        <section className="intro">
          <div className="hero-copy">
            <p className="eyebrow">TỦ ĐỒ CÁ NHÂN</p>
            <h1>
              Tủ đồ là <em>phong cách</em>
              <br /> của bạn
            </h1>
            <p>
              Hôm nay có {items.filter((i) => isStale(i)).length} món lâu chưa mặc — thử một món
              nhé?
            </p>
          </div>
          <div className="hero-collage" aria-label="Một vài món đồ trong bộ sưu tập">
            {items
              .filter((item) => item.photo)
              .slice(0, 4)
              .map((item, index) => (
                <div className={`collage-card collage-${index + 1}`} key={item.id}>
                  <img src={item.photo} alt={item.name} />
                  <span>{["Mới mua", "Yêu thích", "Mặc nhiều nhất", "Dễ phối"][index]}</span>
                </div>
              ))}
            <i className="hero-sparkle sparkle-one">✦</i>
            <i className="hero-sparkle sparkle-two">✧</i>
            <svg className="hero-squiggle" viewBox="0 0 90 25" aria-hidden="true">
              <path d="M2 17c14-23 29 16 44-6 14-20 25 14 42-8" />
            </svg>
          </div>
          <div className="mobile-import">
            <Btn onClick={() => setImportOpen(true)}>
              <Icon name="import" /> Import
            </Btn>
            <Btn onClick={() => setExportOpen(true)}>
              <Icon name="export" /> Export
            </Btn>
          </div>
        </section>

        <section className="stats-grid">
          <div className="stat-card">
            <span>Tổng món đồ</span>
            <strong>{items.length}</strong>
            <small>
              {new Set(items.map((i) => i.location).filter(Boolean)).size} vị trí lưu trữ
            </small>
          </div>
          <div className="stat-card">
            <span>Tổng giá trị</span>
            <strong className="money">
              {items.reduce((s, i) => s + i.price, 0).toLocaleString("vi-VN")} ₫
            </strong>
            <small>Giá mua ban đầu</small>
          </div>
          <button
            className={`stat-card clickable ${filters.special === "stale" ? "active" : ""}`}
            onClick={() => toggleSpecial("stale")}
          >
            <span>≥ 90 ngày chưa mặc</span>
            <strong>{items.filter((i) => isStale(i)).length}</strong>
            <small>
              Xem những món bị lãng quên <span>→</span>
            </small>
          </button>
          <button
            className={`stat-card clickable ${filters.special === "never" ? "active" : ""}`}
            onClick={() => toggleSpecial("never")}
          >
            <span>Chưa mặc lần nào</span>
            <strong>{items.filter((i) => i.wearCount === 0).length}</strong>
            <small>
              Bắt đầu phối đồ <span>→</span>
            </small>
          </button>
          <div className="stat-card most">
            <span>Mặc nhiều nhất</span>
            <strong>{most?.name}</strong>
            <small>{most?.wearCount} lần mặc</small>
          </div>
        </section>

        <section className="wardrobe-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">BỘ SƯU TẬP</p>
              <h2>Tất cả món đồ</h2>
              <span>{visible.length} kết quả</span>
            </div>
            {(query || category !== "Tất cả" || Object.values(filters).some(Boolean)) && (
              <button className="text-btn" onClick={resetFilters}>
                Xoá bộ lọc
              </button>
            )}
          </div>
          <div className="toolbar">
            <label className="searchbox">
              <Icon name="search" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm theo tên, hãng, màu, thẻ, chất liệu, ghi chú, vị trí…"
              />
              {query && (
                <button onClick={() => setQuery("")}>
                  <Icon name="close" size={15} />
                </button>
              )}
            </label>
            <FilterSelect
              value={filters.status}
              onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
              label="Trạng thái"
              options={statuses}
            />
            <FilterSelect
              value={filters.season}
              onChange={(v) => setFilters((f) => ({ ...f, season: v }))}
              label="Mùa"
              options={seasons}
            />
            <FilterSelect
              value={filters.location}
              onChange={(v) => setFilters((f) => ({ ...f, location: v }))}
              label="Vị trí lưu trữ"
              options={locationOptions}
            />
            <FilterSelect
              value={filters.color}
              onChange={(v) => setFilters((f) => ({ ...f, color: v }))}
              label="Màu"
              options={colors}
            />
            <FilterSelect
              value={sort}
              onChange={setSort}
              label="Sắp xếp"
              options={["Mới thêm", "Tên A→Z", "Mặc nhiều nhất", "Lâu chưa mặc", "Giá cao → thấp"]}
              sort
            />
          </div>
          <div className="categories">
            {["Tất cả", ...categoryNames].map((c) => (
              <button
                key={c}
                className={category === c ? "active" : ""}
                onClick={() => setCategory(c)}
              >
                <i>{categoryIcons[c]}</i>
                {c}
                <span>{c === "Tất cả" ? items.length : counts[c]}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <Skeleton />
          ) : visible.length ? (
            <div className="item-grid">
              {visible.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  age={ageInDays}
                  onClick={() => {
                    setEditor({ ...item });
                    setIsNew(false);
                  }}
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <Empty onAdd={openNew} onImport={() => setImportOpen(true)} />
          ) : (
            <div className="no-results">
              <span>
                <Icon name="search" size={26} />
              </span>
              <h3>Không tìm thấy món đồ</h3>
              <p>Thử một từ khoá khác hoặc xoá bớt bộ lọc.</p>
              <Btn onClick={resetFilters}>Xoá bộ lọc</Btn>
            </div>
          )}
        </section>
      </main>

      {editor && (
        <Editor
          item={editor}
          locations={locationOptions}
          isNew={isNew}
          update={update}
          onClose={() => setEditor(null)}
          onSave={save}
          onDelete={() => setConfirm(true)}
          onDuplicate={() => {
            setEditor({ ...editor, id: "", name: `${editor.name} (bản sao)`, wearCount: 0 });
            setIsNew(true);
            notify("Đã tạo bản sao");
          }}
          onWorn={async (delta) => {
            try {
              const res = await wardrobe.wear(editor, delta > 0 ? 1 : -1);
              setEditor((p) => (p ? { ...p, ...res } : p));
              notify(delta > 0 ? "Đã ghi nhận mặc hôm nay" : "Đã điều chỉnh số lần mặc");
            } catch (e) {
              notify(wardrobe.message(e));
            }
          }}
        />
      )}
      {confirm && (
        <Confirm
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            setConfirm(false);
            if (!editor) return;
            try {
              await wardrobe.remove(editor);
              setEditor(null);
              notify("Đã xoá món đồ");
            } catch (e) {
              notify(wardrobe.message(e));
            }
          }}
        />
      )}
      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onDone={async (added) => {
            try {
              const saved = await wardrobe.importMany(added);
              notify(`Đã thêm ${saved.length} món vào tủ`);
            } catch (e) {
              notify(wardrobe.message(e));
            } finally {
              setImportOpen(false);
            }
          }}
        />
      )}
      {exportOpen && <ExportModal onClose={() => setExportOpen(false)} onExport={download} />}
      {toast && (
        <div className="toast">
          <span>
            <Icon name="check" size={15} />
          </span>
          {toast}
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  options,
  sort = false,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: readonly string[];
  sort?: boolean;
}) {
  return (
    <label className={`filter-select ${value && !sort ? "has-value" : ""}`}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{label}</option>
        {options.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <Icon name="chevron" size={15} />
    </label>
  );
}

function ItemCard({
  item,
  age,
  onClick,
}: {
  item: Item;
  age: (s: string) => number;
  onClick: () => void;
}) {
  const days = age(item.lastWorn);
  const frameIndex = Number.parseInt(item.id.replace(/\D/g, "").slice(-2) || "0", 10);
  return (
    <button className="item-card" onClick={onClick}>
      <div
        className="photo-wrap"
        style={{ "--frame": frameColors[frameIndex % frameColors.length] } as React.CSSProperties}
      >
        {item.photo ? (
          <img src={item.photo} alt={item.name} />
        ) : (
          <div className="photo-placeholder">
            <Icon name="shirt" size={42} />
            <span>Chưa có ảnh</span>
          </div>
        )}
        {item.status !== "Đang dùng" && (
          <span className={`badge badge-${item.status.replaceAll(" ", "-")}`}>{item.status}</span>
        )}
        <span className="wear-pill">
          👕 {item.wearCount}× ·{" "}
          {days > 365 ? "hơn 1 năm" : days === 0 ? "hôm nay" : `${days} ngày`}
        </span>
        <i className="card-sparkle">✦</i>
      </div>
      <div className="card-info">
        <div className="card-title">
          <h3>{item.name}</h3>
          <div className="dots">
            {item.colors.slice(0, 3).map((c) => (
              <i key={c} title={c} style={{ background: colorMap[c] }} />
            ))}
          </div>
        </div>
        <p>
          {item.category} · {item.brand || "Không hãng"}
        </p>
        <p className="location">{item.location || "Chưa có vị trí"}</p>
      </div>
    </button>
  );
}

function Editor({
  item,
  locations,
  isNew,
  update,
  onClose,
  onSave,
  onDelete,
  onDuplicate,
  onWorn,
}: {
  item: Item;
  locations: string[];
  isNew: boolean;
  update: <K extends keyof Item>(k: K, v: Item[K]) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onWorn: (n: number) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const toggle = (key: "colors" | "seasons", v: string) =>
    update(key, item[key].includes(v) ? item[key].filter((x) => x !== v) : [...item[key], v]);
  const upload = (f?: File) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => update("photo", String(r.result));
    r.readAsDataURL(f);
  };
  return (
    <Modal onClose={onClose} wide>
      <div className="modal-header editor-header">
        <div>
          <p className="eyebrow">{isNew ? "THÊM VÀO BỘ SƯU TẬP" : "CHI TIẾT MÓN ĐỒ"}</p>
          <h2>{isNew ? "Món đồ mới" : item.name}</h2>
        </div>
        <button className="icon-btn" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="editor-body">
        <div className="photo-column">
          <button
            className={`upload-zone ${item.photo ? "has-photo" : ""}`}
            onClick={() => file.current?.click()}
            onDrop={(e) => {
              e.preventDefault();
              upload(e.dataTransfer.files[0]);
            }}
            onDragOver={(e) => e.preventDefault()}
          >
            {item.photo ? (
              <img src={item.photo} alt="Ảnh món đồ" />
            ) : (
              <>
                <span className="upload-icon">
                  <Icon name="image" size={25} />
                </span>
                <b>Thêm ảnh món đồ</b>
                <small>
                  Nhấp hoặc kéo ảnh vào đây
                  <br />
                  JPG, PNG · tối đa 10MB
                </small>
              </>
            )}
          </button>
          <div className="photo-caption">
            <div>
              <small>MÓN ĐỒ CỦA BẠN</small>
              <b>{item.name || "Chưa đặt tên"}</b>
            </div>
            <span>↗</span>
          </div>
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => upload(e.target.files?.[0])}
          />
          <Btn
            className="ai-btn"
            onClick={() => {
              update("name", item.name || "Áo sơ mi dáng rộng");
              update("category", "Áo");
              update("colors", ["Kem"]);
              update("seasons", ["Xuân", "Hạ"]);
              update("tags", ["đi làm", "tối giản"]);
            }}
          >
            <Icon name="sparkle" /> Tự điền từ ảnh
          </Btn>
          {item.photo && (
            <button className="remove-photo" onClick={() => update("photo", "")}>
              Bỏ ảnh
            </button>
          )}
        </div>
        <div className="form-column">
          {!isNew && (
            <div className="wear-bar">
              <div>
                <span>
                  <Icon name="shirt" />
                </span>
                <div>
                  <b>Đã mặc {item.wearCount} lần</b>
                  <small>
                    {item.lastWorn
                      ? `Lần cuối ${Math.floor((Date.now() - +new Date(item.lastWorn)) / 86400000)} ngày trước`
                      : "Chưa có lịch sử"}
                  </small>
                </div>
              </div>
              <div>
                <Btn onClick={() => onWorn(-1)}>−1</Btn>
                <Btn kind="primary" onClick={() => onWorn(1)}>
                  <Icon name="shirt" /> Mặc hôm nay
                </Btn>
              </div>
            </div>
          )}
          <h3 className="form-section-title">
            Thông tin <em>món đồ</em>
          </h3>
          <div className="form-grid">
            <Field label="Tên món đồ" wide>
              <input
                autoFocus
                value={item.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Ví dụ: Áo sơ mi linen trắng"
              />
            </Field>
            <Field label="Loại">
              <select value={item.category} onChange={(e) => update("category", e.target.value)}>
                {categoryNames.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Trạng thái">
              <select
                value={item.status}
                onChange={(e) => update("status", e.target.value as Status)}
              >
                {statuses.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
            <Field label="Hãng">
              <input
                value={item.brand}
                onChange={(e) => update("brand", e.target.value)}
                placeholder="Uniqlo, Zara…"
              />
            </Field>
            <Field label="Size">
              <input
                value={item.size}
                onChange={(e) => update("size", e.target.value)}
                placeholder="S, M, 38…"
              />
            </Field>
            <Field label="Vị trí lưu trữ" wide>
              <input
                list="locations"
                value={item.location}
                onChange={(e) => update("location", e.target.value)}
                placeholder="Chọn hoặc nhập vị trí"
              />
              <datalist id="locations">
                {locations.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </Field>
            <Field label="Giá mua (₫)">
              <input
                type="number"
                value={item.price || ""}
                onChange={(e) => update("price", +e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Ngày mua">
              <input
                type="date"
                value={item.purchaseDate}
                onChange={(e) => update("purchaseDate", e.target.value)}
              />
            </Field>
            <Field label="Chất liệu" wide>
              <input
                value={item.material}
                onChange={(e) => update("material", e.target.value)}
                placeholder="Cotton, linen, denim…"
              />
            </Field>
            <Field label="Màu sắc" wide>
              <div className="choice-chips colors">
                {colors.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={item.colors.includes(c) ? "selected" : ""}
                    onClick={() => toggle("colors", c)}
                  >
                    <i style={{ background: colorMap[c] }} />
                    {c}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Mùa" wide>
              <div className="choice-chips">
                {seasons.map((s) => (
                  <button
                    type="button"
                    key={s}
                    className={item.seasons.includes(s) ? "selected" : ""}
                    onClick={() => toggle("seasons", s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Dịp / tag" wide>
              <input
                value={item.tags.join(", ")}
                onChange={(e) =>
                  update(
                    "tags",
                    e.target.value
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  )
                }
                placeholder="đi làm, đi chơi, dự tiệc…"
              />
            </Field>
            <Field label="Ghi chú" wide>
              <textarea
                value={item.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Cách bảo quản, phối cùng…"
              />
            </Field>
          </div>
        </div>
      </div>
      <div className="modal-footer">
        {!isNew ? (
          <div>
            <Btn kind="danger" onClick={onDelete}>
              <Icon name="trash" /> Xoá
            </Btn>
            <Btn onClick={onDuplicate}>
              <Icon name="copy" /> Nhân bản
            </Btn>
          </div>
        ) : (
          <div />
        )}
        <div>
          <Btn onClick={onClose}>Huỷ</Btn>
          <Btn kind="primary" onClick={onSave}>
            Lưu món đồ
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: (x: Item[]) => void }) {
  const [tab, setTab] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [paste, setPaste] = useState("");
  const csv =
    "name,category,status,colors,brand,size,location,price\nÁo sơ mi trắng,Áo,Đang dùng,Trắng|Kem,Uniqlo,M,Tủ ngăn 1,890000";
  const doImport = () => {
    setProcessing(true);
    setProgress(1);
    let n = 1;
    const t = setInterval(() => {
      n++;
      setProgress(n);
      if (n === 4) {
        clearInterval(t);
        setTimeout(
          () =>
            onDone(
              starter.slice(0, 4).map((i) => ({
                ...i,
                id: crypto.randomUUID(),
                createdAt: new Date().toISOString(),
              })),
            ),
          500,
        );
      }
    }, 550);
  };
  return (
    <Modal onClose={onClose}>
      <div className="modal-header import-header">
        <div>
          <p className="eyebrow">THÊM NHIỀU MÓN</p>
          <h2>
            Đưa tủ đồ <em>vào app</em>
          </h2>
        </div>
        <span className="modal-doodle">✦</span>
        <button className="icon-btn" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="tabs">
        {["Ảnh hàng loạt", "CSV / Excel", "JSON (backup)"].map((x, i) => (
          <button className={tab === i ? "active" : ""} onClick={() => setTab(i)} key={x}>
            {x}
          </button>
        ))}
      </div>
      <div className="import-content">
        {tab === 0 && (
          <>
            <div className="bulk-drop">
              <span>
                <Icon name="upload" size={25} />
              </span>
              <h3>Kéo nhiều ảnh vào đây</h3>
              <p>Mỗi ảnh sẽ trở thành một món đồ mới</p>
              <Btn>Chọn ảnh từ máy</Btn>
            </div>
            <label className="check-row">
              <input type="checkbox" defaultChecked />
              <span>
                <Icon name="sparkle" size={16} />
              </span>
              <div>
                <b>Dùng AI nhận diện loại, màu, mùa</b>
                <small>Bạn luôn có thể kiểm tra và sửa lại sau</small>
              </div>
            </label>
            <div className="two-cols">
              <Field label="Vị trí lưu trữ mặc định">
                <input placeholder="Chọn vị trí…" />
              </Field>
              <Field label="Trạng thái mặc định">
                <select>
                  <option>Đang dùng</option>
                  {statuses.slice(1).map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
            </div>
            {processing && (
              <div className="progress">
                <div>
                  <span>
                    Đang xử lý {progress}/4: IMG_203{progress}.jpg
                  </span>
                  <b>{progress * 25}%</b>
                </div>
                <i>
                  <span style={{ width: `${progress * 25}%` }} />
                </i>
              </div>
            )}
          </>
        )}
        {tab === 1 && (
          <>
            <div className="instructions">
              <b>Nhập danh sách từ bảng tính</b>
              <p>Tải lên file CSV hoặc dán dữ liệu. Hàng đầu tiên cần là tên các cột.</p>
            </div>
            <div className="code-head">
              <span>Mẫu CSV</span>
              <button onClick={() => navigator.clipboard.writeText(csv)}>
                <Icon name="copy" size={15} /> Copy mẫu
              </button>
            </div>
            <pre>{csv}</pre>
            <Btn className="file-btn">
              <Icon name="upload" /> Chọn file .csv
            </Btn>
            <div className="or">
              <span>hoặc dán dữ liệu</span>
            </div>
            <textarea
              className="paste-area"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="Dán nội dung CSV tại đây…"
            />
            {paste && (
              <div className="parse-summary">
                <Icon name="check" />
                <div>
                  <b>Nhận {Math.max(1, paste.split("\n").length - 1)} món</b>
                  <small>Cột dùng được: name, category, colors, brand…</small>
                </div>
              </div>
            )}
          </>
        )}
        {tab === 2 && (
          <>
            <div className="backup-note">
              <Icon name="export" />
              <div>
                <b>Khôi phục từ bản sao lưu</b>
                <p>
                  Chọn tệp JSON đã xuất trước đó. Dữ liệu hiện tại sẽ được giữ nguyên và các món mới
                  sẽ được thêm vào.
                </p>
              </div>
            </div>
            <Btn className="file-btn">
              <Icon name="upload" /> Chọn file .json
            </Btn>
            <div className="or">
              <span>hoặc dán JSON</span>
            </div>
            <textarea className="paste-area json" placeholder='[{"name": "Áo sơ mi", ...}]' />
          </>
        )}
      </div>
      <div className="modal-footer">
        <div />
        <div>
          <Btn onClick={onClose}>Huỷ</Btn>
          <Btn kind="primary" onClick={doImport} disabled={processing}>
            {processing ? "Đang xử lý…" : tab === 0 ? "Bắt đầu import" : "Kiểm tra & import"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

function ExportModal({
  onClose,
  onExport,
}: {
  onClose: () => void;
  onExport: (x: "json" | "csv") => void;
}) {
  return (
    <Modal onClose={onClose}>
      <div className="modal-header">
        <div>
          <p className="eyebrow">SAO LƯU & CHIA SẺ</p>
          <h2>Export tủ đồ</h2>
        </div>
        <button className="icon-btn" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="export-content">
        <p>Chọn định dạng phù hợp với nhu cầu của bạn.</p>
        <div className="export-options">
          <button onClick={() => onExport("json")}>
            <span className="file-icon">{"{ }"}</span>
            <div>
              <b>JSON</b>
              <small>Bản sao lưu đầy đủ để khôi phục</small>
            </div>
            <Icon name="export" />
          </button>
          <button onClick={() => onExport("csv")}>
            <span className="file-icon">CSV</span>
            <div>
              <b>CSV</b>
              <small>Mở bằng Excel hoặc Google Sheets</small>
            </div>
            <Icon name="export" />
          </button>
        </div>
        <div className="photo-note">
          <Icon name="image" />
          <span>Ảnh được giữ an toàn trong ứng dụng và không nằm trong tệp export.</span>
        </div>
      </div>
    </Modal>
  );
}

function Confirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal onClose={onCancel}>
      <div className="confirm-content">
        <span className="danger-icon">
          <Icon name="trash" />
        </span>
        <h2>Xoá món đồ này?</h2>
        <p>Hành động này không thể hoàn tác. Mọi thông tin và lịch sử mặc sẽ bị xoá.</p>
        <div>
          <Btn onClick={onCancel}>Giữ lại</Btn>
          <Btn kind="danger-fill" onClick={onConfirm}>
            Xoá món đồ
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
function Skeleton() {
  return (
    <div className="item-grid">
      {Array.from({ length: 10 }).map((_, i) => (
        <div className="skeleton-card" key={i}>
          <i />
          <b />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
function Empty({ onAdd, onImport }: { onAdd: () => void; onImport: () => void }) {
  return (
    <div className="no-results empty-state">
      <div className="empty-illustration" aria-hidden="true">
        <svg viewBox="0 0 240 150">
          <path className="rack" d="M34 132V35h172v97M20 132h34m132 0h34M68 35v-9m104 9v-9" />
          <path className="hanger hanger-one" d="m78 52-28 19h56L78 52Zm0 0c-2-9 8-10 8-4" />
          <path className="cloth cloth-one" d="M55 70h46l-5 55H60l-5-55Z" />
          <path className="hanger hanger-two" d="m141 53-27 18h54l-27-18Zm0 0c-2-9 8-10 8-4" />
          <path className="cloth cloth-two" d="m122 70 19-6 19 6-4 54h-30l-4-54Z" />
          <path className="spark" d="m200 48 3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Z" />
          <path className="spark small" d="m29 62 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" />
        </svg>
      </div>
      <h3>
        Tủ đồ đang <em>trống trơn</em>
      </h3>
      <p>Thêm món đồ đầu tiên hoặc import bộ sưu tập sẵn có.</p>
      <div>
        <Btn onClick={onImport}>
          <Icon name="import" /> Import
        </Btn>
        <Btn kind="primary" onClick={onAdd}>
          <Icon name="plus" /> Thêm món đồ
        </Btn>
      </div>
    </div>
  );
}

export default App;
