import type { ProbeQuestion } from '@post-anki/shared'
import type { Question } from '../curriculum/model'

export function mapPushQuestion(topicId: string, question: ProbeQuestion): Question {
  return {
    id: `${question.gapId ?? 'opener'}:${question.kind}`,
    topicId,
    gapId: question.gapId,
    gapLabel: question.gapLabel,
    kind: question.kind,
    prompt: question.prompt,
    options: question.options,
    correctAnswerIndex: question.correctAnswerIndex ?? undefined,
    sources: question.sources,
  }
}
