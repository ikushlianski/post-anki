// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import type { StudySession, StudySessionPushResponse } from '@post-anki/shared'

vi.mock('./session-question-surface', () => ({
  SessionQuestionSurface: ({ onAnswered }: { onAnswered: (result: { outcome: 'pass' | 'fail'; coveredGapLabels: string[]; nextQuestion: null; feedback: string }) => void }) => (
    <button
      type="button"
      data-testid="mock-answer"
      onClick={() =>
        onAnswered({ outcome: 'pass', coveredGapLabels: [], nextQuestion: null, feedback: 'ok' })
      }
    >
      answer
    </button>
  ),
}))

import { SessionRunner } from './session-runner'

afterEach(cleanup)

function session(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: 's1',
    targetType: null,
    targetId: null,
    plannedDurationMinutes: 20,
    scheduledFor: null,
    status: 'in_progress',
    startedAt: '2026-08-08T10:00:00.000Z',
    completedAt: null,
    questionsAnswered: 0,
    questionsCorrect: 0,
    createdAt: '2026-08-08T09:00:00.000Z',
    ...overrides,
  }
}

const pushResult: StudySessionPushResponse = {
  push: {
    topicId: 't1',
    topicTitle: 'Hooks',
    curriculumId: 'c1',
    curriculumName: 'React',
    gap: {
      id: 'g1',
      topicId: 't1',
      label: 'useEffect cleanup',
      depth: 'working',
      origin: 'ai',
      state: 'open',
      wanted: false,
      concern: null,
      lastEvaluatedAt: null,
      triageState: 'untriaged',
      triagedAt: null,
      deferredUntil: null,
      deferralCount: 0,
      dismissedAt: null,
      dismissedCheckinSentAt: null,
    },
    reason: 'weakest',
  },
  question: { gapId: 'g1', gapLabel: 'useEffect cleanup', kind: 'socratic', prompt: 'Explain it' },
}

describe('SessionRunner', () => {
  it('loads the session push on mount with no excluded gaps', async () => {
    const onLoadPush = vi.fn().mockResolvedValue({ ok: true, data: pushResult })

    await act(async () => {
      render(
        <SessionRunner
          session={session()}
          nudge={null}
          onLoadPush={onLoadPush}
          onRecordAnswer={vi.fn()}
          onEnd={vi.fn()}
          onEnded={vi.fn()}
          onRespondNudge={vi.fn()}
          onNudgeResponded={vi.fn()}
        />,
      )
    })

    expect(onLoadPush).toHaveBeenCalledWith([])
  })

  it('records the answer and excludes the answered gap from the next push', async () => {
    const onLoadPush = vi.fn().mockResolvedValue({ ok: true, data: pushResult })
    const onRecordAnswer = vi.fn().mockResolvedValue({ ok: true, data: session() })

    await act(async () => {
      render(
        <SessionRunner
          session={session()}
          nudge={null}
          onLoadPush={onLoadPush}
          onRecordAnswer={onRecordAnswer}
          onEnd={vi.fn()}
          onEnded={vi.fn()}
          onRespondNudge={vi.fn()}
          onNudgeResponded={vi.fn()}
        />,
      )
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId('mock-answer'))
    })

    expect(onRecordAnswer).toHaveBeenCalledWith(true)
    expect(onLoadPush).toHaveBeenLastCalledWith(['g1'])
  })

  it('ends the session and calls onEnded when "End now" succeeds', async () => {
    const ended = session({ status: 'completed', completedAt: '2026-08-08T10:05:00.000Z' })
    const onEnd = vi.fn().mockResolvedValue({ ok: true, data: ended })
    const onEnded = vi.fn()

    await act(async () => {
      render(
        <SessionRunner
          session={session()}
          nudge={null}
          onLoadPush={vi.fn().mockResolvedValue({ ok: true, data: pushResult })}
          onRecordAnswer={vi.fn()}
          onEnd={onEnd}
          onEnded={onEnded}
          onRespondNudge={vi.fn()}
          onNudgeResponded={vi.fn()}
        />,
      )
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId('session-end-now'))
    })

    expect(onEnd).toHaveBeenCalledWith(true)
    expect(onEnded).toHaveBeenCalledWith(ended)
  })

  it('renders the nudge panel when a due nudge is present', async () => {
    await act(async () => {
      render(
        <SessionRunner
          session={session()}
          nudge={{ entityType: 'learning_list_item', entityId: 'n1', name: 'React', score: null, related: [] }}
          onLoadPush={vi.fn().mockResolvedValue({ ok: true, data: pushResult })}
          onRecordAnswer={vi.fn()}
          onEnd={vi.fn()}
          onEnded={vi.fn()}
          onRespondNudge={vi.fn()}
          onNudgeResponded={vi.fn()}
        />,
      )
    })

    expect(screen.getByTestId('nudge-panel')).toBeTruthy()
  })
})
