import { Btn } from "@/components/Btn";
import { Icon } from "@/components/Icon";
import { IMPORT_EXPORT_COPY } from "@/features/import-export/copy";
import { CSV_TEMPLATE } from "@/features/import-export/csv/template";

const COPY = IMPORT_EXPORT_COPY.import;
const CSV = COPY.csv;

export function ImportCsvTab({ paste, onPaste }: { paste: string; onPaste: (v: string) => void }) {
  return (
    <>
      <div className="instructions">
        <b>{CSV.title}</b>
        <p>{CSV.hint}</p>
      </div>
      <div className="code-head">
        <span>{CSV.sample}</span>
        <button onClick={() => navigator.clipboard.writeText(CSV_TEMPLATE)}>
          <Icon name="copy" size={15} /> {CSV.copySample}
        </button>
      </div>
      <pre>{CSV_TEMPLATE}</pre>
      <Btn className="file-btn">
        <Icon name="upload" /> {CSV.pickFile}
      </Btn>
      <div className="or">
        <span>{CSV.orPaste}</span>
      </div>
      <textarea
        className="paste-area"
        value={paste}
        onChange={(e) => onPaste(e.target.value)}
        placeholder={CSV.pastePlaceholder}
      />
      {paste && (
        <div className="parse-summary">
          <Icon name="check" />
          <div>
            <b>{COPY.parsedCount(Math.max(1, paste.split("\n").length - 1))}</b>
            <small>{CSV.columnsHint}</small>
          </div>
        </div>
      )}
    </>
  );
}
