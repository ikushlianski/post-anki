import { createFileRoute } from '@tanstack/react-router'

import { TriageHistoryPage } from '../card-triage/triage-history-page'
import { pageHead } from '../shared/page-title'

export const Route = createFileRoute('/knowledge/triage-history')({
  head: pageHead('Triage history'),
  component: TriageHistoryPage,
})
