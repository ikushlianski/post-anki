import type {
  DiscardFromInboxResult,
  GenerateKnowledgeBitExampleResult,
  InboxKnowledgeBitList,
  KnowledgeBitExampleError,
  MoveToInboxResult,
  ReturnFromInboxResult,
} from '@post-anki/shared'

import { ApiError, request } from '../curriculum/api-client'

export type GenerateKnowledgeBitExampleOutcome =
  | { ok: true; data: GenerateKnowledgeBitExampleResult }
  | { ok: false; error: KnowledgeBitExampleError }

const EXAMPLE_ERRORS: readonly string[] = [
  'not_found',
  'blocked',
  'example_exists',
  'limit_reached',
  'generation_failed',
  'budget_exceeded',
]

export function moveKnowledgeBitToInbox(bitId: string): Promise<MoveToInboxResult> {
  return request<MoveToInboxResult>(`/knowledge-bits/${bitId}/inbox`, { method: 'POST' })
}

export function returnKnowledgeBitFromInbox(bitId: string): Promise<ReturnFromInboxResult> {
  return request<ReturnFromInboxResult>(`/knowledge-bits/${bitId}/inbox`, { method: 'DELETE' })
}

export function discardKnowledgeBitFromInbox(bitId: string): Promise<DiscardFromInboxResult> {
  return request<DiscardFromInboxResult>(`/knowledge-bits/${bitId}/inbox/discard`, {
    method: 'POST',
  })
}

export function listInboxKnowledgeBits(): Promise<InboxKnowledgeBitList> {
  return request<InboxKnowledgeBitList>('/knowledge-bits/inbox')
}

export async function generateKnowledgeBitExample(
  bitId: string,
  overwrite: boolean,
): Promise<GenerateKnowledgeBitExampleOutcome> {
  try {
    const data = await request<GenerateKnowledgeBitExampleResult>(
      `/knowledge-bits/${bitId}/example`,
      { method: 'POST', body: overwrite ? { overwrite: true } : {} },
    )

    return { ok: true, data }
  } catch (error) {
    const code = error instanceof ApiError ? error.code : undefined

    return {
      ok: false,
      error:
        code && EXAMPLE_ERRORS.includes(code)
          ? (code as KnowledgeBitExampleError)
          : 'generation_failed',
    }
  }
}
