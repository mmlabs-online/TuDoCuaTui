import { Btn } from "@/components/Btn";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/Modal";

export function Confirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal onClose={onCancel}>
      <div className="confirm-content">
        <span className="danger-icon">
          <Icon name="trash" />
        </span>
        <h2>Xoá món đồ này?</h2>
        <p>Hành động này không thể hoàn tác. Mọi thông tin và lịch sử mặc sẽ bị xoá.</p>
        <div>
          <Btn onClick={onCancel}>Giữ lại</Btn>
          <Btn kind="danger-fill" onClick={onConfirm}>
            Xoá món đồ
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
