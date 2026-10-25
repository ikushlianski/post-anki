import { createFileRoute } from '@tanstack/react-router'

import { KnowledgeSubjectsScreen } from '../knowledge-bit/knowledge-subjects-screen'

export const Route = createFileRoute('/subjects/')({
  component: KnowledgeSubjectsScreen,
})
