import { describe, expect, it } from 'vitest'

import {
  TOP_AVAILABLE_DEPTH,
  headroomDeclineText,
  headroomOfferText,
  headroomToOffer,
} from './headroom'

const NOW = '2026-08-07T10:00:00.000Z'

describe('headroomToOffer', () => {
  it('should offer advanced for a topic mastered at basics', () => {
    expect(
      headroomToOffer({
        electedDepth: 'working',
        availableDepth: TOP_AVAILABLE_DEPTH,
        mastered: true,
        lastOfferAt: null,
        now: NOW,
      }),
    ).toEqual({ nextDepth: 'deep', topDepth: 'deep' })
  })

  it('should not offer while the topic is not yet mastered', () => {
    expect(
      headroomToOffer({
        electedDepth: 'working',
        availableDepth: TOP_AVAILABLE_DEPTH,
        mastered: false,
        lastOfferAt: null,
        now: NOW,
      }),
    ).toBeNull()
  })

  it('should not offer when there is no headroom left', () => {
    expect(
      headroomToOffer({
        electedDepth: 'deep',
        availableDepth: TOP_AVAILABLE_DEPTH,
        mastered: true,
        lastOfferAt: null,
        now: NOW,
      }),
    ).toBeNull()
  })

  it('should not re-ask the day after a decline', () => {
    expect(
      headroomToOffer({
        electedDepth: 'working',
        availableDepth: TOP_AVAILABLE_DEPTH,
        mastered: true,
        lastOfferAt: '2026-08-06T10:00:00.000Z',
        now: NOW,
      }),
    ).toBeNull()
  })

  it('should ask again once the cooling-off period has passed', () => {
    expect(
      headroomToOffer({
        electedDepth: 'working',
        availableDepth: TOP_AVAILABLE_DEPTH,
        mastered: true,
        lastOfferAt: '2026-06-01T10:00:00.000Z',
        now: NOW,
      }),
    ).not.toBeNull()
  })

  it('should not offer before a depth has been elected', () => {
    expect(
      headroomToOffer({
        electedDepth: null,
        availableDepth: TOP_AVAILABLE_DEPTH,
        mastered: true,
        lastOfferAt: null,
        now: NOW,
      }),
    ).toBeNull()
  })
})

describe('headroomOfferText', () => {
  it('should name the advanced level for a basics topic', () => {
    expect(headroomOfferText({ nextDepth: 'deep', topDepth: 'deep' })).toContain(
      'advanced',
    )
  })

  it('should name the next rung for any other step', () => {
    expect(
      headroomOfferText({ nextDepth: 'working', topDepth: 'deep' }),
    ).toContain('working')
  })
})

describe('headroomDeclineText', () => {
  it('should promise not to ask again tomorrow', () => {
    expect(headroomDeclineText()).toContain('not come back tomorrow')
  })
})
