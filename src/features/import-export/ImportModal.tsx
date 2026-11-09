import { useState } from "react";

import type { Item } from "@/types/item";
import { Btn } from "@/components/Btn";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { starter } from "@/data/demo";
import { IMPORT_EXPORT_COPY } from "@/features/import-export/copy";
import { ImportCsvTab } from "@/features/import-export/ImportCsvTab";
import { ImportJsonTab } from "@/features/import-export/ImportJsonTab";
import { ImportPhotosTab } from "@/features/import-export/ImportPhotosTab";

const COPY = IMPORT_EXPORT_COPY.import;

export function ImportModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (x: Item[]) => void;
}) {
  const [tab, setTab] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [paste, setPaste] = useState("");
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
          <button className={tab === i ? "active" : ""} onClick={() => setTab(i)} key={x}>
            {x}
          </button>
        ))}
      </div>
      <div className="import-content">
        {tab === 0 && <ImportPhotosTab processing={processing} progress={progress} />}
        {tab === 1 && <ImportCsvTab paste={paste} onPaste={setPaste} />}
        {tab === 2 && <ImportJsonTab />}
      </div>
      <div className="modal-footer">
        <div />
        <div>
          <Btn onClick={onClose}>{COPY.cancel}</Btn>
          <Btn kind="primary" onClick={doImport} disabled={processing}>
            {processing ? COPY.processing : tab === 0 ? COPY.startImport : COPY.checkAndImport}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
