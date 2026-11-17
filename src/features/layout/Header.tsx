import { Btn } from "@/components/Btn";
import { Icon } from "@/components/Icon";
import { LAYOUT_COPY } from "@/features/layout/copy";
import { SETTINGS_COPY } from "@/features/settings/copy";

export function Header({
  count,
  dark,
  onToggleDark,
  onImport,
  onExport,
  onAdd,
  onSettings,
  onSignOut,
}: {
  count: number;
  dark: boolean;
  onToggleDark: () => void;
  onImport: () => void;
  onExport: () => void;
  onAdd: () => void;
  onSettings?: () => void;
  onSignOut?: () => void;
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
            <Icon name="ai" />
          </button>
        )}
        {onSignOut && (
          <button className="icon-btn" onClick={onSignOut} aria-label={LAYOUT_COPY.signOut}>
            <Icon name="logout" />
          </button>
        )}
        <Btn className="desktop-btn" onClick={onImport}>
          <Icon name="import" /> Import
        </Btn>
        <Btn className="desktop-btn" onClick={onExport}>
          <Icon name="export" /> Export
        </Btn>
        <Btn kind="primary" onClick={onAdd} aria-label={LAYOUT_COPY.addItem}>
          <Icon name="plus" /> <span>{LAYOUT_COPY.addItem}</span>
        </Btn>
      </div>
    </header>
  );
}
