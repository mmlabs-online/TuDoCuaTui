import { Icon } from "@/components/Icon";

export function FilterSelect({
  value,
  onChange,
  label,
  options,
  sort = false,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: readonly string[];
  sort?: boolean;
}) {
  return (
    <label className={`filter-select ${value && !sort ? "has-value" : ""}`}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{label}</option>
        {options.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <Icon name="chevron" size={15} />
    </label>
  );
}
