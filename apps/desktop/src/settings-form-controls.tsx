import type { ReactNode } from "react";

export type SaveState =
  | { kind: "idle" }
  | { kind: "saved" }
  | { kind: "info"; message: string }
  | { kind: "error"; message: string };

const ROW_CLASS = "flex min-h-13 items-center justify-between gap-4 px-4 py-2 text-body";

export function SettingsSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4">
      <h3 className="group-label">{title}</h3>
      <div className="list-group">{children}</div>
    </section>
  );
}

export function SettingsField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={ROW_CLASS}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={htmlFor} className="block shrink-0 font-medium text-text">
          {label}
        </label>
        {hint ? <p className="m-0 text-caption text-muted">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function SaveBar({
  busy,
  state,
  onSave,
  disabled = false,
}: {
  busy: boolean;
  state: SaveState;
  onSave: () => void;
  disabled?: boolean;
}) {
  return (
    <div className={`${ROW_CLASS} bg-note/50`}>
      <SaveStatus state={state} />
      <button type="button" className="btn btn-primary ml-auto min-w-24" disabled={busy || disabled} onClick={onSave}>
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

export function SaveStatus({ state }: { state: SaveState }) {
  if (state.kind === "saved") {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-body font-medium text-accent-text">
        <CheckIcon />
        Saved.
      </span>
    );
  }

  if (state.kind === "info") {
    return (
      <span role="status" className="text-body text-muted">
        {state.message}
      </span>
    );
  }

  if (state.kind === "error") {
    return (
      <p role="alert" className="m-0 min-w-0 text-body text-danger">
        {state.message}
      </p>
    );
  }

  return null;
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SettingsSwitch({
  id,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <span className="relative inline-flex min-h-11 shrink-0 items-center">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        className="peer m-0 h-6 min-h-0 w-[42px] cursor-pointer appearance-none rounded-full border-0 bg-border-strong p-0 shadow-none transition-colors checked:bg-accent disabled:cursor-default disabled:opacity-50"
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0.5 size-5 rounded-full bg-on-accent shadow-card transition-transform peer-checked:translate-x-[18px]"
      />
    </span>
  );
}
