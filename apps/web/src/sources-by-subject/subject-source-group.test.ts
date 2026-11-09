import { describe, expect, it } from 'vitest'
import type { LibrarySource } from '@post-anki/shared'

import { groupSourcesBySubject } from './subject-source-group'

const library = (over: Partial<LibrarySource>): LibrarySource => ({
  id: 'l1',
  curriculumId: 'c1',
  curriculumName: 'Curriculum',
  subjectId: 's-english',
  subjectName: 'English',
  kind: 'link',
  value: 'https://example.com/a',
  title: 'An article',
  fetchState: 'fetched',
  lastFetchedAt: null,
  lastFetchOutcome: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

describe('groupSourcesBySubject', () => {
  it('should list subjects alphabetically so the page order is predictable', () => {
    const groups = groupSourcesBySubject(
      [
        library({ id: 'a', subjectId: 'z', subjectName: 'Zoology' }),
        library({ id: 'b', subjectId: 'a', subjectName: 'Algebra' }),
      ],
    )

    expect(groups.map((group) => group.subjectName)).toEqual(['Algebra', 'Zoology'])
  })

  it('should fall back to the link address when a library source has no title', () => {
    const groups = groupSourcesBySubject([library({ title: null })])

    expect(groups[0].items[0].title).toBe('https://example.com/a')
  })

  it('should return no groups when there are no sources', () => {
    expect(groupSourcesBySubject([])).toEqual([])
  })

  it('should not make a javascript: library value clickable', () => {
    const groups = groupSourcesBySubject([library({ value: 'javascript:alert(1)' })])

    expect(groups[0].items[0].href).toBeNull()
  })

  const subjects = [
    { id: 'biz', name: 'Business', parentId: null },
    { id: 'biz-common', name: 'Common', parentId: 'biz' },
    { id: 'eng', name: 'English', parentId: null },
    { id: 'eng-common', name: 'Common', parentId: 'eng' },
  ]

  it('should keep two subjects both named Common apart by showing their full paths', () => {
    const groups = groupSourcesBySubject(
      [
        library({ id: 'a', subjectId: 'eng-common', subjectName: 'Common' }),
        library({ id: 'b', subjectId: 'biz-common', subjectName: 'Common' }),
      ],
      subjects,
    )

    expect(groups.map((group) => group.subjectName)).toEqual(['Business › Common', 'English › Common'])
  })

  it('should place a child group right after its parent and before the next root', () => {
    const groups = groupSourcesBySubject(
      [
        library({ id: 'a', subjectId: 'eng', subjectName: 'English' }),
        library({ id: 'b', subjectId: 'eng-common', subjectName: 'Common' }),
        library({ id: 'c', subjectId: 'biz', subjectName: 'Business' }),
      ],
      subjects,
    )

    expect(groups.map((group) => group.subjectName)).toEqual(['Business', 'English', 'English › Common'])
  })

  it('should not double the path when the library subject name already contains it', () => {
    const groups = groupSourcesBySubject(
      [library({ subjectId: 'unknown', subjectName: 'English › Common' })],
      subjects,
    )

    expect(groups[0].subjectName).toBe('English › Common')
  })

  it('should say whether a library link downloaded, failed or is not fetched yet', () => {
    const details = groupSourcesBySubject(
      [
        library({ id: 'a', title: 'A', fetchState: 'stale_failed' }),
        library({ id: 'b', title: 'B', fetchState: 'never_fetched' }),
        library({ id: 'c', title: 'C', fetchState: 'fetched', lastFetchedAt: '2026-11-03T08:00:00.000Z' }),
      ],
    )[0].items.map((item) => item.detail)

    expect(details[0]).toContain('download failed')
    expect(details[1]).toContain('not downloaded yet')
    expect(details[2]).toContain('downloaded 2026-11-03')
  })
})
