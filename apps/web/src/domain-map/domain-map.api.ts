import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { DomainNodeTreeItem } from '@post-anki/shared'

import { getDomainMap, listSubjects, setCurriculumDomainNode } from '../curriculum/api-client'
import type { Curriculum, Subject } from '../curriculum/model'

// SSR-first, loader-seeded — deliberately not Electric-dependent (see
// spec.md's own note on subject.$subjectId.map.tsx: this view has no
// live-multi-client requirement, so it stays on the simpler
// loader/router.invalidate() pattern rather than reintroducing the
// Electric-only-read risk the batch-practice-electric-fallback item fixed
// elsewhere).
export const getDomainMapForSubject = createServerFn({ method: 'GET' })
  .inputValidator((subjectId: string) => z.string().parse(subjectId))
  .handler(({ data }): Promise<DomainNodeTreeItem[]> => getDomainMap(data))

// No dedicated GET /subjects/:id endpoint exists — mirrors getBoard()'s own
// approach of listing every subject and finding the one needed, rather than
// adding a new backend route for a single lookup this route alone needs.
export const getSubjectForMap = createServerFn({ method: 'GET' })
  .inputValidator((subjectId: string) => z.string().parse(subjectId))
  .handler(async ({ data }): Promise<Subject | null> => {
    const subjects = await listSubjects()

    return subjects.find((subject) => subject.id === data) ?? null
  })

export const changeCurriculumPlacement = createServerFn({ method: 'POST' })
  .inputValidator((data: { curriculumId: string; domainNodeId: string | null }) => data)
  .handler(({ data }): Promise<Curriculum> =>
    setCurriculumDomainNode(data.curriculumId, data.domainNodeId),
  )
