import type { NotionConnectionFailureReason, NotionRunResult } from '@post-anki/shared'

export const BLOCK_LIMIT = 500

export function failureReasonText(errorCode: string | null): string | null {
  if (!errorCode) return null

  if (errorCode === 'budget_check_unavailable') return "The AI spending limit could not be checked."

  if (errorCode === 'run_finish_failed') return 'The run finished but its result could not be saved.'

  if (errorCode === 'notion_unauthorized' || errorCode === 'notion_restricted_resource') {
    return 'Notion refused access. Check the token and that the page is shared with the integration.'
  }

  if (errorCode === 'notion_object_not_found') return 'Notion could not find the page. Check the link and that it is shared.'

  if (errorCode === 'notion_rate_limited') return 'Notion is limiting requests. Try again later.'

  if (errorCode.startsWith('notion_')) return 'Notion returned an error.'

  return 'Something went wrong while running.'
}

export function runNotes(result: Pick<NotionRunResult, 'truncated' | 'pendingAfterLimit'>): string[] {
  const notes: string[] = []

  if (result.truncated) notes.push(`Page was cut off at ${BLOCK_LIMIT} blocks, so later phrases were not read.`)

  if (result.pendingAfterLimit > 0) notes.push(`${result.pendingAfterLimit} more waiting.`)

  return notes
}

export function connectionFailureText(reason: NotionConnectionFailureReason | null): string {
  if (reason === 'not_connected') return 'No Notion token is set. Add one first.'

  if (reason === 'unreachable') return 'Notion could not be reached. Try again later.'

  return 'Notion did not accept the token. Check it and that the integration is added to your pages.'
}

export function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value)

    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}
