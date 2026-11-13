import { Btn } from "@/components/Btn";
import { Icon } from "@/components/Icon";
import { SETTINGS_COPY } from "@/features/settings/copy";

export function Header({
  count,
  dark,
  onToggleDark,
  onImport,
  onExport,
  onAdd,
  onSettings,
}: {
  count: number;
  dark: boolean;
  onToggleDark: () => void;
  onImport: () => void;
  onExport: () => void;
  onAdd: () => void;
  onSettings?: () => void;
}) {
  return (
    <header className="topbar">
      <div className="brandmark">
        <span className="brand-icon">
          <Icon name="shirt" size={21} />
        </span>
        <div>
          <b>Tủ đồ</b>
          <span>{count} món</span>
        </div>
      </div>
      <div className="header-actions">
        <button className="icon-btn" onClick={onToggleDark} aria-label="Đổi giao diện">
          <Icon name={dark ? "sun" : "moon"} />
        </button>
        {onSettings && (
          <button className="icon-btn" onClick={onSettings} aria-label={SETTINGS_COPY.open}>
            <Icon name="settings" />
          </button>
        )}
        <Btn className="desktop-btn" onClick={onImport}>
          <Icon name="import" /> Import
        </Btn>
        <Btn className="desktop-btn" onClick={onExport}>
          <Icon name="export" /> Export
        </Btn>
        <Btn kind="primary" onClick={onAdd}>
          <Icon name="plus" /> <span>Thêm món đồ</span>
        </Btn>
      </div>
    </header>
  );
}
