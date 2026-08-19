import { describe, expect, it } from 'vitest'

import type { StudySessionListItem } from '@post-anki/shared'

import { selectResumableSession } from './select-resumable-session'

const NOW = new Date('2026-08-18T12:00:00.000Z')

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
    createdAt: '2026-08-18T00:00:00.000Z',
    missed: false,
    ...overrides,
  }
}

describe('selectResumableSession', () => {
  it('returns null when there are no sessions', () => {
    expect(selectResumableSession([], NOW)).toBeNull()
  })

  it('ignores an in-progress session that started more than 24h ago', () => {
    const stale = item({
      id: 'stale',
      status: 'in_progress',
      startedAt: '2026-08-17T11:00:00.000Z',
    })

    expect(selectResumableSession([stale], NOW)).toBeNull()
  })

  it('picks the most recently started session among several in-progress ones', () => {
    const older = item({
      id: 'older',
      status: 'in_progress',
      startedAt: '2026-08-18T08:00:00.000Z',
    })
    const newer = item({
      id: 'newer',
      status: 'in_progress',
      startedAt: '2026-08-18T10:00:00.000Z',
    })

    expect(selectResumableSession([older, newer], NOW)).toEqual(newer)
  })

  it('ignores a completed session even if it finished recently', () => {
    const completed = item({
      id: 'completed',
      status: 'completed',
      startedAt: '2026-08-18T11:00:00.000Z',
      completedAt: '2026-08-18T11:30:00.000Z',
    })

    expect(selectResumableSession([completed], NOW)).toBeNull()
  })
})
