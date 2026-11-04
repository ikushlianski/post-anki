// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { NotionIngestionSource, NotionRunResult } from '@post-anki/shared'

import { pickSearchableOption } from '../ui/searchable-select-test-utils'
import {
  createNotionSource,
  deleteNotionSource,
  runNotionSource,
  updateNotionSource,
} from './notion-source.api'
import { NotionSourcesPanel } from './notion-sources-panel'

vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: () => ({
    data: [
      { id: 'eng', name: 'English', parentId: null },
      { id: 'eng-it', name: 'English for IT', parentId: 'eng' },
    ],
  }),
}))
vi.mock('../curriculum/board.collection', () => ({
  subjectsCollection: {},
  mapSubjectRow: (row: unknown) => row,
}))
vi.mock('./notion-source.api')

const PAGE = 'https://www.notion.so/Phrases-0123456789abcdef0123456789abcdef'

const source: NotionIngestionSource = {
  id: 's1',
  name: 'Meeting phrases',
  pageUrl: PAGE,
  subjectId: 'eng-it',
  subjectPath: ['English', 'English for IT'],
  itemsPerRun: 20,
  frequency: 'nightly',
  removeAfterImport: false,
  paused: false,
  nextRunAt: null,
  lastRun: { status: 'ok', finishedAt: null, imported: 4, removed: 0, errorCode: null },
}

const runResult: NotionRunResult = {
  status: 'ok',
  read: 6,
  imported: 4,
  skippedExisting: 2,
  ignored: 0,
  removed: 0,
  removeFailed: 0,
  truncated: false,
  pendingAfterLimit: 0,
}

describe('page address', () => {
  it('should render a safe address as a link and an unsafe one as plain text', () => {
    renderPanel([source, { ...source, id: 's2', pageUrl: 'javascript:alert(1)' }])

    expect(screen.getByTestId('notion-source-link-s1').getAttribute('href')).toBe(PAGE)
    expect(screen.queryByTestId('notion-source-link-s2')).toBeNull()
  })
})

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

function renderPanel(sources: NotionIngestionSource[] = [source], loadFailed = false) {
  const onChanged = vi.fn().mockResolvedValue(undefined)

  render(<NotionSourcesPanel sources={sources} loadFailed={loadFailed} onChanged={onChanged} />)

  return onChanged
}

