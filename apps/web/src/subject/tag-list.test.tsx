// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

import { listTagMasteryStatuses } from '../curriculum/curriculum.api'
import { listTags } from '../curriculum/curriculum.api'
import { TagList } from './tag-list'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    'data-testid': testId,
  }: {
    to: string
    params: Record<string, string>
    children: ReactNode
    'data-testid': string
  }) => (
    <a href={to} data-testid={testId} data-params={JSON.stringify(params)}>
      {children}
    </a>
  ),
}))

vi.mock('../curriculum/curriculum.api')

const mockedListTags = vi.mocked(listTags)
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

describe('TagList strength badges', () => {
  it('shows the correct label for each mastery status', async () => {
    mockedListTags.mockResolvedValue([
      { id: 'tag-strong', name: 'Strong', normalizedName: 'strong' },
      { id: 'tag-shallow', name: 'Shallow', normalizedName: 'shallow' },
      { id: 'tag-weak', name: 'Weak', normalizedName: 'weak' },
      { id: 'tag-untested', name: 'Untested', normalizedName: 'untested' },
    ])
    mockedListTagMasteryStatuses.mockResolvedValue([
      { tagId: 'tag-strong', name: 'Strong', status: 'mastered' },
      { tagId: 'tag-shallow', name: 'Shallow', status: 'practicing' },
      { tagId: 'tag-weak', name: 'Weak', status: 'struggling' },
      { tagId: 'tag-untested', name: 'Untested', status: 'new' },
    ])

    renderWithClient(<TagList />)

    expect((await screen.findByTestId('tag-list-strength-tag-strong')).textContent).toBe('strong')
    expect((await screen.findByTestId('tag-list-strength-tag-shallow')).textContent).toBe(
      'shallow',
    )
    expect((await screen.findByTestId('tag-list-strength-tag-weak')).textContent).toBe('weak')
    expect((await screen.findByTestId('tag-list-strength-tag-untested')).textContent).toBe(
      'untested',
    )
  })
})
