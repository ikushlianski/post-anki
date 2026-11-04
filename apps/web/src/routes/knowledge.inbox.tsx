import { createFileRoute } from '@tanstack/react-router'

import { KnowledgeBitInboxScreen } from '../knowledge-bit/knowledge-bit-inbox-screen'
import { pageHead } from '../shared/page-title'

export const Route = createFileRoute('/knowledge/inbox')({
  head: pageHead('Set aside'),
  component: KnowledgeBitInboxScreen,
})
