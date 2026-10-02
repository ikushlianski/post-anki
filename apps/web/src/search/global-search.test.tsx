// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import type { SearchResponse, TopicModuleSearchResult } from '@post-anki/shared'

import { GlobalSearch } from './global-search'
import { combineHeaderSearch } from './header-search'
import type { HeaderSearchResults } from './header-search'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    onClick,
    to,
    search,
    params,
    ...rest
  }: {
    children: ReactNode
    onClick?: () => void
    to?: string
    search?: Record<string, unknown>
    params?: Record<string, unknown>
  } & Record<string, unknown>) => (
    <a
      href="#"
      onClick={onClick}
      data-to={to}
      data-search={search ? JSON.stringify(search) : undefined}
      data-params={params ? JSON.stringify(params) : undefined}
      {...rest}
    >
      {children}
    </a>
  ),
}))

function result(overrides: Partial<TopicModuleSearchResult> = {}): TopicModuleSearchResult {
  return {
    id: 'top_1',
    kind: 'topic',
    title: 'Async error handling',
    curriculumId: 'cur_1',
    curriculumName: 'Concurrency',
    rank: 0.5,
    tags: [],
    ...overrides,
  }
}

function legacyResponse(overrides: Partial<SearchResponse> = {}): SearchResponse {
  return {
    subjects: [],
    curricula: [],
    topics: [],
    ...overrides,
  }
}

function emptyResults(overrides: Partial<HeaderSearchResults> = {}): HeaderSearchResults {
  return {
    subjects: [],
    curricula: [],
    items: [],
    ...overrides,
  }
}

describe('GlobalSearch', () => {
  afterEach(() => {
    cleanup()
  })

  it('should surface modules and knowledge bits alongside topics from the header search', async () => {
    const onSearch = vi.fn().mockResolvedValue(
      emptyResults({
        items: [
          result({ id: 'top_1', kind: 'topic', title: 'Async error handling' }),
          result({ id: 'mod_1', kind: 'module', title: 'Error boundaries' }),
          result({ id: 'bit_1', kind: 'bit', title: 'Isolate with an interceptor' }),
        ],
      }),
    )

    render(<GlobalSearch onSearch={onSearch} />)

    await userEvent.type(screen.getByTestId('global-search-input'), 'async')

    await waitFor(() => {
      expect(screen.getByTestId('global-search-result-topic-top_1')).toBeDefined()
    })

    expect(screen.getByText('Topics')).toBeDefined()
    expect(screen.getByText('Modules')).toBeDefined()
    expect(screen.getByText('Knowledge bits')).toBeDefined()
    expect(screen.getByTestId('global-search-result-module-mod_1')).toBeDefined()
    expect(screen.getByTestId('global-search-result-bit-bit_1')).toBeDefined()
  })

  it('should surface subjects and curricula from the legacy search alongside topics/modules/bits', async () => {
    const onSearch = vi.fn().mockResolvedValue(
      emptyResults({
        subjects: [{ id: 'sub_1', label: 'Distributed Systems' }],
        curricula: [{ id: 'cur_2', label: 'Concurrency 101' }],
        items: [result({ id: 'top_1', kind: 'topic', title: 'Async error handling' })],
      }),
    )

    render(<GlobalSearch onSearch={onSearch} />)

    await userEvent.type(screen.getByTestId('global-search-input'), 'async')

    await waitFor(() => {
      expect(screen.getByTestId('global-search-result-subject-sub_1')).toBeDefined()
    })

    expect(screen.getByText('Subjects')).toBeDefined()
    expect(screen.getByText('Curricula')).toBeDefined()
    expect(screen.getByTestId('global-search-result-curriculum-cur_2')).toBeDefined()
    expect(screen.getByText('Distributed Systems')).toBeDefined()
    expect(screen.getByText('Concurrency 101')).toBeDefined()

    // Exactly one "Topics" group — no duplicate from the legacy endpoint's own topics field.
    expect(screen.getAllByText('Topics')).toHaveLength(1)
    expect(screen.getByTestId('global-search-result-topic-top_1')).toBeDefined()
  })

  it('should link an unplaced knowledge bit to the answer queue, scoped to just that bit', async () => {
    const onSearch = vi.fn().mockResolvedValue(
      emptyResults({
        items: [
          result({
            id: 'bit_1',
            kind: 'bit',
            title: 'Isolate the component with an interceptor',
            curriculumId: null,
            curriculumName: null,
          }),
        ],
      }),
    )

    render(<GlobalSearch onSearch={onSearch} />)

    await userEvent.type(screen.getByTestId('global-search-input'), 'isolate')

    await waitFor(() => {
      expect(screen.getByTestId('global-search-result-bit-bit_1')).toBeDefined()
    })

    const row = screen.getByTestId('global-search-result-bit-bit_1')
    const link = within(row).getByRole('link')

    expect(link.getAttribute('data-to')).toBe('/knowledge/answer')
    expect(JSON.parse(link.getAttribute('data-search')!)).toEqual({ knowledgeBitId: 'bit_1' })
    expect(within(row).getByText('Not yet placed in a course')).toBeDefined()
  })

  it('should render an unplaced topic as plain text, not a link to the answer queue', async () => {
    const onSearch = vi.fn().mockResolvedValue(
      emptyResults({
        items: [
          result({
            id: 'top_2',
            kind: 'topic',
            title: 'Unplaced topic',
            curriculumId: null,
            curriculumName: null,
          }),
        ],
      }),
    )

    render(<GlobalSearch onSearch={onSearch} />)

    await userEvent.type(screen.getByTestId('global-search-input'), 'unplaced')

    await waitFor(() => {
      expect(screen.getByTestId('global-search-result-topic-top_2')).toBeDefined()
    })

    const row = screen.getByTestId('global-search-result-topic-top_2')

    expect(within(row).queryByRole('link')).toBeNull()
  })

  it('should show every matched tag on a placed search result that still links to its course', async () => {
    const onSearch = vi.fn().mockResolvedValue(
      emptyResults({
        items: [
          result({
            tags: [
              { id: 'tag_performance', name: 'performance' },
              { id: 'tag_security', name: 'security' },
            ],
          }),
        ],
      }),
    )

    render(<GlobalSearch onSearch={onSearch} />)

    await userEvent.type(screen.getByTestId('global-search-input'), 'async')

    await waitFor(() => {
      expect(screen.getByTestId('global-search-result-topic-top_1')).toBeDefined()
    })

    const row = screen.getByTestId('global-search-result-topic-top_1')

    expect(within(row).getByText('performance')).toBeDefined()
    expect(within(row).getByText('security')).toBeDefined()
    expect(within(row).getAllByRole('link')).toHaveLength(3)
  })

  it('should link a matched tag on a search result to its tag page', async () => {
    const onSearch = vi
      .fn()
      .mockResolvedValue(
        emptyResults({ items: [result({ tags: [{ id: 'tag_performance', name: 'performance' }] })] }),
      )

    render(<GlobalSearch onSearch={onSearch} />)

    await userEvent.type(screen.getByTestId('global-search-input'), 'async')

    const row = await waitFor(() => screen.getByTestId('global-search-result-topic-top_1'))
    const tagLink = within(row).getByText('performance')

    expect(tagLink.getAttribute('data-to')).toBe('/probe/tag/$tagId')
    expect(tagLink.getAttribute('data-params')).toBe(JSON.stringify({ tagId: 'tag_performance' }))
  })

  it('should close the results panel when a result link is clicked', async () => {
    const onSearch = vi.fn().mockResolvedValue(emptyResults({ items: [result()] }))

    render(<GlobalSearch onSearch={onSearch} />)

    await userEvent.type(screen.getByTestId('global-search-input'), 'async')

    await waitFor(() => {
      expect(screen.getByTestId('global-search-result-topic-top_1')).toBeDefined()
    })

    await userEvent.click(
      within(screen.getByTestId('global-search-result-topic-top_1')).getByRole('link'),
    )

    expect(screen.queryByTestId('global-search-results')).toBeNull()
  })

  it('should show "No results" when subjects, curricula and items are all empty', async () => {
    const onSearch = vi.fn().mockResolvedValue(emptyResults())

    render(<GlobalSearch onSearch={onSearch} />)

    await userEvent.type(screen.getByTestId('global-search-input'), 'nonexistent')

    await waitFor(() => {
      expect(screen.getByText('No results')).toBeDefined()
    })
  })
})

