import type { ExamDateErrorCode } from '@post-anki/shared'

export const EXAM_DATE_MESSAGES: Record<ExamDateErrorCode, string> = {
  exam_date_required: 'Pick the exam date to study for an exam.',
  exam_date_in_past: 'The exam date has to be today or later.',
  exam_date_too_far: 'The exam date can be at most two years ahead.',
  exam_date_requires_exam_intent: 'An exam date only works when studying for an Exam.',
}

export function isExamDateMessage(message: string): boolean {
  return Object.values(EXAM_DATE_MESSAGES).includes(message)
}

export function examDateMessageFor(code: string | undefined): string | null {
  return code !== undefined && code in EXAM_DATE_MESSAGES
    ? EXAM_DATE_MESSAGES[code as ExamDateErrorCode]
    : null
}
