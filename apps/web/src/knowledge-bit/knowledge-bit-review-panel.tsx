import { useCallback, useRef, useState } from 'react'
import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import {
  editKnowledgeBitForReview,
  gradeKnowledgeBitForReview,
  updateKnowledgeBitFeedbackForReview,
  getPendingKnowledgeBitsForReview,
  editKnowledgeBitQuestionVariantForReview,
} from './knowledge-bit-review.api'
import { applyBitEdit, applyVariantEdit, singleSubjectId } from './knowledge-bit-review-sources'
import { useBulkApproval } from './knowledge-bit-review-bulk-approval'
import {
  REGENERATION_POLL_INTERVAL_MS,
  useSourceRegeneration,
} from './knowledge-bit-review-regeneration'
import { KnowledgeBitReviewLanding } from './knowledge-bit-review-landing'
import { KnowledgeBitReviewAttentionBlock } from './knowledge-bit-review-attention-block'
import { splitAttentionSources, useAttentionNotices } from './use-attention-notices'
import { buildFocusQueue } from './knowledge-bit-focus-queue'
import { useFocusKeyboard, type FocusKeyAction } from './knowledge-bit-focus-keyboard'
import { KnowledgeBitFocusShell } from './knowledge-bit-focus-shell'
import { KnowledgeBitFocusCard } from './knowledge-bit-focus-card'
import { KnowledgeBitFocusDone } from './knowledge-bit-focus-done'
import { KnowledgeBitReviewAnnouncer, useReviewAnnouncer } from './knowledge-bit-review-announcer'
import {
  QUESTION_POLL_IDLE_LIMIT,
  hasBitAwaitingQuestions,
  mergeArrivedBits,
  mergeArrivedVariants,
  REGENERATION_POLL_MAX_ATTEMPTS,
  unseenBitIds,
  useQuestionPolling,
} from './knowledge-bit-review-polling'
import { useReviewDecisions } from './use-review-decisions'
import { useResolvingSuggestions } from '../domain-map/use-resolving-suggestions'
import { TriageSessionSection } from '../card-triage/triage-session-section'
import { useTriageSession } from '../card-triage/use-triage-session'

const NEUTRAL_RATING = 3

