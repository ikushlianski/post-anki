import { useEffect, useState } from "react";
import {
  controlCard,
  editCard,
  gradeCard,
  undoLastGrade,
  type ControlAction,
  type ReviewCard,
  type ReviewGrade,
  type ReviewScope,
} from "@/api/review-commands";
import { getSubjects, type Subject } from "@/api/desktop-commands";
import { errorMessage } from "@/shared/error-message";
import { applyGradeToCounts } from "@/review-counts";
import { ReviewCardBody } from "@/review-card-body";
import { ReviewCountsStrip } from "@/review-counts-strip";
import { mapReviewKey } from "@/review-keys";
import { pendingNote } from "@/review-queue";
import { AHEAD_STORAGE_KEY, clampAheadDays, parseStoredAheadDays } from "@/review-scope";
import { ReviewQueueStates } from "@/review-queue-states";
import { ReviewScopeControls } from "@/review-scope-controls";
import { useReviewQueue } from "@/use-review-queue";

type UndoEntry = { card: ReviewCard; grade: ReviewGrade };

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function isControlTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest("button, a[href], [role='button']") !== null;
}

export function ReviewView({ initialSubjectId }: { initialSubjectId?: string | null } = {}) {
  const [subjectId, setSubjectId] = useState<string | null>(initialSubjectId ?? null);
  const [aheadDays, setAheadDays] = useState<number>(() =>
    parseStoredAheadDays(window.localStorage.getItem(AHEAD_STORAGE_KEY)),
  );
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const scope: ReviewScope = { subjectId, aheadDays };
  const queue = useReviewQueue(scope);
  const { card, index, revealed, counts, cards, phase, exhausted, refilling } = queue;

  useEffect(() => {
    setSubjectId(initialSubjectId ?? null);
  }, [initialSubjectId]);

  useEffect(() => {
    getSubjects()
      .then(setSubjects)
      .catch(() => setSubjects([]));
  }, []);

  useEffect(() => {
    setUndoStack([]);
    setEditing(false);
    setEditError(null);
  }, [subjectId, aheadDays]);

  function changeAhead(days: number) {
    const next = clampAheadDays(days);

    window.localStorage.setItem(AHEAD_STORAGE_KEY, String(next));
    setAheadDays(next);
  }

  function handleGrade(grade: ReviewGrade) {
    if (!card) {
      return;
    }

    const entry: UndoEntry = { card, grade };

    queue.setIndex(index + 1);
    queue.setRevealed(false);
    queue.setError(null);
    setUndoStack((stack) => [...stack, entry]);
    queue.setCounts((current) => current && applyGradeToCounts(current, card.phase, -1));

    gradeCard(card, grade, scope)
      .then((status) => queue.setPending(status.pending))
      .catch((reason) => {
        setUndoStack((stack) => stack.filter((known) => known !== entry));
        queue.setError(errorMessage(reason, "Could not save the grade. Try again."));
      });
  }

  async function handleUndo() {
    if (undoStack.length === 0 || busy) {
      return;
    }

    setBusy(true);
    queue.setError(null);

    try {
      const outcome = await undoLastGrade(scope);

      if (queue.cardsRef.current[index - 1]?.id !== outcome.card.id) {
        setUndoStack([]);
        await queue.loadCards(scope);
        return;
      }

      setUndoStack((stack) => stack.slice(0, -1));
      queue.setIndex(index - 1);
      queue.setRevealed(false);
      queue.setCounts((current) => current && applyGradeToCounts(current, outcome.card.phase, 1));
      queue.setPending(outcome.pending);
    } catch (reason) {
      queue.setError(errorMessage(reason, "Could not undo the last grade."));
    } finally {
      setBusy(false);
    }
  }

  async function handleControl(action: ControlAction) {
    if (!card || busy) {
      return;
    }

    const target = card;

    setBusy(true);
    queue.setError(null);

    try {
      await controlCard(target, action);

      const keep = (known: ReviewCard) =>
        target.cardKey === null ? known.knowledgeBitId !== target.knowledgeBitId : known.id !== target.id;
      const current = queue.cardsRef.current;

      queue.commitCards(current.filter(keep));
      queue.setIndex(current.slice(0, index).filter(keep).length);
      queue.setRevealed(false);
      queue.setCounts((known) => known && applyGradeToCounts(known, target.phase, -1));
    } catch (reason) {
      queue.setError(errorMessage(reason, "Could not change this card."));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit(question: string, answer: string) {
    if (!card || busy) {
      return;
    }

    const target = card;

    setBusy(true);
    setEditError(null);

    try {
      const saved = await editCard(target.id, question, answer);

      queue.commitCards(
        queue.cardsRef.current.map((known) =>
          known.id === target.id ? { ...known, question: saved.prompt, answer: saved.answer } : known,
        ),
      );
      setEditing(false);
    } catch (reason) {
      setEditError(errorMessage(reason, "Couldn't save the edit. Try again."));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const result = mapReviewKey(
        {
          code: event.code,
          repeat: event.repeat,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
          targetIsEditable: isEditableTarget(event.target),
          targetIsControl: isControlTarget(event.target),
        },
        { hasCard: card !== null, revealed, busy, editing, canUndo: undoStack.length > 0 },
      );

      if (result.preventDefault) {
        event.preventDefault();
      }

      if (result.action?.type === "reveal") {
        queue.setRevealed(true);
      } else if (result.action?.type === "grade") {
        handleGrade(result.action.grade);
      } else if (result.action?.type === "undo") {
        void handleUndo();
      }
    }

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const note = pendingNote(queue.pending);

  return (
    <section className="page">
      <ReviewScopeControls
        subjects={subjects}
        counts={queue.dueCounts}
        subjectId={subjectId}
        aheadDays={aheadDays}
        disabled={busy || editing}
        onSubjectChange={setSubjectId}
        onAheadChange={changeAhead}
      />

      {(queue.offline || note) && (
        <div className="notice flex flex-col gap-1 text-muted">
          {queue.offline && <p className="m-0">Offline: showing saved cards. Grades sync when you are back online.</p>}
          {note && <p className="m-0">{note}</p>}
        </div>
      )}
      {counts && <ReviewCountsStrip counts={counts} />}

      <ReviewQueueStates
        phase={phase}
        hasCard={card !== null}
        error={queue.error}
        exhausted={exhausted}
        refilling={refilling}
        onReload={() => void queue.loadCards(scope)}
      />

      {phase === "ready" && card && (
        <ReviewCardBody
          card={card}
          cardsLeft={cards.length - index}
          revealed={revealed}
          editing={editing}
          busy={busy}
          canUndo={undoStack.length > 0}
          error={queue.error}
          editError={editError}
          onReveal={() => queue.setRevealed(true)}
          onGrade={handleGrade}
          onUndo={() => void handleUndo()}
          onStartEdit={() => {
            setEditError(null);
            setEditing(true);
          }}
          onSaveEdit={(question, answer) => void handleSaveEdit(question, answer)}
          onCancelEdit={() => {
            setEditError(null);
            setEditing(false);
          }}
          onBury={() => void handleControl("bury")}
          onSuspend={() => void handleControl("suspend")}
        />
      )}
    </section>
  );
}
