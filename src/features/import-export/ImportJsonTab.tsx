import { useRef } from "react";

import { Btn } from "@/components/Btn";
import { Icon } from "@/components/Icon";
import { summaryLines } from "@/data/backup";
import { toLocalDate } from "@/lib/dates";
import { IMPORT_EXPORT_COPY } from "@/features/import-export/copy";
import type { useJsonRestore } from "@/features/import-export/useJsonRestore";

const COPY = IMPORT_EXPORT_COPY.import;
const JSON_COPY = COPY.json;

const dmy = (iso: string) => toLocalDate(iso).split("-").reverse().join("/");

export function ImportJsonTab({ json }: { json: ReturnType<typeof useJsonRestore> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { file, text, phase, error, checked, summary } = json;
  const running = phase === "running";
  return (
    <>
      <div className="backup-note">
        <Icon name="export" />
        <div>
          <b>{JSON_COPY.title}</b>
          <p>{JSON_COPY.hint}</p>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const input = e.target;
          const f = input.files?.[0];
          input.value = "";
          if (f) await json.pickFile(f);
        }}
      />
      <Btn className="file-btn" onClick={() => fileRef.current?.click()} disabled={running}>
        <Icon name="upload" /> {JSON_COPY.pickFile}
      </Btn>
      {file ? (
        <div className="parse-summary">
          <Icon name="check" />
          <div>
            <b>{JSON_COPY.pickedFile(file.name, Math.ceil(file.size / 1024))}</b>
          </div>
          <Btn onClick={json.clearFile} disabled={running}>
            {JSON_COPY.clearFile}
          </Btn>
        </div>
      ) : (
        <>
          <div className="or">
            <span>{JSON_COPY.orPaste}</span>
          </div>
          <textarea
            className="paste-area json"
            value={text}
            onChange={(e) => json.setText(e.target.value)}
            placeholder={JSON_COPY.pastePlaceholder}
            disabled={running}
          />
        </>
      )}
      {error && (
        <p className="csv-error" role="alert">
          {error}
        </p>
      )}
      {checked && phase !== "done" && (
        <div className="parse-summary">
          <Icon name="check" />
          <div>
            <b>{JSON_COPY.fileFrom(dmy(checked.backup.exportedAt))}</b>
            <small>
              {JSON_COPY.counts(
                checked.counts.items,
                checked.counts.locations,
                checked.counts.wearLogs,
              )}
            </small>
            <small>{JSON_COPY.warning}</small>
            {checked.counts.withPhoto > 0 && (
              <small>{JSON_COPY.photoNote(checked.counts.withPhoto)}</small>
            )}
          </div>
        </div>
      )}
      {running && (
        <div className="progress">
          <div>
            <span>{JSON_COPY.running}</span>
          </div>
        </div>
      )}
      {phase === "done" && summary && (
        <div className="import-summary">
          <b>{JSON_COPY.summaryTitle}</b>
          {summaryLines(summary).map((l) => (
            <b key={l.key}>{JSON_COPY.summary[l.key as keyof typeof JSON_COPY.summary](l.n)}</b>
          ))}
        </div>
      )}
    </>
  );
}
