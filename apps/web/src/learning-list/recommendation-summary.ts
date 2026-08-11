import type {
  LearningListDestination,
  LearningListItem,
  LearningListRecommendation,
  SeriesVerdictValue,
} from '@post-anki/shared'

export const VERDICT_LABEL: Record<SeriesVerdictValue, string> = {
  single: 'Read as a single article',
  series: 'Read as a multi-part series',
  unknown: 'Could not tell single from series',
}

export const DESTINATION_LABEL: Record<LearningListDestination, string> = {
  fold_in: 'Folded into an existing Area',
  mini_course: 'Mini-course recommended',
  extend_curriculum: 'Matches an existing mini-course',
  park: 'Parked in the learning list',
}

const NO_SIGNALS_RECORDED =
  'No page signals were recorded for this verdict — treat it as a guess.'

const APPROVABLE_DESTINATIONS: LearningListDestination[] = [
  'mini_course',
  'extend_curriculum',
]

export function isAwaitingRecommendationDecision(
  item: Pick<LearningListItem, 'status' | 'recommendation'>,
): boolean {
  return (
    item.status === 'classified' &&
    item.recommendation !== null &&
    APPROVABLE_DESTINATIONS.includes(item.recommendation.destination)
  )
}

export function decidingSignals(
  recommendation: Pick<LearningListRecommendation, 'reasons'>,
): string[] {
  const signals = recommendation.reasons.filter(
    (reason) => reason.trim() !== '',
  )

  return signals.length > 0 ? signals : [NO_SIGNALS_RECORDED]
}

export function overridePrompt(): string {
  return 'If these signals are wrong and this is really a standalone article, decline — nothing will be created.'
}

const SETTLED_NOTE: Record<LearningListDestination, string> = {
  fold_in:
    'These are the signals that filed it here rather than proposing a course.',
  mini_course: 'These are the signals that produced this verdict.',
  extend_curriculum:
    'These are the signals that matched this to an existing mini-course.',
  park: 'These are the signals that were too weak to decide, so it was parked.',
}

export function settledSignalsNote(
  destination: LearningListDestination,
): string {
  return SETTLED_NOTE[destination]
}

export function signalsFraming(input: {
  destination: LearningListDestination
  awaitingDecision: boolean
}): string {
  return input.awaitingDecision
    ? overridePrompt()
    : settledSignalsNote(input.destination)
}

export function declineOutcome(): string {
  return 'Declined. No course, module, topic or question was created — the item stays captured in the list.'
}

export function approveOutcome(
  destination: LearningListDestination = 'mini_course',
): string {
  return destination === 'extend_curriculum'
    ? 'Approved. Merged into the existing mini-course instead of creating a new one.'
    : 'Approved. The mini-course was created with its first slice only.'
}

export function placementSummary(
  recommendation: Pick<
    LearningListRecommendation,
    'areaName' | 'concern' | 'partCount'
  >,
): string[] {
  const parts: string[] = []

  if (recommendation.areaName) {
    parts.push(`Area: ${recommendation.areaName}`)
  }

  if (recommendation.concern) {
    parts.push(`Concern: ${recommendation.concern}`)
  }

  if (recommendation.partCount > 0) {
    parts.push(`${recommendation.partCount} parts detected`)
  }

  return parts
}
