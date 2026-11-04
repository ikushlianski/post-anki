import { useState, type FormEvent } from "react";
import { errorMessage } from "@/shared/error-message";

type SubjectNameFormProps = {
  label: string;
  initialValue: string;
  submitLabel: string;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
};

export function SubjectNameForm({ label, initialValue, submitLabel, onSubmit, onCancel }: SubjectNameFormProps) {
  const [name, setName] = useState(initialValue);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (name.trim().length === 0) {
      setError("Enter a subject name.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      await onSubmit(name);
    } catch (reason: unknown) {
      setError(errorMessage(reason, "Could not save the subject. Try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card">
      <span className="text-caption font-semibold text-muted">{label}</span>
      <div className="flex flex-wrap gap-2">
        <input
          aria-label={label}
          autoFocus
          value={name}
          className="field min-w-48 flex-1"
          disabled={pending}
          onChange={(event) => setName(event.target.value)}
        />
        <div className="flex gap-2">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary min-w-24" disabled={pending}>
            {submitLabel}
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="notice notice-error">
          {error}
        </p>
      ) : null}
    </form>
  );
}
