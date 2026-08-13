import { deriveDepthHeadroom, shouldOfferHeadroom } from '@post-anki/core'
import type { DepthHeadroom, DepthLevel } from '@post-anki/shared'

export const TOP_AVAILABLE_DEPTH: DepthLevel = 'deep'

export interface HeadroomOfferInput {
  electedDepth: DepthLevel | null
  availableDepth: DepthLevel
  mastered: boolean
  lastOfferAt: string | null
  now: string
}

export function headroomToOffer(input: HeadroomOfferInput): DepthHeadroom | null {
  if (input.electedDepth === null) {
    return null
  }

  const headroom = deriveDepthHeadroom(input.electedDepth, input.availableDepth)

  const offer = shouldOfferHeadroom(
    {
      masteryAtElectedDepth: input.mastered ? 'mastered' : 'practicing',
      lastOfferAt: input.lastOfferAt,
      headroom,
    },
    input.now,
  )

  return offer ? headroom : null
}

export function headroomOfferText(headroom: DepthHeadroom): string {
  return headroom.nextDepth === 'deep'
    ? 'You have mastered this at basics. Want the advanced level?'
    : `You have mastered this at your chosen level. Want to go to ${headroom.nextDepth}?`
}

export function headroomDeclineText(): string {
  return 'Not now. This offer is parked and will not come back tomorrow.'
}
