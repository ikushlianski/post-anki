import type { KnowledgeBitFeedbackReason } from "@post-anki/shared";

import { CardListLoadError } from "./card-list-load-error";
import { RejectedCardsFilters } from "./rejected-cards-filters";
import { RejectedCardsRow } from "./rejected-cards-row";
import { useRejectedCards } from "./use-rejected-cards";
import { useRejectedSendToChat } from "./use-rejected-send-to-chat";

interface RejectedCardsScreenProps {
  reason: KnowledgeBitFeedbackReason | undefined;
  subjectId?: string | undefined;
  q?: string | undefined;
  onReasonChange: (reason: KnowledgeBitFeedbackReason | undefined) => void;
  onSubjectChange: (subjectId: string | undefined) => void;
  onQueryChange: (q: string | undefined) => void;
}

function formatCount(count: number): string {
  return `${count} rejected ${count === 1 ? "card" : "cards"}`;
}

export function RejectedCardsScreen({
  reason,
  subjectId,
  q,
  onReasonChange,
  onSubjectChange,
  onQueryChange,
}: RejectedCardsScreenProps) {
  const chat = useRejectedSendToChat();
  const {
    query,
    cards,
    reasonCounts,
    totalCount,
    matchCount,
    restoringIds,
    failedIds,
    selectedIds,
    setSelectedIds,
    bulkRunning,
    staleNotice,
    restore,
    restoreSelected,
    toggleSelected,
  } = useRejectedCards({ reason, subjectId, q });

  return (
    <main
      data-testid="rejected-cards-page"
      className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10"
    >
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Rejected cards
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Cards you rejected, with the reason you gave.{" "}
          <a
            href="/knowledge/triage-history"
            data-testid="rejected-cards-triage-history-link"
            className="text-indigo-600 hover:underline"
          >
            Last 7 days of triage
          </a>
        </p>
      </header>

      {staleNotice ? (
        <p data-testid="rejected-cards-stale-notice" className="mb-4 text-sm text-neutral-600">
          That card is no longer rejected, so the list was refreshed.
        </p>
      ) : null}

      <RejectedCardsFilters
        reason={reason}
        subjectId={subjectId}
        q={q}
        reasonCounts={reasonCounts}
        totalCount={totalCount}
        onReasonChange={onReasonChange}
        onSubjectChange={onSubjectChange}
        onQueryChange={onQueryChange}
      />

      <p
        aria-live="polite"
        data-testid="rejected-cards-match-count"
        className="mb-3 text-sm text-neutral-600"
      >
        {matchCount === undefined ? null : formatCount(matchCount)}
      </p>

      {query.isPending ? (
        <p
          role="status"
          aria-live="polite"
          data-testid="rejected-cards-loading"
          className="text-neutral-500"
        >
          Loading…
        </p>
      ) : null}

      {query.isError ? (
        <CardListLoadError
          testId="rejected-cards-error"
          retryTestId="rejected-cards-retry"
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {query.isSuccess && cards.length === 0 ? (
        <p
          role="status"
          aria-live="polite"
          data-testid="rejected-cards-empty"
          className="text-lg font-medium"
        >
          {q
            ? `No rejected cards match "${q}"`
            : subjectId
              ? "No rejected cards in this subject"
              : reason
              ? "No rejected cards with this reason"
              : "No rejected cards yet"}
        </p>
      ) : null}

      {cards.length > 0 ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <label className="flex min-h-[44px] items-center gap-2 text-xs text-neutral-600 sm:min-h-0">
            <input
              type="checkbox"
              data-testid="rejected-cards-select-all"
              checked={cards.every((card) => selectedIds.has(card.knowledgeBitId))}
              onChange={(event) =>
                setSelectedIds(
                  event.target.checked
                    ? new Set(cards.map((card) => card.knowledgeBitId))
                    : new Set(),
                )
              }
            />
            Select all
          </label>
          <button
            type="button"
            data-testid="rejected-cards-restore-selected"
            disabled={selectedIds.size === 0 || bulkRunning}
            onClick={() => void restoreSelected()}
            className="rounded-md border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-50 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
          >
            {bulkRunning ? "Restoring…" : `Restore selected (${selectedIds.size})`}
          </button>
        </div>
      ) : null}

      {cards.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {cards.map((card) => (
            <RejectedCardsRow
              key={card.knowledgeBitId}
              card={card}
              selected={selectedIds.has(card.knowledgeBitId)}
              restoring={restoringIds.has(card.knowledgeBitId)}
              restoreFailed={failedIds.has(card.knowledgeBitId)}
              chat={chat}
              onToggleSelected={toggleSelected}
              onRestore={restore}
            />
          ))}
        </ul>
      ) : null}

      {query.isSuccess && cards.length > 0 && !query.hasNextPage ? (
        <p data-testid="rejected-cards-end" className="mt-6 text-center text-sm text-neutral-500">
          That's all the rejected cards
        </p>
      ) : null}

      {query.hasNextPage ? (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            data-testid="rejected-cards-load-more"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
            className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-50"
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </main>
  );
}
