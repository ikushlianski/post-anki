// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

import { listTagMasteryStatuses } from '../curriculum/curriculum.api'
import { TagDeepenList } from './tag-deepen-list'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    search,
    children,
    'data-testid': testId,
  }: {
    to: string
    search?: Record<string, string>
    children: ReactNode
    'data-testid': string
  }) => (
    <a href={to} data-testid={testId} data-search={JSON.stringify(search)}>
      {children}
    </a>
  ),
}))

vi.mock('../curriculum/curriculum.api')

const mockedListTagMasteryStatuses = vi.mocked(listTagMasteryStatuses)

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('TagDeepenList', () => {
  it('shows struggling and practicing tags linked into the answer screen', async () => {
    mockedListTagMasteryStatuses.mockResolvedValue([
      { tagId: 'tag-weak', name: 'Weak', status: 'struggling' },
      { tagId: 'tag-shallow', name: 'Shallow', status: 'practicing' },
      { tagId: 'tag-strong', name: 'Strong', status: 'mastered' },
      { tagId: 'tag-untested', name: 'Untested', status: 'new' },
    ])

    renderWithClient(<TagDeepenList />)

    const weakLink = await screen.findByTestId('tag-deepen-list-item-tag-weak')
    expect(weakLink.getAttribute('href')).toBe('/knowledge/answer')
    expect(weakLink.getAttribute('data-search')).toBe(JSON.stringify({ tagId: 'tag-weak' }))
    expect(weakLink.textContent).toContain('weak')

    const shallowLink = await screen.findByTestId('tag-deepen-list-item-tag-shallow')
    expect(shallowLink.textContent).toContain('shallow')

    expect(screen.queryByTestId('tag-deepen-list-item-tag-strong')).toBeNull()
    expect(screen.queryByTestId('tag-deepen-list-item-tag-untested')).toBeNull()
  })

  it('shows a quiet empty-state message when nothing is struggling or practicing', async () => {
    mockedListTagMasteryStatuses.mockResolvedValue([
      { tagId: 'tag-strong', name: 'Strong', status: 'mastered' },
    ])

    renderWithClient(<TagDeepenList />)

    expect(await screen.findByTestId('tag-deepen-list-empty')).toBeTruthy()
  })

  it('renders no accept/reject controls anywhere in the panel', async () => {
    mockedListTagMasteryStatuses.mockResolvedValue([
      { tagId: 'tag-weak', name: 'Weak', status: 'struggling' },
    ])

    renderWithClient(<TagDeepenList />)

    await screen.findByTestId('tag-deepen-list-item-tag-weak')

    expect(screen.queryByRole('button')).toBeNull()
  })
})
