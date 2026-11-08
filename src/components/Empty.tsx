import { Btn } from "@/components/Btn";
import { Icon } from "@/components/Icon";

export function Empty({ onAdd, onImport }: { onAdd: () => void; onImport: () => void }) {
  return (
    <div className="no-results empty-state">
      <div className="empty-illustration" aria-hidden="true">
        <svg viewBox="0 0 240 150">
          <path className="rack" d="M34 132V35h172v97M20 132h34m132 0h34M68 35v-9m104 9v-9" />
          <path className="hanger hanger-one" d="m78 52-28 19h56L78 52Zm0 0c-2-9 8-10 8-4" />
          <path className="cloth cloth-one" d="M55 70h46l-5 55H60l-5-55Z" />
          <path className="hanger hanger-two" d="m141 53-27 18h54l-27-18Zm0 0c-2-9 8-10 8-4" />
          <path className="cloth cloth-two" d="m122 70 19-6 19 6-4 54h-30l-4-54Z" />
          <path className="spark" d="m200 48 3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Z" />
          <path className="spark small" d="m29 62 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" />
        </svg>
      </div>
      <h3>
        Tủ đồ đang <em>trống trơn</em>
      </h3>
      <p>Thêm món đồ đầu tiên hoặc import bộ sưu tập sẵn có.</p>
      <div>
        <Btn onClick={onImport}>
          <Icon name="import" /> Import
        </Btn>
        <Btn kind="primary" onClick={onAdd}>
          <Icon name="plus" /> Thêm món đồ
        </Btn>
      </div>
    </div>
  );
}
