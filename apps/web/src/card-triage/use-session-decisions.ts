import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import type { TriageDecision } from '@post-anki/shared'

import type { ReviewDecisions } from '../knowledge-bit/use-review-decisions'
import { toTriageDecision, type TriageDecisionDetails } from './triage-decision-detail'
import { saveStoredTriageDecisions } from './triage-session-storage'

export function useSessionDecisions({
  decisions,
  sessionId,
  details,
  earlierDecisions,
  baseline,
}: {
  decisions: ReviewDecisions
  sessionId: string | null
  details: TriageDecisionDetails
  earlierDecisions: TriageDecision[]
  baseline: MutableRefObject<Set<string>>
}) {
  const sessionDecisions: TriageDecision[] = useMemo(() => {
    if (!sessionId) {
      return []
    }

    const current = Object.entries(decisions)
      .filter(([bitId]) => !baseline.current.has(bitId))
      .map(([bitId, decision]) => toTriageDecision(bitId, decision.verdict, details[bitId]))
    const currentIds = new Set(current.map((decision) => decision.bitId))
    const earlier = earlierDecisions
      .filter((decision) => !currentIds.has(decision.bitId))
      .map((decision) =>
        toTriageDecision(decision.bitId, decision.verdict, details[decision.bitId] ?? decision),
      )

    return [...earlier, ...current]
  }, [decisions, sessionId, earlierDecisions, details, baseline])

  const latestSessionDecisions = useRef(sessionDecisions)

  latestSessionDecisions.current = sessionDecisions

  useEffect(() => {
    if (sessionId) {
      saveStoredTriageDecisions(sessionId, sessionDecisions)
    }
  }, [sessionId, sessionDecisions])

  return { sessionDecisions, latestSessionDecisions }
}
