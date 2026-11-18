import { useEffect, useRef, useState } from "react";

import {
  isPhotoQuotaStop,
  itemNameFromFile,
  newPhotoFiles,
  type PhotoImportOptions,
  type PhotoJob,
  type PhotoStop,
} from "@/data/photoImport";
import type { AiTagger } from "@/data/aiTagging";
import type { Status } from "@/types/item";

export type PhotoPhase = "edit" | "running" | "done" | "stopped";
export type ImportPhotosFn = (
  jobs: PhotoJob[],
  opts: PhotoImportOptions,
) => Promise<{ jobs: PhotoJob[]; stopped?: PhotoStop; aiStopped?: string }>;

const HEIC_EXT = /\.hei[cf]$/i;
const isPhotoFile = (f: File) => f.type.startsWith("image/") || HEIC_EXT.test(f.name);

/** State of the bulk photo import: picked files, batch defaults, progress and the last stop. */
export function usePhotoImport({
  importPhotos,
  onImported,
  tagger,
}: {
  importPhotos: ImportPhotosFn;
  /** Non-null only when AI is ready (key saved, model supported). */
  tagger?: AiTagger | null;
  onImported: (count: number) => void;
}) {
  const [jobs, setJobs] = useState<PhotoJob[]>([]);
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<Status>("Đang dùng");
  const [phase, setPhase] = useState<PhotoPhase>("edit");
  const [current, setCurrent] = useState<{
    index: number;
    k: number;
    n: number;
    name: string;
    tagging: boolean;
  } | null>(null);
  const [aiOn, setAiOn] = useState(false);
  const [aiStopped, setAiStopped] = useState<string | null>(null);
  const [stopped, setStopped] = useState<PhotoStop | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const quotaHitRef = useRef(false);
  // After a 429 stop "Thử lại" waits until Retry-After has passed.
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now);
  const cooldownSec = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0;

  useEffect(() => {
    if (retryAt === null) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= retryAt) setRetryAt(null);
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);

  // Closing the modal (any route ends in unmount) stops the batch after the current file.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const addFiles = (files: Iterable<File>) => {
    if (phase !== "edit") return;
    const photos = [...files].filter(isPhotoFile);
    if (!photos.length) return;
    setJobs((p) => [
      ...p,
      ...newPhotoFiles(p, photos).map<PhotoJob>((file) => ({
        key: crypto.randomUUID(),
        file,
        name: itemNameFromFile(file.name),
        itemId: crypto.randomUUID(),
        state: "pending",
      })),
    ]);
  };

  /** First run and retry are the same call: files already done are skipped. */
  const run = async () => {
    if (cooldownSec > 0) return;
    const todo = jobs.flatMap((j, i) => (j.state === "done" ? [] : [i]));
    if (!todo.length) return;
    const before = jobs.length - todo.length;
    const controller = new AbortController();
    controllerRef.current = controller;
    setStopped(null);
    setAiStopped(null);
    setPhase("running");
    const out = await importPhotos(jobs, {
      defaults: { location, status },
      signal: controller.signal,
      photoQuotaHit: quotaHitRef.current,
      onUpdate: setJobs,
      onCurrent: (i) =>
        setCurrent({
          index: i,
          k: todo.indexOf(i) + 1,
          n: todo.length,
          name: jobs[i].name,
          tagging: false,
        }),
      ...(aiOn &&
        tagger && {
          tag: (jpeg: Blob, signal?: AbortSignal) => tagger.tag(jpeg, signal),
          onTagging: (_i: number, on: boolean) =>
            setCurrent((c) => (c ? { ...c, tagging: on } : c)),
        }),
    });
    setJobs(out.jobs);
    setCurrent(null);
    setStopped(out.stopped ?? null);
    setAiStopped(out.aiStopped ?? null);
    setPhase(out.stopped ? "stopped" : "done");
    const added = out.jobs.filter((j) => j.state === "done").length - before;
    quotaHitRef.current = isPhotoQuotaStop(out.stopped) || (quotaHitRef.current && added <= 0);
    const t = Date.now();
    setNow(t);
    setRetryAt(
      out.stopped?.code === "rate_limited" && out.stopped.retryAfterSec
        ? t + out.stopped.retryAfterSec * 1000
        : null,
    );
    if (added > 0) onImported(added);
  };

  return {
    jobs,
    addFiles,
    location,
    setLocation,
    status,
    setStatus,
    phase,
    current,
    stopped,
    cooldownSec,
    aiOn,
    setAiOn,
    aiStopped,
    run,
  };
}

export type PhotoImportState = ReturnType<typeof usePhotoImport>;
