// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { KnowledgeBitBrowserFilters, KnowledgeBitBrowserItem, KnowledgeBitDetail } from '@post-anki/shared'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to: _to, search: _search, ...rest }: { children: ReactNode; to?: string; search?: unknown } & Record<string, unknown>) => (
    <a href="#" {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('../knowledge-source/add-knowledge-button', () => ({ AddKnowledgeButton: () => null }))
vi.mock('./knowledge-browser-purge.api', () => ({ purgeKnowledgeBits: vi.fn() }))
vi.mock('./knowledge-browser-source.api', () => ({ deleteKnowledgeSourceById: vi.fn() }))
vi.mock('./use-knowledge-overview-subjects', () => ({
  useKnowledgeOverviewSubjects: () => ({ options: [], labelFor: () => 'Math' }),
}))

const world = vi.hoisted(() => ({
  rows: [] as { knowledgeBitId: string }[],
  matches: { active: false, rows: [] as { knowledgeBitId: string }[] },
  detail: vi.fn(),
}))

vi.mock('./knowledge-browser-detail.api', () => ({ getKnowledgeBrowserDetail: world.detail }))
vi.mock('./use-knowledge-browser-data', () => ({
  KNOWLEDGE_BROWSER_QUERY_KEY: ['knowledge-bits', 'browser'],
  useKnowledgeBrowserRows: () => ({
    rows: world.rows,
    total: world.rows.length,
    isPending: false,
    isError: false,
    hasMore: false,
    loadingMore: false,
    loadMore: vi.fn(),
    retry: vi.fn(),
  }),
}))
vi.mock('./use-knowledge-browser-matches', () => ({
  useKnowledgeBrowserMatches: () => ({
    active: world.matches.active,
    status: world.matches.active ? 'success' : 'off',
    rows: world.matches.rows,
    readyCount: world.matches.rows.length,
    notReadyCount: 0,
    capped: false,
    errorCode: null,
    retry: vi.fn(),
  }),
}))

import { KnowledgeBrowserScreen } from './knowledge-browser-screen'

const make = (id: string): KnowledgeBitBrowserItem => ({
  knowledgeBitId: id,
  phrasings: [{ id: `v-${id}`, kind: 'basic', prompt: `Q ${id}` }],
  answer: `A ${id}`,
  origin: 'manual',
  addedAt: '2026-03-04T12:00:00.000Z',
  sourcePieceCount: 1,
})

const detailFor = (id: string): KnowledgeBitDetail => ({
  knowledgeBitId: id,
  body: `Body ${id}`,
  context: null,
  phrasings: [
    { id: `v-${id}`, kind: 'basic', kindLabel: 'Basic', prompt: `Q ${id}`, answer: `A ${id}`, sentence: null },
  ],
  subjectPath: ['Math'],
  tags: [],
  origin: 'manual',
  addedBy: 'you',
  sourceId: null,
  sourceLabel: null,
  sourceUrl: null,
  addedAt: '2026-03-04T12:00:00.000Z',
  review: { state: 'new', dueAt: null, lapses: 0, reviewCount: 0 },
})

let opens: (string | null)[]

function Harness({ initialOpen = null }: { initialOpen?: string | null }) {
  const [openId, setOpenId] = useState<string | null>(initialOpen)
  const [filters, setFilters] = useState<KnowledgeBitBrowserFilters>({})

  return (
    <>
      <button type="button" data-testid="harness-filter" onClick={() => setFilters({ question: 'zzz' })} />
      <KnowledgeBrowserScreen
        subjectId={null}
        filters={filters}
        openId={openId}
        onOpenChange={(id) => {
          opens.push(id)
          setOpenId(id)
        }}
        onClearAll={() => setFilters({})}
      />
    </>
  )
}

function renderScreen(initialOpen: string | null = null) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Harness initialOpen={initialOpen} />
    </QueryClientProvider>,
  )
}

const rowEl = (id: string) =>
  screen.getAllByTestId('knowledge-browser-row').find((el) => el.getAttribute('data-row-id') === id) as HTMLElement
const count = () => screen.queryByTestId('knowledge-browser-selected-count')?.textContent

beforeEach(() => {
  opens = []
  world.rows = ['b1', 'b2', 'b3'].map(make)
  world.matches = { active: false, rows: [] }
  world.detail.mockReset()
  world.detail.mockImplementation(async ({ data }: { data: { id: string } }) => ({ ok: true, detail: detailFor(data.id) }))
})
afterEach(cleanup)

