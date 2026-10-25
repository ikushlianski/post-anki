import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  cardStyleNoteListResponse,
  cardStyleNoteSchema,
  discardTriageSessionInput,
  finishTriageSessionInput,
  listCardStyleNotesQuery,
  putTriageDecisionInput,
  startTriageSessionInput,
  triageDecisionListResponse,
  triageDecisionResponse,
  triageSessionResponse,
  updateCardStyleNoteInput,
  type CardStyleNote,
  type TriageDecisionResponse,
  type TriageSessionResponse,
} from '@post-anki/shared'

import { ApiError, request } from '../curriculum/api-client'

export type TriageOutcome<T> = { ok: true; data: T } | { ok: false; error: string; status?: number }

export interface TriageSubject {
  id: string
  name: string
}

async function run<T>(call: () => Promise<T>): Promise<TriageOutcome<T>> {
  try {
    return { ok: true, data: await call() }
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, error: err.code ?? 'unknown', status: err.status }
    }

    return { ok: false, error: err instanceof Error ? err.message : 'unknown' }
  }
}

export const startTriageSession = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => startTriageSessionInput.parse(data))
  .handler(({ data }) =>
    run(async () =>
      triageSessionResponse.parse(
        await request<unknown>('/triage-sessions', { method: 'POST', body: data }),
      ),
    ),
  )

const finishInput = finishTriageSessionInput.extend({ sessionId: z.string().min(1) })

export const finishTriageSession = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => finishInput.parse(data))
  .handler(({ data: { sessionId, ...body } }): Promise<TriageOutcome<TriageSessionResponse>> =>
    run(async () =>
      triageSessionResponse.parse(
        await request<unknown>(`/triage-sessions/${encodeURIComponent(sessionId)}/finish`, {
          method: 'POST',
          body,
        }),
      ),
    ),
  )

const discardInput = discardTriageSessionInput.extend({ sessionId: z.string().min(1) })

export const discardTriageSession = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => discardInput.parse(data))
  .handler(({ data: { sessionId, ...body } }): Promise<TriageOutcome<TriageSessionResponse>> =>
    run(async () =>
      triageSessionResponse.parse(
        await request<unknown>(`/triage-sessions/${encodeURIComponent(sessionId)}/discards`, {
          method: 'POST',
          body,
        }),
      ),
    ),
  )

const decisionTarget = z.object({ sessionId: z.string().min(1), bitId: z.string().min(1) })

function decisionPath({ sessionId, bitId }: { sessionId: string; bitId: string }) {
  return `/triage-sessions/${encodeURIComponent(sessionId)}/decisions/${encodeURIComponent(bitId)}`
}

export const putTriageDecision = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => decisionTarget.and(putTriageDecisionInput).parse(data))
  .handler(({ data }): Promise<TriageOutcome<TriageDecisionResponse>> => {
    const { sessionId, bitId, ...body } = data

    return run(async () =>
      triageDecisionResponse.parse(
        await request<unknown>(decisionPath({ sessionId, bitId }), { method: 'PUT', body }),
      ),
    )
  })

export const deleteTriageDecision = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => decisionTarget.parse(data))
  .handler(({ data }): Promise<TriageOutcome<TriageDecisionResponse>> =>
    run(async () =>
      triageDecisionResponse.parse(await request<unknown>(decisionPath(data), { method: 'DELETE' })),
    ),
  )

export const listTriageDecisions = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => z.object({ sessionId: z.string().min(1) }).parse(data))
  .handler(({ data }): Promise<TriageOutcome<TriageDecisionResponse[]>> =>
    run(async () => {
      const body = await request<unknown>(
        `/triage-sessions/${encodeURIComponent(data.sessionId)}/decisions`,
      )

      return triageDecisionListResponse.parse(body).decisions
    }),
  )

export const listCardStyleNotes = createServerFn({ method: 'GET' })
  .inputValidator((data: unknown) => listCardStyleNotesQuery.parse(data ?? {}))
  .handler(({ data }): Promise<TriageOutcome<CardStyleNote[]>> =>
    run(async () => {
      const params = data.subjectId ? `?subjectId=${encodeURIComponent(data.subjectId)}` : ''
      const body = await request<unknown>(`/card-style-notes${params}`)

      return cardStyleNoteListResponse.parse(body).notes
    }),
  )

const updateInput = z.object({ noteId: z.string().min(1) }).and(updateCardStyleNoteInput)

export const updateCardStyleNote = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => updateInput.parse(data))
  .handler(({ data }): Promise<TriageOutcome<CardStyleNote>> => {
    const { noteId, ...patch } = data

    return run(async () =>
      cardStyleNoteSchema.parse(
        await request<unknown>(`/card-style-notes/${encodeURIComponent(noteId)}`, {
          method: 'PATCH',
          body: patch,
        }),
      ),
    )
  })

export const listTriageSubjects = createServerFn({ method: 'GET' }).handler(
  (): Promise<TriageOutcome<TriageSubject[]>> =>
    run(async () => {
      const subjects = await request<TriageSubject[]>('/subjects')

      return subjects.map(({ id, name }) => ({ id, name }))
    }),
)
