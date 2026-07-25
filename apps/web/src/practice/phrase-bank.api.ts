import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import type { PhraseBankSummary } from '@post-anki/shared'

import { apiBaseUrl, authHeaders } from '../curriculum/api-client'

const subjectIdSchema = z.string().min(1)

async function fetchPhraseBank(subjectId: string): Promise<PhraseBankSummary> {
  const base = apiBaseUrl()

  if (!base) {
    throw new Error('API_BASE_URL is not configured')
  }

  const response = await fetch(`${base}/subjects/${subjectId}/phrase-bank`, {
    headers: authHeaders(),
  })

  if (!response.ok) {
    throw new Error(`api GET /subjects/${subjectId}/phrase-bank → ${response.status}`)
  }

  return (await response.json()) as PhraseBankSummary
}

export const getPhraseBank = createServerFn({ method: 'GET' })
  .inputValidator((subjectId: string) => subjectIdSchema.parse(subjectId))
  .handler(({ data }) => fetchPhraseBank(data))
