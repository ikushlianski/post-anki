import { createServerFn } from '@tanstack/react-start'
import type { SubjectHierarchyRow } from '@post-anki/core'
import type { LibrarySource, NotionIngestionSource } from '@post-anki/shared'

import { listLibrarySources as fetchLibrarySources } from '../content-library/content-library.api-client'
import { request } from '../curriculum/api-client'

export type SourcesBySubjectData = {
  notionSources: NotionIngestionSource[]
  librarySources: LibrarySource[]
  subjects: SubjectHierarchyRow[]
  notionFailed: boolean
  libraryFailed: boolean
  subjectsFailed: boolean
}

async function settle<T>(call: () => Promise<T>, fallback: T): Promise<{ value: T; failed: boolean }> {
  try {
    return { value: await call(), failed: false }
  } catch {
    return { value: fallback, failed: true }
  }
}

export const loadSourcesBySubject = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SourcesBySubjectData> => {
    const [notion, library, subjects] = await Promise.all([
      settle(async () => (await request<{ sources: NotionIngestionSource[] }>('/notion-sources')).sources, []),
      settle(() => fetchLibrarySources(), []),
      settle(
        async () =>
          (await request<SubjectHierarchyRow[]>('/subjects')).map(({ id, name, parentId }) => ({ id, name, parentId })),
        [],
      ),
    ])

    return {
      notionSources: notion.value,
      librarySources: library.value,
      subjects: subjects.value,
      notionFailed: notion.failed,
      libraryFailed: library.failed,
      subjectsFailed: subjects.failed,
    }
  },
)
