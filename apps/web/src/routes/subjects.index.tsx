import { createFileRoute } from '@tanstack/react-router'

import { KnowledgeSubjectsScreen } from '../knowledge-bit/knowledge-subjects-screen'
import { pageHead } from '../shared/page-title'

export const Route = createFileRoute('/subjects/')({
  head: pageHead('Subjects'),
  component: KnowledgeSubjectsScreen,
})
