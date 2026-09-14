import { describe, expect, it } from 'vitest'
import { describeCreationProgress } from './curriculum-creation-progress'

describe('describeCreationProgress', () => {
  it('gives a plain-language label and percent for every pre-confirm status', () => {
    expect(describeCreationProgress('draft')).toEqual({
      label: 'Getting started',
      percent: 10,
    })
    expect(describeCreationProgress('curating')).toEqual({
      label: 'Finding real sources for this course',
      percent: 30,
    })
    expect(describeCreationProgress('awaiting_source_approval')).toEqual({
      label: 'Waiting on you to approve sources',
      percent: 50,
    })
    expect(describeCreationProgress('shaping_structure')).toEqual({
      label: 'Drafting the course outline',
      percent: 75,
    })
  })

  it('advances monotonically as the course moves through earlier stages', () => {
    const order: Array<'draft' | 'curating' | 'awaiting_source_approval' | 'shaping_structure'> = [
      'draft',
      'curating',
      'awaiting_source_approval',
      'shaping_structure',
    ]
    const percents = order.map((status) => describeCreationProgress(status)?.percent ?? -1)

    for (let i = 1; i < percents.length; i += 1) {
      expect(percents[i]).toBeGreaterThan(percents[i - 1]!)
    }
  })

  it('returns null once the course has real content to show instead', () => {
    expect(describeCreationProgress('ready')).toBeNull()
    expect(describeCreationProgress('confirmed')).toBeNull()
    expect(describeCreationProgress('failed')).toBeNull()
  })
})
