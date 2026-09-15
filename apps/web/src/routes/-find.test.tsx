// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import type { TopicModuleSearchResult } from '@post-anki/shared'

import { FindPage } from './find'
import { searchTopicsAndModules } from '../curriculum/curriculum.api'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
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
})
