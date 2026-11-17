import { useEffect, useMemo, useRef, useState } from "react";

import type { Item } from "@/types/item";
import { PhotoSaveError } from "@/data/apiErrors";
import { PhotoLoaderContext } from "@/data/usePhotoUrl";
import { useWardrobe } from "@/data/useWardrobe";
import { download, downloadBackup } from "@/features/import-export/download";
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
import { AiSettingsModal } from "@/features/settings/AiSettingsModal";
import { LAYOUT_COPY } from "@/features/layout/copy";
import { Hero } from "@/features/layout/Hero";
import { Btn } from "@/components/Btn";
import { Confirm } from "@/components/Confirm";
import { Toast, useToast } from "@/components/Toast";
import { createHttpAiSettings } from "@/data/aiSettings";
import { createHttpAiTagger } from "@/data/aiTagging";
import type { GetToken } from "@/data/authFetch";
import { THEME_KEY } from "@/lib/theme";
import { APP_VERSION } from "@/lib/version";

function App({
  getToken,
  onSignOut,
  onAuthLost,
}: {
  getToken?: GetToken;
  onSignOut?: () => void;
  onAuthLost?: () => void;
} = {}) {
  const wardrobe = useWardrobe({ getToken, onAuthLost });
  // One client per mounted App: it carries this sign-in's bearer provider.
  const aiClient = useMemo(
    () => createHttpAiSettings(undefined, undefined, { getToken, onAuthLost }),
    [], // getToken/onAuthLost are injected once, as for useWardrobe
  );
  const aiTagger = useMemo(
    () => createHttpAiTagger(undefined, undefined, { getToken, onAuthLost }),
    [], // same injection as aiClient
  );
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
    filterKey,
    hasActiveFilters,
    setFilter,
    toggleSpecial,
    resetFilters,
  } = useItemFilters(items);
  const [editor, setEditor] = useState<Item | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const exportingRef = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiSettingsRev, setAiSettingsRev] = useState(0);
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
    <PhotoLoaderContext.Provider value={wardrobe.photos}>
      <div className="app-shell">
        <Header
          count={items.length}
          dark={dark}
          onToggleDark={() => setDark(!dark)}
          onImport={() => setImportOpen(true)}
          onExport={() => setExportOpen(true)}
          onAdd={openNew}
          onSettings={() => setSettingsOpen(true)}
          onSignOut={onSignOut}
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
              resetKey={filterKey}
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
            ai={{
              settings: aiClient,
              tagger: aiTagger,
              settingsRev: aiSettingsRev,
              onOpenSettings: () => setSettingsOpen(true),
            }}
            onClose={() => setEditor(null)}
            onSave={save}
            onDelete={() => setConfirm(true)}
            onDuplicate={() => {
              setEditor({
                ...editor,
                id: "",
                name: `${editor.name} (bản sao)`,
                wearCount: 0,
                lastWorn: "",
                photo: "",
                photoPath: undefined,
                removedPhotoId: undefined,
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
            restoreBackup={wardrobe.restoreBackup}
            onRestored={() => notify(IMPORT_EXPORT_COPY.restored)}
          />
        )}
        {exportOpen && (
          <ExportModal
            onClose={() => setExportOpen(false)}
            busy={exportBusy}
            onExport={async (type) => {
              if (type === "csv") {
                download(items, type);
                notify(IMPORT_EXPORT_COPY.exported(type));
                return;
              }
              if (exportingRef.current) return;
              exportingRef.current = true;
              setExportBusy(true);
              try {
                downloadBackup(await wardrobe.exportBackup());
                notify(IMPORT_EXPORT_COPY.exported(type));
              } catch (e) {
                notify(wardrobe.message(e));
              } finally {
                exportingRef.current = false;
                setExportBusy(false);
              }
            }}
          />
        )}
        {settingsOpen && (
          <AiSettingsModal
            client={aiClient}
            onClose={() => {
              setSettingsOpen(false);
              setAiSettingsRev((r) => r + 1);
            }}
          />
        )}
        <Toast message={toast} />
      </div>
    </PhotoLoaderContext.Provider>
  );
}

export default App;
