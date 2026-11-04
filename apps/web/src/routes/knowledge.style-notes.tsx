import { createFileRoute } from '@tanstack/react-router'

import { StyleNotesPage } from '../card-triage/style-notes-page'
import { pageHead } from '../shared/page-title'

export const Route = createFileRoute('/knowledge/style-notes')({
  head: pageHead('Style notes'),
  component: StyleNotesPage,
})
