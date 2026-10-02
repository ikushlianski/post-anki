// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import type { TopicModuleSearchResult } from '@post-anki/shared'

import { FindPage } from './find'
import { searchTopicsAndModules } from '../curriculum/curriculum.api'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
    params,
    ...rest
  }: {
    children: ReactNode
    to?: string
    search?: Record<string, unknown>
    params?: Record<string, unknown>
  } & Record<string, unknown>) => (
    <a
      href="#"
      data-to={to}
      data-search={search ? JSON.stringify(search) : undefined}
      data-params={params ? JSON.stringify(params) : undefined}
      {...rest}
    >
      {children}
    </a>
  ),
  createFileRoute: () => (options: unknown) => options,
}))

vi.mock('../curriculum/curriculum.api', () => ({
  searchTopicsAndModules: vi.fn(),
}))

const mockedSearch = vi.mocked(searchTopicsAndModules)

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

describe('FindPage', () => {
  afterEach(() => {
    cleanup()
    mockedSearch.mockReset()
  })

  it('shows a distinct error message when the search request fails, not a false "no matches"', async () => {
    mockedSearch.mockRejectedValue(new Error('network down'))

    render(<FindPage />)

    await userEvent.type(screen.getByTestId('find-search-input'), 'async')
    await userEvent.click(screen.getByTestId('find-search-button'))

    await waitFor(() => {
      expect(screen.getByTestId('find-search-error')).toBeDefined()
    })

    expect(screen.queryByTestId('find-empty-state')).toBeNull()
  })

  it('shows the no-matches message, naming the query that was actually searched', async () => {
    mockedSearch.mockResolvedValue([])

    render(<FindPage />)

    await userEvent.type(screen.getByTestId('find-search-input'), 'nonexistent')
    await userEvent.click(screen.getByTestId('find-search-button'))

    await waitFor(() => {
      expect(screen.getByTestId('find-empty-state').textContent).toContain('nonexistent')
    })
  })

  it('keeps the no-matches message describing the last submitted query, not an edited but unsubmitted one', async () => {
    mockedSearch.mockResolvedValue([])

    render(<FindPage />)

    const input = screen.getByTestId('find-search-input')

    await userEvent.type(input, 'first query')
    await userEvent.click(screen.getByTestId('find-search-button'))

    await waitFor(() => {
      expect(screen.getByTestId('find-empty-state').textContent).toContain('first query')
    })

    await userEvent.clear(input)
    await userEvent.type(input, 'edited but not submitted')

    expect(screen.getByTestId('find-empty-state').textContent).toContain('first query')
    expect(screen.getByTestId('find-empty-state').textContent).not.toContain(
      'edited but not submitted',
    )
  })

  it('renders a successful result and clears a prior error on retry', async () => {
    mockedSearch.mockRejectedValueOnce(new Error('network down'))
    mockedSearch.mockResolvedValueOnce([result()])

    render(<FindPage />)

    await userEvent.type(screen.getByTestId('find-search-input'), 'async')
    await userEvent.click(screen.getByTestId('find-search-button'))

    await waitFor(() => {
      expect(screen.getByTestId('find-search-error')).toBeDefined()
    })

    await userEvent.click(screen.getByTestId('find-search-button'))

    await waitFor(() => {
      expect(screen.queryByTestId('find-search-error')).toBeNull()
    })

    expect(screen.getByTestId('find-result-topic-top_1')).toBeDefined()
  })

  it('links an unplaced knowledge-bit result to the answer queue, scoped to just that bit', async () => {
    mockedSearch.mockResolvedValue([
      result({
        id: 'bit_1',
        kind: 'bit',
        title: 'Isolate the component from the world using an HTTP interceptor',
        curriculumId: null,
        curriculumName: null,
      }),
    ])

    render(<FindPage />)

    await userEvent.type(screen.getByTestId('find-search-input'), 'isolate')
    await userEvent.click(screen.getByTestId('find-search-button'))

    await waitFor(() => {
      expect(screen.getByTestId('find-result-bit-bit_1')).toBeDefined()
    })

    const row = screen.getByTestId('find-result-bit-bit_1')
    const link = within(row).getByRole('link')

    expect(link.getAttribute('data-to')).toBe('/knowledge/answer')
    expect(JSON.parse(link.getAttribute('data-search')!)).toEqual({ knowledgeBitId: 'bit_1' })
    expect(screen.getByText('Not yet placed in a course')).toBeDefined()
  })

  it('renders an unplaced topic result as plain text, not a link to the answer queue', async () => {
    mockedSearch.mockResolvedValue([
      result({
        id: 'top_2',
        kind: 'topic',
        title: 'Unplaced topic',
        curriculumId: null,
        curriculumName: null,
      }),
    ])

    render(<FindPage />)

    await userEvent.type(screen.getByTestId('find-search-input'), 'unplaced')
    await userEvent.click(screen.getByTestId('find-search-button'))

    await waitFor(() => {
      expect(screen.getByTestId('find-result-topic-top_2')).toBeDefined()
    })

    const row = screen.getByTestId('find-result-topic-top_2')

    expect(within(row).queryByRole('link')).toBeNull()
  })

  it('shows every matched tag on a search result', async () => {
    mockedSearch.mockResolvedValue([result({ tags: ['performance', 'security'] })])

    render(<FindPage />)

    await userEvent.type(screen.getByTestId('find-search-input'), 'async')
    await userEvent.click(screen.getByTestId('find-search-button'))

    await waitFor(() => {
      expect(screen.getByTestId('find-result-tag-topic-top_1-performance')).toBeDefined()
    })

    expect(screen.getByTestId('find-result-tag-topic-top_1-security')).toBeDefined()
  })
})
