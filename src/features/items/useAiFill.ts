import { useEffect, useRef, useState } from "react";

import { AiSettingsError, type AiSettingsClient } from "@/data/aiSettings";
import type { AiTagger } from "@/data/aiTagging";
import { resizeImage, urlToBlob } from "@/data/photos";
import type { Item } from "@/types/item";
import {
  aiAvailability,
  fillEmpty,
  photoSourceFor,
  suggestionToFields,
  undoFill,
  type FillRecord,
} from "./aiFill";
import { useAiLoad } from "./useAiLoad";

export interface EditorAi {
  settings: Pick<AiSettingsClient, "get">;
  tagger: AiTagger;
  /** Bumped when the Settings modal closes: the saved provider / key may have changed. */
  settingsRev: number;
  onOpenSettings: () => void;
}

type Notice = { kind: "filled"; n: number } | { kind: "nothing" };
type Applied = FillRecord & { photo: string };

/** State and actions behind the editor's "Tự điền từ ảnh" block. */
export function useAiFill({
  ai,
  item,
  photoSrc,
  categoryFillable,
  update,
}: {
  ai?: EditorAi;
  item: Item;
  /** Where to read the photo bytes from, or null while unavailable. */
  photoSrc: string | null;
  categoryFillable: boolean;
  update: <K extends keyof Item>(k: K, v: Item[K]) => void;
}) {
  const settings = ai?.settings;
  const rev = ai?.settingsRev;
  const tagger = ai?.tagger;
  const { load, retry } = useAiLoad(settings, rev);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [error, setError] = useState<{ code: string; requestId?: string } | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);
  const busyRef = useRef(false);
  const ctlRef = useRef<AbortController | null>(null);
  const latest = useRef({ item, categoryFillable, update });
  useEffect(() => {
    latest.current = { item, categoryFillable, update };
  });

  useEffect(() => () => ctlRef.current?.abort(), []);

  const availability = aiAvailability(load, photoSrc !== null);

  const run = async () => {
    if (!tagger || busyRef.current || availability.kind !== "ready" || photoSrc === null) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    const photoAtStart = latest.current.item.photo;
    const ctl = new AbortController();
    ctlRef.current = ctl;
    try {
      let jpeg: Blob;
      try {
        jpeg = (await resizeImage(await urlToBlob(photoSrc))).blob;
      } catch {
        throw new AiSettingsError(0, "invalid_photo");
      }
      const suggestion = await tagger.tag(jpeg, ctl.signal);
      const now = latest.current;
      if (ctl.signal.aborted || now.item.photo !== photoAtStart) return;
      const record = fillEmpty(now.item, suggestionToFields(suggestion), {
        categoryFillable: now.categoryFillable,
      });
      const keys = Object.keys(record.patch) as (keyof Item)[];
      if (keys.length === 0) {
        setNotice({ kind: "nothing" });
        return;
      }
      for (const k of keys) now.update(k, record.patch[k as keyof typeof record.patch] as never);
      setApplied({ ...record, photo: photoAtStart });
      setNotice({ kind: "filled", n: keys.length });
    } catch (e) {
      if (ctl.signal.aborted) return;
      setError(
        e instanceof AiSettingsError
          ? { code: e.code, requestId: e.requestId }
          : { code: "internal" },
      );
    } finally {
      if (ctlRef.current === ctl) {
        ctlRef.current = null;
        busyRef.current = false;
        if (!ctl.signal.aborted) setBusy(false);
      }
    }
  };

  /** Drops the request in flight, if any (the photo it was started for changed or went away). */
  const cancel = () => {
    const c = ctlRef.current;
    if (!c) return;
    ctlRef.current = null;
    c.abort();
    busyRef.current = false;
    setBusy(false);
  };

  const record = applied && applied.photo === item.photo ? applied : null;
  const undo = () => {
    if (!record) return;
    const now = latest.current;
    const patch = undoFill(now.item, record);
    for (const k of Object.keys(patch) as (keyof typeof patch)[]) now.update(k, patch[k] as never);
    setApplied(null);
    setNotice(null);
  };

  return { availability, busy, notice, error, canUndo: record !== null, run, cancel, undo, retry };
}
