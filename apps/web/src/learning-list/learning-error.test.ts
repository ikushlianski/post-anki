import { describe, expect, it } from 'vitest'

import { learningErrorMessage } from './learning-error'

describe('learningErrorMessage', () => {
  it('should explain an already-handled item in plain words', () => {
    expect(learningErrorMessage('not_capturable')).toContain('already handled')
  })

  it('should never show the raw code for a known failure', () => {
    for (const code of ['not_found', 'not_parked', 'fold_in_area_missing', 'unresolved_target']) {
      expect(learningErrorMessage(code)).not.toContain('_')
    }
  })

  it('should give a generic sentence for an unknown code', () => {
    expect(learningErrorMessage('weird_code')).toBe(
      'Something went wrong. Try again in a moment.',
    )
  })
})
