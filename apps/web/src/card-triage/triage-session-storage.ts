import { z } from 'zod'
import { triageDecisionSchema, type TriageDecision } from '@post-anki/shared'

const STORAGE_KEY = 'post-anki:open-triage-session'
const DECISIONS_KEY = 'post-anki:open-triage-session-decisions'

export function readOpenTriageSessionId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function saveOpenTriageSessionId(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // storage unavailable: the session still works until reload
  }
}

export function clearOpenTriageSessionId(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
    window.localStorage.removeItem(DECISIONS_KEY)
  } catch {
    // nothing to clear
  }
}

const storedDecisions = z.object({ sessionId: z.string(), decisions: z.array(triageDecisionSchema) })

export function readStoredTriageDecisions(sessionId: string): TriageDecision[] {
  try {
    const raw = window.localStorage.getItem(DECISIONS_KEY)
    const parsed = raw ? storedDecisions.safeParse(JSON.parse(raw)) : null

    return parsed?.success && parsed.data.sessionId === sessionId ? parsed.data.decisions : []
  } catch {
    return []
  }
}

export function saveStoredTriageDecisions(sessionId: string, decisions: TriageDecision[]): void {
  try {
    window.localStorage.setItem(DECISIONS_KEY, JSON.stringify({ sessionId, decisions }))
  } catch {
    // storage unavailable: earlier decisions are lost on reload
  }
}
