// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { AddKnowledgeForm } from './add-knowledge-form'
import { createKnowledgeSource } from './knowledge-source.api'
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

function type(value: string) {
  fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value } })
}

function useUrlBlock(url: string) {
  fireEvent.click(screen.getByTestId('knowledge-block-type-url-0'))
  type(url)
}

describe('AddKnowledgeForm draft and link validation', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  it('should bring back typed text after the page is reopened', async () => {
    const first = render(<AddKnowledgeForm />)

    type('half-written note')
    first.unmount()
    render(<AddKnowledgeForm />)

    await waitFor(() =>
      expect((screen.getByTestId('knowledge-block-input-0') as HTMLTextAreaElement).value).toBe('half-written note'),
    )
  })

  it('should forget the draft after a successful submit', async () => {
    mockedText.mockResolvedValue({
      id: 'ks_1',
      kind: 'prose',
      rawText: null,
      status: 'pending',
      createdAt: '2026-01-01',
    } as Awaited<ReturnType<typeof createKnowledgeSource>>)
    render(<AddKnowledgeForm />)
    type('Closures capture variables')
    await waitFor(() => expect(window.localStorage.getItem(KNOWLEDGE_DRAFT_STORAGE_KEY)).not.toBeNull())
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await screen.findByTestId('knowledge-success-message')
    await waitFor(() => expect(window.localStorage.getItem(KNOWLEDGE_DRAFT_STORAGE_KEY)).toBeNull())
  })

  it('should not bring the text back when the page is left while the submit is still running', async () => {
    let finish: (value: Awaited<ReturnType<typeof createKnowledgeSource>>) => void = () => {}

    mockedText.mockReturnValue(new Promise((resolve) => (finish = resolve)))

    const first = render(<AddKnowledgeForm />)

    type('Closures capture variables')
    await waitFor(() => expect(window.localStorage.getItem(KNOWLEDGE_DRAFT_STORAGE_KEY)).not.toBeNull())
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))
    first.unmount()
    finish({
      id: 'ks_1',
      kind: 'prose',
      rawText: null,
      status: 'pending',
      createdAt: '2026-01-01',
    } as Awaited<ReturnType<typeof createKnowledgeSource>>)

    await waitFor(() => expect(window.localStorage.getItem(KNOWLEDGE_DRAFT_STORAGE_KEY)).toBeNull())
    render(<AddKnowledgeForm />)

    expect((screen.getByTestId('knowledge-block-input-0') as HTMLTextAreaElement).value).toBe('')
  })

  it('should submit from the keyboard with Ctrl+Enter in a text box, but only when the button is enabled', async () => {
    mockedText.mockResolvedValue({
      id: 'ks_1',
      kind: 'prose',
      rawText: null,
      status: 'pending',
      createdAt: '2026-01-01',
    } as Awaited<ReturnType<typeof createKnowledgeSource>>)
    render(<AddKnowledgeForm />)

    fireEvent.keyDown(screen.getByTestId('knowledge-block-input-0'), { key: 'Enter', ctrlKey: true })
    expect(mockedText).not.toHaveBeenCalled()

    type('Closures capture variables')
    fireEvent.keyDown(screen.getByTestId('knowledge-block-input-0'), { key: 'Enter', metaKey: true })

    await waitFor(() => expect(mockedText).toHaveBeenCalledTimes(1))
  })

  it('should forget the draft when the learner clears the text', async () => {
    render(<AddKnowledgeForm />)
    type('something')
    await waitFor(() => expect(window.localStorage.getItem(KNOWLEDGE_DRAFT_STORAGE_KEY)).not.toBeNull())
    type('')

    await waitFor(() => expect(window.localStorage.getItem(KNOWLEDGE_DRAFT_STORAGE_KEY)).toBeNull())
  })

  it('should show an inline alert and block submit for a link that is not http or https', () => {
    render(<AddKnowledgeForm />)
    useUrlBlock('ftp://example.com/file')

    expect(screen.getByTestId('knowledge-block-link-error-0').getAttribute('role')).toBe('alert')
    expect((screen.getByTestId('knowledge-submit-button') as HTMLButtonElement).disabled).toBe(true)

    useUrlBlock('not a link')

    expect(screen.getByTestId('knowledge-block-link-error-0').textContent).toBe(
      'Enter a full link starting with https://',
    )
  })

  it('should accept a full https link and stay quiet while the link box is empty', () => {
    render(<AddKnowledgeForm />)
    fireEvent.click(screen.getByTestId('knowledge-block-type-url-0'))

    expect(screen.queryByTestId('knowledge-block-link-error-0')).toBeNull()

    type('https://example.com/post')

    expect(screen.queryByTestId('knowledge-block-link-error-0')).toBeNull()
    expect((screen.getByTestId('knowledge-submit-button') as HTMLButtonElement).disabled).toBe(false)
  })
})
