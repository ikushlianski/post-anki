// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { TopicModuleSearchResult } from '@post-anki/shared'

import { listTagNodes, listTags } from '../curriculum/curriculum.api'
import { TagNodeBrowser } from '../curriculum/tag-node-browser'
import { Route, ViewToggle } from './probe.tag.$tagId'

const mockUseSearch = vi.hoisted(() => vi.fn(() => ({ view: undefined as 'browse' | 'practice' | undefined })))

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
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useParams: () => ({ tagId: 'tag_1' }),
    useSearch: mockUseSearch,
    useLoaderData: () => [{ id: 'tag_1', name: 'performance', normalizedName: 'performance' }],
  }),
}))

vi.mock('../curriculum/probe-session-quiz', () => ({
  ProbeSessionQuiz: () => <div data-testid="mock-quiz" />,
}))

vi.mock('../curriculum/curriculum.api', () => ({
  listTagNodes: vi.fn(),
  listTags: vi.fn(),
}))

const mockedListTagNodes = vi.mocked(listTagNodes)
const mockedListTags = vi.mocked(listTags)

function node(overrides: Partial<TopicModuleSearchResult> = {}): TopicModuleSearchResult {
  return {
    id: 'top_1',
    kind: 'topic',
    title: 'Timeouts and retries',
    curriculumId: 'cur_1',
    curriculumName: 'Reliability',
    rank: 0,
    tags: [{ id: 'tag_1', name: 'performance' }],
    ...overrides,
  }
}

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('TagNodeBrowser', () => {
  afterEach(() => {
    cleanup()
    mockedListTagNodes.mockReset()
  })

  it('shows every topic, module, and bit tagged this tag', async () => {
    mockedListTagNodes.mockResolvedValue({
      nodes: [
        node({ id: 'top_1', kind: 'topic' }),
        node({ id: 'bit_1', kind: 'bit', title: 'Retry budgets cap cascading failure' }),
      ],
      capped: false,
    })

    renderWithClient(<TagNodeBrowser tagId="tag_perf_1" />)

    await waitFor(() => {
      expect(screen.getByTestId('tag-browse-result-topic-top_1')).toBeDefined()
    })

    expect(screen.getByTestId('tag-browse-result-bit-bit_1')).toBeDefined()
    expect(mockedListTagNodes).toHaveBeenCalledWith({ data: 'tag_perf_1' })
  })

  it('links an unplaced knowledge bit straight to the answer queue, scoped to just that bit', async () => {
    mockedListTagNodes.mockResolvedValue({
      nodes: [
        node({
          id: 'bit_2',
          kind: 'bit',
          title: 'Isolate with an HTTP interceptor',
          curriculumId: null,
          curriculumName: null,
        }),
      ],
      capped: false,
    })

    renderWithClient(<TagNodeBrowser tagId="tag_perf_1" />)

    await waitFor(() => {
      expect(screen.getByTestId('tag-browse-result-bit-bit_2')).toBeDefined()
    })

    const row = screen.getByTestId('tag-browse-result-bit-bit_2')
    const link = within(row).getByRole('link')

    expect(link.getAttribute('data-to')).toBe('/knowledge/answer')
    expect(JSON.parse(link.getAttribute('data-search')!)).toEqual({ knowledgeBitId: 'bit_2' })
  })

  it('renders an unplaced topic as plain text, not a dead link', async () => {
    mockedListTagNodes.mockResolvedValue({
      nodes: [node({ id: 'top_2', kind: 'topic', curriculumId: null, curriculumName: null })],
      capped: false,
    })

    renderWithClient(<TagNodeBrowser tagId="tag_perf_1" />)

    await waitFor(() => {
      expect(screen.getByTestId('tag-browse-result-topic-top_2')).toBeDefined()
    })

    const row = screen.getByTestId('tag-browse-result-topic-top_2')

    expect(within(row).queryByRole('link')).toBeNull()
  })

  it('shows an empty-state message, not a blank screen, when nothing is tagged', async () => {
    mockedListTagNodes.mockResolvedValue({ nodes: [], capped: false })

    renderWithClient(<TagNodeBrowser tagId="tag_perf_1" />)

    await waitFor(() => {
      expect(screen.getByTestId('tag-browse-empty')).toBeDefined()
    })
  })

  it('shows a distinct error message, not a false empty state, when the request fails', async () => {
    mockedListTagNodes.mockRejectedValue(new Error('network down'))

    renderWithClient(<TagNodeBrowser tagId="tag_perf_1" />)

    await waitFor(() => {
      expect(screen.getByTestId('tag-browse-error')).toBeDefined()
    })

    expect(screen.queryByTestId('tag-browse-empty')).toBeNull()
  })

  it('shows a capped notice when the backend reports more nodes than it returned', async () => {
    mockedListTagNodes.mockResolvedValue({ nodes: [node({ id: 'top_1', kind: 'topic' })], capped: true })

    renderWithClient(<TagNodeBrowser tagId="tag_perf_1" />)

    await waitFor(() => {
      expect(screen.getByTestId('tag-browse-capped')).toBeDefined()
    })
  })

  it('does not show a capped notice when the backend returned everything tagged', async () => {
    mockedListTagNodes.mockResolvedValue({ nodes: [node({ id: 'top_1', kind: 'topic' })], capped: false })

    renderWithClient(<TagNodeBrowser tagId="tag_perf_1" />)

    await waitFor(() => {
      expect(screen.getByTestId('tag-browse-result-topic-top_1')).toBeDefined()
    })

    expect(screen.queryByTestId('tag-browse-capped')).toBeNull()
  })
})

