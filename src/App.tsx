import { useEffect, useRef, useState } from "react";

import type { Item } from "@/types/item";
import type { DataMode } from "@/data/mode";
import { PhotoSaveError } from "@/data/apiErrors";
import { useWardrobe } from "@/data/useWardrobe";
import { download } from "@/features/import-export/download";
import { IMPORT_EXPORT_COPY } from "@/features/import-export/copy";
import { ExportModal } from "@/features/import-export/ExportModal";
import { ImportModal } from "@/features/import-export/ImportModal";
import { blankItem } from "@/features/items/blankItem";
import { EDITOR_COPY } from "@/features/items/copy";
import { Editor } from "@/features/items/Editor";
import { FilterBar } from "@/features/items/FilterBar";
import { ItemGrid } from "@/features/items/ItemGrid";
import { StatsRow } from "@/features/items/StatsRow";
import { useItemFilters } from "@/features/items/useItemFilters";
import { Header } from "@/features/layout/Header";
import { LAYOUT_COPY } from "@/features/layout/copy";
import { Hero } from "@/features/layout/Hero";
import { Btn } from "@/components/Btn";
import { Confirm } from "@/components/Confirm";
import { Toast, useToast } from "@/components/Toast";
import { locations, starter } from "@/data/demo";
import { THEME_KEY } from "@/lib/theme";
import { APP_VERSION } from "@/lib/version";

function App({ mode }: { mode?: DataMode } = {}) {
  const wardrobe = useWardrobe(starter, locations, mode);
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
  const [saving, setSaving] = useState(false);
  const { toast, notify } = useToast();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  }, [dark]);

  const openNew = () => {
    setEditor(blankItem());
    setIsNew(true);
  };
  const savingRef = useRef(false);
  const save = async () => {
    if (!editor || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await wardrobe.save(isNew ? { ...editor, id: crypto.randomUUID() } : editor);
      notify(isNew ? "Đã thêm vào tủ" : "Đã lưu thay đổi");
      setEditor(null);
    } catch (e) {
      // The item exists now: a retry must update it, not create a second one.
      if (e instanceof PhotoSaveError) {
        setEditor((p) => (p ? { ...p, id: e.item.id } : p));
        setIsNew(false);
      }
      notify(wardrobe.message(e));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const update = <K extends keyof Item>(key: K, val: Item[K]) =>
    setEditor((p) => (p ? { ...p, [key]: val } : p));

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
      <footer className="app-version">{LAYOUT_COPY.version(APP_VERSION)}</footer>

      {editor && (
        <Editor
          item={editor}
          locations={locationOptions}
          isNew={isNew}
          saving={saving}
          update={update}
          onClose={() => setEditor(null)}
          showMockAi={wardrobe.mode === "local"}
          photoById={wardrobe.mode === "api"}
          onSave={save}
          onDelete={() => setConfirm(true)}
          onDuplicate={() => {
            setEditor({
              ...editor,
              id: "",
              name: `${editor.name} (bản sao)`,
              wearCount: 0,
              lastWorn: "",
            });
            setIsNew(true);
            notify("Đã tạo bản sao");
          }}
          onWorn={async (delta) => {
            try {
              const res = await wardrobe.wear(editor, delta > 0 ? 1 : -1);
              setEditor((p) =>
                p ? { ...p, wearCount: res.wearCount, lastWorn: res.lastWorn } : p,
              );
              notify(
                delta < 0
                  ? EDITOR_COPY.wear.adjusted
                  : res.already
                    ? EDITOR_COPY.wear.alreadyWorn
                    : EDITOR_COPY.wear.worn,
              );
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
          locations={wardrobe.locations}
          importMany={wardrobe.importMany}
          onImported={(n) => notify(IMPORT_EXPORT_COPY.imported(n))}
          showMockAi={wardrobe.mode === "local"}
        />
      )}
      {exportOpen && (
        <ExportModal
          onClose={() => setExportOpen(false)}
          onExport={(type) => {
            download(items, type);
            notify(IMPORT_EXPORT_COPY.exported(type));
          }}
        />
      )}
      <Toast message={toast} />
    </div>
  );
}

export default App;
