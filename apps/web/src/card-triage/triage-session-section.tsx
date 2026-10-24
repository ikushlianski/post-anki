import { useTriageSessionKeys } from './triage-session-keyboard'
import { TriageFeedbackPanel, TriageResultPanel } from './triage-feedback-panel'
import { TriageSessionBar } from './triage-session-bar'
import type { TriageSession } from './use-triage-session'

export function TriageSessionSection({ session }: { session: TriageSession }) {
  useTriageSessionKeys({
    onStart: () => void session.start(),
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

  return <TriageSessionBar session={session} />
}
