import { createFileRoute } from '@tanstack/react-router'

import { StyleNotesPage } from '../card-triage/style-notes-page'

export const Route = createFileRoute('/knowledge/style-notes')({
  component: StyleNotesPage,
})
