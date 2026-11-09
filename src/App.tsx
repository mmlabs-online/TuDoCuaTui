import { useEffect, useState } from "react";

import type { Item } from "@/types/item";
import { useWardrobe } from "@/data/useWardrobe";
import { CSV_TEMPLATE } from "@/features/import-export/csv/template";
import { toCsv } from "@/features/import-export/csv/serialize";
import { blankItem } from "@/features/items/blankItem";
import { Editor } from "@/features/items/Editor";
import { FilterBar } from "@/features/items/FilterBar";
import { ItemGrid } from "@/features/items/ItemGrid";
import { StatsRow } from "@/features/items/StatsRow";
import { useItemFilters } from "@/features/items/useItemFilters";
import { Header } from "@/features/layout/Header";
import { Hero } from "@/features/layout/Hero";
import { Btn } from "@/components/Btn";
import { Confirm } from "@/components/Confirm";
import { Field } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { statuses } from "@/constants/wardrobe";
import { locations, starter } from "@/data/demo";
import { THEME_KEY } from "@/lib/theme";

function App() {
  const wardrobe = useWardrobe(starter, locations);
  const { items, loading } = wardrobe;
  const locationOptions = wardrobe.locations;
  const [dark, setDark] = useState(() => localStorage.getItem(THEME_KEY) === "dark");
  const {
    query,
    setQuery,
    category,
    setCategory,
    filters,
    sort,
    setSort,
    counts,
    visible,
    hasActiveFilters,
    setFilter,
    toggleSpecial,
    resetFilters,
  } = useItemFilters(items);
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
      <Header
        count={items.length}
        dark={dark}
        onToggleDark={() => setDark(!dark)}
        showSignOut={wardrobe.mode === "supabase"}
        onSignOut={wardrobe.signOut}
        onImport={() => setImportOpen(true)}
        onExport={() => setExportOpen(true)}
        onAdd={openNew}
      />

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
        <Hero
          items={items}
          onImport={() => setImportOpen(true)}
          onExport={() => setExportOpen(true)}
        />

        <StatsRow items={items} special={filters.special} onToggleSpecial={toggleSpecial} />

        <section className="wardrobe-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">BỘ SƯU TẬP</p>
              <h2>Tất cả món đồ</h2>
              <span>{visible.length} kết quả</span>
            </div>
            {hasActiveFilters && (
              <button className="text-btn" onClick={resetFilters}>
                Xoá bộ lọc
              </button>
            )}
          </div>
          <FilterBar
            query={query}
            onQuery={setQuery}
            filters={filters}
            onFilter={setFilter}
            sort={sort}
            onSort={setSort}
            category={category}
            onCategory={setCategory}
            locationOptions={locationOptions}
            counts={counts}
            total={items.length}
          />

          <ItemGrid
            loading={loading}
            visible={visible}
            total={items.length}
            onOpen={(item) => {
              setEditor({ ...item });
              setIsNew(false);
            }}
            onAdd={openNew}
            onImport={() => setImportOpen(true)}
            onReset={resetFilters}
          />
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

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: (x: Item[]) => void }) {
  const [tab, setTab] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [paste, setPaste] = useState("");
  const csv = CSV_TEMPLATE;
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
