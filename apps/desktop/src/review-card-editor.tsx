import { useState } from "react";

const textareaClass = "field min-h-24 resize-y text-left font-normal";

export function ReviewCardEditor({
  initialQuestion,
  initialAnswer,
  error,
  saving,
  onSave,
  onCancel,
}: {
  initialQuestion: string;
  initialAnswer: string;
  error: string | null;
  saving: boolean;
  onSave: (question: string, answer: string) => void;
  onCancel: () => void;
}) {
  const [question, setQuestion] = useState(initialQuestion);
  const [answer, setAnswer] = useState(initialAnswer);

  return (
    <form
      aria-label="Edit card"
      className="card gap-4 text-left"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(question, answer);
      }}
    >
      <label className="field-label">
        Question
        <textarea className={textareaClass} value={question} onChange={(event) => setQuestion(event.target.value)} />
      </label>
      <label className="field-label">
        Answer
        <textarea className={textareaClass} value={answer} onChange={(event) => setAnswer(event.target.value)} />
      </label>
      {error && (
        <p role="alert" className="notice notice-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={saving} className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={saving} className="btn btn-primary min-w-[120px]">
          {saving ? "Saving…" : "Save edit"}
        </button>
      </div>
    </form>
  );
}
