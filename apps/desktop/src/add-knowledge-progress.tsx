import { noteStatusText, type AddedNote } from "@/add-knowledge-logic";

type AddKnowledgeProgressProps = {
  notes: AddedNote[];
  onReviewNew?: () => void;
};

export function AddKnowledgeProgress({ notes, onReviewNew }: AddKnowledgeProgressProps) {
  if (notes.length === 0) {
    return null;
  }

  return (
    <section aria-label="Added knowledge progress" className="flex flex-col gap-3">
      <h3 className="group-label m-0">Recently added</h3>
      <ul role="status" className="list-group">
        {notes.map((note) => (
          <li
            key={note.sourceId}
            data-phase={note.phase}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3"
          >
            <span className="min-w-0 font-semibold text-text">{note.label || "Your note"}</span>
            <span className="text-body text-muted">{noteStatusText(note)}</span>
          </li>
        ))}
      </ul>

      {onReviewNew && (
        <button type="button" onClick={onReviewNew} className="btn self-start">
          Review new items
        </button>
      )}
    </section>
  );
}
