import { createFileRoute } from '@tanstack/react-router'

import { ChatQueueScreen } from '../chat-queue/chat-queue-screen'
import { pageHead } from '../shared/page-title'

export const Route = createFileRoute('/knowledge/chat')({
  head: pageHead('Chat'),
  validateSearch: (search: Record<string, unknown>): { card?: string } => ({
    card: typeof search.card === 'string' && search.card ? search.card : undefined,
  }),
  component: ChatQueueRoute,
})

function ChatQueueRoute() {
  const { card } = Route.useSearch()

  return <ChatQueueScreen initialCardId={card} />
}
