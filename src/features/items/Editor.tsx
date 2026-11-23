import { useEffect, useRef, useState } from "react";

import type { Item, Status } from "@/types/item";
import { Btn } from "@/components/Btn";
import { Field } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { Confirm } from "@/components/Confirm";
import { Modal } from "@/components/Modal";
import { PhotoPrepError, preparePhoto } from "@/data/photoPrep";
import { usePhotoUrl } from "@/data/usePhotoUrl";
import { SETTINGS_COPY } from "@/features/settings/copy";
import { categoryNames, colorMap, colors, seasons, statuses } from "@/constants/wardrobe";
import { toDateOnly } from "@/features/import-export/csv/serialize";
import { aiErrorText, needsSettings, photoSourceFor } from "./aiFill";
import { blankItem } from "./blankItem";
import { EDITOR_COPY } from "./copy";
import { isDirty } from "./dirty";
import { ageInDays } from "./filters";
import { useAiFill, type EditorAi } from "./useAiFill";
import { hasErrors, NAME_MAX, validateItem, type ItemErrorCode } from "./validate";

export function Editor({
  item,
  locations,
  isNew,
  saving,
  update,
  onClose,
  onSave,
  onDelete,
  onDuplicate,
  onWorn,
  ai,
}: {
  item: Item;
  locations: string[];
  isNew: boolean;
  saving: boolean;
  update: <K extends keyof Item>(k: K, v: Item[K]) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onWorn: (n: number) => void;
  /** Without it the editor has no AI block. */
  ai?: EditorAi;
}) {
  const file = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [initial] = useState(item);
  const [showErrors, setShowErrors] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const today = toDateOnly(new Date().toISOString());
  const errors = validateItem(item, today);
  const msg = (code?: ItemErrorCode) => {
    if (!showErrors || !code) return undefined;
    const m = EDITOR_COPY.errors[code];
    return typeof m === "function" ? m(NAME_MAX) : m;
  };
  const handleSave = () => {
    if (hasErrors(errors)) {
      setShowErrors(true);
      return;
    }
    onSave();
  };
  const requestClose = () => (isDirty(initial, item) ? setDiscardOpen(true) : onClose());
  const toggle = (key: "colors" | "seasons", v: string) =>
    update(key, item[key].includes(v) ? item[key].filter((x) => x !== v) : [...item[key], v]);
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const stored = usePhotoUrl(item.photo, { lazy: false });
  const loadFailed = !!item.photo && (item.photo === brokenSrc || stored.failed);
  const ownUrl = useRef<string | null>(null);
  const pickSeq = useRef(0);
  const [preparing, setPreparing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const revokeOwn = () => {
    if (ownUrl.current) URL.revokeObjectURL(ownUrl.current);
    ownUrl.current = null;
  };
  const resetPhoto = () => {
    pickSeq.current++;
    setPreparing(false);
    setPhotoError(null);
    revokeOwn();
  };
  useEffect(
    () => () => {
      pickSeq.current++;
      revokeOwn();
    },
    [],
  );
  const [categoryTouched, setCategoryTouched] = useState(false);
  const fill = useAiFill({
    ai,
    item,
    photoSrc: loadFailed ? null : photoSourceFor(item.photo, stored.src),
    categoryFillable: isNew && !categoryTouched && item.category === blankItem().category,
    update,
  });
  const a = fill.availability;
  const aiCopy = EDITOR_COPY.ai;
  const settingsLink = (
    <button type="button" className="ai-fill-link" onClick={ai?.onOpenSettings}>
      {aiCopy.openSettings}
    </button>
  );
  const upload = async (f?: File) => {
    if (!f) return;
    const seq = ++pickSeq.current;
    setPhotoError(null);
    setPreparing(true);
    try {
      const { blob } = await preparePhoto(f);
      if (seq !== pickSeq.current) return;
      const url = URL.createObjectURL(blob);
      revokeOwn();
      ownUrl.current = url;
      fill.cancel();
      update("photo", url);
    } catch (e) {
      if (seq === pickSeq.current) {
        setPhotoError(
          e instanceof PhotoPrepError ? e.message : EDITOR_COPY.photo.errors.unreadable,
        );
      }
    } finally {
      if (seq === pickSeq.current) setPreparing(false);
    }
  };
  return (
    <>
      <Modal onClose={requestClose} wide>
        <div className="modal-header editor-header">
          <div>
            <p className="eyebrow">{isNew ? "THÊM VÀO BỘ SƯU TẬP" : "CHI TIẾT MÓN ĐỒ"}</p>
            <h2>{isNew ? "Món đồ mới" : item.name}</h2>
          </div>
          <button className="icon-btn" onClick={requestClose} aria-label={EDITOR_COPY.close}>
            <Icon name="close" />
          </button>
        </div>
        <div className="editor-body">
          <div className="photo-column">
            <button
              className={`upload-zone ${item.photo && !loadFailed ? "has-photo" : ""}`}
              onClick={() => file.current?.click()}
              onDrop={(e) => {
                e.preventDefault();
                void upload(e.dataTransfer.files[0]);
              }}
              onDragOver={(e) => e.preventDefault()}
            >
              {item.photo && !loadFailed && stored.src === null ? (
                <span className="photo-pending" aria-hidden />
              ) : item.photo && !loadFailed ? (
                <img
                  src={stored.src ?? undefined}
                  alt="Ảnh món đồ"
                  decoding="async"
                  onError={() => setBrokenSrc(item.photo)}
                />
              ) : loadFailed ? (
                <>
                  <span className="upload-icon">
                    <Icon name="image" size={25} />
                  </span>
                  <b>{EDITOR_COPY.photo.loadFailed}</b>
                  <small>{EDITOR_COPY.photo.loadFailedHint}</small>
                </>
              ) : (
                <>
                  <span className="upload-icon">
                    <Icon name="image" size={25} />
                  </span>
                  <b>Thêm ảnh món đồ</b>
                  <small>
                    Nhấp hoặc kéo ảnh vào đây
                    <br />
                    {EDITOR_COPY.photo.hint}
                  </small>
                </>
              )}
              {preparing ? (
                <span className="photo-busy" role="status">
                  {EDITOR_COPY.photo.preparing}
                </span>
              ) : (
                saving &&
                /^(blob|data):/.test(item.photo) && (
                  <span className="photo-busy" role="status">
                    {EDITOR_COPY.photo.uploading}
                  </span>
                )
              )}
            </button>
            {photoError && (
              <small className="photo-error" role="alert">
                {photoError}
              </small>
            )}
            <div className="photo-source-actions">
              <Btn type="button" onClick={() => camera.current?.click()}>
                {EDITOR_COPY.photo.takePhoto}
              </Btn>
              <Btn type="button" onClick={() => file.current?.click()}>
                {EDITOR_COPY.photo.pickFromLibrary}
              </Btn>
            </div>
            {ai && (
              <div className="ai-fill">
                <Btn
                  type="button"
                  className="ai-btn"
                  aria-busy={fill.busy}
                  disabled={a.kind !== "ready" || fill.busy}
                  onClick={fill.run}
                >
                  <Icon name="sparkle" /> {fill.busy ? aiCopy.busy : aiCopy.button}
                </Btn>
                {a.kind === "ready" && (
                  <small className="ai-fill-note">
                    {aiCopy.disclosure(SETTINGS_COPY.providerOptions[a.provider])}
                  </small>
                )}
                {a.kind === "no_photo" && <small className="ai-fill-note">{aiCopy.noPhoto}</small>}
                {a.kind === "no_key" && (
                  <small className="ai-fill-note">
                    {aiCopy.notConfigured} {settingsLink}
                  </small>
                )}
                {a.kind === "model_unsupported" && (
                  <small className="ai-fill-note">
                    {SETTINGS_COPY.unsupportedModel} {settingsLink}
                  </small>
                )}
                {a.kind === "misconfigured" && (
                  <small className="ai-fill-note">{aiErrorText("server_misconfigured")}</small>
                )}
                {a.kind === "load_error" && (
                  <small className="ai-fill-note">
                    {aiCopy.loadFailed}{" "}
                    <button type="button" className="ai-fill-link" onClick={fill.retry}>
                      {aiCopy.retry}
                    </button>
                  </small>
                )}
                {fill.error && (
                  <small role="alert" className="ai-fill-error">
                    {aiErrorText(fill.error.code, fill.error.requestId)}{" "}
                    {needsSettings(fill.error.code) && settingsLink}
                  </small>
                )}
                {fill.notice && (
                  <small role="status" className="ai-fill-note">
                    {fill.notice.kind === "filled" ? aiCopy.filled(fill.notice.n) : aiCopy.nothing}
                    {fill.canUndo && (
                      <>
                        {" "}
                        <button type="button" className="ai-fill-link" onClick={fill.undo}>
                          {aiCopy.undo}
                        </button>
                      </>
                    )}
                  </small>
                )}
              </div>
            )}
            <div className="photo-caption">
              <div>
                <small>MÓN ĐỒ CỦA BẠN</small>
                <b>{item.name || "Chưa đặt tên"}</b>
              </div>
              <span>↗</span>
            </div>
            <input
              ref={file}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={camera}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {(item.photo || item.photoPath) && (
              <button
                className="remove-photo"
                onClick={() => {
                  resetPhoto();
                  fill.cancel();
                  update("photo", "");
                  update("removedPhotoId", item.photoPath ?? item.removedPhotoId);
                  update("photoPath", undefined);
                }}
              >
                Bỏ ảnh
              </button>
            )}
          </div>
          <div className="form-column">
            {!isNew && (
              <div className="wear-bar">
                <div>
                  <span>
                    <Icon name="shirt" />
                  </span>
                  <div>
                    <b>Đã mặc {item.wearCount} lần</b>
                    <small>
                      {item.lastWorn
                        ? `Lần cuối ${ageInDays(item.lastWorn)} ngày trước`
                        : "Chưa có lịch sử"}
                    </small>
                  </div>
                </div>
                <div>
                  <Btn disabled={item.wearCount <= 0} onClick={() => onWorn(-1)}>
                    −1
                  </Btn>
                  <Btn kind="primary" onClick={() => onWorn(1)}>
                    <Icon name="shirt" /> Mặc hôm nay
                  </Btn>
                </div>
              </div>
            )}
            <h3 className="form-section-title">
              Thông tin <em>món đồ</em>
            </h3>
            <div className="form-grid">
              <Field label="Tên món đồ" wide error={msg(errors.name)}>
                <input
                  autoFocus
                  value={item.name}
                  aria-invalid={!!msg(errors.name)}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Ví dụ: Áo sơ mi linen trắng"
                />
              </Field>
              <Field label="Loại">
                <select
                  value={item.category}
                  onChange={(e) => {
                    setCategoryTouched(true);
                    update("category", e.target.value);
                  }}
                >
                  {categoryNames.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="Trạng thái">
                <select
                  value={item.status}
                  onChange={(e) => update("status", e.target.value as Status)}
                >
                  {statuses.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="Hãng">
                <input
                  value={item.brand}
                  onChange={(e) => update("brand", e.target.value)}
                  placeholder="Uniqlo, Zara…"
                />
              </Field>
              <Field label="Size">
                <input
                  value={item.size}
                  onChange={(e) => update("size", e.target.value)}
                  placeholder="S, M, 38…"
                />
              </Field>
              <Field label="Vị trí lưu trữ" wide>
                <input
                  list="locations"
                  value={item.location}
                  onChange={(e) => update("location", e.target.value)}
                  placeholder="Chọn hoặc nhập vị trí"
                />
                <datalist id="locations">
                  {locations.map((x) => (
                    <option key={x} value={x} />
                  ))}
                </datalist>
              </Field>
              <Field label="Giá mua (₫)" error={msg(errors.price)}>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  aria-invalid={!!msg(errors.price)}
                  value={item.price || ""}
                  onChange={(e) => update("price", +e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="Ngày mua" error={msg(errors.purchaseDate)}>
                <input
                  type="date"
                  max={today}
                  aria-invalid={!!msg(errors.purchaseDate)}
                  value={item.purchaseDate}
                  onChange={(e) => update("purchaseDate", e.target.value)}
                />
              </Field>
              <Field label="Chất liệu" wide>
                <input
                  value={item.material}
                  onChange={(e) => update("material", e.target.value)}
                  placeholder="Cotton, linen, denim…"
                />
              </Field>
              <Field label="Màu sắc" wide>
                <div className="choice-chips colors">
                  {colors.map((c) => (
                    <button
                      type="button"
                      key={c}
                      className={item.colors.includes(c) ? "selected" : ""}
                      onClick={() => toggle("colors", c)}
                    >
                      <i style={{ background: colorMap[c] }} />
                      {c}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Mùa" wide>
                <div className="choice-chips">
                  {seasons.map((s) => (
                    <button
                      type="button"
                      key={s}
                      className={item.seasons.includes(s) ? "selected" : ""}
                      onClick={() => toggle("seasons", s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Dịp / tag" wide>
                <input
                  value={item.tags.join(", ")}
                  onChange={(e) =>
                    update(
                      "tags",
                      e.target.value
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="đi làm, đi chơi, dự tiệc…"
                />
              </Field>
              <Field label="Ghi chú" wide>
                <textarea
                  value={item.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  placeholder="Cách bảo quản, phối cùng…"
                />
              </Field>
            </div>
          </div>
        </div>
        <div className="modal-footer editor-footer">
          {!isNew ? (
            <div>
              <Btn kind="danger" onClick={onDelete}>
                <Icon name="trash" /> Xoá
              </Btn>
              <Btn
                className="editor-duplicate"
                aria-label={EDITOR_COPY.duplicate}
                onClick={() => {
                  resetPhoto();
                  onDuplicate();
                }}
              >
                <Icon name="copy" /> <span className="btn-label">{EDITOR_COPY.duplicate}</span>
              </Btn>
            </div>
          ) : (
            <div />
          )}
          <div>
            <Btn className="editor-cancel" onClick={requestClose}>
              Huỷ
            </Btn>
            <Btn
              kind="primary"
              className="editor-save"
              disabled={saving || preparing}
              onClick={handleSave}
            >
              {saving ? EDITOR_COPY.saving : EDITOR_COPY.save}
            </Btn>
          </div>
        </div>
      </Modal>
      {discardOpen && (
        <Confirm
          title={EDITOR_COPY.discard.title}
          body={EDITOR_COPY.discard.body}
          cancelLabel={EDITOR_COPY.discard.cancel}
          confirmLabel={EDITOR_COPY.discard.confirm}
          onCancel={() => setDiscardOpen(false)}
          onConfirm={onClose}
        />
      )}
    </>
  );
}
