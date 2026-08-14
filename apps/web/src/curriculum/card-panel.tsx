import { useState } from 'react'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { TopicCard, TopicCardSet } from './model'
import { compileCards, getCards } from './cards.api'

function cardsQuery(topicId: string) {
  return queryOptions({
    queryKey: ['cards', topicId] as const,
    queryFn: () => getCards({ data: topicId }),
    refetchInterval: (query) =>
      query.state.data?.status === 'generating' ? 2000 : false,
  })
}

export function CardPanel({ topicId }: { topicId: string }) {
  const queryClient = useQueryClient()
  const { data: cardSet, isLoading } = useQuery(cardsQuery(topicId))

  function invalidateCards() {
    return queryClient.invalidateQueries({ queryKey: cardsQuery(topicId).queryKey })
  }

  if (isLoading) {
    return (
      <div
        className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-500"
        data-testid="cards-loading"
      >
        Checking for a card set…
      </div>
    )
  }

  if (!cardSet) {
    return <CardsEmpty topicId={topicId} onGenerated={invalidateCards} />
  }

  if (cardSet.status === 'generating') {
    return (
      <div
        className="rounded-lg border border-neutral-300 bg-white p-6 text-center"
        data-testid="cards-generating"
      >
        <p className="text-sm font-medium text-neutral-700">Generating cards…</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">
          This refreshes on its own — no need to reload.
        </p>
      </div>
    )
  }

  if (cardSet.status === 'failed') {
    return <CardsFailed topicId={topicId} onRetried={invalidateCards} />
  }

  return <CardsReady topicId={topicId} cardSet={cardSet} onRegenerated={invalidateCards} />
}

function CardsEmpty({
  topicId,
  onGenerated,
}: {
  topicId: string
  onGenerated: () => void
}) {
  const generateMutation = useMutation({
    mutationFn: () => compileCards({ data: topicId }),
    onSuccess: onGenerated,
  })

  return (
    <div
      className="rounded-lg border border-neutral-200 bg-white p-6 text-center"
      data-testid="cards-empty"
    >
      <p className="text-sm font-medium text-neutral-700">No cards yet for this topic.</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">
        Generate a set of review cards covering this topic's key concepts.
      </p>
      <button
        type="button"
        data-testid="cards-generate-button"
        disabled={generateMutation.isPending}
        onClick={() => generateMutation.mutate()}
        className="mt-4 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {generateMutation.isPending ? 'Generating…' : 'Generate cards'}
      </button>

      {generateMutation.isError ? (
        <p className="mt-2 text-xs text-amber-700">Couldn't start generating cards. Try again.</p>
      ) : null}
    </div>
  )
}

function CardsFailed({
  topicId,
  onRetried,
}: {
  topicId: string
  onRetried: () => void
}) {
  const retryMutation = useMutation({
    mutationFn: () => compileCards({ data: topicId }),
    onSuccess: onRetried,
  })

  return (
    <div
      className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-center"
      data-testid="cards-status-failed"
    >
      <p className="text-sm font-medium text-amber-800">Couldn't generate cards for this topic.</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-amber-700">
        The generation step may have timed out or failed. Retry to try again.
      </p>
      <button
        type="button"
        data-testid="cards-retry-button"
        disabled={retryMutation.isPending}
        onClick={() => retryMutation.mutate()}
        className="mt-4 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {retryMutation.isPending ? 'Retrying…' : 'Retry generation'}
      </button>
    </div>
  )
}

function CardsReady({
  topicId,
  cardSet,
  onRegenerated,
}: {
  topicId: string
  cardSet: TopicCardSet
  onRegenerated: () => void
}) {
  const regenerateMutation = useMutation({
    mutationFn: () => compileCards({ data: topicId }),
    onSuccess: onRegenerated,
  })

  const cards = [...cardSet.cards].sort((a, b) => a.order - b.order)

  return (
    <div data-testid="cards-ready" className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-neutral-700">
          {cards.length} concept{cards.length === 1 ? '' : 's'}
        </p>
        <button
          type="button"
          data-testid="cards-regenerate-button"
          disabled={regenerateMutation.isPending}
          onClick={() => regenerateMutation.mutate()}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-neutral-500 disabled:opacity-50"
        >
          {regenerateMutation.isPending ? 'Regenerating…' : 'Regenerate cards'}
        </button>
      </div>

      {regenerateMutation.isError ? (
        <p className="text-xs text-amber-700">Couldn't start regenerating cards. Try again.</p>
      ) : null}

      <div className="space-y-6">
        {cards.map((card) => (
          <ConceptCard key={card.id} card={card} />
        ))}
      </div>
    </div>
  )
}

function ConceptCard({ card }: { card: TopicCard }) {
  const variants = [...card.variants].sort((a, b) => a.order - b.order)

  return (
    <section data-testid="card-concept" className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-neutral-800" data-testid="card-concept-title">
        {card.concept}
      </h2>
      <div className="mt-3 space-y-2">
        {variants.map((variant) => (
          <CardVariant key={variant.id} prompt={variant.prompt} answer={variant.answer} />
        ))}
      </div>
    </section>
  )
}

function CardVariant({ prompt, answer }: { prompt: string; answer: string }) {
  const [revealed, setRevealed] = useState(false)

  return (
    <button
      type="button"
      data-testid="card-variant"
      data-revealed={revealed}
      onClick={() => setRevealed((prev) => !prev)}
      className="w-full rounded-md border border-neutral-200 bg-neutral-50 p-3 text-left"
    >
      <p className="text-sm text-neutral-700" data-testid="card-variant-prompt">
        {prompt}
      </p>
      {revealed ? (
        <p className="mt-2 border-t border-neutral-200 pt-2 text-sm text-neutral-600" data-testid="card-variant-answer">
          {answer}
        </p>
      ) : (
        <p className="mt-2 text-xs text-neutral-400">Tap to reveal the answer</p>
      )}
    </button>
  )
}
