import { describe, it, expect } from 'vitest'
import type { ProbeOutcome, ProbeSessionQuestion } from '@post-anki/shared'
import { summarizeProbeSessionByTopic } from './probe-topic-summary'

function question(overrides: Partial<ProbeSessionQuestion> & { id: string }): ProbeSessionQuestion {
  return {
    order: 1,
    topicId: 't1',
    gapId: null,
    prompt: 'Q',
    options: ['a', 'b'],
    difficulty: 'medium',
    format: 'mcq',
    type: 'single',
    answeredIndex: 0,
    answeredIndexes: null,
    outcome: 'pass',
    correctAnswerIndex: 0,
    correctAnswerIndexes: null,
    optionExplanations: null,
    ...overrides,
  }
}

function outcomeQuestion(id: string, topicId: string, outcome: ProbeOutcome): ProbeSessionQuestion {
  return question({ id, topicId, outcome })
}

describe('summarizeProbeSessionByTopic', () => {
  it('returns nothing when there are no answered questions', () => {
    const summary = summarizeProbeSessionByTopic(
      { questions: [question({ id: 'q1', outcome: null, answeredIndex: null })] },
      new Map(),
    )

    expect(summary).toEqual([])
  })

  it('ignores a question with no topic attribution', () => {
    const summary = summarizeProbeSessionByTopic(
      { questions: [question({ id: 'q1', topicId: null })] },
      new Map(),
    )

    expect(summary).toEqual([])
  })

  it('tallies correct and total per topic across multiple questions', () => {
    const summary = summarizeProbeSessionByTopic(
      {
        questions: [
          outcomeQuestion('q1', 't1', 'pass'),
          outcomeQuestion('q2', 't1', 'fail'),
          outcomeQuestion('q3', 't1', 'pass'),
        ],
      },
      new Map([['t1', 'Caching']]),
    )

    expect(summary).toEqual([
      { topicId: 't1', topicTitle: 'Caching', correct: 2, total: 3, strength: 'mixed' },
    ])
  })

  it('classifies a topic answered mostly correctly as strong', () => {
    const summary = summarizeProbeSessionByTopic(
      {
        questions: [
          outcomeQuestion('q1', 't1', 'pass'),
          outcomeQuestion('q2', 't1', 'pass'),
          outcomeQuestion('q3', 't1', 'pass'),
          outcomeQuestion('q4', 't1', 'fail'),
        ],
      },
      new Map([['t1', 'Caching']]),
    )

    expect(summary[0]!.strength).toBe('strong')
  })

  it('classifies a topic answered mostly incorrectly as weak', () => {
    const summary = summarizeProbeSessionByTopic(
      {
        questions: [
          outcomeQuestion('q1', 't1', 'fail'),
          outcomeQuestion('q2', 't1', 'fail'),
          outcomeQuestion('q3', 't1', 'pass'),
        ],
      },
      new Map([['t1', 'Caching']]),
    )

    expect(summary[0]!.strength).toBe('weak')
  })

  it('falls back to a placeholder title when the topic is not in the lookup map', () => {
    const summary = summarizeProbeSessionByTopic(
      { questions: [outcomeQuestion('q1', 't-unknown', 'pass')] },
      new Map(),
    )

    expect(summary[0]!.topicTitle).toBe('Unknown topic')
  })

  it('orders the weakest topics first', () => {
    const summary = summarizeProbeSessionByTopic(
      {
        questions: [
          outcomeQuestion('q1', 't-strong', 'pass'),
          outcomeQuestion('q2', 't-strong', 'pass'),
          outcomeQuestion('q3', 't-weak', 'fail'),
          outcomeQuestion('q4', 't-weak', 'fail'),
        ],
      },
      new Map([
        ['t-strong', 'Strong topic'],
        ['t-weak', 'Weak topic'],
      ]),
    )

    expect(summary.map((row) => row.topicId)).toEqual(['t-weak', 't-strong'])
  })
})
