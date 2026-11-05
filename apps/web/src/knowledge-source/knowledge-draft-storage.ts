import { z } from 'zod'

import { knowledgeHighlightsSchema, mergeHighlights } from '@post-anki/shared'
import type { Block } from './knowledge-form-blocks'

export const KNOWLEDGE_DRAFT_STORAGE_KEY = 'post-anki:add-knowledge:draft-blocks'
export const KNOWLEDGE_DRAFT_MAX_BLOCKS = 20
export const KNOWLEDGE_DRAFT_MAX_CHARS = 200_000

const draftSchema = z
  .array(
    z.object({
      type: z.enum(['text', 'url']),
      value: z.string(),
      highlights: knowledgeHighlightsSchema.optional(),
    }),
  )
  .min(1)
  .max(KNOWLEDGE_DRAFT_MAX_BLOCKS)

export function readKnowledgeDraft(): Block[] | null {
  try {
    const raw = window.localStorage.getItem(KNOWLEDGE_DRAFT_STORAGE_KEY)
    const parsed = raw ? draftSchema.safeParse(JSON.parse(raw)) : null

    if (!parsed?.success) {
      return null
    }

    return parsed.data.map(({ type, value, highlights }) => {
      const valid = mergeHighlights(highlights ?? []).filter((range) => range.end <= value.length)

      return type === 'text' && valid.length > 0 ? { type, value, highlights: valid } : { type, value }
    })
  } catch {
    return null
  }
}

export function clearKnowledgeDraft(): void {
  try {
    window.localStorage.removeItem(KNOWLEDGE_DRAFT_STORAGE_KEY)
  } catch {
    return
  }
}

export function writeKnowledgeDraft(blocks: Block[]): void {
  const draft = blocks.map(({ type, value, highlights }) =>
    type === 'text' && highlights && highlights.length > 0 ? { type, value, highlights } : { type, value },
  )
  const size = draft.reduce((total, block) => total + block.value.length, 0)

  if (size === 0 || draft.length > KNOWLEDGE_DRAFT_MAX_BLOCKS || size > KNOWLEDGE_DRAFT_MAX_CHARS) {
    clearKnowledgeDraft()

    return
  }

  try {
    window.localStorage.setItem(KNOWLEDGE_DRAFT_STORAGE_KEY, JSON.stringify(draft))
  } catch {
    return
  }
}
