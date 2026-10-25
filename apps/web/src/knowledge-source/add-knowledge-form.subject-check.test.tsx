// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

import type { SubjectCheckResponse } from '@post-anki/shared'

import { AddKnowledgeForm } from './add-knowledge-form'
import { checkKnowledgeSourceSubject, createKnowledgeSource } from './knowledge-source.api'
import { createSubject } from '../subject/subject.api'

const liveRows = vi.hoisted(() => ({
  rows: [
    { id: 'sub_a', name: 'Alpha', parentId: null },
    { id: 'sub_b', name: 'Beta', parentId: null },
    { id: 'sub_p', name: 'Parent', parentId: null },
    { id: 'sub_c', name: 'Child', parentId: 'sub_p' },
  ] as unknown[],
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@tanstack/react-db', () => ({ useLiveQuery: () => ({ data: liveRows.rows }) }))

vi.mock('../curriculum/board.collection', () => ({
  subjectsCollection: {},
  mapSubjectRow: (row: unknown) => row,
}))

vi.mock('./knowledge-source.api', () => ({
  createKnowledgeSource: vi.fn(),
  createKnowledgeSources: vi.fn(),
  createKnowledgeSourceFromUrl: vi.fn(),
  checkKnowledgeSourceSubject: vi.fn(),
}))

vi.mock('../knowledge-bit/knowledge-bit-review.api', () => ({
  getKnowledgeSourceRegenerationForReview: vi.fn().mockResolvedValue({ status: 'running', failureReason: null }),
  getPendingKnowledgeBitsWithAttentionForReview: vi.fn().mockResolvedValue([]),
}))

vi.mock('../subject/subject.api', () => ({ createSubject: vi.fn() }))

const mockedCheck = vi.mocked(checkKnowledgeSourceSubject)
const mockedCreate = vi.mocked(createKnowledgeSource)
const mockedCreateSubject = vi.mocked(createSubject)

const created = { id: 'ks_1', kind: 'prose', rawText: null, status: 'pending', createdAt: '2026-01-01' }

const okAdvice: SubjectCheckResponse = {
  status: 'ok',
  recommendations: [{ subjectId: 'sub_a', subjectLabel: 'Alpha', confidence: 'high', reason: 'Matches alpha' }],
  newSubject: null,
}

function type(text: string) {
  fireEvent.change(screen.getByTestId('knowledge-block-input-0'), { target: { value: text } })
}

function press() {
  fireEvent.click(screen.getByTestId('knowledge-submit-button'))
}

describe('AddKnowledgeForm subject check', () => {
  afterEach(() => {
    cleanup()
    mockedCheck.mockReset()
    mockedCreate.mockReset()
    mockedCreateSubject.mockReset()
  })

  it('saves nothing until the owner taps a suggestion, then files under that subject', async () => {
    mockedCheck.mockResolvedValue(okAdvice)
    mockedCreate.mockResolvedValue(created)

    render(<AddKnowledgeForm />)
    type('alpha text')
    press()

    await screen.findByTestId('subject-check-panel')
    expect(mockedCreate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('subject-check-use-sub_a'))

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith({ data: { text: 'alpha text', subjectId: 'sub_a' } })
    })
    expect((screen.getByTestId('knowledge-adding-to-label')).textContent).toContain('Alpha')
  })

  it('does not check or spend anything when a subject is already chosen', async () => {
    mockedCreate.mockResolvedValue(created)

    render(<AddKnowledgeForm initialSubjectId="sub_b" />)
    type('beta text')
    press()

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith({ data: { text: 'beta text', subjectId: 'sub_b' } })
    })
    expect(mockedCheck).not.toHaveBeenCalled()
  })

  it('limits the check to the parent when a parent subject is preselected', async () => {
    mockedCheck.mockResolvedValue({ status: 'none' })
    mockedCreate.mockResolvedValue(created)

    render(<AddKnowledgeForm initialSubjectId="sub_p" />)
    type('child text')
    press()

    await waitFor(() => {
      expect(mockedCheck).toHaveBeenCalledWith({
        data: { blocks: [{ type: 'text', value: 'child text' }], parentSubjectId: 'sub_p' },
      })
    })
  })

  it('adds unfiled with a visible notice when the check is unavailable', async () => {
    mockedCheck.mockResolvedValue({ status: 'unavailable', reason: 'timeout' })
    mockedCreate.mockResolvedValue(created)

    render(<AddKnowledgeForm />)
    type('some text')
    press()

    await screen.findByTestId('knowledge-unfiled-notice')
    expect(mockedCreate).toHaveBeenCalledWith({ data: { text: 'some text' } })
    expect(screen.getByTestId('knowledge-unfiled-notice').textContent).toContain('without a subject')
  })

  it('adds unfiled with the notice when the check call throws', async () => {
    mockedCheck.mockRejectedValue(new Error('network'))
    mockedCreate.mockResolvedValue(created)

    render(<AddKnowledgeForm />)
    type('some text')
    press()

    await screen.findByTestId('knowledge-unfiled-notice')
    expect(mockedCreate).toHaveBeenCalledWith({ data: { text: 'some text' } })
  })

  it('adds unfiled with the notice when nothing fits', async () => {
    mockedCheck.mockResolvedValue({ status: 'none' })
    mockedCreate.mockResolvedValue(created)

    render(<AddKnowledgeForm />)
    type('odd text')
    press()

    await screen.findByTestId('knowledge-unfiled-notice')
    expect(mockedCreate).toHaveBeenCalledWith({ data: { text: 'odd text' } })
  })

  it('adds without a subject when the owner declines and does not check the same text again', async () => {
    mockedCheck.mockResolvedValue(okAdvice)
    mockedCreate.mockRejectedValueOnce(new Error('api POST /knowledge-sources → 500')).mockResolvedValue(created)

    render(<AddKnowledgeForm />)
    type('alpha text')
    press()
    fireEvent.click(await screen.findByTestId('subject-check-add-without'))

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith({ data: { text: 'alpha text' } })
    })
    await screen.findByTestId('knowledge-error-message')

    press()

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledTimes(2)
    })
    expect(mockedCheck).toHaveBeenCalledTimes(1)
  })

  it('moves focus to the subject picker and keeps the text when picking another', async () => {
    mockedCheck.mockResolvedValue(okAdvice)

    render(<AddKnowledgeForm />)
    type('alpha text')
    press()
    fireEvent.click(await screen.findByTestId('subject-check-pick-another'))

    expect(document.activeElement).toBe(screen.getByTestId('knowledge-subject-select'))
    expect((screen.getByTestId('knowledge-block-input-0') as HTMLTextAreaElement).value).toBe('alpha text')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  it('creates the proposed subject and then adds the text under its id', async () => {
    mockedCheck.mockResolvedValue({
      status: 'ok',
      recommendations: [],
      newSubject: { name: 'Rust', parentSubjectId: null, parentLabel: null, kind: 'language', reason: 'New area' },
    })
    mockedCreateSubject.mockResolvedValue({ id: 'sub_new' } as Awaited<ReturnType<typeof createSubject>>)
    mockedCreate.mockResolvedValue(created)

    render(<AddKnowledgeForm />)
    type('rust text')
    press()
    fireEvent.click(await screen.findByTestId('subject-check-create'))

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith({ data: { text: 'rust text', subjectId: 'sub_new' } })
    })
    expect(mockedCreateSubject).toHaveBeenCalledWith({
      data: { name: 'Rust', kind: 'language-practice', parentId: null },
    })
  })

  it('keeps the text and the choices when creating the proposed subject fails', async () => {
    mockedCheck.mockResolvedValue({
      status: 'ok',
      recommendations: [],
      newSubject: { name: 'Rust', parentSubjectId: null, parentLabel: null, kind: 'general', reason: 'New area' },
    })
    mockedCreateSubject.mockRejectedValue(new Error('boom'))

    render(<AddKnowledgeForm />)
    type('rust text')
    press()
    fireEvent.click(await screen.findByTestId('subject-check-create'))

    await screen.findByTestId('knowledge-error-message')
    expect(mockedCreate).not.toHaveBeenCalled()
    expect(screen.getByTestId('subject-check-panel')).toBeTruthy()
  })
})
