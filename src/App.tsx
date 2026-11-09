import { useEffect, useMemo, useRef, useState } from "react";

import type { Item, Status } from "@/types/item";
import { useWardrobe } from "@/data/useWardrobe";
import { toCsv } from "@/features/import-export/csv/serialize";
import { ageInDays, isStale, matchesFilters, sortItems } from "@/features/items/filters";
import { Btn } from "@/components/Btn";
import { Confirm } from "@/components/Confirm";
import { Empty } from "@/components/Empty";
import { Field } from "@/components/Field";
import { FilterSelect } from "@/components/FilterSelect";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { Skeleton } from "@/components/Skeleton";
import {
  categoryIcons,
  categoryNames,
  colorMap,
  colors,
  frameColors,
  seasons,
  sortOptions,
  statuses,
} from "@/constants/wardrobe";
import { locations, starter } from "@/data/demo";
import { THEME_KEY } from "@/lib/theme";

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

function App() {
  const wardrobe = useWardrobe(starter, locations);
  const { items, loading } = wardrobe;
  const locationOptions = wardrobe.locations;
  const [dark, setDark] = useState(() => localStorage.getItem(THEME_KEY) === "dark");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tất cả");
  const [filters, setFilters] = useState({
    status: "",
    season: "",
    location: "",
    color: "",
    special: "",
  });
  const [sort, setSort] = useState<string>(sortOptions[0]);
  const [editor, setEditor] = useState<Item | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
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
                placeholder="Tìm theo tên, hãng, màu, tag, chất liệu, ghi chú, vị trí…"
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
              options={sortOptions}
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

export default App;
