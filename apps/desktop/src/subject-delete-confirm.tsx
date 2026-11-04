import { useState } from "react";
import { errorMessage } from "@/shared/error-message";

type SubjectDeleteConfirmProps = {
  name: string;
  subSubjectCount: number;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
};

function consequence(count: number): string {
  if (count === 0) return "This subject has no sub-subjects.";

  return `Its ${count} sub-${count === 1 ? "subject is" : "subjects are"} deleted too.`;
}

export function SubjectDeleteConfirm({ name, subSubjectCount, onConfirm, onCancel }: SubjectDeleteConfirmProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setPending(true);
    setError(null);

    try {
      await onConfirm();
    } catch (reason: unknown) {
      setError(errorMessage(reason, "Delete failed. Try again."));
      setPending(false);
    }
  }

  return (
    <div
      role="alertdialog"
      aria-labelledby="subject-delete-title"
      className="card border-[color-mix(in_srgb,var(--danger)_35%,transparent)]"
    >
      <div className="flex flex-col gap-1">
        <p id="subject-delete-title" className="section-title [overflow-wrap:anywhere]">
          Delete {name}?
        </p>
        <p className="muted-text">{consequence(subSubjectCount)}</p>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
        <button type="button" className="btn btn-danger" onClick={handleConfirm} disabled={pending}>
          Delete
        </button>
      </div>
      {error ? (
        <p role="alert" className="notice notice-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
