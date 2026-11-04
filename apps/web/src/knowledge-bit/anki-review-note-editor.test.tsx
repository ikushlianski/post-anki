// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { AnkiReviewNoteEditor } from './anki-review-note-editor'
import { getKnowledgeBrowserDetail } from './knowledge-browser-detail.api'

vi.mock('./knowledge-browser-detail.api', () => ({
  getKnowledgeBrowserDetail: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function mockNote(sentence: string | null) {
  vi.mocked(getKnowledgeBrowserDetail).mockResolvedValue({
    ok: true,
    detail: { phrasings: [{ id: 'v1', sentence }] },
  } as never)
}

function renderEditor(onSave = vi.fn()) {
  render(
    <AnkiReviewNoteEditor
      knowledgeBitId="kb1"
      variantId="v1"
      error={null}
      disabled={false}
      onSave={onSave}
      onCancel={() => {}}
    />,
  )

  return onSave
}

describe('AnkiReviewNoteEditor', () => {
  it('should load the whole note and preview one card per gap', async () => {
    mockNote('A {{c1::deal}} needs {{c2::budget}}')
    renderEditor()

    const text = await screen.findByTestId('anki-review-note-editor-text')

    expect((text as HTMLTextAreaElement).value).toBe('A {{c1::deal}} needs {{c2::budget}}')
    expect(screen.getByTestId('anki-review-note-editor-preview').children).toHaveLength(2)
  })

  it('should block saving and explain why when a gap is nested', async () => {
    mockNote('A {{c1::deal}} needs {{c2::budget}}')

    const onSave = renderEditor()
    const text = await screen.findByTestId('anki-review-note-editor-text')

    fireEvent.change(text, { target: { value: '{{c1::a {{c2::b}}}}' } })

    expect(screen.getByTestId('anki-review-editor-error').textContent).toContain('inside each other')
    expect((screen.getByTestId('anki-review-editor-save') as HTMLButtonElement).disabled).toBe(true)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('should hand the edited note to save', async () => {
    mockNote('A {{c1::deal}} needs {{c2::budget}}')

    const onSave = renderEditor()

    await screen.findByTestId('anki-review-note-editor-text')
    fireEvent.click(screen.getByTestId('anki-review-editor-save'))

    expect(onSave).toHaveBeenCalledWith('A {{c1::deal}} needs {{c2::budget}}')
  })

  it('should say the note could not be loaded when the card has no stored note', async () => {
    mockNote(null)
    renderEditor()

    expect(await screen.findByTestId('anki-review-note-editor-error')).toBeTruthy()
  })
})

describe('AnkiReviewNoteEditor for ordered lists', () => {
  it('should preview every card of the list and block saving a list with too few steps', async () => {
    mockNote('Closing a sale\nQualify\nPitch\nClose')
    render(
      <AnkiReviewNoteEditor
        mode="list"
        knowledgeBitId="kb1"
        variantId="v1"
        error={null}
        disabled={false}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    )

    const text = await screen.findByTestId('anki-review-note-editor-text')

    expect(screen.getByTestId('anki-review-note-editor-preview').children).toHaveLength(6)

    fireEvent.change(text, { target: { value: 'Closing a sale\nQualify\nPitch' } })

    expect(screen.getByTestId('anki-review-editor-error').textContent).toContain('at least 3 steps')
    expect((screen.getByTestId('anki-review-editor-save') as HTMLButtonElement).disabled).toBe(true)
  })
})
