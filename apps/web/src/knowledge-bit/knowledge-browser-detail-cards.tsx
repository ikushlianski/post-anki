import { KNOWLEDGE_BIT_VARIANT_KIND_LABELS } from '@post-anki/shared'
import type { KnowledgeBitDetailCard } from '@post-anki/shared'

import { formatAddedAt } from './knowledge-browser-columns'
import { BROWSER_STATE_LABELS } from './knowledge-browser-filters'

export function cardStatusText(card: KnowledgeBitDetailCard): string {
  const parts = [BROWSER_STATE_LABELS[card.state]]

  if (card.suspended) {
    parts.push('suspended')
  }

  if (card.buried) {
    parts.push('buried')
  }

  if (card.dueAt) {
    parts.push(`next due ${formatAddedAt(card.dueAt)}`)
  }

  if (card.lapses > 0) {
    parts.push(`forgotten ${card.lapses} ${card.lapses === 1 ? 'time' : 'times'}`)
  }

  return parts.join(', ')
}

export function KnowledgeBrowserDetailCards({ cards }: { cards: KnowledgeBitDetailCard[] | undefined }) {
  if (!cards || !cards.some((card) => card.cardKey !== '')) {
    return null
  }

  return (
    <section data-testid="knowledge-browser-detail-cards" className="mb-5">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Cards</h3>
      <ul className="space-y-2">
        {cards.map((card) => (
          <li
            key={card.variantId}
            data-testid="knowledge-browser-detail-card"
            className="rounded border border-neutral-200 p-2 text-sm"
          >
            <p className="text-xs text-neutral-500">
              {KNOWLEDGE_BIT_VARIANT_KIND_LABELS[card.kind]} {card.order + 1}
            </p>
            <p>{cardStatusText(card)}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
