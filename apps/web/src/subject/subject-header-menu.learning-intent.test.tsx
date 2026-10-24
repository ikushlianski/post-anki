// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { DEFAULT_INTENT_BY_ROOT_NAME } from '@post-anki/shared'
import type { Subject } from '../curriculum/model'
import { SubjectHeaderMenu } from './subject-header-menu'
import { updateSubjectLearningIntent } from './subject.api'

const live = vi.hoisted(() => ({ subjects: null as Subject[] | null }))

vi.mock('./subject-live-data', () => ({
  useLiveCurriculumCount: () => 0,
  useLiveSubjects: () => live.subjects,
}))

const router = vi.hoisted(() => ({ invalidate: vi.fn(async () => undefined), navigate: vi.fn(async () => undefined) }))

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => router,
}))

vi.mock('./subject.api', () => ({
  createSubject: vi.fn(),
  updateSubjectName: vi.fn(),
  updateSubjectParent: vi.fn(),
  deleteSubject: vi.fn(),
  updateSubjectLearningIntent: vi.fn(async () => null),
}))

const BUSINESS: Subject = {
  id: 'biz',
  name: 'Business',
  kind: 'architecture-mentor',
  requireSources: false,
  modelTier: null,
  parentId: null,
  learningIntent: null,
}

const SALES: Subject = { ...BUSINESS, id: 'sales', name: 'Sales', parentId: 'biz' }

afterEach(() => {
  cleanup()
  live.subjects = null
  vi.clearAllMocks()
})

function openIntent(subject: Subject) {
  render(<SubjectHeaderMenu subject={subject} />)
  fireEvent.click(screen.getByRole('button', { name: `Actions for ${subject.name}` }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Learning intent' }))
}

describe('SubjectHeaderMenu learning intent', () => {
  it('should show the root default as placeholder for a top-level subject without an intent', () => {
    live.subjects = [BUSINESS, SALES]
    openIntent(BUSINESS)

    expect((screen.getByTestId('subject-intent-biz-input') as HTMLTextAreaElement).placeholder).toBe(
      DEFAULT_INTENT_BY_ROOT_NAME.Business,
    )
  })

  it('should show the parent intent as placeholder for a sub-subject', () => {
    live.subjects = [{ ...BUSINESS, learningIntent: 'Custom business intent' }, SALES]
    openIntent(SALES)

    expect((screen.getByTestId('subject-intent-sales-input') as HTMLTextAreaElement).placeholder).toBe(
      'Custom business intent',
    )
  })

  it('should save the typed intent and refresh', async () => {
    live.subjects = [BUSINESS]
    openIntent(BUSINESS)
    fireEvent.change(screen.getByTestId('subject-intent-biz-input'), { target: { value: 'Apply pricing rules' } })
    fireEvent.click(screen.getByTestId('subject-intent-biz-confirm'))

    await waitFor(() => {
      expect(vi.mocked(updateSubjectLearningIntent)).toHaveBeenCalledWith({
        data: { subjectId: 'biz', learningIntent: 'Apply pricing rules' },
      })
    })
    await waitFor(() => expect(router.invalidate).toHaveBeenCalled())
  })

  it('should send an empty intent to inherit again when the user clears the field', async () => {
    const own = { ...BUSINESS, learningIntent: 'Old intent' }

    live.subjects = [own]
    openIntent(own)
    fireEvent.change(screen.getByTestId('subject-intent-biz-input'), { target: { value: '' } })
    fireEvent.click(screen.getByTestId('subject-intent-biz-confirm'))

    await waitFor(() => {
      expect(vi.mocked(updateSubjectLearningIntent)).toHaveBeenCalledWith({
        data: { subjectId: 'biz', learningIntent: '' },
      })
    })
  })

  it('should keep the form open with an error when saving fails', async () => {
    vi.mocked(updateSubjectLearningIntent).mockRejectedValueOnce(new Error('boom'))
    live.subjects = [BUSINESS]
    openIntent(BUSINESS)
    fireEvent.change(screen.getByTestId('subject-intent-biz-input'), { target: { value: 'x intent' } })
    fireEvent.click(screen.getByTestId('subject-intent-biz-confirm'))

    expect((await screen.findByTestId('subject-intent-biz-error')).textContent).toContain('failed')
  })
})
