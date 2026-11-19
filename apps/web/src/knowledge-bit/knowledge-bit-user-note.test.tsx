// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { KnowledgeBitUserNote } from './knowledge-bit-user-note'

const mockSave = vi.fn()

vi.mock('./knowledge-bit-user-note.api', () => ({
  saveKnowledgeBitUserNote: (...args: unknown[]) => mockSave(...args),
}))

afterEach(() => {
  cleanup()
  mockSave.mockReset()
})

describe('KnowledgeBitUserNote', () => {
  it('should show the learner their existing note', () => {
    render(<KnowledgeBitUserNote knowledgeBitId="kb1" initialNote="remember the trick" />)

    expect(screen.getByTestId('user-note-text').textContent).toBe('remember the trick')
  })

  it('should offer to add a note when none exists', () => {
    render(<KnowledgeBitUserNote knowledgeBitId="kb1" initialNote={null} />)

    expect(screen.queryByTestId('user-note-text')).toBeNull()
    expect(screen.getByTestId('user-note-edit').textContent).toBe('Add note')
  })

  it('should save an edited note and show it in place', async () => {
    mockSave.mockResolvedValue({ ok: true, userNote: 'new text' })
    render(<KnowledgeBitUserNote knowledgeBitId="kb1" initialNote={null} />)

    fireEvent.click(screen.getByTestId('user-note-edit'))
    fireEvent.change(screen.getByTestId('user-note-input'), { target: { value: 'new text' } })
    fireEvent.click(screen.getByTestId('user-note-save'))

    await waitFor(() => expect(screen.getByTestId('user-note-text').textContent).toBe('new text'))
    expect(mockSave).toHaveBeenCalledWith({ data: { id: 'kb1', note: 'new text' } })
  })

  it('should keep the draft and tell the learner when saving fails', async () => {
    mockSave.mockResolvedValue({ ok: false, error: 'boom' })
    render(<KnowledgeBitUserNote knowledgeBitId="kb1" initialNote="old" />)

    fireEvent.click(screen.getByTestId('user-note-edit'))
    fireEvent.change(screen.getByTestId('user-note-input'), { target: { value: 'changed' } })
    fireEvent.click(screen.getByTestId('user-note-save'))

    await waitFor(() => expect(screen.getByTestId('user-note-error')).toBeTruthy())
    expect((screen.getByTestId('user-note-input') as HTMLTextAreaElement).value).toBe('changed')
  })

  it('should cap the note at 2000 characters', () => {
    render(<KnowledgeBitUserNote knowledgeBitId="kb1" initialNote={null} />)
    fireEvent.click(screen.getByTestId('user-note-edit'))

    expect(screen.getByTestId('user-note-input').getAttribute('maxlength')).toBe('2000')
  })
})
