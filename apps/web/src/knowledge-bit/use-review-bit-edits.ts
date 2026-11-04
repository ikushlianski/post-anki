import type { Dispatch, SetStateAction } from 'react'
import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import {
  editKnowledgeBitForReview,
  editKnowledgeBitNoteForReview,
  editKnowledgeBitQuestionVariantForReview,
} from './knowledge-bit-review.api'
import { applyBitEdit, applyVariantEdit } from './knowledge-bit-review-sources'
import { applyNoteEdit, draftNote, type NoteMode } from './knowledge-bit-review-note-edit'
import { useResolvingSuggestions } from '../domain-map/use-resolving-suggestions'

export function useReviewBitEdits(
  setSources: Dispatch<SetStateAction<PendingKnowledgeSourceForReview[]>>,
) {
  const { claim: claimVariant, release: releaseVariant } = useResolvingSuggestions()
  const { claim: claimBitEdit, release: releaseBitEdit } = useResolvingSuggestions()

  async function saveVariant(
    bitId: string,
    variantId: string,
    prompt: string,
    answer: string,
    context?: string | null,
  ): Promise<boolean> {
    if (!claimVariant(variantId)) {
      return false
    }

    try {
      const result = await editKnowledgeBitQuestionVariantForReview({
        data: { variantId, prompt, answer, context },
      })

      setSources((prev) => applyVariantEdit(prev, bitId, variantId, result.variantId, prompt, answer, context))

      return true
    } catch {
      return false
    } finally {
      releaseVariant(variantId)
    }
  }

  async function saveNote(
    bitId: string,
    variantId: string,
    mode: NoteMode,
    text: string,
  ): Promise<boolean> {
    const draft = draftNote(mode, text)

    if (draft.problem !== null || !claimVariant(variantId)) {
      return false
    }

    try {
      const result = await editKnowledgeBitNoteForReview({ data: { variantId, text, mode } })

      setSources((prev) => applyNoteEdit(prev, bitId, mode, draft, result.cards))

      return true
    } catch {
      return false
    } finally {
      releaseVariant(variantId)
    }
  }

  async function saveBit(bitId: string, body: string, background: string | null): Promise<boolean> {
    if (!claimBitEdit(bitId)) {
      return false
    }

    try {
      await editKnowledgeBitForReview({ data: { bitId, body, background } })

      setSources((prev) => applyBitEdit(prev, bitId, body, background))

      return true
    } catch {
      return false
    } finally {
      releaseBitEdit(bitId)
    }
  }

  return { saveVariant, saveNote, saveBit }
}
