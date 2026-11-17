import { useEffect, useRef, useState } from "react";

import { restoreErrorMessage } from "@/data/apiErrors";
import {
  type Backup,
  type BackupCounts,
  precheckBackup,
  precheckBackupSize,
  type PrecheckError,
  type RestoreSummary,
} from "@/data/backup";
import { IMPORT_EXPORT_COPY } from "@/features/import-export/copy";

const COPY = IMPORT_EXPORT_COPY.import;
const PRE = COPY.json.precheck;

export type JsonPhase = "edit" | "confirm" | "running" | "done";
type Checked = { backup: Backup; counts: BackupCounts };
type PickedFile = { name: string; size: number; text: string };

const readFile = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });

const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));

export function precheckMessage(e: PrecheckError): string {
  switch (e.reason) {
    case "tooLarge":
      return PRE.tooLarge(mb(e.max));
    case "missingList":
      return PRE.missingList(e.field);
    case "tooMany":
      return PRE.tooMany(e.field, e.max);
    default:
      return PRE[e.reason];
  }
}

/** State of the JSON tab: input (paste or file) → pre-check → confirm → restore → summary. */
export function useJsonRestore(
  restoreBackup: (b: Backup) => Promise<RestoreSummary>,
  onRestored: (s: RestoreSummary) => void,
  onClose: () => void,
) {
  const [text, setTextState] = useState("");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [phase, setPhase] = useState<JsonPhase>("edit");
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [summary, setSummary] = useState<RestoreSummary | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reset = () => {
    setPhase("edit");
    setError(null);
    setChecked(null);
  };
  const setText = (v: string) => {
    setTextState(v);
    reset();
  };
  const clearFile = () => {
    setFile(null);
    reset();
  };
  const pickFile = async (f: File) => {
    reset();
    const size = precheckBackupSize(f.size);
    if (!size.ok) {
      setFile(null);
      setError(precheckMessage(size));
      return; // too large: never read
    }
    try {
      setFile({ name: f.name, size: f.size, text: await readFile(f) });
    } catch {
      setError(PRE.notJson);
    }
  };

  const check = () => {
    const r = precheckBackup(file?.text ?? text);
    if (!r.ok) {
      setError(precheckMessage(r));
      return;
    }
    setError(null);
    setChecked({ backup: r.backup, counts: r.counts });
    setPhase("confirm");
  };

  const run = async () => {
    if (!checked) return;
    setError(null);
    setPhase("running");
    try {
      const s = await restoreBackup(checked.backup);
      if (!mounted.current) return;
      setSummary(s);
      setPhase("done");
      onRestored(s);
    } catch (e) {
      if (!mounted.current) return;
      setError(restoreErrorMessage(e));
      setPhase("confirm");
    }
  };

  const hasInput = !!file || text.trim().length > 0;
  const primary =
    phase === "running"
      ? { label: COPY.processing, disabled: true, onClick: undefined }
      : phase === "done"
        ? { label: COPY.json.done, disabled: false, onClick: onClose }
        : phase === "confirm"
          ? { label: COPY.json.restore, disabled: false, onClick: run }
          : { label: COPY.checkAndImport, disabled: !hasInput, onClick: check };

  return { text, file, phase, error, checked, summary, setText, pickFile, clearFile, primary };
}
