import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { IMPORT_EXPORT_COPY } from "@/features/import-export/copy";

const COPY = IMPORT_EXPORT_COPY.export;

export function ExportModal({
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
          <p className="eyebrow">{COPY.eyebrow}</p>
          <h2>{COPY.title}</h2>
        </div>
        <button className="icon-btn" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="export-content">
        <p>{COPY.hint}</p>
        <div className="export-options">
          <button onClick={() => onExport("json")}>
            <span className="file-icon">{"{ }"}</span>
            <div>
              <b>JSON</b>
              <small>{COPY.jsonHint}</small>
            </div>
            <Icon name="export" />
          </button>
          <button onClick={() => onExport("csv")}>
            <span className="file-icon">CSV</span>
            <div>
              <b>CSV</b>
              <small>{COPY.csvHint}</small>
            </div>
            <Icon name="export" />
          </button>
        </div>
        <div className="photo-note">
          <Icon name="image" />
          <span>{COPY.photoNote}</span>
        </div>
      </div>
    </Modal>
  );
}
