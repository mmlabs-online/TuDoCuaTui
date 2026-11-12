import { useRef, useState } from "react";

import type { Item, Status } from "@/types/item";
import { Btn } from "@/components/Btn";
import { Field } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { Confirm } from "@/components/Confirm";
import { Modal } from "@/components/Modal";
import { categoryNames, colorMap, colors, seasons, statuses } from "@/constants/wardrobe";
import { toDateOnly } from "@/features/import-export/csv/serialize";
import { EDITOR_COPY } from "./copy";
import { isDirty } from "./dirty";
import { ageInDays } from "./filters";
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
  showMockAi,
  photoById = false,
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
  showMockAi: boolean;
  /** API mode: a stored photo is known only by its id (`photoPath`) and is not displayed yet. */
  photoById?: boolean;
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
  const storedOnly = photoById && !item.photo && !!item.photoPath && !isNew;
  const upload = (f?: File) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => update("photo", String(r.result));
    r.readAsDataURL(f);
  };
  return (
    <>
      <Modal onClose={requestClose} wide>
        <div className="modal-header editor-header">
          <div>
            <p className="eyebrow">{isNew ? "THÊM VÀO BỘ SƯU TẬP" : "CHI TIẾT MÓN ĐỒ"}</p>
            <h2>{isNew ? "Món đồ mới" : item.name}</h2>
          </div>
          <button className="icon-btn" onClick={requestClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="editor-body">
          <div className="photo-column">
            <button
              className={`upload-zone ${item.photo ? "has-photo" : ""}`}
              onClick={() => file.current?.click()}
              onDrop={(e) => {
                e.preventDefault();
                upload(e.dataTransfer.files[0]);
              }}
              onDragOver={(e) => e.preventDefault()}
            >
              {item.photo ? (
                <img src={item.photo} alt="Ảnh món đồ" />
              ) : storedOnly ? (
                <>
                  <span className="upload-icon">
                    <Icon name="image" size={25} />
                  </span>
                  <b>{EDITOR_COPY.photo.stored}</b>
                  <small>{EDITOR_COPY.photo.storedHint}</small>
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
                    JPG, PNG · tối đa 10MB
                  </small>
                </>
              )}
            </button>
            <div className="photo-source-actions">
              <Btn type="button" onClick={() => camera.current?.click()}>
                {EDITOR_COPY.photo.takePhoto}
              </Btn>
              <Btn type="button" onClick={() => file.current?.click()}>
                {EDITOR_COPY.photo.pickFromLibrary}
              </Btn>
            </div>
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
              onChange={(e) => upload(e.target.files?.[0])}
            />
            <input
              ref={camera}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => upload(e.target.files?.[0])}
            />
            {showMockAi && (
              <Btn
                className="ai-btn"
                onClick={() => {
                  update("name", item.name || "Áo sơ mi dáng rộng");
                  update("category", "Áo");
                  update("colors", ["Kem"]);
                  update("seasons", ["Xuân", "Hạ"]);
                  update("tags", ["đi làm", "tối giản"]);
                }}
              >
                <Icon name="sparkle" /> Tự điền từ ảnh
              </Btn>
            )}
            {(item.photo || (photoById && item.photoPath)) && (
              <button
                className="remove-photo"
                onClick={() => {
                  update("photo", "");
                  if (photoById) update("photoPath", undefined);
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
                  <Btn onClick={() => onWorn(-1)}>−1</Btn>
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
                <select value={item.category} onChange={(e) => update("category", e.target.value)}>
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
        <div className="modal-footer">
          {!isNew ? (
            <div>
              <Btn kind="danger" onClick={onDelete}>
                <Icon name="trash" /> Xoá
              </Btn>
              <Btn onClick={onDuplicate}>
                <Icon name="copy" /> Nhân bản
              </Btn>
            </div>
          ) : (
            <div />
          )}
          <div>
            <Btn onClick={requestClose}>Huỷ</Btn>
            <Btn kind="primary" disabled={saving} onClick={handleSave}>
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
