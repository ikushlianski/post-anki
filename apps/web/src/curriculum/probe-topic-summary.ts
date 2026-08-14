import type { ProbeSession } from '@post-anki/shared'

export type TopicStrength = 'strong' | 'weak' | 'mixed'

export interface ProbeTopicSummaryRow {
  topicId: string
  topicTitle: string
  correct: number
  total: number
  strength: TopicStrength
}

function classifyStrength(correct: number, total: number): TopicStrength {
  if (total === 0) {
    return 'mixed'
  }

  const ratio = correct / total

  if (ratio >= 0.7) {
    return 'strong'
  }

  if (ratio < 0.4) {
    return 'weak'
  }

  return 'mixed'
}

export function summarizeProbeSessionByTopic(
  session: Pick<ProbeSession, 'questions'>,
  topicTitleById: Map<string, string>,
): ProbeTopicSummaryRow[] {
  const byTopic = new Map<string, { correct: number; total: number }>()

  for (const question of session.questions) {
    if (!question.topicId || question.outcome === null) {
      continue
    }

    const entry = byTopic.get(question.topicId) ?? { correct: 0, total: 0 }

    entry.total += 1

    if (question.outcome === 'pass') {
      entry.correct += 1
    }

    byTopic.set(question.topicId, entry)
  }

  return Array.from(byTopic.entries())
    .map(([topicId, { correct, total }]) => ({
      topicId,
      topicTitle: topicTitleById.get(topicId) ?? 'Unknown topic',
      correct,
      total,
      strength: classifyStrength(correct, total),
    }))
    .sort((a, b) => a.correct / a.total - b.correct / b.total)
}
