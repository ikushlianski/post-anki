import type { InboxKnowledgeBit } from '@post-anki/shared'
import { matchesSubjectPath, subjectPathOptions } from '../shared/subject-path-filter'

export type InboxFilter = { query: string; subject: string }

export const EMPTY_INBOX_FILTER: InboxFilter = { query: '', subject: '' }

export function inboxSubjects(items: { subjectName: string | null }[]): string[] {
  return subjectPathOptions(items.map((item) => item.subjectName))
}

export function filterInbox(items: InboxKnowledgeBit[], filter: InboxFilter): InboxKnowledgeBit[] {
  const query = filter.query.trim().toLowerCase()
  const subject = inboxSubjects(items).includes(filter.subject) ? filter.subject : ''

  return items.filter((item) => {
    if (subject && !matchesSubjectPath(item.subjectName, subject)) return false

    if (!query) return true

    return `${item.body}\n${item.subjectName ?? ''}`.toLowerCase().includes(query)
  })
}

export function isInboxFilterActive(filter: InboxFilter): boolean {
  return filter.query.trim() !== '' || filter.subject !== ''
}
