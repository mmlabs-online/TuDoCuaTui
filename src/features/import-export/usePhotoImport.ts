import { useEffect, useRef, useState } from "react";

import {
  itemNameFromFile,
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
    k: number;
    n: number;
    name: string;
    tagging: boolean;
  } | null>(null);
  const [aiOn, setAiOn] = useState(false);
  const [aiStopped, setAiStopped] = useState<string | null>(null);
  const [stopped, setStopped] = useState<PhotoStop | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  // Closing the modal (any route ends in unmount) stops the batch after the current file.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const addFiles = (files: Iterable<File>) => {
    if (phase !== "edit") return;
    const added = [...files].filter(isPhotoFile).map<PhotoJob>((file) => ({
      key: crypto.randomUUID(),
      file,
      name: itemNameFromFile(file.name),
      itemId: crypto.randomUUID(),
      state: "pending",
    }));
    if (added.length) setJobs((p) => [...p, ...added]);
  };

  /** First run and retry are the same call: files already done are skipped. */
  const run = async () => {
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
      onUpdate: setJobs,
      onCurrent: (i) =>
        setCurrent({ k: todo.indexOf(i) + 1, n: todo.length, name: jobs[i].name, tagging: false }),
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
    aiOn,
    setAiOn,
    aiStopped,
    run,
  };
}

export type PhotoImportState = ReturnType<typeof usePhotoImport>;
