import type { ChatQueueKnowledgeBit } from '@post-anki/shared'
import { matchesSubjectPath, subjectPathOptions } from '../shared/subject-path-filter'

export type ChatQueueFilter = { query: string; subject: string }

export const EMPTY_CHAT_QUEUE_FILTER: ChatQueueFilter = { query: '', subject: '' }

export function chatQueueSubjects(items: { subjectName: string | null }[]): string[] {
  return subjectPathOptions(items.map((item) => item.subjectName))
}

export function filterChatQueue(
  items: ChatQueueKnowledgeBit[],
  filter: ChatQueueFilter,
): ChatQueueKnowledgeBit[] {
  const query = filter.query.trim().toLowerCase()
  const subject = chatQueueSubjects(items).includes(filter.subject) ? filter.subject : ''

  return items.filter((item) => {
    if (subject && !matchesSubjectPath(item.subjectName, subject)) return false

    if (!query) return true

    return `${item.body}\n${item.background ?? ''}`.toLowerCase().includes(query)
  })
}

export function isChatQueueFilterActive(filter: ChatQueueFilter): boolean {
  return filter.query.trim() !== '' || filter.subject !== ''
}

export function chatQueueSubjectId(
  items: ChatQueueKnowledgeBit[],
  subjectName: string,
): string | null {
  if (!subjectName) return null

  return items.find((item) => item.subjectName === subjectName && item.subjectId)?.subjectId ?? null
}
