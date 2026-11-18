import { useRef, useState } from "react";

import { Btn } from "@/components/Btn";
import { Field } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { statuses } from "@/constants/wardrobe";
import { exceedsDailyLimit, PHOTO_DAILY_LIMIT } from "@/data/photoImport";
import { aiErrorText, needsSettings, type AiAvailability } from "@/features/items/aiFill";
import { EDITOR_COPY } from "@/features/items/copy";
import { SETTINGS_COPY } from "@/features/settings/copy";
import { AI_BATCH_OFF } from "@/data/photoImport";
import { formatWait, IMPORT_EXPORT_COPY } from "@/features/import-export/copy";
import type { PhotoImportState } from "@/features/import-export/usePhotoImport";
import type { Status } from "@/types/item";

const PHOTOS = IMPORT_EXPORT_COPY.import.photos;

export interface PhotosAi {
  availability: AiAvailability;
  onOpenSettings: () => void;
  retry: () => void;
}

export function ImportPhotosTab({
  photos,
  locations,
  ai,
}: {
  photos: PhotoImportState;
  locations: string[];
  /** Absent: the AI checkbox is not shown. */
  ai?: PhotosAi;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { jobs, phase, current, stopped, aiStopped } = photos;
  const AI = PHOTOS.ai;
  const a = ai?.availability;
  const settingsLink = (
    <button type="button" className="ai-fill-link" onClick={ai?.onOpenSettings}>
      {EDITOR_COPY.ai.openSettings}
    </button>
  );
  const aiFilled = jobs.filter((j) => j.ai === "filled").length;
  const aiSkipped = jobs.filter(
    (j) => j.ai === "skipped" && j.aiError && !AI_BATCH_OFF.has(j.aiError),
  );
  const editing = phase === "edit";
  const done = jobs.filter((j) => j.state === "done").length;
  const failed = jobs.filter((j) => j.state === "failed" || j.state === "photoFailed");
  const pending = jobs.filter((j) => j.state === "pending").length;
  const pct = current && current.n ? Math.round(((current.k - 1) / current.n) * 100) : 0;
  return (
    <>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/*,.heic,.heif"
        hidden
        onChange={(e) => {
          const input = e.target;
          photos.addFiles(Array.from(input.files ?? []));
          input.value = "";
        }}
      />
      {editing && (
        <>
          <div
            className={`bulk-drop${dragging ? " drag-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (editing) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              photos.addFiles(Array.from(e.dataTransfer.files));
            }}
          >
            <span>
              <Icon name="upload" size={25} />
            </span>
            <h3>{PHOTOS.dropTitle}</h3>
            <p>{PHOTOS.dropHint}</p>
            <Btn onClick={() => fileRef.current?.click()} disabled={!editing}>
              {PHOTOS.pickPhotos}
            </Btn>
          </div>
          <div className="two-cols photo-defaults">
            <Field label={PHOTOS.locationLabel}>
              <input
                list="photo-import-locations"
                value={photos.location}
                onChange={(e) => photos.setLocation(e.target.value)}
                placeholder={PHOTOS.locationPlaceholder}
                disabled={!editing}
              />
              <datalist id="photo-import-locations">
                {locations.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </Field>
            <Field label={PHOTOS.statusLabel}>
              <select
                value={photos.status}
                onChange={(e) => photos.setStatus(e.target.value as Status)}
                disabled={!editing}
              >
                {statuses.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
          </div>
          {ai && a && (
            <label className="check-row">
              <input
                type="checkbox"
                checked={photos.aiOn && a.kind === "ready"}
                disabled={a.kind !== "ready"}
                onChange={(e) => photos.setAiOn(e.target.checked)}
              />
              <span>
                <b>{AI.title}</b>
                <small>{AI.hint}</small>
                {a.kind === "ready" && (
                  <small>{AI.disclosure(SETTINGS_COPY.providerOptions[a.provider])}</small>
                )}
                {a.kind === "no_key" && (
                  <small>
                    {EDITOR_COPY.ai.notConfigured} {settingsLink}
                  </small>
                )}
                {a.kind === "model_unsupported" && (
                  <small>
                    {SETTINGS_COPY.unsupportedModel} {settingsLink}
                  </small>
                )}
                {a.kind === "misconfigured" && <small>{aiErrorText("server_misconfigured")}</small>}
                {a.kind === "load_error" && (
                  <small>
                    {EDITOR_COPY.ai.loadFailed}{" "}
                    <button type="button" className="ai-fill-link" onClick={ai.retry}>
                      {EDITOR_COPY.ai.retry}
                    </button>
                  </small>
                )}
              </span>
            </label>
          )}
        </>
      )}
      {phase === "running" && current && (
        <div className="progress">
          <div>
            <span>
              {current.tagging
                ? AI.tagging(current.k, current.n, current.name)
                : PHOTOS.running(current.k, current.n, current.name)}
            </span>
            <b>{pct}%</b>
          </div>
          <i>
            <span style={{ width: `${pct}%` }} />
          </i>
        </div>
      )}
      {(phase === "done" || phase === "stopped") && (
        <div className="import-summary">
          <b>{PHOTOS.summaryImported(done)}</b>
          <b>{PHOTOS.summaryFailed(failed.length)}</b>
          {pending > 0 && <b>{PHOTOS.summaryPending(pending)}</b>}
          {aiFilled > 0 && <b>{AI.summaryFilled(aiFilled)}</b>}
          {aiStopped && (
            <p className="csv-error">
              {aiStopped === "rate_limited"
                ? AI.stoppedRateLimited
                : AI.stoppedOther(aiErrorText(aiStopped))}{" "}
              {needsSettings(aiStopped) && ai && settingsLink}
            </p>
          )}
          {stopped && (
            <p className="csv-error">
              {stopped.code === "rate_limited"
                ? PHOTOS.stoppedRateLimited(done, formatWait(stopped.retryAfterSec ?? NaN))
                : PHOTOS.stoppedQuota(done)}
            </p>
          )}
          <ul>
            {aiSkipped.map((j) => (
              <li key={j.key} className="csv-error">
                {j.file.name}: {aiErrorText(j.aiError!)}
              </li>
            ))}
            {failed.map((j) => (
              <li key={j.key} className="csv-error">
                {j.file.name}: {(j.error as Error | undefined)?.message}
              </li>
            ))}
          </ul>
          {failed.length + pending > 0 && (
            <Btn onClick={() => void photos.run()}>{PHOTOS.retry(failed.length + pending)}</Btn>
          )}
        </div>
      )}
      {jobs.length > 0 && (
        <>
          <p className="csv-preview-title">{PHOTOS.fileCount(jobs.length)}</p>
          {exceedsDailyLimit(jobs.length) && (
            <p className="photo-warning">{PHOTOS.dailyWarning(PHOTO_DAILY_LIMIT)}</p>
          )}
          <ul className="csv-preview photo-files">
            {jobs.map((j) => (
              <li key={j.key}>
                <span>{j.file.name}</span>
                <b className={j.state === "done" ? "" : j.state === "pending" ? "" : "csv-error"}>
                  {PHOTOS.state[j.state]}
                  {j.ai && ` · ${AI.state[j.ai]}`}
                </b>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