describe('TagProbeRoom default view', () => {
  const TagProbeRoom = (Route as unknown as { component: () => ReactNode }).component

  afterEach(() => {
    cleanup()
    mockedListTagNodes.mockReset()
    mockedListTags.mockReset()
    mockUseSearch.mockReset()
  })

  it('opens on Practice with the quiz mounted when no view is requested', async () => {
    mockedListTags.mockResolvedValue([{ id: 'tag_1', name: 'performance', normalizedName: 'performance' }])
    mockUseSearch.mockReturnValue({ view: undefined })

    renderWithClient(<TagProbeRoom />)

    await waitFor(() => {
      expect(screen.getByTestId('mock-quiz')).toBeDefined()
    })

    expect(screen.queryByTestId('tag-browse-results')).toBeNull()
  })

  it('switches to Browse once it is explicitly requested via ?view=browse', async () => {
    mockedListTags.mockResolvedValue([{ id: 'tag_1', name: 'performance', normalizedName: 'performance' }])
    mockedListTagNodes.mockResolvedValue({ nodes: [node()], capped: false })
    mockUseSearch.mockReturnValue({ view: 'browse' })

    renderWithClient(<TagProbeRoom />)

    await waitFor(() => {
      expect(screen.getByTestId('tag-browse-result-topic-top_1')).toBeDefined()
    })

    expect(screen.queryByTestId('mock-quiz')).toBeNull()
  })
})

describe('Route.validateSearch', () => {
  const validateSearch = (Route as unknown as {
    validateSearch: (search: Record<string, unknown>) => { view: string }
  }).validateSearch

  it('defaults to practice, and falls back to practice on an unrecognized value', () => {
    expect(validateSearch({})).toEqual({ view: 'practice' })
    expect(validateSearch({ view: 'junk' })).toEqual({ view: 'practice' })
  })

  it('honors an explicit practice request', () => {
    expect(validateSearch({ view: 'practice' })).toEqual({ view: 'practice' })
  })
})

describe('ViewToggle', () => {
  const tag = { id: 'tag_1', name: 'performance', normalizedName: 'performance' }

  afterEach(() => {
    cleanup()
  })

  it('highlights Browse and links Practice to the explicit opt-in, when Browse is active', () => {
    render(<ViewToggle tag={tag} view="browse" />)

    const browseLink = screen.getByTestId('tag-room-view-browse')
    const practiceLink = screen.getByTestId('tag-room-view-practice')

    expect(browseLink.className).toContain('bg-neutral-900')
    expect(practiceLink.className).not.toContain('bg-neutral-900')
    expect(JSON.parse(practiceLink.getAttribute('data-search')!)).toEqual({ view: 'practice' })
  })

  it('highlights Practice, not Browse, once the learner has opted into it', () => {
    render(<ViewToggle tag={tag} view="practice" />)

    const browseLink = screen.getByTestId('tag-room-view-browse')
    const practiceLink = screen.getByTestId('tag-room-view-practice')

    expect(practiceLink.className).toContain('bg-neutral-900')
    expect(browseLink.className).not.toContain('bg-neutral-900')
  })
})
