import type { SubjectRecommendation } from "@/api/add-knowledge-commands";
import { CONFIDENCE_LABELS } from "@/add-knowledge-logic";

type AddKnowledgeSuggestionProps = {
  recommendations: SubjectRecommendation[];
  busy: boolean;
  onUse: (subjectId: string) => void;
  onPickAnother: () => void;
  onAddWithoutSubject: () => void;
};

export function AddKnowledgeSuggestion({
  recommendations,
  busy,
  onUse,
  onPickAnother,
  onAddWithoutSubject,
}: AddKnowledgeSuggestionProps) {
  return (
    <section aria-label="Suggested subjects" className="card gap-4 p-5">
      <p className="m-0">
        <span className="block text-heading font-semibold text-text">Where should this go?</span>
        <span className="block text-body text-muted">Nothing is saved until you choose.</span>
      </p>

      <ul className="list-group shadow-none">
        {recommendations.map((recommendation) => {
          const primary = recommendation.confidence === "high";

          return (
            <li key={recommendation.subjectId} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
              <div className="flex min-w-[200px] flex-1 flex-col gap-1">
                <p className="m-0 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-text">{recommendation.subjectLabel}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-caption font-medium ${
                      primary ? "bg-accent-soft text-accent-text" : "bg-note text-muted"
                    }`}
                  >
                    {CONFIDENCE_LABELS[recommendation.confidence]}
                  </span>
                </p>
                {recommendation.reason && <p className="m-0 text-body text-muted">{recommendation.reason}</p>}
              </div>
              <button
                type="button"
                disabled={busy}
                aria-label={`Use subject ${recommendation.subjectLabel}`}
                onClick={() => onUse(recommendation.subjectId)}
                className={primary ? "btn btn-primary" : "btn"}
              >
                Use this subject
              </button>
            </li>
          );
        })}
      </ul>

      <div className="-mx-2 -mb-2 flex flex-wrap gap-1">
        <button type="button" disabled={busy} onClick={onPickAnother} className="btn btn-quiet px-3">
          Pick another
        </button>
        <button type="button" disabled={busy} onClick={onAddWithoutSubject} className="btn btn-quiet px-3">
          Add without a subject
        </button>
      </div>
    </section>
  );
}
