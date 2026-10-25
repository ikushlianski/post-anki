import type { SubjectCheckNewSubject } from '@post-anki/shared'

import { createSubject } from '../subject/subject.api'

export async function createProposedSubject(proposal: SubjectCheckNewSubject): Promise<string> {
  const created = await createSubject({
    data: {
      name: proposal.name,
      kind: proposal.kind === 'language' ? 'language-practice' : 'architecture-mentor',
      parentId: proposal.parentSubjectId,
    },
  })

  return created.id
}
