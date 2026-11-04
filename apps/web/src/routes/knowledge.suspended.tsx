import { createFileRoute } from '@tanstack/react-router'

import { SuspendedCardsScreen } from '../knowledge-bit/suspended-cards-screen'
import { pageHead } from '../shared/page-title'

export const Route = createFileRoute('/knowledge/suspended')({
  head: pageHead('Suspended cards'),
  component: SuspendedCardsRoute,
})

function SuspendedCardsRoute() {
  return <SuspendedCardsScreen />
}
