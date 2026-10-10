import type { SuspendedCard } from '@post-anki/shared'

export interface SuspendedCardRowState {
  pending: boolean
  failed: boolean
}

export interface SuspendedCardsPageProps {
  cards: SuspendedCard[]
  rowStates: Record<string, SuspendedCardRowState>
  hasMore: boolean
  loadingMore: boolean
  onBringBack: (card: SuspendedCard) => void
  onLoadMore: () => void
}

function formatDay(iso: string | null): string {
  if (!iso) {
    return ''
  }

  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function badgeLabel(card: SuspendedCard): string {
  if (card.reason === 'leech') {
    return `Leech ×${card.lapses}`
  }

  if (card.reason === 'suspended') {
    return 'Suspended'
  }

  return card.buriedUntil ? `Buried until ${formatDay(card.buriedUntil)}` : 'Buried'
}

function SuspendedCardRow({
  card,
  rowState,
  onBringBack,
}: {
  card: SuspendedCard
  rowState: SuspendedCardRowState | undefined
  onBringBack: (card: SuspendedCard) => void
}) {
  const pending = rowState?.pending ?? false
  const failed = rowState?.failed ?? false
  const actionLabel = card.suspended ? 'Unsuspend' : 'Bring back'

  return (
    <li
      data-testid={`suspended-card-row-${card.knowledgeBitId}`}
      className="rounded-lg border border-neutral-200 bg-white p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p
          data-testid={`suspended-card-item-${card.knowledgeBitId}`}
          className="text-sm font-medium text-neutral-900"
        >
          {card.itemText}
        </p>
        <span
          data-testid={`suspended-card-badge-${card.knowledgeBitId}`}
          className={
            card.reason === 'leech'
              ? 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800'
              : 'rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700'
          }
        >
          {badgeLabel(card)}
        </span>
      </div>

      <dl className="mt-3 flex flex-col gap-2 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-neutral-400">Question</dt>
          <dd data-testid={`suspended-card-question-${card.knowledgeBitId}`} className="text-neutral-800">
            {card.question}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-neutral-400">Answer</dt>
          <dd data-testid={`suspended-card-answer-${card.knowledgeBitId}`} className="text-neutral-800">
            {card.answer}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-neutral-500">
          {card.subjectName ? (
            <span data-testid={`suspended-card-subject-${card.knowledgeBitId}`}>{card.subjectName}</span>
          ) : null}
          {card.subjectName && card.since ? ' · ' : null}
          {card.since ? (
            <span data-testid={`suspended-card-since-${card.knowledgeBitId}`}>
              Suspended since {formatDay(card.since)}
            </span>
          ) : null}
        </p>

        <button
          type="button"
          data-testid={`suspended-card-action-${card.knowledgeBitId}`}
          disabled={pending}
          onClick={() => onBringBack(card)}
          className="rounded-md border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-50"
        >
          {pending ? 'Working…' : actionLabel}
        </button>
      </div>

      {failed ? (
        <p
          role="alert"
          data-testid={`suspended-card-error-${card.knowledgeBitId}`}
          className="mt-2 text-xs text-red-700"
        >
          Could not update this card. Try again.
        </p>
      ) : null}
    </li>
  )
}

export function SuspendedCardsPage({
  cards,
  rowStates,
  hasMore,
  loadingMore,
  onBringBack,
  onLoadMore,
}: SuspendedCardsPageProps) {
  return (
    <main
      data-testid="suspended-cards-page"
      className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10"
    >
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Suspended cards</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Cards you set aside, buried cards, and leeches that were suspended automatically. Bring one
          back to put it in review again.
        </p>
      </header>

      {cards.length === 0 ? (
        <div data-testid="suspended-cards-empty" className="flex flex-col gap-1">
          <p className="text-lg font-medium">Nothing is suspended or buried</p>
          <p className="text-sm text-neutral-500">
            Cards you suspend or bury during review show up here until you bring them back.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {cards.map((card) => (
            <SuspendedCardRow
              key={card.knowledgeBitId}
              card={card}
              rowState={rowStates[card.knowledgeBitId]}
              onBringBack={onBringBack}
            />
          ))}
        </ul>
      )}

      {hasMore ? (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            data-testid="suspended-cards-load-more"
            disabled={loadingMore}
            onClick={onLoadMore}
            className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}
    </main>
  )
}
