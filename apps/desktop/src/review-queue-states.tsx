import type { ReviewPhase } from "@/use-review-queue";

export function ReviewQueueStates({
  phase,
  hasCard,
  error,
  exhausted,
  refilling,
  onReload,
}: {
  phase: ReviewPhase;
  hasCard: boolean;
  error: string | null;
  exhausted: boolean;
  refilling: boolean;
  onReload: () => void;
}) {
  const readyWithoutCard = phase === "ready" && !hasCard;

  return (
    <>
      {phase === "loading" && <p className="muted-text">Loading cards…</p>}

      {phase === "error" && (
        <section className="flex flex-col items-start gap-3">
          <p role="alert" className="notice notice-error self-stretch">
            {error}
          </p>
          <button type="button" className="btn" onClick={onReload}>
            Try again
          </button>
        </section>
      )}

      {readyWithoutCard && error && (
        <p role="alert" className="notice notice-error">
          {error}
        </p>
      )}

      {readyWithoutCard && exhausted && (
        <div className="empty-state">
          <p className="empty-state-title">No cards are due right now.</p>
          <p className="m-0">Pick another subject or turn on Learn ahead to study early.</p>
          <button type="button" className="btn mt-2" onClick={onReload}>
            Check again
          </button>
        </div>
      )}

      {readyWithoutCard && !exhausted && !refilling && !error && <p className="muted-text">Nothing to review yet.</p>}
    </>
  );
}
