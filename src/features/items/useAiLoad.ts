import { useEffect, useState } from "react";

import { AiSettingsError, type AiSettingsClient } from "@/data/aiSettings";
import type { AiLoad } from "./aiFill";

/** Loads the user's AI settings; reloads when `rev` changes (Settings closed) or on `retry`. */
export function useAiLoad(
  settings: Pick<AiSettingsClient, "get"> | undefined,
  rev: number | undefined,
) {
  const [load, setLoad] = useState<AiLoad>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!settings) return;
    let live = true;
    settings.get().then(
      (view) => live && setLoad({ state: "loaded", view }),
      (e) =>
        live &&
        setLoad({ state: "error", code: e instanceof AiSettingsError ? e.code : "internal" }),
    );
    return () => {
      live = false;
    };
  }, [settings, rev, attempt]);

  const retry = () => {
    setLoad({ state: "loading" });
    setAttempt((a) => a + 1);
  };
  return { load, retry };
}
