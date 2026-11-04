import { fieldClass, narrowFieldClass } from "@/settings-classes";

export function InputWithReset({
  id,
  value,
  type = "text",
  disabled,
  canReset,
  busy,
  onChange,
  onReset,
}: {
  id: string;
  value: string;
  type?: "text" | "number";
  disabled: boolean;
  canReset: boolean;
  busy: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        className={type === "number" ? narrowFieldClass : fieldClass}
        onChange={(event) => onChange(event.target.value)}
      />
      {canReset ? (
        <button type="button" className="btn btn-quiet" disabled={busy} onClick={onReset}>
          Use inherited
        </button>
      ) : null}
    </div>
  );
}

