// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import { AddKnowledgeForm } from './add-knowledge-form'
import { createKnowledgeSource } from './knowledge-source.api'
import { LAST_SUBJECT_STORAGE_KEY } from './last-subject-storage'
import { createSubject } from '../subject/subject.api'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: () => ({
    data: [
      { id: 'sub_a', name: 'Physics', parentId: null },
      { id: 'sub_b', name: 'Optics', parentId: 'sub_a' },
    ],
  }),
}))

vi.mock('../curriculum/board.collection', () => ({
  subjectsCollection: {},
  mapSubjectRow: (row: unknown) => row,
}))

vi.mock('../subject/subject.api', () => ({ createSubject: vi.fn() }))

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

const mockedCreateSubject = vi.mocked(createSubject)
const mockedSource = vi.mocked(createKnowledgeSource)

function subjectInput() {
  return screen.getByRole('combobox', { name: 'Subject for these sources' }) as HTMLInputElement
}

describe('AddKnowledgeForm subject choice', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  it('should keep the chosen subject after a reload even when nothing was submitted', async () => {
    const first = render(<AddKnowledgeForm />)

    fireEvent.click(subjectInput())
    fireEvent.mouseDown(await screen.findByTestId('knowledge-subject-select-option-sub_b'))
    first.unmount()

    expect(window.localStorage.getItem(LAST_SUBJECT_STORAGE_KEY)).toBe('sub_b')

    render(<AddKnowledgeForm />)

    expect(subjectInput().value).toContain('Optics')
  })

  it('should keep the subject after adding knowledge and reloading', async () => {
    mockedSource.mockResolvedValue({ id: 'ks_1' } as never)
    window.localStorage.setItem(LAST_SUBJECT_STORAGE_KEY, 'sub_a')
    const first = render(<AddKnowledgeForm />)

    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'alpha beta' } })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))
    await waitFor(() => expect(mockedSource).toHaveBeenCalledTimes(1))
    first.unmount()
    render(<AddKnowledgeForm />)

    expect(subjectInput().value).toContain('Physics')
  })

  it('should start with no subject when the remembered one no longer exists', () => {
    window.localStorage.setItem(LAST_SUBJECT_STORAGE_KEY, 'sub_gone')
    render(<AddKnowledgeForm />)

    expect(subjectInput().value).toBe('')
  })

  it('should create a subject under a parent, select it and remember it', async () => {
    mockedCreateSubject.mockResolvedValue({ id: 'sub_new', name: 'Lenses', parentId: 'sub_a' } as never)
    mockedSource.mockResolvedValue({ id: 'ks_1' } as never)
    render(<AddKnowledgeForm />)

    fireEvent.click(screen.getByTestId('knowledge-new-subject-button'))
    fireEvent.change(screen.getByTestId('knowledge-new-subject-new-name'), { target: { value: 'Lenses' } })
    fireEvent.click(screen.getByRole('combobox', { name: 'Parent subject' }))
    fireEvent.mouseDown(await screen.findByTestId('knowledge-new-subject-parent-option-sub_a'))
    fireEvent.click(screen.getByTestId('knowledge-new-subject-create'))

    await waitFor(() => expect(subjectInput().value).toContain('Lenses'))
    expect(mockedCreateSubject).toHaveBeenCalledWith({ data: { name: 'Lenses', kind: 'architecture-mentor', parentId: 'sub_a' } })
    expect(window.localStorage.getItem(LAST_SUBJECT_STORAGE_KEY)).toBe('sub_new')

    fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: 'alpha beta' } })
    fireEvent.click(screen.getByTestId('knowledge-submit-button'))

    await waitFor(() => expect(mockedSource).toHaveBeenCalledTimes(1))
    expect(mockedSource.mock.calls[0][0].data).toEqual(expect.objectContaining({ subjectId: 'sub_new' }))
  })

  it('should keep the subject unchanged and say so when creating fails', async () => {
    mockedCreateSubject.mockRejectedValue(new Error('boom'))
    render(<AddKnowledgeForm />)

    fireEvent.click(screen.getByTestId('knowledge-new-subject-button'))
    fireEvent.change(screen.getByTestId('knowledge-new-subject-new-name'), { target: { value: 'Lenses' } })
    fireEvent.click(screen.getByTestId('knowledge-new-subject-create'))

    expect(await screen.findByTestId('knowledge-new-subject-error')).toBeTruthy()
    expect(subjectInput().value).toBe('')
  })
})
