import type { ComponentProps, Dispatch, ReactNode, SetStateAction } from 'react'

import type { buildFocusQueue } from './knowledge-bit-focus-queue'
import { KnowledgeBitFocusShell } from './knowledge-bit-focus-shell'
import { KnowledgeBitFocusCard } from './knowledge-bit-focus-card'
import { KnowledgeBitFocusDone } from './knowledge-bit-focus-done'
import { KnowledgeBitReviewAnnouncer } from './knowledge-bit-review-announcer'
import { KnowledgeBitInboxToast } from './knowledge-bit-inbox-toast'
import type { useTriageExtras } from './use-triage-extras'
import type { useTriageSession } from '../card-triage/use-triage-session'

type CardProps = ComponentProps<typeof KnowledgeBitFocusCard>

type CardHandlers = Pick<
  CardProps,
  | 'onChat'
  | 'onInbox'
  | 'onExample'
  | 'onApprove'
  | 'onReject'
  | 'onEditingChange'
  | 'onSaveVariant'
  | 'onSaveBit'
  | 'onSaveNote'
>

export function KnowledgeBitReviewFocusView({
  queue,
  triageSession,
  pendingCount,
  extras,
  inFocus,
  session,
  announcement,
  isBitResolving,
  pollingGaveUp,
  rowErrors,
  undoError,
  note,
  setNote,
  selectedIndex,
  setChoice,
  doneFeedback,
  setDoneFeedback,
  handlers,
}: {
  queue: ReturnType<typeof buildFocusQueue>
  triageSession: ReturnType<typeof useTriageSession>
  pendingCount: number
  extras: ReturnType<typeof useTriageExtras>
  inFocus: boolean
  session: ReactNode
  announcement: ComponentProps<typeof KnowledgeBitReviewAnnouncer>['announcement']
  isBitResolving: (bitId: string) => boolean
  pollingGaveUp: boolean
  rowErrors: Record<string, string | null | undefined>
  undoError: string | undefined
  note: { bitId: string; text: string }
  setNote: Dispatch<SetStateAction<{ bitId: string; text: string }>>
  selectedIndex: number
  setChoice: Dispatch<SetStateAction<{ bitId: string; index: number }>>
  doneFeedback: string
  setDoneFeedback: (value: string) => void
  handlers: CardHandlers
}) {
  return (
    <div data-testid="knowledge-bit-review-panel">
      <KnowledgeBitFocusShell
        readyCount={queue.readyCount}
        waitingCount={queue.waitingCount}
        decidedCount={triageSession.decidedCount}
        pendingCount={pendingCount}
        canUndo={extras.canUndo}
        onUndo={() => void extras.undoLast()}
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
                rowErrors[queue.current.bit.id] ||
                extras.inboxErrors[queue.current.bit.id] ||
                (undoError ? rowErrors[undoError] : null) ||
                null
              }
              example={extras.exampleStates[queue.current.bit.id]}
              note={note.bitId === queue.current.bit.id ? note.text : ''}
              onNoteChange={(text) => setNote({ bitId: queue.current?.bit.id ?? '', text })}
              selectedIndex={selectedIndex}
              onSelect={(index) => setChoice({ bitId: queue.current?.bit.id ?? '', index })}
              {...handlers}
            />
          ) : (
            <KnowledgeBitFocusDone
              waitingCount={queue.waitingCount}
              decidedCount={triageSession.decidedCount}
              inboxCount={extras.inboxedIds.size}
              chatCount={extras.chattedIds.size}
              feedback={doneFeedback}
              onFeedbackChange={setDoneFeedback}
              onFinish={() => void triageSession.finish(doneFeedback)}
            />
          )
        ) : null}
        {session}
      </KnowledgeBitFocusShell>
      {extras.toast ? (
        <KnowledgeBitInboxToast
          bitId={extras.toast.bitId}
          destination={extras.toast.destination}
          onUndo={() => void extras.undoLast()}
          onDismiss={extras.dismissToast}
        />
      ) : null}
      <KnowledgeBitReviewAnnouncer announcement={announcement} />
    </div>
  )
}
