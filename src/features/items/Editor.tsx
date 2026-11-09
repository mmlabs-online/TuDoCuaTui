import { useRef } from "react";

import type { Item, Status } from "@/types/item";
import { Btn } from "@/components/Btn";
import { Field } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { categoryNames, colorMap, colors, seasons, statuses } from "@/constants/wardrobe";

export function Editor({
  item,
  locations,
  isNew,
  update,
  onClose,
  onSave,
  onDelete,
  onDuplicate,
  onWorn,
}: {
  item: Item;
  locations: string[];
  isNew: boolean;
  update: <K extends keyof Item>(k: K, v: Item[K]) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onWorn: (n: number) => void;
}) {
  const file = useRef<HTMLInputElement>(null);
  const toggle = (key: "colors" | "seasons", v: string) =>
    update(key, item[key].includes(v) ? item[key].filter((x) => x !== v) : [...item[key], v]);
  const upload = (f?: File) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => update("photo", String(r.result));
    r.readAsDataURL(f);
  };
  return (
    <Modal onClose={onClose} wide>
      <div className="modal-header editor-header">
        <div>
          <p className="eyebrow">{isNew ? "THÊM VÀO BỘ SƯU TẬP" : "CHI TIẾT MÓN ĐỒ"}</p>
          <h2>{isNew ? "Món đồ mới" : item.name}</h2>
        </div>
        <button className="icon-btn" onClick={onClose}>
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
          {item.photo && (
            <button className="remove-photo" onClick={() => update("photo", "")}>
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
                      ? `Lần cuối ${Math.floor((Date.now() - +new Date(item.lastWorn)) / 86400000)} ngày trước`
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
            <Field label="Tên món đồ" wide>
              <input
                autoFocus
                value={item.name}
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
            <Field label="Giá mua (₫)">
              <input
                type="number"
                value={item.price || ""}
                onChange={(e) => update("price", +e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Ngày mua">
              <input
                type="date"
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
          <Btn onClick={onClose}>Huỷ</Btn>
          <Btn kind="primary" onClick={onSave}>
            Lưu món đồ
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
