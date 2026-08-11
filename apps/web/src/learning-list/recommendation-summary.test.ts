import { describe, expect, it } from 'vitest'

import type { LearningListRecommendation } from '@post-anki/shared'

import {
  decidingSignals,
  declineOutcome,
  isAwaitingRecommendationDecision,
  overridePrompt,
  placementSummary,
  signalsFraming,
} from './recommendation-summary'

const recommendation: LearningListRecommendation = {
  verdict: 'series',
  reasons: ['the page is labelled part 1 of 9'],
  destination: 'mini_course',
  areaId: 'area-1',
  areaName: 'AI/ML Services',
  subSubjectNodeId: 'node-1',
  subjectId: 'subject-1',
  concern: 'security',
  partCount: 9,
  existingCurriculumMatch: null,
}

describe('isAwaitingRecommendationDecision', () => {
  it('should await a decision for a classified mini-course recommendation', () => {
    expect(
      isAwaitingRecommendationDecision({ status: 'classified', recommendation }),
    ).toBe(true)
  })

  it('should not await a decision once a course was created', () => {
    expect(
      isAwaitingRecommendationDecision({
        status: 'course_created',
        recommendation,
      }),
    ).toBe(false)
  })

  it('should not await a decision for a folded-in item', () => {
    expect(
      isAwaitingRecommendationDecision({
        status: 'folded_in',
        recommendation: { ...recommendation, destination: 'fold_in' },
      }),
    ).toBe(false)
  })

  it('should not await a decision when there is no recommendation', () => {
    expect(
      isAwaitingRecommendationDecision({
        status: 'classified',
        recommendation: null,
      }),
    ).toBe(false)
  })
})

describe('decidingSignals', () => {
  it('should return the reasons that produced the verdict', () => {
    expect(decidingSignals(recommendation)).toEqual([
      'the page is labelled part 1 of 9',
    ])
  })

  it('should never leave the override affordance blank', () => {
    expect(decidingSignals({ reasons: [] })).toHaveLength(1)
    expect(decidingSignals({ reasons: ['  '] })[0]).toContain('guess')
  })
})

describe('signalsFraming', () => {
  it('should offer the override route while a decision is pending', () => {
    expect(
      signalsFraming({ destination: 'mini_course', awaitingDecision: true }),
    ).toContain('decline')
  })

  it('should stay neutral for a settled fold-in, where no decision is takeable', () => {
    const framing = signalsFraming({
      destination: 'fold_in',
      awaitingDecision: false,
    })

    expect(framing).toContain('filed it here')
    expect(framing).not.toContain('approve')
  })

  it('should explain why a parked item was not decided', () => {
    expect(
      signalsFraming({ destination: 'park', awaitingDecision: false }),
    ).toContain('too weak')
  })
})

describe('overridePrompt', () => {
  it('should point at the decline button as the override', () => {
    expect(overridePrompt()).toContain('decline')
  })
})

describe('declineOutcome', () => {
  it('should state that nothing was created', () => {
    expect(declineOutcome()).toContain('No course, module, topic or question')
  })
})

describe('placementSummary', () => {
  it('should list area, concern and part count', () => {
    expect(placementSummary(recommendation)).toEqual([
      'Area: AI/ML Services',
      'Concern: security',
      '9 parts detected',
    ])
  })

  it('should omit what is not known', () => {
    expect(
      placementSummary({ areaName: null, concern: null, partCount: 0 }),
    ).toEqual([])
  })
})
