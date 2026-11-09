import { useRef } from "react";

import { Btn } from "@/components/Btn";
import { Icon } from "@/components/Icon";
import type { ImportResult } from "@/data/useWardrobe";
import { IMPORT_EXPORT_COPY } from "@/features/import-export/copy";
import type { CsvPreview } from "@/features/import-export/csv/preview";
import { CSV_TEMPLATE } from "@/features/import-export/csv/template";

const COPY = IMPORT_EXPORT_COPY.import;
const CSV = COPY.csv;

export type CsvPhase = "edit" | "running" | "done";

const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });

export function ImportCsvTab({
  text,
  onText,
  preview,
  phase,
  progress,
  results,
}: {
  text: string;
  onText: (v: string) => void;
  preview: CsvPreview;
  phase: CsvPhase;
  progress: { done: number; total: number };
  results: ImportResult[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const failed = results.filter((r) => !r.ok);
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
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={async (e) => {
          const input = e.target;
          const file = input.files?.[0];
          if (file) onText(await readFile(file));
          input.value = "";
        }}
      />
      <Btn className="file-btn" onClick={() => fileRef.current?.click()}>
        <Icon name="upload" /> {CSV.pickFile}
      </Btn>
      <div className="or">
        <span>{CSV.orPaste}</span>
      </div>
      <textarea
        className="paste-area"
        value={text}
        onChange={(e) => onText(e.target.value)}
        placeholder={CSV.pastePlaceholder}
        disabled={phase === "running"}
      />
      {preview.kind === "parseError" && <p className="csv-error">{CSV.parseError(preview.line)}</p>}
      {preview.kind === "ready" && (
        <>
          <div className="parse-summary">
            <Icon name="check" />
            <div>
              <b>{CSV.willImport(preview.items.length)}</b>
              {preview.skipped > 0 && (
                <small className="csv-error">{CSV.willSkip(preview.skipped)}</small>
              )}
              {preview.ignoredColumns.length > 0 && (
                <small>{CSV.ignoredColumns(preview.ignoredColumns)}</small>
              )}
              <small>{CSV.columnsHint}</small>
            </div>
          </div>
          {preview.rows.length === 0 ? (
            <p className="coming-soon">{CSV.noRows}</p>
          ) : (
            <>
              <p className="csv-preview-title">
                {CSV.previewTitle(preview.rows.length, preview.total)}
              </p>
              <ul className="csv-preview">
                {preview.rows.map((r) => (
                  <li key={r.row}>
                    <b>{CSV.rowLabel(r.row + 1)}</b>{" "}
                    {r.item ? (
                      <span>
                        {[r.item.name, r.item.category, r.item.location]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : (
                      <span className="csv-error">{r.errors.join("; ")}</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {phase === "running" && (
        <div className="progress">
          <div>
            <span>{CSV.running(progress.done, progress.total)}</span>
            <b>{pct}%</b>
          </div>
          <i>
            <span style={{ width: `${pct}%` }} />
          </i>
        </div>
      )}
      {phase === "done" && preview.kind === "ready" && (
        <div className="import-summary">
          <b>{CSV.summaryImported(results.length - failed.length)}</b>
          <b>{CSV.summarySkipped(preview.skipped)}</b>
          <b>{CSV.summaryFailed(failed.length)}</b>
          <ul>
            {failed.map((r) => (
              <li key={r.index} className="csv-error">
                {CSV.rowLabel(preview.itemRows[r.index] + 1)}: {r.ok ? "" : r.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
