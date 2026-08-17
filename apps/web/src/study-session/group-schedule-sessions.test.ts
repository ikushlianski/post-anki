import { describe, expect, it } from 'vitest'

import type { StudySessionListItem } from '@post-anki/shared'

import { groupScheduleSessions } from './group-schedule-sessions'

function item(overrides: Partial<StudySessionListItem>): StudySessionListItem {
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
    missed: false,
    ...overrides,
  }
}

describe('groupScheduleSessions', () => {
  it('groups planned, in-progress, and finished sessions separately', () => {
    const result = groupScheduleSessions([
      item({ id: 'a', status: 'planned' }),
      item({ id: 'b', status: 'in_progress' }),
      item({ id: 'c', status: 'completed' }),
      item({ id: 'd', status: 'abandoned' }),
    ])

    expect(result.upcoming.map((s) => s.id)).toEqual(['a'])
    expect(result.active.map((s) => s.id)).toEqual(['b'])
    expect(result.history.map((s) => s.id)).toEqual(['c', 'd'])
  })

  it('drops a missed planned session out of every group — no catch-up queue', () => {
    const result = groupScheduleSessions([item({ id: 'missed', status: 'planned', missed: true })])

    expect(result.upcoming).toEqual([])
    expect(result.active).toEqual([])
    expect(result.history).toEqual([])
  })
})
