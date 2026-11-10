import { useEffect, useMemo, useRef, useState } from "react";

import { Btn } from "@/components/Btn";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import type { ImportResult } from "@/data/useWardrobe";
import type { Item } from "@/types/item";
import { IMPORT_EXPORT_COPY } from "@/features/import-export/copy";
import { buildCsvPreview } from "@/features/import-export/csv/preview";
import { type CsvPhase, ImportCsvTab } from "@/features/import-export/ImportCsvTab";
import { ImportJsonTab } from "@/features/import-export/ImportJsonTab";
import { ImportPhotosTab } from "@/features/import-export/ImportPhotosTab";

const COPY = IMPORT_EXPORT_COPY.import;

export function ImportModal({
  onClose,
  locations,
  importMany,
  onImported,
  showMockAi,
}: {
  onClose: () => void;
  locations: string[];
  importMany: (
    list: Item[],
    opts: { onProgress: (done: number, total: number) => void; signal: AbortSignal },
  ) => Promise<ImportResult[]>;
  onImported: (count: number) => void;
  showMockAi: boolean;
}) {
  const [tab, setTab] = useState(0);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<CsvPhase>("edit");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<ImportResult[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const preview = useMemo(() => buildCsvPreview(text, { locations }), [text, locations]);

  // Closing the modal (any route ends in unmount) stops the import after the current row.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const start = async () => {
    if (preview.kind !== "ready") return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setProgress({ done: 0, total: preview.items.length });
    setPhase("running");
    const out = await importMany(preview.items, {
      onProgress: (done, total) => setProgress({ done, total }),
      signal: controller.signal,
    });
    setResults(out);
    setPhase("done");
    const ok = out.filter((r) => r.ok).length;
    if (ok > 0) onImported(ok);
  };

  const csvReady = preview.kind === "ready" && preview.items.length > 0;
  const primary =
    tab !== 1
      ? {
          label: tab === 0 ? COPY.startImport : COPY.checkAndImport,
          disabled: true,
          onClick: undefined,
        }
      : phase === "running"
        ? { label: COPY.processing, disabled: true, onClick: undefined }
        : phase === "done"
          ? { label: COPY.csv.done, disabled: false, onClick: onClose }
          : {
              label: COPY.csv.importN(preview.kind === "ready" ? preview.items.length : 0),
              disabled: !csvReady,
              onClick: start,
            };

  return (
    <Modal onClose={onClose}>
      <div className="modal-header import-header">
        <div>
          <p className="eyebrow">{COPY.eyebrow}</p>
          <h2>
            {COPY.titleBefore} <em>{COPY.titleEm}</em>
          </h2>
        </div>
        <span className="modal-doodle">✦</span>
        <button className="icon-btn" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="tabs">
        {COPY.tabs.map((x, i) => (
          <button
            className={tab === i ? "active" : ""}
            onClick={() => setTab(i)}
            disabled={phase === "running"}
            key={x}
          >
            {x}
          </button>
        ))}
      </div>
      <div className="import-content">
        {tab === 0 && <ImportPhotosTab showMockAi={showMockAi} />}
        {tab === 1 && (
          <ImportCsvTab
            text={text}
            onText={setText}
            preview={preview}
            phase={phase}
            progress={progress}
            results={results}
          />
        )}
        {tab === 2 && <ImportJsonTab />}
      </div>
      <div className="modal-footer">
        <div />
        <div>
          <Btn onClick={onClose}>{COPY.cancel}</Btn>
          <Btn kind="primary" onClick={primary.onClick} disabled={primary.disabled}>
            {primary.label}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
