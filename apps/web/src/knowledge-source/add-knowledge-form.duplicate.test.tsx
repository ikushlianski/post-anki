// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { encodeKnowledgeSourceRefusal } from '@post-anki/shared'

import { AddKnowledgeForm } from './add-knowledge-form'
import {
  createKnowledgeSource,
  createKnowledgeSourceFromUrl,
  createKnowledgeSources,
} from './knowledge-source.api'

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
const mockedTexts = vi.mocked(createKnowledgeSources)
const mockedUrl = vi.mocked(createKnowledgeSourceFromUrl)

function source(id: string, truncated?: boolean) {
  return { id, kind: 'prose', rawText: null, status: 'pending', createdAt: '2026-01-01', truncated }
}

function alreadyAdded(duplicates: { index?: number; existingId: string; addedAt: string }[]) {
  return encodeKnowledgeSourceRefusal(Object.assign(new Error('api'), { code: 'already_added', details: { duplicates } }))
}

function fillUrlBlock(index: number, url: string) {
  fireEvent.click(screen.getByTestId(`knowledge-block-type-url-${index}`))
  fireEvent.change(screen.getByTestId(`knowledge-block-input-${index}`), { target: { value: url } })
}

const earlier = { existingId: 'ks_old', addedAt: '2026-02-03T10:00:00.000Z' }

describe('AddKnowledgeForm duplicate warning', () => {
  afterEach(() => {
    cleanup()
    mockedText.mockReset()
    mockedTexts.mockReset()
    mockedUrl.mockReset()
  })

  it('warns that a link was already added, with its date and a link to its suggestions', async () => {
    mockedUrl.mockRejectedValue(alreadyAdded([earlier]))

    render(<AddKnowledgeForm />)
    fillUrlBlock(0, 'https://example.com/post')
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-block-error-0').textContent).toBe('Already added on Feb 3, 2026.')
    })

    expect(screen.getByTestId('knowledge-block-duplicate-link-0').getAttribute('href')).toBe('/knowledge-bit-review')
    expect((screen.getByTestId('knowledge-block-input-0') as HTMLInputElement).value).toBe('https://example.com/post')
  })

  it('adds the link again, sending the explicit add-again flag, when the learner asks', async () => {
    mockedUrl.mockRejectedValueOnce(alreadyAdded([earlier])).mockResolvedValueOnce(source('ks_new'))

    render(<AddKnowledgeForm />)
    fillUrlBlock(0, 'https://example.com/post')
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    fireEvent.click(await screen.findByTestId('knowledge-block-add-again-0'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-success-message').textContent).toContain('Added.')
    })

    expect(mockedUrl).toHaveBeenLastCalledWith({ data: { url: 'https://example.com/post', force: true } })
    expect(screen.queryByTestId('knowledge-block-duplicate-0')).toBeNull()
  })

  it('warns on a repeated text and sends it again with the flag on add again', async () => {
    mockedText.mockRejectedValueOnce(alreadyAdded([earlier])).mockResolvedValueOnce(source('ks_new'))

    render(<AddKnowledgeForm />)
    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Same prose' } })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    fireEvent.click(await screen.findByTestId('knowledge-block-add-again-0'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-success-message')).toBeTruthy()
    })

    expect(mockedText).toHaveBeenLastCalledWith({ data: { text: 'Same prose', force: true } })
  })

  it('warns only on the repeated block of a batch, not on the new one', async () => {
    mockedTexts.mockRejectedValue(alreadyAdded([{ ...earlier, index: 1 }]))

    render(<AddKnowledgeForm />)
    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))
    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'New prose' } })
    fireEvent.change(screen.getByTestId('knowledge-block-input-1'), { target: { value: 'Old prose' } })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-block-duplicate-1')).toBeTruthy()
    })

    expect(screen.queryByTestId('knowledge-block-duplicate-0')).toBeNull()
    expect(screen.queryByTestId('knowledge-block-add-again-0')).toBeNull()
  })
})
