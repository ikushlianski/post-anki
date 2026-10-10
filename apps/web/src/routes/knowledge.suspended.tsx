import { createFileRoute } from '@tanstack/react-router'

import { SuspendedCardsScreen } from '../knowledge-bit/suspended-cards-screen'

export const Route = createFileRoute('/knowledge/suspended')({
  component: SuspendedCardsRoute,
})

function SuspendedCardsRoute() {
  return <SuspendedCardsScreen />
}
