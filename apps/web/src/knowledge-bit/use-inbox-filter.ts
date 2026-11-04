import { useEffect, useState } from 'react'
import type { InboxKnowledgeBit } from '@post-anki/shared'

import { EMPTY_INBOX_FILTER, filterInbox, inboxSubjects, isInboxFilterActive } from './knowledge-bit-inbox-filter'

export const INBOX_SEARCH_DEBOUNCE_MS = 300

export function useInboxFilter(items: InboxKnowledgeBit[]) {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState('')
  const subjects = inboxSubjects(items)
  const subjectPresent = subjects.includes(subject)

  useEffect(() => {
    const timer = setTimeout(() => setQuery(input), INBOX_SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [input])

  useEffect(() => {
    if (subject && !subjectPresent) setSubject('')
  }, [subject, subjectPresent])

  const filter = { query, subject: subjectPresent ? subject : '' }

  return {
    input,
    subject: filter.subject,
    subjects,
    visible: filterInbox(items, filter),
    active: isInboxFilterActive({ query: input, subject: filter.subject }),
    setInput,
    setSubject,
    clear() {
      setInput(EMPTY_INBOX_FILTER.query)
      setQuery(EMPTY_INBOX_FILTER.query)
      setSubject(EMPTY_INBOX_FILTER.subject)
    },
  }
}
