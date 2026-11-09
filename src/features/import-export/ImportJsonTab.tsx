import { Btn } from "@/components/Btn";
import { Icon } from "@/components/Icon";
import { IMPORT_EXPORT_COPY } from "@/features/import-export/copy";

const JSON_COPY = IMPORT_EXPORT_COPY.import.json;

export function ImportJsonTab() {
  return (
    <>
      <div className="backup-note">
        <Icon name="export" />
        <div>
          <b>{JSON_COPY.title}</b>
          <p>{JSON_COPY.hint}</p>
        </div>
      </div>
      <Btn className="file-btn">
        <Icon name="upload" /> {JSON_COPY.pickFile}
      </Btn>
      <div className="or">
        <span>{JSON_COPY.orPaste}</span>
      </div>
      <textarea className="paste-area json" placeholder={JSON_COPY.pastePlaceholder} />
    </>
  );
}