describe('knowledge browser row click opens the full version', () => {
  it('should open the slide-over with the piece on a plain click and leave the selection as it was', async () => {
    renderScreen()
    fireEvent.click(screen.getAllByTestId('knowledge-browser-select-row')[2])
    fireEvent.click(screen.getByText('A b1'))

    expect(opens).toEqual(['b1'])
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(await screen.findByTestId('knowledge-browser-detail-meta')).toBeTruthy()
    expect(count()).toBe('1 selected')
    expect(rowEl('b1').getAttribute('aria-current')).toBe('true')
  })

  it('should show the row text at once and then the details of that piece', async () => {
    renderScreen()
    fireEvent.click(screen.getByText('A b2'))

    expect(screen.getByTestId('knowledge-browser-detail-preview').textContent).toContain('A b2')
    expect(await screen.findByTestId('knowledge-browser-detail-meta')).toBeTruthy()
  })

  it('should switch the panel to another piece when another row is clicked', async () => {
    renderScreen('b1')
    await screen.findByTestId('knowledge-browser-detail-meta')
    fireEvent.mouseDown(rowEl('b2'))
    fireEvent.click(screen.getByText('A b2'))

    expect(opens).toEqual(['b2'])
    await waitFor(() => expect(world.detail).toHaveBeenCalledWith({ data: { id: 'b2' } }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(rowEl('b2').getAttribute('aria-current')).toBe('true')
  })

  it('should select with the checkbox, shift-click and command-click without opening the panel', () => {
    renderScreen()
    fireEvent.click(screen.getAllByTestId('knowledge-browser-select-row')[0])
    fireEvent.click(rowEl('b3'), { shiftKey: true })

    expect(count()).toBe('3 selected')

    fireEvent.click(rowEl('b2'), { metaKey: true })

    expect(count()).toBe('2 selected')
    expect(opens).toEqual([])
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('knowledge browser Escape and Delete with the panel open', () => {
  it('should close only the panel on the first Escape and clear the selection on the second', async () => {
    renderScreen()
    fireEvent.click(screen.getAllByTestId('knowledge-browser-select-row')[0])
    fireEvent.click(screen.getByText('A b2'))
    await screen.findByTestId('knowledge-browser-detail-meta')

    fireEvent.keyDown(document.body, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(count()).toBe('1 selected')
    expect(opens).toEqual(['b2', null])

    fireEvent.keyDown(document.body, { key: 'Escape' })

    expect(count()).toBe('0 selected')
  })

  it('should not open the delete confirmation on the Delete key while the panel is open', async () => {
    renderScreen()
    fireEvent.click(screen.getAllByTestId('knowledge-browser-select-row')[0])
    fireEvent.click(screen.getByText('A b2'))
    await screen.findByTestId('knowledge-browser-detail-meta')

    fireEvent.keyDown(document.body, { key: 'Delete' })

    expect(screen.queryByTestId('knowledge-browser-confirm-delete')).toBeNull()

    fireEvent.click(screen.getByTestId('knowledge-browser-slide-over-close'))
    fireEvent.keyDown(document.body, { key: 'Delete' })

    expect(screen.getByTestId('knowledge-browser-confirm-delete')).toBeTruthy()
  })

  it('should put focus back on the row when the panel is closed', async () => {
    renderScreen()
    fireEvent.click(screen.getByText('A b3'))
    await screen.findByTestId('knowledge-browser-detail-meta')

    fireEvent.click(screen.getByTestId('knowledge-browser-slide-over-close'))

    expect(document.activeElement).toBe(rowEl('b3'))
  })
})

describe('knowledge browser panel survives list changes', () => {
  it('should keep showing the piece when a filter hides its row', async () => {
    renderScreen()
    fireEvent.click(screen.getByText('A b2'))
    await screen.findByTestId('knowledge-browser-detail-meta')

    world.rows = []
    fireEvent.click(screen.getByTestId('harness-filter'))

    expect(screen.getByTestId('knowledge-browser-no-match')).toBeTruthy()
    expect(screen.getByTestId('knowledge-browser-detail-meta')).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('should keep showing the piece while a meaning search lists other pieces', async () => {
    renderScreen('b1')
    await screen.findByTestId('knowledge-browser-detail-meta')

    world.matches = { active: true, rows: [make('m1')] }
    fireEvent.click(screen.getByTestId('harness-filter'))

    expect(screen.getAllByTestId('knowledge-browser-row')).toHaveLength(1)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByTestId('knowledge-browser-detail-meta')).toBeTruthy()
  })

  it('should open a piece from the address even when its row is not on the loaded page', async () => {
    renderScreen('far-away')

    expect(await screen.findByTestId('knowledge-browser-detail-meta')).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('should say the piece no longer exists for an unknown id in the address', async () => {
    world.detail.mockResolvedValue({ ok: false, error: 'not_found' })
    renderScreen('made-up')

    expect(await screen.findByTestId('knowledge-browser-detail-missing')).toBeTruthy()
  })
})
