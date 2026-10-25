import { discardTriageSession } from './card-triage.api'

export function discardOnServer(sessionId: string, undecidedCount?: number): void {
  void Promise.resolve()
    .then(() =>
      discardTriageSession({
        data: { sessionId, ...(undecidedCount !== undefined ? { undecidedCount } : {}) },
      }),
    )
    .catch(() => undefined)
}
