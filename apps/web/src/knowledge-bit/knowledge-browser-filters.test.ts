import { describe, expect, it } from 'vitest'

import {
  applyFilterPatch,
  buildFilterChips,
  countActiveFilters,
  filteredColumns,
  filtersFromSearch,
  hasAnyFilter,
  localDayBound,
  meaningWordsFrom,
  parseBrowserSearch,
  removeChip,
  searchFromFilters,
  toApiFilters,
} from './knowledge-browser-filters'

describe('browser filters in the page address', () => {
  it('should reopen the same view from a shared link', () => {
    const search = searchFromFilters({
      question: 'pod',
      origins: ['article', 'notion'],
      from: '2026-01-01',
      states: ['new'],
    })

    expect(filtersFromSearch(search)).toEqual({
      question: 'pod',
      origins: ['notion', 'article'],
      from: '2026-01-01',
      states: ['new'],
    })
  })

  it('should ignore a broken filter value instead of failing the page', () => {
    const search = parseBrowserSearch({
      subject: 's1',
      origins: 'article,bogus',
      link: 'maybe',
      from: 'yesterday',
      states: 'nope',
    })

    expect(search).toEqual({ subject: 's1', origins: 'article' })
  })

  it('should read a number typed into the address as text', () => {
    expect(parseBrowserSearch({ question: 42 })).toEqual({ question: '42' })
  })

  it('should keep the subjects view marker and drop an empty subject', () => {
    expect(parseBrowserSearch({ view: 'subjects', subject: '' })).toEqual({ view: 'subjects' })
  })

  it('should reopen the open piece from a shared link without counting it as a filter', () => {
    const search = parseBrowserSearch({ open: ' b1 ', question: 'pod' })

    expect(search).toEqual({ open: 'b1', question: 'pod' })
    expect(countActiveFilters(filtersFromSearch(search))).toBe(1)
    expect(hasAnyFilter(filtersFromSearch(search))).toBe(true)
    expect(hasAnyFilter(filtersFromSearch({ open: 'b1' }))).toBe(false)
  })

  it('should drop an empty open piece from the address', () => {
    expect(parseBrowserSearch({ open: '  ' })).toEqual({})
  })

  it('should treat a typed site as a link requirement', () => {
    expect(filtersFromSearch({ site: 'https://www.wikipedia.org/wiki/X' })).toEqual({
      link: 'has',
      site: 'wikipedia.org',
    })
  })
})

describe('local day bounds', () => {
  it('should turn a chosen day into the start and end of that day in the owner time zone', () => {
    const start = new Date(localDayBound('2026-03-04', 'start'))
    const end = new Date(localDayBound('2026-03-04', 'end'))

    expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()]).toEqual([2026, 2, 4, 0])
    expect([end.getDate(), end.getHours(), end.getMinutes()]).toEqual([4, 23, 59])
  })

  it('should leave a full instant untouched and convert only the dates sent to the server', () => {
    expect(localDayBound('2026-03-04T10:00:00.000Z', 'end')).toBe('2026-03-04T10:00:00.000Z')
    expect(toApiFilters({ question: 'x', from: '2026-03-04' }).question).toBe('x')
    expect(toApiFilters({ from: '2026-03-04' }).from).toContain('T')
  })
})

describe('active filter chips', () => {
  const filters = filtersFromSearch({
    question: 'pod',
    origins: 'article,notion',
    site: 'wikipedia.org',
    from: '2026-01-01',
    to: '2026-02-01',
    states: 'new,buried',
  })

  it('should show one readable chip per active filter', () => {
    expect(buildFilterChips(filters).map((chip) => chip.label)).toEqual([
      'Question: pod',
      'Source: Notion, Article',
      'Site: wikipedia.org',
      'Added 2026-01-01 to 2026-02-01',
      'Study state: New, Buried',
    ])
    expect(countActiveFilters(filters)).toBe(5)
  })

  it('should remove only that filter when its chip is clicked', () => {
    const chip = buildFilterChips(filters).find((item) => item.key === 'link')

    expect(chip && removeChip(filters, chip)).toEqual({
      question: 'pod',
      origins: ['notion', 'article'],
      from: '2026-01-01',
      to: '2026-02-01',
      states: ['new', 'buried'],
    })
  })

  it('should report no filter once everything is cleared', () => {
    expect(hasAnyFilter({})).toBe(false)
    expect(hasAnyFilter(filters)).toBe(true)
  })

  it('should know which columns carry a filter, hidden or not', () => {
    expect([...filteredColumns(filters)].sort()).toEqual(['addedAt', 'phrasings', 'source', 'sourceUrl'])
  })
})

describe('applying a filter change', () => {
  it('should drop a filter set back to empty', () => {
    expect(applyFilterPatch({ question: 'pod', answer: 'x' }, { question: '' })).toEqual({ answer: 'x' })
    expect(applyFilterPatch({ origins: ['article'] }, { origins: [] })).toEqual({})
  })

  it('should add a filter next to the existing ones', () => {
    expect(applyFilterPatch({ question: 'pod' }, { origins: ['manual'] })).toEqual({
      question: 'pod',
      origins: ['manual'],
    })
  })
})

describe('meaning search words in the page address', () => {
  it('should keep trimmed meaning words from a shared link next to the filters', () => {
    expect(parseBrowserSearch({ q: '  how does the heart pump ', question: 'pod' })).toEqual({
      q: 'how does the heart pump',
      question: 'pod',
    })
  })

  it('should drop empty or non-text meaning words and cap long ones at 300 characters', () => {
    expect(parseBrowserSearch({ q: '   ' })).toEqual({})
    expect(parseBrowserSearch({ q: ['a'] })).toEqual({})
    expect(meaningWordsFrom('x'.repeat(400))?.length).toBe(300)
  })
})
