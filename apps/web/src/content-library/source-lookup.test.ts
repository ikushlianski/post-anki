import { describe, expect, it } from 'vitest'

import type { LibrarySource } from '@post-anki/shared'

import { buildSourceLookup, sourceDisplayLabel } from './source-lookup'

function source(overrides: Partial<LibrarySource> & { id: string }): LibrarySource {
  return {
    curriculumId: 'c1',
    curriculumName: 'React',
    subjectId: 'subj1',
    subjectName: 'Web',
    kind: 'link',
    value: 'https://example.com',
    title: null,
    fetchState: 'fetched',
    lastFetchedAt: null,
    lastFetchOutcome: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildSourceLookup', () => {
  it('indexes sources by id', () => {
    const lookup = buildSourceLookup([source({ id: 'a' }), source({ id: 'b' })])

    expect(Object.keys(lookup)).toEqual(['a', 'b'])
  })
})

describe('sourceDisplayLabel', () => {
  it('prefers the title when present', () => {
    expect(sourceDisplayLabel(source({ id: 'a', title: 'React docs' }))).toBe('React docs')
  })

  it('falls back to the raw value when there is no title', () => {
    expect(sourceDisplayLabel(source({ id: 'a', title: null, value: 'https://x.com' }))).toBe(
      'https://x.com',
    )
  })

  it('renders a neutral label for a missing source rather than crashing', () => {
    expect(sourceDisplayLabel(undefined)).toBe('Unknown source')
  })
})
