import type { NotionIngestionSource, NotionRunResult } from '@post-anki/shared'

import { failureReasonText, runNotes } from './notion-failure-text'

export const FREQUENCY_LABELS = {
  manual: 'Manual only',
  daily: 'Daily',
  nightly: 'Nightly',
} as const

function counts(result: NotionRunResult): string {
  const parts = [`imported ${result.imported}`]

  if (result.skippedExisting > 0) parts.push(`skipped ${result.skippedExisting} already imported`)

  if (result.ignored > 0) parts.push(`ignored ${result.ignored} that are not phrases`)

  parts.push(`removed ${result.removed} from Notion`)

  return parts.join(', ')
}

function mainText(result: NotionRunResult): string {
  switch (result.status) {
    case 'ok':
      return `Done: ${counts(result)}.`
    case 'partial':
      return `Partly done: ${counts(result)}. ${result.removeFailed} could not be removed and stay on the page; blocks with nested content are never removed.`
    case 'failed':
      return 'The run failed. Try again later.'
    case 'skipped_budget':
      return "Skipped: today's AI spending limit is used up. Nothing was imported."
    case 'skipped_no_connection':
      return 'Skipped: Notion is not connected. Add a token in Admin settings.'
  }
}

const STATUS_LABELS: Record<NonNullable<NotionIngestionSource['lastRun']>['status'], string> = {
  running: 'Running',
  ok: 'Done',
  partial: 'Partly done',
  failed: 'Failed',
  skipped_budget: 'Skipped, AI limit used up',
  skipped_no_connection: 'Skipped, Notion not connected',
}

export function notionRunResultText(result: NotionRunResult): string {
  return [mainText(result), ...runNotes(result)].join(' ')
}

function whenText(finishedAt: string): string {
  const date = new Date(finishedAt)
  const day = date.toLocaleDateString('en-US', { dateStyle: 'medium' })
  const time = date.toLocaleTimeString('en-US', { timeStyle: 'short' })

  return `${day}, ${time}`.replace(/\u202f/g, ' ')
}

export function lastRunFailureText(lastRun: NotionIngestionSource['lastRun']): string | null {
  if (!lastRun || lastRun.status !== 'failed') return null

  return failureReasonText(lastRun.errorCode)
}

export function lastRunText(lastRun: NotionIngestionSource['lastRun']): string {
  if (!lastRun) return 'Never run'

  const when = lastRun.finishedAt ? `, ${whenText(lastRun.finishedAt)}` : ''

  return `Last run: ${STATUS_LABELS[lastRun.status]}${when}, imported ${lastRun.imported}, removed ${lastRun.removed}`
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`
}

export function nextRunText(nextRunAt: string | null, now: Date = new Date()): string | null {
  if (!nextRunAt) return null

  const minutes = Math.round((new Date(nextRunAt).getTime() - now.getTime()) / 60000)

  if (Number.isNaN(minutes)) return null

  if (minutes <= 0) return 'Next run due now'

  if (minutes < 60) return `Next run in ${plural(minutes, 'minute')}`

  if (minutes < 60 * 24) return `Next run in ${plural(Math.round(minutes / 60), 'hour')}`

  return `Next run in ${plural(Math.round(minutes / (60 * 24)), 'day')}`
}