describe('NotionSourcesPanel', () => {
  it('should show each source with its subject path, frequency, items per run and last run', () => {
    renderPanel()

    const row = screen.getByTestId('notion-source-s1')

    expect(row.textContent).toContain('English / English for IT')
    expect(row.textContent).toContain('Nightly')
    expect(row.textContent).toContain('20')
    expect(row.textContent).toContain('imported 4')
  })

  it('should invite the learner to add a first source when there are none', () => {
    renderPanel([])

    expect(screen.getByTestId('notion-sources-empty')).toBeTruthy()
  })

  it('should say the sources could not be loaded instead of showing an empty list', () => {
    renderPanel([], true)

    expect(screen.getByTestId('notion-sources-load-error')).toBeTruthy()
    expect(screen.queryByTestId('notion-sources-empty')).toBeNull()
  })

  it('should send a new source with removal off unless the learner turned it on', async () => {
    vi.mocked(createNotionSource).mockResolvedValue({ ok: true, data: source })
    const onChanged = renderPanel([])

    fireEvent.click(screen.getByTestId('notion-source-add'))
    fireEvent.change(screen.getByTestId('notion-source-name'), { target: { value: 'Phrases' } })
    fireEvent.change(screen.getByTestId('notion-source-url'), { target: { value: PAGE } })
    pickSearchableOption('notion-source-subject', 'eng-it')
    fireEvent.click(screen.getByTestId('notion-source-save'))

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(createNotionSource).toHaveBeenCalledWith({
      data: expect.objectContaining({ subjectId: 'eng-it', removeAfterImport: false }),
    })
  })

  it('should tell the learner when the page is already added', async () => {
    vi.mocked(createNotionSource).mockResolvedValue({ ok: false, status: 409, code: 'page_already_added' })
    renderPanel([])

    fireEvent.click(screen.getByTestId('notion-source-add'))
    fireEvent.change(screen.getByTestId('notion-source-name'), { target: { value: 'Phrases' } })
    fireEvent.change(screen.getByTestId('notion-source-url'), { target: { value: PAGE } })
    pickSearchableOption('notion-source-subject', 'eng-it')
    fireEvent.click(screen.getByTestId('notion-source-save'))

    expect((await screen.findByTestId('notion-source-form-error')).textContent).toContain('already added')
    expect(screen.getByTestId('notion-source-form')).toBeTruthy()
  })

  it('should save edits to an existing source with its own id', async () => {
    vi.mocked(updateNotionSource).mockResolvedValue({ ok: true, data: source })
    renderPanel()

    fireEvent.click(screen.getByText('Edit'))
    fireEvent.change(screen.getByTestId('notion-source-items-per-run'), { target: { value: '50' } })
    fireEvent.click(screen.getByTestId('notion-source-save'))

    await waitFor(() =>
      expect(updateNotionSource).toHaveBeenCalledWith({
        data: { id: 's1', patch: expect.objectContaining({ itemsPerRun: 50, removeAfterImport: false }) },
      }),
    )
  })

  it('should pause a running source and resume a paused one', async () => {
    vi.mocked(updateNotionSource).mockResolvedValue({ ok: true, data: source })
    renderPanel([{ ...source, paused: true }])

    expect(screen.getByTestId('notion-source-paused-s1')).toBeTruthy()
    fireEvent.click(screen.getByTestId('notion-source-pause-s1'))

    await waitFor(() =>
      expect(updateNotionSource).toHaveBeenCalledWith({ data: { id: 's1', patch: { paused: false } } }),
    )
  })

  it('should ask before deleting and say imported cards are kept', async () => {
    vi.mocked(deleteNotionSource).mockResolvedValue({ ok: true, data: { deleted: true } })
    renderPanel()

    fireEvent.click(screen.getByTestId('notion-source-delete-s1'))

    expect(deleteNotionSource).not.toHaveBeenCalled()
    expect(screen.getByTestId('notion-source-confirm-s1').textContent).toContain('Cards already imported are kept')

    fireEvent.click(screen.getByTestId('notion-source-confirm-delete-s1'))

    await waitFor(() => expect(deleteNotionSource).toHaveBeenCalledWith({ data: { id: 's1' } }))
  })

  it('should delete nothing when the learner cancels the confirmation', () => {
    renderPanel()

    fireEvent.click(screen.getByTestId('notion-source-delete-s1'))
    fireEvent.click(screen.getByText('Cancel'))

    expect(deleteNotionSource).not.toHaveBeenCalled()
    expect(screen.queryByTestId('notion-source-confirm-s1')).toBeNull()
  })

  it('should disable Ingest Now while a run is going and show the result summary after', async () => {
    let finish: (value: { ok: true; data: NotionRunResult }) => void = () => undefined

    vi.mocked(runNotionSource).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    renderPanel()

    fireEvent.click(screen.getByTestId('notion-source-ingest-s1'))

    const button = screen.getByTestId('notion-source-ingest-s1') as HTMLButtonElement

    expect(button.disabled).toBe(true)
    expect(button.textContent).toBe('Ingesting...')

    finish({ ok: true, data: runResult })

    expect((await screen.findByTestId('notion-source-result-s1')).textContent).toContain(
      'imported 4, skipped 2 already imported',
    )
    expect((screen.getByTestId('notion-source-ingest-s1') as HTMLButtonElement).disabled).toBe(false)
  })

  it('should explain a run that is already in progress', async () => {
    vi.mocked(runNotionSource).mockResolvedValue({ ok: false, status: 409, code: 'already_running' })
    renderPanel()

    fireEvent.click(screen.getByTestId('notion-source-ingest-s1'))

    expect((await screen.findByTestId('notion-source-result-s1')).textContent).toContain('already in progress')
  })
})
