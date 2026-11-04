import { useState } from 'react'
import type { ChatQueueKnowledgeBit } from '@post-anki/shared'

import { useChatQueueSearch } from './use-chat-queue-search'

type Props = {
  items: ChatQueueKnowledgeBit[]
  onOpen: (cardId: string) => void
}

export function ChatQueueMessageSearch({ items, onOpen }: Props) {
  const [query, setQuery] = useState('')
  const search = useChatQueueSearch(query)
  const bodies = new Map(items.map((item) => [item.id, item.body]))

  return (
    <div data-testid="chat-queue-message-search" className="mb-4 space-y-2">
      <input
        type="search"
        aria-label="Search conversations"
        data-testid="chat-queue-message-search-input"
        placeholder="Search conversations"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
      />
      {search.status === 'loading' ? (
        <p className="text-xs text-neutral-500">Searching…</p>
      ) : null}
      {search.status === 'error' ? (
        <p role="alert" data-testid="chat-queue-message-search-error" className="text-sm text-red-700">
          Search failed. Try again.
        </p>
      ) : null}
      {search.status === 'ready' && search.results.length === 0 ? (
        <p data-testid="chat-queue-message-search-empty" className="text-sm text-neutral-600">
          No conversation matches.
        </p>
      ) : null}
      {search.status === 'ready' && search.results.length > 0 ? (
        <ul data-testid="chat-queue-message-search-results" className="space-y-1">
          {search.results.map((hit) => (
            <li key={`${hit.cardId}-${hit.seq}`}>
              <button
                type="button"
                data-testid={`chat-queue-message-hit-${hit.cardId}-${hit.seq}`}
                onClick={() => onOpen(hit.cardId)}
                className="w-full rounded-lg border border-neutral-200 p-3 text-left text-sm hover:bg-neutral-50"
              >
                <span className="line-clamp-1 text-xs font-medium text-neutral-500">
                  {bodies.get(hit.cardId) ?? 'Card'}
                </span>
                <span className="mt-0.5 block">
                  <span className="text-xs uppercase text-neutral-500">
                    {hit.role === 'user' ? 'You' : 'Tutor'}
                  </span>{' '}
                  {hit.snippet}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {search.status === 'ready' && search.results.length > 0 && search.hasMore ? (
        <p data-testid="chat-queue-message-search-more" className="text-xs text-neutral-600">
          Showing the first {search.results.length}, refine your search
        </p>
      ) : null}
    </div>
  )
}
