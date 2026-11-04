// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SubjectStudyOptions } from '@post-anki/shared'
import { SubjectStudyOptionsForm } from './subject-study-options-form'
import { examForecast } from '../study-plan/test-mocks'

afterEach(cleanup)

const inherited: SubjectStudyOptions = {
  own: {
    newCardsPerDay: null,
    learningStepsMinutes: null,
    relearningStepsMinutes: null,
    desiredRetention: null,
    studyIntent: null,
    examDate: null,
    detailLevel: null,
    hintingEnabled: null,
  },
  intent: { studyIntent: 'long_term', examDate: null, source: 'app' },
  effective: {
    newCardsPerDay: 7,
    learningStepsMinutes: [1, 10],
    relearningStepsMinutes: [10],
    desiredRetention: 0.9,
  },
  sources: {
    newCardsPerDay: 'parent',
    learningStepsMinutes: 'app',
    relearningStepsMinutes: 'app',
    desiredRetention: 'app',
  },
}

function setup(initial = inherited, onSave = vi.fn(), forecast: Parameters<typeof SubjectStudyOptionsForm>[0]['forecast'] = null) {
  render(
    <SubjectStudyOptionsForm
      subjectId="child"
      initial={initial}
      subjectNames={{ parent: 'Networking' }}
      forecast={forecast}
      onSave={onSave}
    />,
  )

  return onSave
}

describe('SubjectStudyOptionsForm', () => {
  it('should say which parent a value is inherited from and which come from app defaults', () => {
    setup()

    expect(screen.getByTestId('study-options-newCardsPerDay-source').textContent).toBe(
      'Inherited from Networking.',
    )
    expect(screen.getByTestId('study-options-learningStepsMinutes-source').textContent).toBe(
      'Using the app default.',
    )
  })

  it('should save the detail level and hinting choices for this subject', async () => {
    const onSave = vi.fn().mockResolvedValue(inherited)

    setup(inherited, onSave)
    fireEvent.change(screen.getByTestId('study-options-detail-level-input'), { target: { value: 'deep' } })
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ detailLevel: 'deep' }))

    fireEvent.click(screen.getByTestId('study-options-hinting-input'))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ hintingEnabled: false }))
  })

  it('should save only the option the learner changed', async () => {
    const onSave = vi.fn().mockResolvedValue(inherited)

    setup(inherited, onSave)
    fireEvent.change(screen.getByTestId('study-options-learning-steps-input'), { target: { value: '5, 30' } })
    fireEvent.blur(screen.getByTestId('study-options-learning-steps-input'))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ learningStepsMinutes: [5, 30] }))
  })

  it('should let the learner clear an own value so it is inherited again', async () => {
    const own: SubjectStudyOptions = {
      ...inherited,
      own: { ...inherited.own, newCardsPerDay: 3 },
      effective: { ...inherited.effective, newCardsPerDay: 3 },
      sources: { ...inherited.sources, newCardsPerDay: 'child' },
    }
    const onSave = vi.fn().mockResolvedValue(inherited)

    setup(own, onSave)
    fireEvent.click(screen.getByTestId('study-options-newCardsPerDay-source-reset'))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ newCardsPerDay: null }))
    await waitFor(() =>
      expect(screen.getByTestId('study-options-newCardsPerDay-source').textContent).toBe(
        'Inherited from Networking.',
      ),
    )
  })

  it('should show an error and keep the old value when saving fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('boom'))

    setup(inherited, onSave)
    fireEvent.change(screen.getByTestId('study-options-retention-input'), { target: { value: '85' } })
    fireEvent.blur(screen.getByTestId('study-options-retention-input'))

    await waitFor(() => expect(screen.getByTestId('study-options-save-error')).toBeTruthy())
    expect((screen.getByTestId('study-options-retention-input') as HTMLInputElement).value).toBe('90')
  })

  it('should clamp retention to the allowed range before saving', async () => {
    const onSave = vi.fn().mockResolvedValue(inherited)

    setup(inherited, onSave)
    fireEvent.change(screen.getByTestId('study-options-retention-input'), { target: { value: '50' } })
    fireEvent.blur(screen.getByTestId('study-options-retention-input'))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ desiredRetention: 0.7 }))
  })

  it('should keep the learning and relearning steps folded under More options', () => {
    setup()

    const more = screen.getByTestId('study-options-more') as HTMLDetailsElement

    expect(more.open).toBe(false)
    expect(more.contains(screen.getByTestId('study-options-learning-steps'))).toBe(true)
    expect(more.contains(screen.getByTestId('study-options-relearning-steps'))).toBe(true)
    expect(more.contains(screen.getByTestId('study-options-retention'))).toBe(false)
    expect(more.contains(screen.getByTestId('study-options-new-cards'))).toBe(false)
  })

  it('should show the exam date only when studying for an Exam', () => {
    setup()

    expect(screen.queryByTestId('study-options-exam-date')).toBeNull()

    fireEvent.change(screen.getByTestId('study-options-intent-input'), { target: { value: 'exam' } })

    expect(screen.getByTestId('study-options-exam-date')).toBeTruthy()
  })

  it('should save Exam together with its date, not before the date is picked', async () => {
    const onSave = vi.fn().mockResolvedValue(inherited)

    setup(inherited, onSave)
    fireEvent.change(screen.getByTestId('study-options-intent-input'), { target: { value: 'exam' } })

    expect(onSave).not.toHaveBeenCalled()

    fireEvent.change(screen.getByTestId('study-options-exam-date-input'), { target: { value: '2026-12-20' } })

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ studyIntent: 'exam', examDate: '2026-12-20' }))
  })

  it('should return to the parent intent when "Same as parent" is picked', async () => {
    const own: SubjectStudyOptions = { ...inherited, own: { ...inherited.own, studyIntent: 'long_term' } }
    const onSave = vi.fn().mockResolvedValue(inherited)

    setup(own, onSave)
    fireEvent.change(screen.getByTestId('study-options-intent-input'), { target: { value: 'inherit' } })

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ studyIntent: null }))
  })

  it('should show the server message when the exam date is refused', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('The exam date has to be today or later.'))

    setup(inherited, onSave)
    fireEvent.change(screen.getByTestId('study-options-intent-input'), { target: { value: 'exam' } })
    fireEvent.change(screen.getByTestId('study-options-exam-date-input'), { target: { value: '2020-01-01' } })

    await waitFor(() =>
      expect(screen.getByTestId('study-options-exam-date-error').textContent).toBe(
        'The exam date has to be today or later.',
      ),
    )
    expect(screen.getByTestId('study-options-exam-date')).toBeTruthy()
  })

  it('should show Auto for new cards on an Exam subject without a typed value', () => {
    const exam: SubjectStudyOptions = {
      ...inherited,
      own: { ...inherited.own, studyIntent: 'exam', examDate: '2026-12-20' },
      intent: { studyIntent: 'exam', examDate: '2026-12-20', source: 'child' },
    }

    setup(exam, vi.fn(), examForecast)

    expect(screen.getByTestId('study-options-new-cards').textContent).toContain('Auto: 10 a day today')
    expect(screen.getByTestId('study-options-intent-source').textContent).toBe(
      'Exam on 2026-12-20, set on this subject.',
    )
  })

  it('should say where an inherited exam comes from', () => {
    const exam: SubjectStudyOptions = {
      ...inherited,
      intent: { studyIntent: 'exam', examDate: '2026-12-20', source: 'parent' },
    }

    setup(exam)

    expect(screen.getByTestId('study-options-intent-source').textContent).toBe(
      'Exam on 2026-12-20, from Networking.',
    )
  })
})
