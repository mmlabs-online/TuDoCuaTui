import { Btn } from "@/components/Btn";
import { Field } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { statuses } from "@/constants/wardrobe";
import { IMPORT_EXPORT_COPY } from "@/features/import-export/copy";

const COPY = IMPORT_EXPORT_COPY.import;
const PHOTOS = COPY.photos;

export function ImportPhotosTab({
  processing,
  progress,
}: {
  processing: boolean;
  progress: number;
}) {
  return (
    <>
      <div className="bulk-drop">
        <span>
          <Icon name="upload" size={25} />
        </span>
        <h3>{PHOTOS.dropTitle}</h3>
        <p>{PHOTOS.dropHint}</p>
        <Btn>{PHOTOS.pickPhotos}</Btn>
      </div>
      <label className="check-row">
        <input type="checkbox" defaultChecked />
        <span>
          <Icon name="sparkle" size={16} />
        </span>
        <div>
          <b>{PHOTOS.aiTitle}</b>
          <small>{PHOTOS.aiHint}</small>
        </div>
      </label>
      <div className="two-cols">
        <Field label={PHOTOS.locationLabel}>
          <input placeholder={PHOTOS.locationPlaceholder} />
        </Field>
        <Field label={PHOTOS.statusLabel}>
          <select>
            <option>{PHOTOS.defaultStatus}</option>
            {statuses.slice(1).map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
      </div>
      {processing && (
        <div className="progress">
          <div>
            <span>{COPY.processingFile(progress)}</span>
            <b>{progress * 25}%</b>
          </div>
          <i>
            <span style={{ width: `${progress * 25}%` }} />
          </i>
        </div>
      )}
    </>
  );
}
