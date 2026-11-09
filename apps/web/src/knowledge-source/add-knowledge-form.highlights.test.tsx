// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { AddKnowledgeForm } from './add-knowledge-form'
import { createKnowledgeSource, createKnowledgeSources } from './knowledge-source.api'
import { HIGHLIGHT_SHORTCUT_STORAGE_KEY } from './highlight-shortcut'
import { KNOWLEDGE_DRAFT_STORAGE_KEY } from './knowledge-draft-storage'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@tanstack/react-db', () => ({ useLiveQuery: () => ({ data: [] }) }))

vi.mock('../curriculum/board.collection', () => ({
  subjectsCollection: {},
  mapSubjectRow: (row: unknown) => row,
}))

vi.mock('./knowledge-source.api', () => ({
  createKnowledgeSource: vi.fn(),
  createKnowledgeSources: vi.fn(),
  createKnowledgeSourceFromUrl: vi.fn(),
  checkKnowledgeSourceSubject: vi.fn().mockResolvedValue({ status: 'none' }),
}))

vi.mock('../knowledge-bit/knowledge-bit-review.api', () => ({
  getKnowledgeSourceRegenerationForReview: vi.fn().mockResolvedValue({ status: 'running', failureReason: null }),
  getPendingKnowledgeBitsWithAttentionForReview: vi.fn().mockResolvedValue([]),
}))

const mockedText = vi.mocked(createKnowledgeSource)
const mockedBatch = vi.mocked(createKnowledgeSources)

function input(index = 0) {
  return screen.getByTestId(`knowledge-block-input-${index}`) as HTMLTextAreaElement
}

function type(value: string, index = 0) {
  fireEvent.change(input(index), { target: { value } })
}

function select(start: number, end: number, index = 0) {
  input(index).setSelectionRange(start, end)
  fireEvent.click(screen.getByTestId(`knowledge-highlight-button-${index}`))
}

describe('AddKnowledgeForm highlights', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  it('should turn the selected text into a highlight chip and remove it again', () => {
    render(<AddKnowledgeForm />)
    type('alpha beta gamma')
    select(6, 10)

    expect(screen.getByTestId('knowledge-highlight-chip-0-0').textContent).toContain('beta')

    fireEvent.click(screen.getByTestId('knowledge-highlight-remove-0-0'))
    expect(screen.queryByTestId('knowledge-highlight-chip-0-0')).toBeNull()
  })

  it('should merge a new overlapping selection and clear all on request', () => {
    render(<AddKnowledgeForm />)
    type('alpha beta gamma')
    select(0, 8)
    select(6, 12)

    expect(screen.getAllByTestId(/knowledge-highlight-chip-0-/)).toHaveLength(1)

    fireEvent.click(screen.getByTestId('knowledge-highlights-clear-0'))
    expect(screen.queryByTestId('knowledge-highlight-chip-0-0')).toBeNull()
  })

  it('should highlight with the keyboard shortcut', () => {
    render(<AddKnowledgeForm />)
    type('alpha beta')
    input().setSelectionRange(0, 5)
    fireEvent.keyDown(input(), { key: 'd', ctrlKey: true })

    expect(screen.getByTestId('knowledge-highlight-chip-0-0').textContent).toContain('alpha')
  })

  it('should highlight with the shortcut the user picked and stop using the default', () => {
    render(<AddKnowledgeForm />)
    type('alpha beta')
    input().setSelectionRange(0, 5)
    fireEvent.change(screen.getByTestId('knowledge-highlight-shortcut-select'), { target: { value: 'shift+h' } })
    fireEvent.keyDown(input(), { key: 'd', ctrlKey: true })

    expect(screen.queryByTestId('knowledge-highlight-chip-0-0')).toBeNull()

    fireEvent.keyDown(input(), { key: 'H', shiftKey: true, ctrlKey: true })

    expect(screen.getByTestId('knowledge-highlight-chip-0-0').textContent).toContain('alpha')
    expect(screen.getByTestId('knowledge-highlight-button-0').getAttribute('title')).toContain('Ctrl+Shift+H')
  })

  it('should remember the picked shortcut next time and go back to the default on reset', () => {
    const first = render(<AddKnowledgeForm />)

    fireEvent.change(screen.getByTestId('knowledge-highlight-shortcut-select'), { target: { value: 'shift+h' } })
    first.unmount()
    render(<AddKnowledgeForm />)

    expect((screen.getByTestId('knowledge-highlight-shortcut-select') as HTMLSelectElement).value).toBe('shift+h')

    fireEvent.click(screen.getByTestId('knowledge-highlight-shortcut-reset'))

    expect((screen.getByTestId('knowledge-highlight-shortcut-select') as HTMLSelectElement).value).toBe('d')
    expect(window.localStorage.getItem(HIGHLIGHT_SHORTCUT_STORAGE_KEY)).toBeNull()
  })

  it('should keep a highlight when a letter inside it is changed', () => {
    render(<AddKnowledgeForm />)
    type('alpha beta gamma')
    select(6, 10)
    type('alpha bXta gamma')

    expect(screen.getByTestId('knowledge-highlight-chip-0-0').textContent).toContain('bXta')
  })

  it('should disable highlighting and explain why when several blocks exist', () => {
    render(<AddKnowledgeForm />)
    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))
    type('alpha beta', 0)
    select(0, 5, 0)

    expect((screen.getByTestId('knowledge-highlight-button-0') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('knowledge-highlight-hint-0')).toBeTruthy()
    expect(screen.queryByTestId('knowledge-highlight-chip-0-0')).toBeNull()
  })

  it('should bring highlights back with the draft', () => {
    const first = render(<AddKnowledgeForm />)

    type('alpha beta gamma')
    select(6, 10)
    expect(window.localStorage.getItem(KNOWLEDGE_DRAFT_STORAGE_KEY)).toContain('"highlights"')
    first.unmount()
    render(<AddKnowledgeForm />)

    expect(screen.getByTestId('knowledge-highlight-chip-0-0').textContent).toContain('beta')
  })

  it('should send highlights for a single block, matched to the trimmed text', async () => {
    mockedText.mockResolvedValue({ id: 'ks_1' } as never)
    render(<AddKnowledgeForm />)
    type('  alpha beta gamma  ')
    select(8, 12)
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => expect(mockedText).toHaveBeenCalledTimes(1))
    expect(mockedText.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ text: 'alpha beta gamma', highlights: [{ start: 6, end: 10 }] }),
    )
  })

  it('should omit highlights when none were marked', async () => {
    mockedText.mockResolvedValue({ id: 'ks_1' } as never)
    render(<AddKnowledgeForm />)
    type('alpha beta')
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => expect(mockedText).toHaveBeenCalledTimes(1))
    expect(mockedText.mock.calls[0][0].data.highlights).toBeUndefined()
  })

  it('should not send highlights when several blocks are added together', async () => {
    mockedBatch.mockResolvedValue([{ id: 'ks_1' }, { id: 'ks_2' }] as never)
    render(<AddKnowledgeForm />)
    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))
    type('alpha beta', 0)
    type('second block', 1)
    select(0, 5, 0)
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => expect(mockedBatch).toHaveBeenCalledTimes(1))
    expect(mockedText).not.toHaveBeenCalled()
    expect(JSON.stringify(mockedBatch.mock.calls[0][0])).not.toContain('highlights')
  })
})
