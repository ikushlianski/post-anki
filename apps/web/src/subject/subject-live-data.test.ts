// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'

import { useLiveCurriculumCount, useLiveSubjects } from './subject-live-data'

const live = vi.hoisted(() => ({ useLiveQuery: vi.fn() }))

vi.mock('@tanstack/react-db', () => ({ useLiveQuery: live.useLiveQuery }))

vi.mock('../curriculum/board.collection', () => ({
  curriculaCollection: { id: 'curricula' },
  subjectsCollection: { id: 'subjects' },
  mapSubjectRow: (row: { id: string; name: string; require_sources: boolean; kind: string }) => ({
    id: row.id,
    name: row.name,
    requireSources: row.require_sources,
    kind: row.kind,
    modelTier: null,
    parentId: null,
  }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('useLiveCurriculumCount', () => {
  it('should count only the curricula that belong to the subject', () => {
    live.useLiveQuery.mockReturnValue({
      status: 'ready',
      data: [
        { id: 'c1', subject_id: 'bio' },
        { id: 'c2', subject_id: 'bio' },
        { id: 'c3', subject_id: 'chem' },
      ],
    })

    const { result } = renderHook(() => useLiveCurriculumCount('bio'))

    expect(result.current).toBe(2)
  })

  it('should return null until the curricula have finished syncing so no count is shown as zero', () => {
    live.useLiveQuery.mockReturnValue({ status: 'loading', data: [] })

    const { result } = renderHook(() => useLiveCurriculumCount('bio'))

    expect(result.current).toBeNull()
  })
})

describe('useLiveSubjects', () => {
  it('should return the mapped subjects once they are ready', () => {
    live.useLiveQuery.mockReturnValue({
      status: 'ready',
      data: [{ id: 'bio', name: 'Biology', require_sources: false, kind: 'architecture-mentor' }],
    })

    const { result } = renderHook(() => useLiveSubjects())

    expect(result.current).toEqual([
      {
        id: 'bio',
        name: 'Biology',
        requireSources: false,
        kind: 'architecture-mentor',
        modelTier: null,
        parentId: null,
      },
    ])
  })

  it('should return null while the subjects are still syncing', () => {
    live.useLiveQuery.mockReturnValue({ status: 'loading', data: undefined })

    const { result } = renderHook(() => useLiveSubjects())

    expect(result.current).toBeNull()
  })
})
