import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import type { PendingKnowledgeSourceForReview } from '@post-anki/shared'

import type { ReviewDecisions } from './use-review-decisions'
import { useBitExample } from './use-bit-example'
import { useInboxMoves } from './use-inbox-moves'
import { useTriageUndoLog, type TriageUndoEntry } from './use-triage-undo-log'

type Announce = (kind: 'polite' | 'assertive', text: string) => void

export function useTriageExtras({
  decisions,
  undoDecision,
  claimBit,
  releaseBit,
  setSources,
  announce,
}: {
  decisions: ReviewDecisions
  undoDecision: (bitId: string) => Promise<boolean>
  claimBit: (bitId: string) => boolean
  releaseBit: (bitId: string) => void
  setSources: Dispatch<SetStateAction<PendingKnowledgeSourceForReview[]>>
  announce: Announce
}) {
  const [toast, setToast] = useState<{ bitId: string; destination: 'inbox' | 'chat' } | null>(null)
  const inbox = useInboxMoves({ claimBit, releaseBit })
  const example = useBitExample({
    claimBit,
    releaseBit,
    setSources,
    onGenerated: (bit, previous) => {
      undo.push({ kind: 'example', bitId: bit.id, body: bit.body, previous })
      announce('polite', 'Example added')
    },
  })

  async function runUndo(entry: TriageUndoEntry): Promise<boolean> {
    if (entry.kind === 'decision') {
      return undoDecision(entry.bitId)
    }

    if (entry.kind === 'example') {
      const restored = await example.restore(entry.bitId, entry.body, entry.previous)

      if (restored) {
        announce('polite', 'Example undone')
      }

      return restored
    }

    const returned =
      entry.kind === 'chat'
        ? await inbox.returnFromChat(entry.bitId)
        : await inbox.returnToTriage(entry.bitId)

    if (returned) {
      setToast(null)
      announce('polite', 'Back in triage')
    }

    return returned
  }

  const undo = useTriageUndoLog({
    isLive: (entry) =>
      entry.kind === 'decision'
        ? Boolean(decisions[entry.bitId])
        : entry.kind === 'inbox'
          ? inbox.inboxedIds.has(entry.bitId)
          : entry.kind === 'chat'
            ? inbox.chattedIds.has(entry.bitId)
            : true,
    run: runUndo,
  })

  const dismissToast = useCallback(() => setToast(null), [])

  async function sendToInbox(bitId: string, left: number) {
    if (await inbox.sendToInbox(bitId)) {
      undo.push({ kind: 'inbox', bitId })
      setToast({ bitId, destination: 'inbox' })
      announce('polite', `Moved to Inbox, ${left} left`)
    }
  }

  async function sendToChat(bitId: string, left: number) {
    if (await inbox.sendToChat(bitId)) {
      undo.push({ kind: 'chat', bitId })
      setToast({ bitId, destination: 'chat' })
      announce('polite', `Moved to Chat, ${left} left`)
    }
  }

  return {
    inboxedIds: inbox.inboxedIds,
    chattedIds: inbox.chattedIds,
    inboxErrors: inbox.inboxErrors,
    exampleStates: example.exampleStates,
    generateExample: example.generate,
    sendToInbox,
    sendToChat,
    pushDecision: (bitId: string) => undo.push({ kind: 'decision', bitId }),
    canUndo: undo.canUndo,
    undoLast: undo.undoLast,
    toast,
    dismissToast,
  }
}