export function KnowledgeBitReviewPanel({
  initialSources,
}: {
  initialSources: PendingKnowledgeSourceForReview[]
}) {
  const [sources, setSources] = useState(() => splitAttentionSources(initialSources).cards)
  const [idleStopped, setIdleStopped] = useState(false)
  const [note, setNote] = useState<{ bitId: string; text: string }>({ bitId: '', text: '' })
  const editingBitIds = useRef(new Set<string>())
  const knownBitIds = useRef(
    new Set(initialSources.flatMap((source) => source.bits.map((bit) => bit.id))),
  )
  const quietPolls = useRef(0)
  const regeneration = useSourceRegeneration({ sources, setSources, knownBitIds })
  const { fetchStatuses, applyStatuses } = regeneration
  const attention = useAttentionNotices({
    initial: splitAttentionSources(initialSources).notices,
    clearRetryState: regeneration.actions.onCancel,
  })
  const { reloadAfterRetry } = attention

  const { claim: claimBit, release: releaseBit, isResolving: isBitResolving } =
    useResolvingSuggestions()
  const { claim: claimVariant, release: releaseVariant } = useResolvingSuggestions()
  const { claim: claimBitEdit, release: releaseBitEdit } = useResolvingSuggestions()
  const { decisions, rowErrors, approve, reject, undoLast, markApproved } = useReviewDecisions({
    knownBitIds,
    claimBit,
    releaseBit,
  })
  const { announcement, announce } = useReviewAnnouncer()
  const pendingSources = sources.map((source) => ({
    ...source,
    bits: source.bits.filter((bit) => !decisions[bit.id]),
  }))
  const triageSession = useTriageSession({
    decisions,
    subjectId: singleSubjectId(pendingSources),
  })
  const queue = buildFocusQueue(pendingSources)
  const allBits = pendingSources.flatMap((source) => source.bits)
  const readyBits = allBits.filter((bit) => bit.variants.length > 0)
  const undoError = Object.keys(rowErrors).find((id) => rowErrors[id] && decisions[id])
  const [doneFeedback, setDoneFeedback] = useState('')
  const inFocus = triageSession.isOpen && triageSession.phase === 'idle'

  const refreshQuestions = useCallback(async () => {
    const statuses = await fetchStatuses()
    const fresh = await getPendingKnowledgeBitsForReview()
    const arrived = new Set(unseenBitIds(fresh, knownBitIds.current))
    const protectedBitIds = new Set([
      ...editingBitIds.current,
      ...Object.keys(rowErrors).filter((bitId) => rowErrors[bitId]),
    ])

    arrived.forEach((bitId) => knownBitIds.current.add(bitId))
    quietPolls.current = arrived.size > 0 ? 0 : quietPolls.current + 1
    setIdleStopped(quietPolls.current >= QUESTION_POLL_IDLE_LIMIT)
    setSources((prev) =>
      mergeArrivedBits(mergeArrivedVariants(prev, fresh, protectedBitIds), fresh, arrived),
    )
    applyStatuses(statuses)
    await reloadAfterRetry(statuses)
  }, [rowErrors, fetchStatuses, applyStatuses, reloadAfterRetry])

  const pollingGaveUp = useQuestionPolling(
    hasBitAwaitingQuestions(pendingSources) || !idleStopped || regeneration.isRegenerating,
    refreshQuestions,
    regeneration.isRegenerating ? REGENERATION_POLL_INTERVAL_MS : undefined,
    regeneration.isRegenerating ? REGENERATION_POLL_MAX_ATTEMPTS : undefined,
  )

  const handleEditingChange = useCallback((bitId: string, editing: boolean) => {
    if (editing) {
      editingBitIds.current.add(bitId)
    } else {
      editingBitIds.current.delete(bitId)
    }
  }, [])

  const bulk = useBulkApproval({
    sources: pendingSources,
    readyBits,
    setSources,
    markApproved,
    knownBitIds,
    editingBitIds,
    claimBit,
    releaseBit,
  })

  async function saveVariant(
    bitId: string,
    variantId: string,
    prompt: string,
    answer: string,
  ): Promise<boolean> {
    if (!claimVariant(variantId)) {
      return false
    }

    try {
      const result = await editKnowledgeBitQuestionVariantForReview({
        data: { variantId, prompt, answer },
      })

      setSources((prev) => applyVariantEdit(prev, bitId, variantId, result.variantId, prompt, answer))

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

  async function sendNote(action: 'approve' | 'reject', bitId: string, text: string, feedbackId: string | null) {
    try {
      if (action === 'reject' && feedbackId) {
        await updateKnowledgeBitFeedbackForReview({ data: { feedbackId, note: text } })
      } else if (action === 'approve') {
        await gradeKnowledgeBitForReview({ data: { bitId, rating: NEUTRAL_RATING, note: text } })
      }
    } catch {
      announce('assertive', "Couldn't save your note.")
    }
  }

  async function decide(action: 'approve' | 'reject') {
    const bitId = queue.current?.bit.id

    if (!bitId || editingBitIds.current.has(bitId) || isBitResolving(bitId)) {
      return
    }

    const text = note.bitId === bitId ? note.text.trim() : ''
    const left = Math.max(queue.readyCount - 1, 0)
    const decision = await (action === 'approve' ? approve(bitId) : reject(bitId))

    if (!decision) {
      return
    }

    announce('polite', `${action === 'approve' ? 'Approved' : 'Rejected'}, ${left} left`)

    if (text) {
      void sendNote(action, bitId, text, decision.feedbackId)
    }
  }

  function handleAction(action: FocusKeyAction) {
    if (action === 'undo') {
      void undoLast()
    } else {
      void decide(action)
    }
  }

  useFocusKeyboard(handleAction, inFocus)

  const session = (
    <TriageSessionSection
      session={triageSession}
      canStart={readyBits.length > 0}
      hideOpenBar
    />
  )

  if (triageSession.isOpen) {
    return (
      <div data-testid="knowledge-bit-review-panel">
        <KnowledgeBitFocusShell
          readyCount={queue.readyCount}
          waitingCount={queue.waitingCount}
          canUndo={Object.keys(decisions).length > 0}
          onUndo={() => void undoLast()}
          onFinish={triageSession.openFinish}
        >
          {inFocus ? (
            queue.current ? (
              <KnowledgeBitFocusCard
                bit={queue.current.bit}
                subjectName={queue.current.source.subjectName ?? null}
                sourceText={queue.current.source.sourceText ?? null}
                isResolving={isBitResolving(queue.current.bit.id)}
                pollingGaveUp={pollingGaveUp}
                errorMessage={
                  rowErrors[queue.current.bit.id] || (undoError ? rowErrors[undoError] : null) || null
                }
                note={note.bitId === queue.current.bit.id ? note.text : ''}
                onNoteChange={(text) => setNote({ bitId: queue.current?.bit.id ?? '', text })}
                onApprove={() => void decide('approve')}
                onReject={() => void decide('reject')}
                onEditingChange={handleEditingChange}
                onSaveVariant={saveVariant}
                onSaveBit={saveBit}
              />
            ) : (
              <KnowledgeBitFocusDone
                waitingCount={queue.waitingCount}
                decidedCount={triageSession.decidedCount}
                feedback={doneFeedback}
                onFeedbackChange={setDoneFeedback}
                onFinish={() => void triageSession.finish(doneFeedback)}
              />
            )
          ) : null}
          {session}
        </KnowledgeBitFocusShell>
        <KnowledgeBitReviewAnnouncer announcement={announcement} />
      </div>
    )
  }

  return (
    <div data-testid="knowledge-bit-review-panel">
      <KnowledgeBitReviewLanding
        sources={pendingSources}
        readyCount={queue.readyCount}
        waitingCount={queue.waitingCount}
        showWaiting={!pollingGaveUp}
        regenerationStates={regeneration.states}
        regenerationActions={regeneration.actions}
        bulk={bulk}
        hasNotices={attention.notices.length > 0}
        notices={
          <KnowledgeBitReviewAttentionBlock
            notices={attention.notices}
            states={regeneration.states}
            actions={regeneration.actions}
            onDiscard={attention.discard}
          />
        }
      >
        {session}
      </KnowledgeBitReviewLanding>
      <KnowledgeBitReviewAnnouncer announcement={announcement} />
    </div>
  )
}
