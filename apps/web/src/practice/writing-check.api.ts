import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { submitWritingCheckInput, type WritingCheck } from '@post-anki/shared'

import { apiBaseUrl, authHeaders } from '../curriculum/api-client'

const subjectIdSchema = z.string().min(1)

const submitWritingCheckForSubject = submitWritingCheckInput.extend({
  subjectId: subjectIdSchema,
})

async function fetchWritingChecks(subjectId: string): Promise<WritingCheck[]> {
  const base = apiBaseUrl()

  if (!base) {
    throw new Error('API_BASE_URL is not configured')
  }

  const response = await fetch(`${base}/subjects/${subjectId}/writing-checks`, {
    headers: authHeaders(),
  })

  if (!response.ok) {
    throw new Error(`api GET /subjects/${subjectId}/writing-checks → ${response.status}`)
  }

  return (await response.json()) as WritingCheck[]
}

async function postWritingCheck(
  input: z.infer<typeof submitWritingCheckForSubject>,
): Promise<WritingCheck> {
  const { subjectId, ...body } = input
  const base = apiBaseUrl()

  if (!base) {
    throw new Error('API_BASE_URL is not configured')
  }

  const response = await fetch(`${base}/subjects/${subjectId}/writing-checks`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`api POST /subjects/${subjectId}/writing-checks → ${response.status}`)
  }

  return (await response.json()) as WritingCheck
}

export const getWritingChecks = createServerFn({ method: 'GET' })
  .inputValidator((subjectId: string) => subjectIdSchema.parse(subjectId))
  .handler(({ data }) => fetchWritingChecks(data))

export const submitWritingCheck = createServerFn({ method: 'POST' })
  .inputValidator((data: z.infer<typeof submitWritingCheckForSubject>) =>
    submitWritingCheckForSubject.parse(data),
  )
  .handler(({ data }) => postWritingCheck(data))
