import { useTriageSessionKeys } from './triage-session-keyboard'
import { TriageFeedbackPanel, TriageResultPanel } from './triage-feedback-panel'
import { TriageSessionBar } from './triage-session-bar'
import type { TriageSession } from './use-triage-session'

export function TriageSessionSection({
  session,
  canStart = true,
  hideOpenBar = false,
}: {
  session: TriageSession
  canStart?: boolean
  hideOpenBar?: boolean
}) {
  useTriageSessionKeys({
    onStart: () => {
      if (canStart) {
        void session.start()
      }
    },
    onFinish: session.openFinish,
  })

  async function skip() {
    if (await session.finish('')) {
      session.closeResult()
    }
  }

  if (session.phase === 'result' && session.result) {
    return <TriageResultPanel result={session.result} onClose={session.closeResult} />
  }

  if (session.isOpen && session.phase !== 'idle') {
    return (
      <TriageFeedbackPanel
        decidedCount={session.decidedCount}
        decisions={session.decisions}
        cards={session.cards}
        onEditDecision={session.editDecision}
        saving={session.phase === 'saving'}
        error={session.error}
        resumed={session.resumed}
        stale={session.stale}
        onDiscard={session.discard}
        onSave={(text) => void session.finish(text)}
        onSkip={() => void skip()}
      />
    )
  }

  if (session.isOpen && hideOpenBar) {
    return session.notice ? (
      <p role="status" data-testid="triage-sync-notice" className="text-xs text-amber-800">
        {session.notice}
      </p>
    ) : null
  }

  return <TriageSessionBar session={session} canStart={canStart} />
}
