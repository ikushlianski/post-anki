// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SubjectPriority } from '@post-anki/shared'
import { SubjectPrioritiesView } from './subject-priorities-panel'

afterEach(cleanup)

const NOW = new Date('2026-10-28T12:00:00.000Z')

function priority(overrides: Partial<SubjectPriority>): SubjectPriority {
  return {
    id: 'p1',
    subjectId: 'pg',
    periodKind: 'week',
    periodKey: '2026-W44',
    title: 'Finish indexes chapter',
    targetMetric: 'none',
    targetValue: null,
    doneAt: null,
    progress: { reviews: 0, newCards: 0, notes: 0 },
    current: null,
    targetMet: false,
    ...overrides,
  }
}

function setup(priorities: SubjectPriority[], handlers = {}) {
  const props = {
    onCreate: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    ...handlers,
  }

  render(
    <SubjectPrioritiesView
      subjectId="pg"
      priorities={priorities}
      subjectNames={{ pgidx: 'Indexes' }}
      now={NOW}
      tz="UTC"
      {...props}
    />,
  )

  return props
}

describe('SubjectPrioritiesView', () => {
  it('should invite the learner to add a priority when none is set for the current periods', () => {
    setup([priority({ periodKey: '2026-W01' })])

    expect(screen.getByTestId('priorities-empty')).toBeTruthy()
    expect(screen.queryByTestId('priority-row')).toBeNull()
  })

  it('should show a numeric priority with its progress and a bar', () => {
    setup([
      priority({
        title: '200 reviews',
        targetMetric: 'reviews',
        targetValue: 200,
        current: 50,
        progress: { reviews: 50, newCards: 4, notes: 2 },
      }),
    ])

    expect(screen.getByTestId('priority-progress').textContent).toContain('50 of 200 reviews')
    expect(screen.getByTestId('priority-bar').getAttribute('style')).toContain('25%')
  })

  it('should name the sub-subject a rolled-up priority belongs to', () => {
    setup([priority({ subjectId: 'pgidx', title: 'B-tree' })])

    expect(screen.getByTestId('priority-row').textContent).toContain('Indexes')
  })

  it('should tick a text-only priority done by hand', async () => {
    const { onUpdate } = setup([priority({})])

    fireEvent.click(screen.getByTestId('priority-done'))

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('p1', { done: true }))
  })

  it('should only offer a target number once a metric is chosen, and send the current period key', async () => {
    const { onCreate } = setup([])

    expect(screen.queryByTestId('priority-target')).toBeNull()

    fireEvent.change(screen.getByTestId('priority-kind'), { target: { value: 'month' } })
    fireEvent.change(screen.getByTestId('priority-title'), { target: { value: 'Postgres reviews' } })
    fireEvent.change(screen.getByTestId('priority-metric'), { target: { value: 'reviews' } })
    fireEvent.change(screen.getByTestId('priority-target'), { target: { value: '200' } })
    fireEvent.click(screen.getByTestId('priority-add'))

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        periodKind: 'month',
        periodKey: '2026-10',
        title: 'Postgres reviews',
        targetMetric: 'reviews',
        targetValue: 200,
      }),
    )
  })

  it('should keep the Add button disabled until the priority has a title', () => {
    setup([])

    expect((screen.getByTestId('priority-add') as HTMLButtonElement).disabled).toBe(true)
  })

  it('should tell the learner when a change cannot be saved', async () => {
    setup([priority({})], { onDelete: vi.fn().mockRejectedValue(new Error('x')) })
    fireEvent.click(screen.getByTestId('priority-delete'))

    await waitFor(() => expect(screen.getByTestId('priorities-error')).toBeTruthy())
  })
})
