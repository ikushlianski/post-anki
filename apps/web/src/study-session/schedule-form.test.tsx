// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { StudySession } from '@post-anki/shared'

import { ScheduleForm } from './schedule-form'

afterEach(cleanup)

function session(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: 's1',
    targetType: null,
    targetId: null,
    plannedDurationMinutes: 20,
    scheduledFor: null,
    status: 'planned',
    startedAt: null,
    completedAt: null,
    questionsAnswered: 0,
    questionsCorrect: 0,
    createdAt: '2026-08-08T00:00:00.000Z',
    ...overrides,
  }
}

describe('ScheduleForm', () => {
  it('does not show a target picker when targeting "anything"', () => {
    render(
      <ScheduleForm
        curricula={[]}
        learningPaths={[]}
        onSchedule={vi.fn()}
        onScheduled={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('schedule-target-id')).toBeNull()
  })

  it('shows a curriculum picker once "A curriculum" is selected and requires a choice', () => {
    render(
      <ScheduleForm
        curricula={[{ id: 'c1', name: 'React' }]}
        learningPaths={[]}
        onSchedule={vi.fn()}
        onScheduled={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId('schedule-target-kind-curriculum'))

    expect(screen.getByTestId('schedule-target-id')).toBeTruthy()
    expect(screen.getByTestId<HTMLButtonElement>('schedule-submit').disabled).toBe(true)
  })

  it('submits a resolved target and duration, then calls onScheduled', async () => {
    const created = session({ targetType: 'curriculum', targetId: 'c1' })
    const onSchedule = vi.fn().mockResolvedValue({ ok: true, data: created })
    const onScheduled = vi.fn()

    render(
      <ScheduleForm
        curricula={[{ id: 'c1', name: 'React' }]}
        learningPaths={[]}
        onSchedule={onSchedule}
        onScheduled={onScheduled}
      />,
    )

    fireEvent.click(screen.getByTestId('schedule-target-kind-curriculum'))
    fireEvent.change(screen.getByTestId('schedule-target-id'), { target: { value: 'c1' } })
    fireEvent.change(screen.getByTestId('schedule-duration'), { target: { value: '30' } })
    fireEvent.click(screen.getByTestId('schedule-submit'))

    await waitFor(() => expect(onScheduled).toHaveBeenCalledWith(created))
    expect(onSchedule).toHaveBeenCalledWith({
      targetType: 'curriculum',
      targetId: 'c1',
      plannedDurationMinutes: 30,
      scheduledFor: null,
    })
  })

  it('shows an error and does not call onScheduled when the API call fails', async () => {
    const onSchedule = vi.fn().mockResolvedValue({ ok: false, status: 500, code: 'x', message: null })
    const onScheduled = vi.fn()

    render(
      <ScheduleForm
        curricula={[]}
        learningPaths={[]}
        onSchedule={onSchedule}
        onScheduled={onScheduled}
      />,
    )

    fireEvent.click(screen.getByTestId('schedule-submit'))

    expect(await screen.findByTestId('schedule-error')).toBeTruthy()
    expect(onScheduled).not.toHaveBeenCalled()
  })
})
