// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CardStyleNote } from '@post-anki/shared'

import { listCardStyleNotes, listTriageSubjects, updateCardStyleNote } from './card-triage.api'
import { StyleNotesList } from './style-notes-list'
import { pickSearchableOption, searchableValue } from '../ui/searchable-select-test-utils'

vi.mock('./card-triage.api', () => ({
  listCardStyleNotes: vi.fn(),
  listTriageSubjects: vi.fn(),
  updateCardStyleNote: vi.fn(),
}))

const mockedList = vi.mocked(listCardStyleNotes)
const mockedSubjects = vi.mocked(listTriageSubjects)
const mockedUpdate = vi.mocked(updateCardStyleNote)

const NOTE: CardStyleNote = {
  id: 'n1',
  subjectId: null,
  sessionId: 's1',
  text: 'Prefer short answers',
  enabled: true,
  createdAt: '2026-03-02T10:00:00.000Z',
}

function renderList() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <StyleNotesList />
    </QueryClientProvider>,
  )
}

describe('StyleNotesList', () => {
  beforeEach(() => {
    mockedList.mockReset()
    mockedUpdate.mockReset()
    mockedList.mockResolvedValue({ ok: true, data: [NOTE] })
    mockedSubjects.mockResolvedValue({ ok: true, data: [{ id: 'sub-1', name: 'Rust' }] })
  })

  afterEach(() => {
    cleanup()
  })

  it('should show each note with the date it was created', async () => {
    renderList()

    expect(await screen.findByDisplayValue('Prefer short answers')).toBeTruthy()
    expect(screen.getByTestId('style-note-created-n1').textContent).toContain(
      new Date(NOTE.createdAt).toLocaleDateString(),
    )
  })

  it('should switch a note off so it stops shaping new cards', async () => {
    mockedUpdate.mockResolvedValue({ ok: true, data: { ...NOTE, enabled: false } })
    renderList()

    fireEvent.click(await screen.findByTestId('style-note-enabled-n1'))

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith({ data: { noteId: 'n1', enabled: false } }),
    )
    await waitFor(() =>
      expect((screen.getByTestId('style-note-enabled-n1') as HTMLInputElement).checked).toBe(false),
    )
  })

  it('should save edited note text', async () => {
    mockedUpdate.mockResolvedValue({ ok: true, data: { ...NOTE, text: 'Keep it brief' } })
    renderList()

    fireEvent.change(await screen.findByTestId('style-note-text-n1'), {
      target: { value: 'Keep it brief' },
    })
    fireEvent.click(screen.getByTestId('style-note-save-n1'))

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith({ data: { noteId: 'n1', text: 'Keep it brief' } }),
    )
  })

  it('should move a global note to one subject and back to global', async () => {
    mockedUpdate.mockResolvedValue({ ok: true, data: { ...NOTE, subjectId: 'sub-1' } })
    renderList()

    const scope = await screen.findByTestId('style-note-scope-n1')

    fireEvent.click(scope)
    await screen.findByRole('option', { name: 'Rust' })
    pickSearchableOption('style-note-scope-n1', 'sub-1')

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith({ data: { noteId: 'n1', subjectId: 'sub-1' } }),
    )

    mockedUpdate.mockResolvedValue({ ok: true, data: NOTE })
    await waitFor(() =>
      expect(searchableValue('style-note-scope-n1')).toBe('Rust'),
    )
    pickSearchableOption('style-note-scope-n1', '__all__')

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenLastCalledWith({ data: { noteId: 'n1', subjectId: null } }),
    )
  })

  it('should explain how to get notes when there are none', async () => {
    mockedList.mockResolvedValue({ ok: true, data: [] })
    renderList()

    expect(await screen.findByTestId('style-notes-empty')).toBeTruthy()
  })
})
