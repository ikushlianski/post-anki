import { KNOWLEDGE_SOURCE_TRUNCATED_NOTICE } from '@post-anki/shared'

export function addedKnowledgeMessage(createdCount: number, truncatedCount: number): string {
  const addedText = createdCount === 1 ? 'Added.' : `${createdCount} knowledge sources added.`
  const truncatedText = truncatedCount > 0 ? ` ${KNOWLEDGE_SOURCE_TRUNCATED_NOTICE}` : ''

  return `${addedText}${truncatedText} Questions take a minute or two to appear. If anything goes wrong, it shows in Knowledge triage.`
}
