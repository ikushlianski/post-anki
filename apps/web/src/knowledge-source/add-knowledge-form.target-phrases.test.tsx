// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { AddKnowledgeForm } from './add-knowledge-form'
import { createKnowledgeSource, createKnowledgeSources } from './knowledge-source.api'

const subjectRows = vi.hoisted(() => [
  { id: 'eng', name: 'English', parentId: null },
  { id: 'eng-idioms', name: 'Idioms', parentId: 'eng' },
  { id: 'math', name: 'Math', parentId: null },
])

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@tanstack/react-db', () => ({ useLiveQuery: () => ({ data: subjectRows }) }))

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

function renderFor(subjectId: string) {
  render(<AddKnowledgeForm initialSubjectId={subjectId} />)
}

function typeText(index = 0, value = 'Some prose to learn from') {
  fireEvent.change(screen.getByTestId(`knowledge-block-input-${index}`), { target: { value } })
}

describe('AddKnowledgeForm target phrases', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
    mockedText.mockReset()
    mockedBatch.mockReset()
  })

  it('shows an target phrases group on each block for English and its sub-subjects only', () => {
    renderFor('eng')
    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))
    expect(screen.getByTestId('target-phrases-field-0')).toBeTruthy()
    expect(screen.getByTestId('target-phrases-field-1')).toBeTruthy()
    cleanup()

    renderFor('eng-idioms')
    expect(screen.getByTestId('target-phrases-field-0')).toBeTruthy()
    cleanup()

    renderFor('math')
    expect(screen.queryByTestId('target-phrases-field-0')).toBeNull()
  })

  it('lets the learner add and remove phrase rows up to five on a block', () => {
    renderFor('eng')
    expect(screen.getAllByLabelText(/^Target phrase \d, block 1$/)).toHaveLength(1)

    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(screen.getByTestId('target-phrase-add-button-0'))
    }

    expect(screen.getAllByLabelText(/^Target phrase \d, block 1$/)).toHaveLength(5)
    expect(screen.queryByTestId('target-phrase-add-button-0')).toBeNull()
    expect(screen.getByTestId('target-phrase-input-0-0').getAttribute('maxlength')).toBe('200')

    fireEvent.click(screen.getByTestId('target-phrase-remove-0-4'))
    expect(screen.getAllByLabelText(/^Target phrase \d, block 1$/)).toHaveLength(4)
    expect(screen.getByTestId('target-phrase-add-button-0')).toBeTruthy()
  })

  it('sends each block its own phrases as separate calls', async () => {
    mockedText.mockResolvedValue({ id: 'ks_1' } as never)

    renderFor('eng')
    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))
    typeText(0, 'First prose')
    typeText(1, 'Second prose')
    fireEvent.change(screen.getByTestId('target-phrase-input-0-0'), { target: { value: '  break the ice  ' } })
    fireEvent.change(screen.getByTestId('target-phrase-input-1-0'), { target: { value: 'piece of cake' } })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => expect(mockedText).toHaveBeenCalledTimes(2))
    expect(mockedBatch).not.toHaveBeenCalled()

    const calls = mockedText.mock.calls.map(([arg]) => arg.data)

    expect(calls).toContainEqual(expect.objectContaining({ text: 'First prose', targetPhrases: ['break the ice'] }))
    expect(calls).toContainEqual(expect.objectContaining({ text: 'Second prose', targetPhrases: ['piece of cake'] }))
  })

  it('keeps phrases on the right block after an earlier block is removed', async () => {
    mockedText.mockResolvedValue({ id: 'ks_1' } as never)

    renderFor('eng')
    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))
    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))
    typeText(1, 'Middle prose')
    typeText(2, 'Last prose')
    fireEvent.change(screen.getByTestId('target-phrase-input-2-0'), { target: { value: 'hit the sack' } })
    fireEvent.click(screen.getByTestId('knowledge-remove-block-button-1'))
    typeText(0, 'First prose')
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => expect(mockedText).toHaveBeenCalledTimes(2))

    const calls = mockedText.mock.calls.map(([arg]) => arg.data)

    expect(calls).toContainEqual(expect.objectContaining({ text: 'Last prose', targetPhrases: ['hit the sack'] }))
    expect(calls).toContainEqual(expect.objectContaining({ text: 'First prose' }))
  })

  it('batches blocks without phrases as before', async () => {
    mockedBatch.mockResolvedValue([{ id: 'ks_1' }, { id: 'ks_2' }] as never)

    renderFor('eng')
    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))
    typeText(0, 'First prose')
    typeText(1, 'Second prose')
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => expect(mockedBatch).toHaveBeenCalledTimes(1))
    expect(mockedBatch.mock.calls[0][0].data.texts).toEqual(['First prose', 'Second prose'])
    expect(mockedBatch.mock.calls[0][0].data.targetPhrases).toBeUndefined()
    expect(mockedText).not.toHaveBeenCalled()
  })

  it('omits target phrases when none are filled in', async () => {
    mockedText.mockResolvedValue({ id: 'ks_1' } as never)

    renderFor('eng')
    typeText()
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => expect(mockedText).toHaveBeenCalledTimes(1))
    expect(mockedText.mock.calls[0][0].data.targetPhrases).toBeUndefined()
  })

  it('sends no target phrases for a non-English subject', async () => {
    mockedText.mockResolvedValue({ id: 'ks_1' } as never)

    renderFor('math')
    typeText()
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => expect(mockedText).toHaveBeenCalledTimes(1))
    expect(mockedText.mock.calls[0][0].data.targetPhrases).toBeUndefined()
  })
})
