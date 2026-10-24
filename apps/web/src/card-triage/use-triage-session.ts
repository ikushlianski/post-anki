import { useEffect, useMemo, useRef, useState } from 'react'
import type { TriageDecision, TriageSessionResponse } from '@post-anki/shared'

import type { ReviewDecisions } from '../knowledge-bit/use-review-decisions'
import { finishTriageSession, startTriageSession } from './card-triage.api'
import {
  clearOpenTriageSessionId,
  readOpenTriageSessionId,
  readStoredTriageDecisions,
  saveOpenTriageSessionId,
  saveStoredTriageDecisions,
} from './triage-session-storage'

export type TriageFinishPhase = 'idle' | 'writing' | 'saving' | 'result'

export function useTriageSession({
  decisions,
  subjectId,
}: {
  decisions: ReviewDecisions
  subjectId?: string | null
}) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [resumed, setResumed] = useState(false)
  const [phase, setPhase] = useState<TriageFinishPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TriageSessionResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [stale, setStale] = useState(false)
  const [earlierDecisions, setEarlierDecisions] = useState<TriageDecision[]>([])
  const baseline = useRef(new Set<string>())
  const latestDecisions = useRef(decisions)

  latestDecisions.current = decisions

  useEffect(() => {
    const stored = readOpenTriageSessionId()

    if (stored) {
      baseline.current = new Set(Object.keys(latestDecisions.current))
      setEarlierDecisions(readStoredTriageDecisions(stored))
      setSessionId(stored)
      setResumed(true)
    }
  }, [])

  const sessionDecisions: TriageDecision[] = useMemo(() => {
    if (!sessionId) {
      return []
    }

    const current = Object.entries(decisions)
      .filter(([bitId]) => !baseline.current.has(bitId))
      .map(([bitId, decision]) => ({ bitId, verdict: decision.verdict }))
    const currentIds = new Set(current.map((decision) => decision.bitId))

    return [...earlierDecisions.filter((decision) => !currentIds.has(decision.bitId)), ...current]
  }, [decisions, sessionId, earlierDecisions])

  useEffect(() => {
    if (sessionId) {
      saveStoredTriageDecisions(sessionId, sessionDecisions)
    }
  }, [sessionId, sessionDecisions])

  async function start() {
    if (sessionId || busy) {
      return
    }

    setBusy(true)
    setError(null)
    setResult(null)

    const outcome = await startTriageSession({ data: { subjectId: subjectId ?? null } })

    setBusy(false)

    if (!outcome.ok) {
      setError("Couldn't start triage. Try again.")

      return
    }

    baseline.current = new Set(Object.keys(latestDecisions.current))
    saveOpenTriageSessionId(outcome.data.id)
    setResumed(false)
    setEarlierDecisions([])
    setSessionId(outcome.data.id)
  }

  function openFinish() {
    if (sessionId && phase === 'idle') {
      setError(null)
      setPhase('writing')
    }
  }

  async function finish(feedbackText: string): Promise<boolean> {
    if (!sessionId || phase === 'saving') {
      return false
    }

    setPhase('saving')
    setError(null)

    const outcome = await finishTriageSession({
      data: { sessionId, feedbackText, decisions: sessionDecisions },
    })

    if (!outcome.ok) {
      setStale(outcome.status === 404 || outcome.status === 409)
      setPhase('writing')
      setError("Couldn't save the feedback. Your text is kept; try again.")

      return false
    }

    clearOpenTriageSessionId()
    setSessionId(null)
    setEarlierDecisions([])
    setResumed(false)
    setResult(outcome.data)
    setPhase('result')

    return true
  }

  function discard() {
    clearOpenTriageSessionId()
    setSessionId(null)
    setEarlierDecisions([])
    setResumed(false)
    setStale(false)
    setError(null)
    setPhase('idle')
  }

  function closeResult() {
    setResult(null)
    setPhase('idle')
  }

  const accepted = sessionDecisions.filter((d) => d.verdict === 'approved').length

  return {
    isOpen: sessionId !== null,
    resumed,
    phase,
    error,
    result,
    busy,
    stale,
    decidedCount: sessionDecisions.length,
    acceptedCount: accepted,
    rejectedCount: sessionDecisions.length - accepted,
    start,
    openFinish,
    finish,
    discard,
    closeResult,
  }
}

export type TriageSession = ReturnType<typeof useTriageSession>
