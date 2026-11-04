import { useEffect, useState } from 'react'
import { CHAT_QUEUE_SEARCH_MIN_CHARS, type ChatQueueSearchResult } from '@post-anki/shared'

import { searchChatQueue } from './chat-queue.api'

export const CHAT_QUEUE_SEARCH_DEBOUNCE_MS = 300

export type ChatQueueSearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; results: ChatQueueSearchResult[]; hasMore: boolean }

export function useChatQueueSearch(query: string): ChatQueueSearchState {
  const term = query.trim()
  const [state, setState] = useState<ChatQueueSearchState>({ status: 'idle' })
  const active = term.length >= CHAT_QUEUE_SEARCH_MIN_CHARS

  useEffect(() => {
    if (!active) return

    let current = true

    setState({ status: 'loading' })

    const timer = setTimeout(async () => {
      try {
        const outcome = await searchChatQueue({ data: { q: term } })

        if (current) {
          setState(
            outcome.ok
              ? { status: 'ready', results: outcome.data.results, hasMore: outcome.data.hasMore === true }
              : { status: 'error' },
          )
        }
      } catch {
        if (current) setState({ status: 'error' })
      }
    }, CHAT_QUEUE_SEARCH_DEBOUNCE_MS)

    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [active, term])

  return active ? state : { status: 'idle' }
}
