import { useRef, type FormEvent } from "react";
import { type Subject } from "@/api/desktop-commands";
import { buildSubjectTree, flattenWithDepth, subjectPath } from "@/subject-tree";
import { AddKnowledgeProgress } from "@/add-knowledge-progress";
import { AddKnowledgeSuggestion } from "@/add-knowledge-suggestion";
import { useAddKnowledgeProgress } from "@/use-add-knowledge-progress";
import { useAddKnowledgeSubmit } from "@/use-add-knowledge-submit";

type AddKnowledgeViewProps = { subjects: Subject[]; onReviewNew?: () => void };

function subjectOptions(subjects: Subject[]) {
  const known = new Set(subjects.map((subject) => subject.id));

  return flattenWithDepth(buildSubjectTree(subjects), known).map(({ subject }) => ({
    id: subject.id,
    label: subjectPath(subject, subjects),
  }));
}

export function AddKnowledgeView({ subjects, onReviewNew }: AddKnowledgeViewProps) {
  const subjectRef = useRef<HTMLSelectElement>(null);
  const progress = useAddKnowledgeProgress();
  const form = useAddKnowledgeSubmit({
    knownSubjectIds: subjects.map((subject) => subject.id),
    onTracked: progress.track,
  });
  const submitLabel = form.busy ? "Saving…" : form.checking ? "Checking…" : "Add knowledge";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void form.submit();
  }

  return (
    <form onSubmit={handleSubmit} className="page gap-5" aria-label="Add knowledge">
      <label className="field-label">
        <span>
          Subject <span className="font-normal text-muted">(optional)</span>
        </span>
        <select
          ref={subjectRef}
          value={form.subjectId}
          disabled={form.busy}
          onChange={(event) => form.changeSubject(event.target.value)}
          className="field font-normal"
        >
          <option value="">No subject: suggest one</option>
          {subjectOptions(subjects).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field-label">
        Knowledge or link
        <textarea
          rows={10}
          value={form.text}
          disabled={form.busy}
          onChange={(event) => form.changeText(event.target.value)}
          placeholder="Paste a note, a passage or a link to an article"
          className="field min-h-[220px] resize-y font-normal"
        />
      </label>

      {form.advice && (
        <AddKnowledgeSuggestion
          recommendations={form.advice}
          busy={form.busy}
          onUse={(id) => void form.acceptSuggestion(id)}
          onPickAnother={() => {
            form.dismissAdvice();
            subjectRef.current?.focus();
          }}
          onAddWithoutSubject={() => void form.addWithoutSubject()}
        />
      )}

      <div className="flex flex-row-reverse flex-wrap gap-2">
        <button type="submit" disabled={!form.canSubmit} className="btn btn-primary min-w-[160px]">
          {submitLabel}
        </button>
        {form.canAddAnyway && (
          <button
            type="button"
            disabled={form.busy}
            onClick={() => void form.addAnyway()}
            className="btn"
          >
            Add anyway
          </button>
        )}
      </div>

      {form.error && (
        <p role="alert" className="notice notice-error">
          {form.error}
        </p>
      )}

      {form.saved && (
        <p role="status" className="notice">
          {form.saved.truncated
            ? "Saved. The page was long, so only the start was kept. "
            : "Saved. "}
          {form.saved.unfiled ? "It was added without a subject. " : ""}
          Questions take a minute or two to appear.
        </p>
      )}

      <AddKnowledgeProgress notes={progress.notes} onReviewNew={onReviewNew} />
    </form>
  );
}
