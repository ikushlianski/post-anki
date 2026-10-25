// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

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

function refusal(code: string) {
  return new Error(`refusal:${code}`)
}

function fillUrlBlock(index: number, url: string) {
  fireEvent.click(screen.getByTestId(`knowledge-block-type-url-${index}`))
  fireEvent.change(screen.getByTestId(`knowledge-block-input-${index}`), { target: { value: url } })
}

describe('AddKnowledgeForm refusal reasons', () => {
  afterEach(() => {
    cleanup()
    mockedText.mockReset()
    mockedTexts.mockReset()
    mockedUrl.mockReset()
  })

  it('says the page could not be opened right under the link that failed', async () => {
    mockedUrl.mockRejectedValue(refusal('fetch_failed'))

    render(<AddKnowledgeForm />)
    fillUrlBlock(0, 'https://example.com/down')
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-block-error-0').textContent).toBe('That page could not be opened.')
    })
  })

  it('says the page has no readable text for an empty page', async () => {
    mockedUrl.mockRejectedValue(refusal('empty_content'))

    render(<AddKnowledgeForm />)
    fillUrlBlock(0, 'https://example.com/blank')
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-block-error-0').textContent).toBe('That page has no readable text.')
    })
  })

  it('says the subject is gone when the server no longer knows it', async () => {
    mockedText.mockRejectedValue(refusal('subject_not_found'))

    render(<AddKnowledgeForm />)
    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Some prose' } })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-block-error-0').textContent).toContain('subject no longer exists')
    })
  })

  it('puts each reason beside the block that failed, not beside the others', async () => {
    mockedText.mockResolvedValue(source('ks_1'))
    mockedUrl.mockImplementation(({ data }) =>
      data.url.includes('down') ? Promise.reject(refusal('fetch_failed')) : Promise.reject(refusal('empty_content')),
    )

    render(<AddKnowledgeForm />)
    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))
    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))
    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Some prose' } })
    fillUrlBlock(1, 'https://example.com/down')
    fillUrlBlock(2, 'https://example.com/blank')
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-block-error-0').textContent).toBe('That page could not be opened.')
    })

    expect(screen.getByTestId('knowledge-block-error-1').textContent).toBe('That page has no readable text.')
    expect((screen.getByTestId('knowledge-block-input-0') as HTMLInputElement).value).toBe(
      'https://example.com/down',
    )
    expect((screen.getByTestId('knowledge-block-input-1') as HTMLInputElement).value).toBe(
      'https://example.com/blank',
    )
  })

  it('refuses a text over 50,000 characters at its own block without sending it', async () => {
    mockedText.mockResolvedValue(source('ks_1'))

    render(<AddKnowledgeForm />)
    fireEvent.click(screen.getByTestId('knowledge-add-block-button'))
    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Short enough' } })
    fireEvent.change(screen.getByTestId('knowledge-block-input-1'), { target: { value: 'a'.repeat(50_001) } })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-block-error-0').textContent).toContain('longer than 50,000 characters')
    })

    expect(mockedText).toHaveBeenCalledWith({ data: { text: 'Short enough' } })
    expect(mockedTexts).not.toHaveBeenCalled()
    expect(screen.getByTestId('knowledge-error-message').textContent).toBe('Block 1 could not be added. Try again.')
  })

  it('keeps the generic message and no block reason for an unknown failure', async () => {
    mockedText.mockRejectedValue(new Error('api POST /knowledge-sources → 500'))

    render(<AddKnowledgeForm />)
    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'Some prose' } })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-error-message').textContent).toBe('Block 1 could not be added. Try again.')
    })

    expect(screen.queryByTestId('knowledge-block-error-0')).toBeNull()
  })

  it('says only the first 50,000 characters were read when an imported page was cut', async () => {
    mockedUrl.mockResolvedValue(source('ks_url', true))

    render(<AddKnowledgeForm />)
    fillUrlBlock(0, 'https://example.com/long')
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-success-message').textContent).toContain(
        'Only the first 50,000 characters of the page were read.',
      )
    })
  })

  it('does not mention cutting when the whole page was read', async () => {
    mockedUrl.mockResolvedValue(source('ks_url', false))

    render(<AddKnowledgeForm />)
    fillUrlBlock(0, 'https://example.com/short')
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => {
      expect(screen.getByTestId('knowledge-success-message').textContent).not.toContain('Only the first')
    })
  })
})
