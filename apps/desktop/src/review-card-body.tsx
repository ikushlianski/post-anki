import type { ReviewCard, ReviewGrade } from "@/api/review-commands";
import { ReviewCardEditor } from "@/review-card-editor";
import { ReviewGradeButtons } from "@/review-grade-buttons";

export interface ReviewCardBodyProps {
  card: ReviewCard;
  cardsLeft: number;
  revealed: boolean;
  editing: boolean;
  busy: boolean;
  canUndo: boolean;
  error: string | null;
  editError: string | null;
  onReveal: () => void;
  onGrade: (grade: ReviewGrade) => void;
  onUndo: () => void;
  onStartEdit: () => void;
  onSaveEdit: (question: string, answer: string) => void;
  onCancelEdit: () => void;
  onBury: () => void;
  onSuspend: () => void;
}

const quietButton = "btn btn-quiet min-h-11 px-3 font-medium text-muted hover:enabled:text-text";

export function ReviewCardBody(props: ReviewCardBodyProps) {
  const { card, editing, revealed, busy } = props;

  return (
    <>
      <div className="card min-h-[280px] gap-0 p-0">
        <p aria-live="polite" className="m-0 px-5 pt-4 text-right text-caption tabular-nums text-muted">
          {props.cardsLeft} cards left
        </p>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pt-4 pb-10 text-center sm:px-12">
          <p className="m-0 max-w-[60ch] text-[22px] leading-8 font-medium text-text">{card.question}</p>
          {revealed && !editing && (
            <p className="m-0 w-full max-w-[60ch] border-t border-border pt-6 text-[20px] leading-7 font-semibold text-text">
              {card.answer}
            </p>
          )}
        </div>
      </div>

      {props.error && (
        <p role="alert" className="notice notice-error">
          {props.error}
        </p>
      )}

      {editing && (
        <ReviewCardEditor
          key={card.id}
          initialQuestion={card.question}
          initialAnswer={card.answer}
          error={props.editError}
          saving={busy}
          onSave={props.onSaveEdit}
          onCancel={props.onCancelEdit}
        />
      )}

      {!editing && !revealed && (
        <button
          type="button"
          title="Shortcut: Space or Enter"
          className="btn btn-primary min-h-14 w-full self-center text-heading sm:w-auto sm:min-w-[280px]"
          onClick={props.onReveal}
        >
          Show answer <kbd className="kbd">Space</kbd>
        </button>
      )}

      {!editing && revealed && (
        <ReviewGradeButtons disabled={busy} intervals={card.intervals} onGrade={props.onGrade} />
      )}

      {!editing && (
        <div className="-mt-2 flex flex-wrap justify-center gap-1">
          <button
            type="button"
            disabled={busy || !props.canUndo}
            title="Shortcut: U"
            className={quietButton}
            onClick={props.onUndo}
          >
            Undo <kbd className="kbd">U</kbd>
          </button>
          <button type="button" disabled={busy} className={quietButton} onClick={props.onStartEdit}>
            Edit
          </button>
          <button
            type="button"
            disabled={busy}
            title="Hide this card until tomorrow"
            className={quietButton}
            onClick={props.onBury}
          >
            Bury
          </button>
          <button
            type="button"
            disabled={busy}
            title="Remove this card from reviews until you bring it back"
            className={quietButton}
            onClick={props.onSuspend}
          >
            Suspend
          </button>
        </div>
      )}
    </>
  );
}
