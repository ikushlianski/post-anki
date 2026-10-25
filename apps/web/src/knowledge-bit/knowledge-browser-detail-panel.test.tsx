// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { KnowledgeBitBrowserItem, KnowledgeBitDetail } from '@post-anki/shared'

const api = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('./knowledge-browser-detail.api', () => ({ getKnowledgeBrowserDetail: api.get }))

import { KnowledgeBrowserDetailPanel } from './knowledge-browser-detail-panel'

const full: KnowledgeBitDetail = {
  knowledgeBitId: 'b1',
  body: 'Indexes speed up reads',
  context: 'Seen while tuning the orders table',
  phrasings: [
    { id: 'v1', kind: 'basic', kindLabel: 'Basic', prompt: 'What is an index?', answer: 'A lookup structure', sentence: null },
    { id: 'v2', kind: 'wh_question', kindLabel: 'Why question', prompt: 'Why add an index?', answer: 'Faster reads', sentence: null },
    {
      id: 'v3',
      kind: 'fill_in_the_blank',
      kindLabel: 'Fill in the blank',
      prompt: 'An ___ speeds reads',
      answer: 'index',
      sentence: 'An index speeds reads',
    },
  ],
  subjectPath: ['Programming', 'Databases', 'Indexes'],
  tags: ['sql', 'performance'],
  origin: 'article',
  addedBy: 'you',
  sourceId: 's1',
  sourceLabel: 'use-the-index.com',
  sourceUrl: 'https://use-the-index.com/guide',
  addedAt: '2026-03-04T12:00:00.000Z',
  review: { state: 'review', dueAt: '2026-04-01T12:00:00.000Z', lapses: 2, reviewCount: 5 },
}

const bare: KnowledgeBitDetail = {
  ...full,
  context: null,
  phrasings: [full.phrasings[0]],
  subjectPath: [],
  tags: [],
  origin: 'manual',
  sourceId: null,
  sourceLabel: null,
  sourceUrl: null,
  review: { state: 'new', dueAt: null, lapses: 0, reviewCount: 0 },
}

const row: KnowledgeBitBrowserItem = {
  knowledgeBitId: 'b1',
  phrasings: [
    { id: 'v1', kind: 'basic', prompt: 'What is an index?' },
    { id: 'v2', kind: 'wh_question', prompt: 'Why add an index?' },
  ],
  answer: 'A lookup structure',
  origin: 'article',
  addedAt: '2026-03-04T12:00:00.000Z',
  sourcePieceCount: 1,
}

function renderPanel(props: { row?: KnowledgeBitBrowserItem | null; onClose?: () => void } = {}) {
  const client = new QueryClient()

  render(
    <QueryClientProvider client={client}>
      <KnowledgeBrowserDetailPanel id="b1" row={props.row} onClose={props.onClose ?? vi.fn()} />
    </QueryClientProvider>,
  )

  return client
}

beforeEach(() => api.get.mockReset())
afterEach(cleanup)

