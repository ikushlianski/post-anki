// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AddKnowledgeGoalProgress } from '@post-anki/shared'
import { AddKnowledgeGoalView } from './add-knowledge-goal-panel'

afterEach(cleanup)

const options = [
  { id: 'pg', label: 'Databases / Postgres' },
  { id: 'go', label: 'Go' },
]

function entry(overrides: Partial<AddKnowledgeGoalProgress>): AddKnowledgeGoalProgress {
  return {
    subjectId: 'pg',
    period: 'week',
    target: 5,
    added: 3,
    periodEndsAt: '2026-11-02T00:00:00.000Z',
    ...overrides,
  }
}

function setup(progress: AddKnowledgeGoalProgress[]) {
  const props = { onSave: vi.fn().mockResolvedValue(undefined), onRemove: vi.fn().mockResolvedValue(undefined) }

  render(
    <AddKnowledgeGoalView
      progress={progress}
      goals={progress.map((p) => ({ id: `g-${p.subjectId}`, subjectId: p.subjectId, period: p.period, targetNotes: p.target }))}
      options={options}
      {...props}
    />,
  )

  return props
}

describe('AddKnowledgeGoalView', () => {
  it('should show how many notes were added to a hot subject this week', () => {
    setup([entry({})])

    expect(screen.getByTestId('add-knowledge-goal-progress').textContent).toBe(
      'Databases / Postgres: 3 of 5 notes this week',
    )
    expect(screen.queryByTestId('add-knowledge-nudge')).toBeNull()
  })

  it('should nudge only the hot subjects that have no notes yet', () => {
    setup([entry({ added: 0 }), entry({ subjectId: 'go', added: 2 })])

    expect(screen.getAllByTestId('add-knowledge-nudge')).toHaveLength(1)
  })

  it('should explain how to start when no subject is marked hot', () => {
    setup([])

    expect(screen.getByTestId('add-knowledge-goals-empty')).toBeTruthy()
  })

  it('should save a chosen subject with a per-day target', async () => {
    const { onSave } = setup([])

    fireEvent.change(screen.getByTestId('add-knowledge-goal-subject'), { target: { value: 'go' } })
    fireEvent.change(screen.getByTestId('add-knowledge-goal-target'), { target: { value: '2' } })
    fireEvent.change(screen.getByTestId('add-knowledge-goal-period'), { target: { value: 'day' } })
    fireEvent.click(screen.getByTestId('add-knowledge-goal-save'))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ subjectId: 'go', period: 'day', targetNotes: 2 }))
  })

  it('should not allow setting a goal before a subject is chosen', () => {
    setup([])

    expect((screen.getByTestId('add-knowledge-goal-save') as HTMLButtonElement).disabled).toBe(true)
  })

  it('should remove a goal by its id', async () => {
    const { onRemove } = setup([entry({})])

    fireEvent.click(screen.getByTestId('add-knowledge-goal-remove'))

    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('g-pg'))
  })
})