describe('combineHeaderSearch', () => {
  it('merges subjects/curricula from the legacy endpoint with items from the new endpoint', async () => {
    const legacy = vi.fn().mockResolvedValue(
      legacyResponse({
        subjects: [{ id: 'sub_1', label: 'Distributed Systems' }],
        curricula: [{ id: 'cur_2', label: 'Concurrency 101' }],
        topics: [{ id: 'legacy_top_1', label: 'Should be dropped', curriculumId: 'cur_2' }],
      }),
    )
    const items = vi.fn().mockResolvedValue([result({ id: 'top_1' })])

    const merged = await combineHeaderSearch(legacy, items)('async')

    expect(merged.subjects).toEqual([{ id: 'sub_1', label: 'Distributed Systems' }])
    expect(merged.curricula).toEqual([{ id: 'cur_2', label: 'Concurrency 101' }])
    expect(merged.items).toEqual([result({ id: 'top_1' })])
    // The legacy endpoint's own `topics` field must never leak into the merged result.
    expect(merged.items.some((item) => item.id === 'legacy_top_1')).toBe(false)
  })

  it('calls both endpoints in parallel rather than sequentially', async () => {
    const callOrder: string[] = []
    let resolveLegacy!: (value: SearchResponse) => void
    let resolveItems!: (value: TopicModuleSearchResult[]) => void

    const legacy = vi.fn().mockImplementation(() => {
      callOrder.push('legacy-called')
      return new Promise<SearchResponse>((resolve) => {
        resolveLegacy = resolve
      })
    })
    const items = vi.fn().mockImplementation(() => {
      callOrder.push('items-called')
      return new Promise<TopicModuleSearchResult[]>((resolve) => {
        resolveItems = resolve
      })
    })

    const pending = combineHeaderSearch(legacy, items)('async')

    // Both calls fire immediately, before either promise resolves.
    expect(callOrder).toEqual(['legacy-called', 'items-called'])

    resolveLegacy(legacyResponse())
    resolveItems([])

    await pending
  })
})