describe('knowledge browser detail panel', () => {
  it('should show front, back and every phrasing with its own answer and blank sentence', async () => {
    api.get.mockResolvedValue({ ok: true, detail: full })
    renderPanel()

    await waitFor(() => expect(screen.getAllByTestId('knowledge-browser-detail-phrasing')).toHaveLength(3))

    expect(within(screen.getByTestId('knowledge-browser-detail-front')).getByText('What is an index?')).toBeTruthy()
    expect(within(screen.getByTestId('knowledge-browser-detail-back')).getByText('A lookup structure')).toBeTruthy()

    const phrasings = screen.getAllByTestId('knowledge-browser-detail-phrasing')

    expect(phrasings[1].textContent).toContain('Why question')
    expect(phrasings[1].textContent).toContain('Answer: Faster reads')
    expect(phrasings[2].textContent).toContain('Fill in the blank')
    expect(phrasings[2].textContent).toContain('Sentence: An index speeds reads')
  })

  it('should show the subject path, tags, context, source, who added it, date and review state', async () => {
    api.get.mockResolvedValue({ ok: true, detail: full })
    renderPanel()

    const meta = await screen.findByTestId('knowledge-browser-detail-meta')

    expect(meta.textContent).toContain('Programming / Databases / Indexes')
    expect(meta.textContent).toContain('sql, performance')
    expect(meta.textContent).toContain('Seen while tuning the orders table')
    expect(meta.textContent).toContain('Article')
    expect(meta.textContent).toContain('You')
    expect(meta.textContent).toContain('Review, next due')
    expect(meta.textContent).toContain('forgotten 2 times')
    expect(screen.getByTestId('knowledge-browser-detail-source-link').getAttribute('href')).toBe(
      'https://use-the-index.com/guide',
    )
  })

  it('should read None for empty fields and say new for a piece never reviewed', async () => {
    api.get.mockResolvedValue({ ok: true, detail: bare })
    renderPanel()

    const meta = await screen.findByTestId('knowledge-browser-detail-meta')

    expect(within(meta).getAllByText('None')).toHaveLength(3)
    expect(meta.textContent).toContain('New')
    expect(meta.textContent).not.toContain('undefined')
    expect(meta.textContent).not.toContain('next due')
  })

  it('should say suspended and show no due date for a suspended piece', async () => {
    api.get.mockResolvedValue({
      ok: true,
      detail: { ...full, review: { state: 'suspended', dueAt: null, lapses: 0, reviewCount: 3 } },
    })
    renderPanel()

    const meta = await screen.findByTestId('knowledge-browser-detail-meta')

    expect(meta.textContent).toContain('Suspended')
    expect(meta.textContent).not.toContain('next due')
  })

  it('should paint the row text first and fill in the details when the read returns', async () => {
    let resolve: (value: unknown) => void = () => undefined

    api.get.mockReturnValue(new Promise((done) => (resolve = done)))
    renderPanel({ row })

    expect(screen.getByTestId('knowledge-browser-detail-preview')).toBeTruthy()
    expect(screen.getByText('A lookup structure')).toBeTruthy()
    expect(screen.getByTestId('knowledge-browser-detail-loading')).toBeTruthy()

    resolve({ ok: true, detail: full })

    expect(await screen.findByTestId('knowledge-browser-detail-meta')).toBeTruthy()
    expect(screen.queryByTestId('knowledge-browser-detail-loading')).toBeNull()
  })

  it('should say the piece no longer exists when it is not found', async () => {
    api.get.mockResolvedValue({ ok: false, error: 'not_found' })
    renderPanel()

    expect((await screen.findByTestId('knowledge-browser-detail-missing')).textContent).toContain('no longer exists')
    expect(screen.getByTestId('knowledge-browser-slide-over-close')).toBeTruthy()
  })

  it('should show an error with Retry that keeps the row text and reloads only the details', async () => {
    api.get.mockResolvedValueOnce({ ok: false, error: 'unknown' })
    renderPanel({ row })

    expect(await screen.findByTestId('knowledge-browser-detail-error')).toBeTruthy()
    expect(screen.getByText('A lookup structure')).toBeTruthy()

    api.get.mockResolvedValueOnce({ ok: true, detail: full })
    fireEvent.click(screen.getByTestId('knowledge-browser-detail-retry'))

    expect(await screen.findByTestId('knowledge-browser-detail-meta')).toBeTruthy()
    expect(api.get).toHaveBeenCalledTimes(2)
  })

  it('should show the missing state after a refresh finds the piece deleted', async () => {
    api.get.mockResolvedValueOnce({ ok: true, detail: full })
    const client = renderPanel()

    await screen.findByTestId('knowledge-browser-detail-meta')
    api.get.mockResolvedValueOnce({ ok: false, error: 'not_found' })
    await client.invalidateQueries({ queryKey: ['knowledge-bits'] })

    expect(await screen.findByTestId('knowledge-browser-detail-missing')).toBeTruthy()
  })

  it('should offer no edit, delete or move controls', async () => {
    api.get.mockResolvedValue({ ok: true, detail: full })
    renderPanel()
    await screen.findByTestId('knowledge-browser-detail-meta')

    const labels = screen.getAllByRole('button', { hidden: true }).map((button) => button.getAttribute('aria-label'))

    expect(labels.sort()).toEqual(['Close', 'Close details'])
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('should block the Delete key while open but let it edit text inside a field', async () => {
    api.get.mockResolvedValue({ ok: true, detail: full })
    renderPanel()
    await screen.findByTestId('knowledge-browser-detail-meta')

    expect(fireEvent.keyDown(document.body, { key: 'Delete' })).toBe(false)

    const field = document.body.appendChild(document.createElement('input'))

    expect(fireEvent.keyDown(field, { key: 'Delete' })).toBe(true)
  })
})
