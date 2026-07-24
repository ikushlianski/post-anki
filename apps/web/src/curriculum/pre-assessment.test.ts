import { describe, expect, it } from 'vitest'

import { needsPreAssessment } from './pre-assessment'

describe('needsPreAssessment', () => {
  describe('a curriculum that just transitioned to confirmed', () => {
    it('routes to the pre-assessment screen when it has never been graded', () => {
      expect(
        needsPreAssessment({ status: 'confirmed', preAssessmentCompletedAt: null }),
      ).toBe(true)
    })

    it('goes straight to its topics once the one-time screen has been passed', () => {
      expect(
        needsPreAssessment({
          status: 'confirmed',
          preAssessmentCompletedAt: '2026-07-18T00:00:00.000Z',
        }),
      ).toBe(false)
    })
  })

  describe('a curriculum not yet confirmed', () => {
    it('never routes to pre-assessment while still ready/curating/awaiting approval', () => {
      expect(needsPreAssessment({ status: 'ready', preAssessmentCompletedAt: null })).toBe(
        false,
      )
      expect(needsPreAssessment({ status: 'curating', preAssessmentCompletedAt: null })).toBe(
        false,
      )
      expect(
        needsPreAssessment({
          status: 'awaiting_source_approval',
          preAssessmentCompletedAt: null,
        }),
      ).toBe(false)
    })
  })
})
