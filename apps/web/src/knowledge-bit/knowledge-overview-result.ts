import type { BulkDeleteKnowledgeBitsResponse } from '@post-anki/shared'
import { KNOWLEDGE_BIT_BULK_MAX_IDS } from '@post-anki/shared'

export const OVERVIEW_DELETE_FAILED_MESSAGE = 'Could not delete cards. Try again.'

export function describeOverviewDeleteResult(result: BulkDeleteKnowledgeBitsResponse): string {
  const count = result.deleted.length
  const noun = count === 1 ? 'card' : 'cards'
  let message = `Deleted ${count} ${noun}.`

  const gone = result.skipped.filter((entry) => entry.reason === 'not_found').length
  const kept = result.skipped.filter((entry) => entry.reason === 'not_approved').length

  if (gone > 0) {
    message += ` ${gone} already gone.`
  }

  if (kept > 0) {
    message += ` ${kept} not approved, so kept.`
  }

  return message
}

export function describeOverviewSelection(count: number, atCap: boolean): string {
  if (count === 0) {
    return 'No cards selected'
  }

  let message = `${count} selected`

  if (atCap) {
    message += `, limited to ${KNOWLEDGE_BIT_BULK_MAX_IDS}`
  }

  return message
}
