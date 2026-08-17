import type { LivenessStatus } from '@post-anki/shared'

export type LivenessTone = 'live' | 'quiet' | 'dormant' | 'untracked'

export function livenessTone(liveness: LivenessStatus | null): LivenessTone {
  if (liveness === null) {
    return 'untracked'
  }

  if (liveness.dormant) {
    return 'dormant'
  }

  return liveness.generationAllowed ? 'live' : 'quiet'
}

export function livenessLabel(liveness: LivenessStatus | null): string {
  const tone = livenessTone(liveness)

  if (tone === 'untracked') {
    return 'Not scored'
  }

  const score = liveness?.score

  if (tone === 'dormant') {
    return score === null || score === undefined
      ? 'Dormant'
      : `Dormant · ${score}/10`
  }

  const prefix = tone === 'live' ? 'Live' : 'Fading'

  return score === null || score === undefined
    ? prefix
    : `${prefix} · ${score}/10`
}

const TONE_DESCRIPTION: Record<LivenessTone, string> = {
  live: 'Answering keeps this alive — the next slice will be generated.',
  quiet:
    'It has gone quiet, so no new questions are generated. It stays on this list.',
  dormant:
    'You declined the nudge, so it no longer surfaces. Nothing was deleted — say yes to a nudge to bring it back.',
  untracked:
    'Folded-in articles are generated once and are not scored, so there is nothing to decay.',
}

export function livenessDescription(liveness: LivenessStatus | null): string {
  return TONE_DESCRIPTION[livenessTone(liveness)]
}

const TONE_CLASS: Record<LivenessTone, string> = {
  live: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  quiet: 'border-amber-300 bg-amber-50 text-amber-800',
  dormant: 'border-neutral-300 bg-neutral-100 text-neutral-500',
  untracked: 'border-neutral-200 bg-white text-neutral-400',
}

export function livenessBadgeClass(liveness: LivenessStatus | null): string {
  return TONE_CLASS[livenessTone(liveness)]
}

export function isVisuallyMuted(liveness: LivenessStatus | null): boolean {
  return livenessTone(liveness) === 'dormant'
}
