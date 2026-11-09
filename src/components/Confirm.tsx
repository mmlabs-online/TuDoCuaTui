import { Btn } from "@/components/Btn";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";

export function Confirm({
  onCancel,
  onConfirm,
  title = "Xoá món đồ này?",
  body = "Hành động này không thể hoàn tác. Mọi thông tin và lịch sử mặc sẽ bị xoá.",
  cancelLabel = "Giữ lại",
  confirmLabel = "Xoá món đồ",
  icon = "trash",
  kind = "danger-fill",
}: {
  onCancel: () => void;
  onConfirm: () => void;
  title?: string;
  body?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  icon?: string;
  kind?: string;
}) {
  return (
    <Modal onClose={onCancel}>
      <div className="confirm-content">
        <span className="danger-icon">
          <Icon name={icon} />
        </span>
        <h2>{title}</h2>
        <p>{body}</p>
        <div>
          <Btn onClick={onCancel}>{cancelLabel}</Btn>
          <Btn kind={kind} onClick={onConfirm}>
            {confirmLabel}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
