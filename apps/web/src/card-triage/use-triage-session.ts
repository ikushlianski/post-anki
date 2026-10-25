import { useEffect, useRef, useState } from 'react'
import type {
  KnowledgeBitRejectReason,
  TriageDecision,
  TriageDecisionResponse,
  TriageSessionResponse,
} from '@post-anki/shared'

import type { ReviewDecisions } from '../knowledge-bit/use-review-decisions'
import { finishTriageSession, listTriageDecisions, startTriageSession } from './card-triage.api'
import { toPutBody, toTriageDecision, type TriageDecisionDetails } from './triage-decision-detail'
import {
  clearOpenTriageSessionId,
  readOpenTriageSessionId,
  readStoredTriageDecisions,
  saveOpenTriageSessionId,
} from './triage-session-storage'
import { newStartKey } from './triage-start-key'
import { discardOnServer } from './triage-discard'
import { useSessionDecisions } from './use-session-decisions'
import { useTriageDecisionSync } from './use-triage-decision-sync'

export type TriageFinishPhase = 'idle' | 'writing' | 'saving' | 'result'

export function useTriageSession({
  decisions,
  subjectId,
  undecidedCount,
}: {
  decisions: ReviewDecisions
  subjectId?: string | null
  undecidedCount?: number
}) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [resumed, setResumed] = useState(false)
  const [phase, setPhase] = useState<TriageFinishPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TriageSessionResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [stale, setStale] = useState(false)
  const [earlierDecisions, setEarlierDecisions] = useState<TriageDecision[]>([])
  const [details, setDetails] = useState<TriageDecisionDetails>({})
  const [cards, setCards] = useState<Record<string, TriageDecisionResponse>>({})
  const baseline = useRef(new Set<string>())
  const startKey = useRef<string | null>(null)
  const skipFlush = useRef(false)
  const generation = useRef(0)
  const sync = useTriageDecisionSync(sessionId)
  const { markSynced } = sync
  const latestDecisions = useRef(decisions)

  latestDecisions.current = decisions

  useEffect(() => {
    const stored = readOpenTriageSessionId()

    if (stored) {
      baseline.current = new Set(Object.keys(latestDecisions.current))
      const earlier = readStoredTriageDecisions(stored)

      generation.current += 1

      setEarlierDecisions(earlier)
      setDetails(Object.fromEntries(earlier.map((decision) => [decision.bitId, decision])))
      markSynced(earlier.map((decision) => decision.bitId))
      setSessionId(stored)
      setResumed(true)
    }
  }, [markSynced])

  const { sessionDecisions, latestSessionDecisions } = useSessionDecisions({
    decisions,
    sessionId,
    details,
    earlierDecisions,
    baseline,
  })

  async function start() {
    if (sessionId || busy) {
      return
    }

    setBusy(true)
    setError(null)
    setResult(null)

    startKey.current ??= newStartKey()

    const outcome = await startTriageSession({
      data: { subjectId: subjectId ?? null, client: 'web', startKey: startKey.current },
    })

    setBusy(false)

    if (!outcome.ok) {
      setError("Couldn't start triage. Try again.")

      return
    }

    startKey.current = null
    baseline.current = new Set(Object.keys(latestDecisions.current))
    generation.current += 1
    sync.reset()
    saveOpenTriageSessionId(outcome.data.id)
    setResumed(false)
    setEarlierDecisions([])
    setDetails({})
    setSessionId(outcome.data.id)
  }

  async function loadCards(id: string) {
    const issuedIn = generation.current

    await sync.settle()

    try {
      const outcome = await listTriageDecisions({ data: { sessionId: id } })

      if (issuedIn === generation.current && outcome.ok) {
        setCards(Object.fromEntries(outcome.data.map((row) => [row.bitId, row])))
      }
    } catch {
      if (issuedIn === generation.current) {
        setCards({})
      }
    }
  }

  function openFinish() {
    if (sessionId && phase === 'idle') {
      setError(null)
      skipFlush.current = false
      setPhase('writing')
      void loadCards(sessionId)
    }
  }

  function recordDecision(
    bitId: string,
    verdict: TriageDecision['verdict'],
    detail: { note?: string; dwellMs?: number },
  ) {
    if (!sessionId) {
      return
    }

    const entry = { note: detail.note || null, dwellMs: detail.dwellMs }

    setDetails((prev) => ({ ...prev, [bitId]: entry }))
    void sync.send(bitId, toPutBody(toTriageDecision(bitId, verdict, entry)))
  }

  function recordUndo(bitId: string) {
    if (!sessionId || baseline.current.has(bitId)) {
      return
    }

    setDetails((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== bitId)))
    void sync.remove(bitId)
  }

  function editDecision(
    bitId: string,
    patch: { note?: string; reasonCode?: KnowledgeBitRejectReason | null },
  ) {
    if (!sessionId || phase !== 'writing') {
      return
    }

    skipFlush.current = false
    setDetails((prev) => ({ ...prev, [bitId]: { ...prev[bitId], ...patch } }))
    sync.unsync(bitId)
  }

  async function finish(feedbackText: string): Promise<boolean> {
    if (!sessionId || phase === 'saving') {
      return false
    }

    const issuedIn = generation.current

    setPhase('saving')
    setError(null)

    const flushed =
      skipFlush.current ||
      (await sync.flush(
        latestSessionDecisions.current.map((decision) => ({
          bitId: decision.bitId,
          body: toPutBody(decision, true),
        })),
      ))

    if (issuedIn !== generation.current) {
      return false
    }

    if (!flushed) {
      skipFlush.current = true
      setPhase('writing')
      setError("Some card notes couldn't be saved. Save again to finish anyway.")

      return false
    }

    const outcome = await finishTriageSession({
      data: {
        sessionId,
        feedbackText,
        decisions: latestSessionDecisions.current,
        ...(undecidedCount !== undefined ? { undecidedCount } : {}),
      },
    })

    if (issuedIn !== generation.current) {
      return false
    }

    if (!outcome.ok) {
      setStale(outcome.status === 404 || outcome.status === 409)
      setPhase('writing')
      setError("Couldn't save the feedback. Your text is kept; try again.")

      return false
    }

    clearOpenTriageSessionId()
    resetSessionState()
    setResult(outcome.data)
    setPhase('result')

    return true
  }

  function resetSessionState() {
    generation.current += 1
    sync.reset()
    setSessionId(null)
    setEarlierDecisions([])
    setDetails({})
    setCards({})
    setResumed(false)
  }

  function discard() {
    const id = sessionId

    clearOpenTriageSessionId()
    resetSessionState()
    setStale(false)
    setError(null)
    setPhase('idle')

    if (id) {
      discardOnServer(id, undecidedCount)
    }
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
    notice: sync.notice,
    decisions: sessionDecisions,
    cards,
    decidedCount: sessionDecisions.length,
    acceptedCount: accepted,
    rejectedCount: sessionDecisions.length - accepted,
    start,
    recordDecision,
    recordUndo,
    editDecision,
    openFinish,
    finish,
    discard,
    closeResult,
  }
}

export type TriageSession = ReturnType<typeof useTriageSession>
