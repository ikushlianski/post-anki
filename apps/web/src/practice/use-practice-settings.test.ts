import { describe, it, expect } from 'vitest'

import type { PracticeSettings } from '@post-anki/shared'

import { resolvePracticeSettings } from './use-practice-settings'

const LIVE_SETTINGS: PracticeSettings = {
  subjectId: 'subj-1',
  level: 'C1_C2',
  pack: 'CodeReview',
}

const INITIAL_SETTINGS: PracticeSettings = {
  subjectId: 'subj-1',
  level: 'B1_B2',
  pack: 'General',
}

describe('resolvePracticeSettings', () => {
  it('returns the live settings when Electric has already delivered a row', () => {
    expect(resolvePracticeSettings(LIVE_SETTINGS, INITIAL_SETTINGS)).toEqual(LIVE_SETTINGS)
  })

  it('falls back to the loader-seeded initial settings when live is not yet available', () => {
    expect(resolvePracticeSettings(undefined, INITIAL_SETTINGS)).toEqual(INITIAL_SETTINGS)
  })

  it('returns undefined when neither live nor initial settings are available', () => {
    expect(resolvePracticeSettings(undefined, undefined)).toBeUndefined()
  })
})
