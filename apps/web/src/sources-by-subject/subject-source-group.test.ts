import { describe, expect, it } from 'vitest'
import type { LibrarySource, NotionIngestionSource } from '@post-anki/shared'

import { groupSourcesBySubject } from './subject-source-group'

const notion = (over: Partial<NotionIngestionSource>): NotionIngestionSource => ({
  id: 'n1',
  name: 'English Phrases',
  pageUrl: 'https://notion.so/p',
  subjectId: 's-english',
  subjectPath: ['Languages', 'English'],
  itemsPerRun: 5,
  frequency: 'daily',
  removeAfterImport: false,
  paused: false,
  nextRunAt: null,
  lastRun: null,
  ...over,
})

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
  it('should show a Notion page and a library link under the same subject when both belong to it', () => {
    const groups = groupSourcesBySubject(
      [notion({})],
      [library({})],
      [
        { id: 'lang', name: 'Languages', parentId: null },
        { id: 's-english', name: 'English', parentId: 'lang' },
      ],
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].subjectName).toBe('Languages › English')
    expect(groups[0].items.map((item) => item.origin).sort()).toEqual(['library', 'notion'])
  })

  it('should list subjects alphabetically so the page order is predictable', () => {
    const groups = groupSourcesBySubject(
      [],
      [
        library({ id: 'a', subjectId: 'z', subjectName: 'Zoology' }),
        library({ id: 'b', subjectId: 'a', subjectName: 'Algebra' }),
      ],
    )

    expect(groups.map((group) => group.subjectName)).toEqual(['Algebra', 'Zoology'])
  })

  it('should mark a paused Notion page as paused so the owner knows it is not importing', () => {
    const groups = groupSourcesBySubject([notion({ paused: true })], [])

    expect(groups[0].items[0].detail).toContain('Paused')
  })

  it('should fall back to the link address when a library source has no title', () => {
    const groups = groupSourcesBySubject([], [library({ title: null })])

    expect(groups[0].items[0].title).toBe('https://example.com/a')
  })

  it('should return no groups when there are no sources', () => {
    expect(groupSourcesBySubject([], [])).toEqual([])
  })

  it('should not make a javascript: library value clickable', () => {
    const groups = groupSourcesBySubject([], [library({ value: 'javascript:alert(1)' })])

    expect(groups[0].items[0].href).toBeNull()
  })

  it('should not make a non-http Notion page address clickable', () => {
    const groups = groupSourcesBySubject([notion({ pageUrl: 'javascript:alert(1)' })], [])

    expect(groups[0].items[0].href).toBeNull()
  })

  it('should keep https links clickable', () => {
    const groups = groupSourcesBySubject([notion({})], [])

    expect(groups[0].items[0].href).toBe('https://notion.so/p')
  })

  const subjects = [
    { id: 'biz', name: 'Business', parentId: null },
    { id: 'biz-common', name: 'Common', parentId: 'biz' },
    { id: 'eng', name: 'English', parentId: null },
    { id: 'eng-common', name: 'Common', parentId: 'eng' },
  ]

  it('should keep two subjects both named Common apart by showing their full paths', () => {
    const groups = groupSourcesBySubject(
      [],
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
      [],
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
      [],
      [library({ subjectId: 'unknown', subjectName: 'English › Common' })],
      subjects,
    )

    expect(groups[0].subjectName).toBe('English › Common')
  })

  it('should use the Notion subject path when the subject list is unavailable', () => {
    const groups = groupSourcesBySubject([notion({})], [])

    expect(groups[0].subjectName).toBe('Languages › English')
  })

  it('should show Never run on a Notion source that has not run yet', () => {
    const groups = groupSourcesBySubject([notion({ lastRun: null })], [])

    expect(groups[0].items[0].detail).toBe('Never run')
  })

  it('should show a failed last run on the Notion row', () => {
    const groups = groupSourcesBySubject(
      [notion({ lastRun: { status: 'failed', finishedAt: null, imported: 0, removed: 0, errorCode: null } })],
      [],
    )

    expect(groups[0].items[0].detail).toContain('Failed')
  })

  it('should say whether a library link downloaded, failed or is not fetched yet', () => {
    const details = groupSourcesBySubject(
      [],
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
