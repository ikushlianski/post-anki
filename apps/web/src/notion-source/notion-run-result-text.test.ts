import { describe, expect, it } from 'vitest'

import type { NotionRunResult } from '@post-anki/shared'

import { connectionFailureText, failureReasonText, safeHttpUrl } from './notion-failure-text'
import { lastRunFailureText, lastRunText, nextRunText, notionRunResultText } from './notion-run-result-text'

const base: NotionRunResult = {
  status: 'ok',
  read: 5,
  imported: 3,
  skippedExisting: 2,
  ignored: 0,
  removed: 0,
  removeFailed: 0,
  truncated: false,
  pendingAfterLimit: 0,
}

describe('notionRunResultText', () => {
  it('should tell the learner how many items were imported, skipped and removed', () => {
    expect(notionRunResultText(base)).toBe(
      'Done: imported 3, skipped 2 already imported, removed 0 from Notion.',
    )
  })

  it('should say nested blocks stay on the page when a removal failed', () => {
    const text = notionRunResultText({ ...base, status: 'partial', removed: 1, removeFailed: 2 })

    expect(text).toContain('Partly done')
    expect(text).toContain('2 could not be removed')
    expect(text).toContain('nested content are never removed')
  })

  it('should explain a budget skip and a missing connection in plain words', () => {
    expect(notionRunResultText({ ...base, status: 'skipped_budget' })).toContain('spending limit')
    expect(notionRunResultText({ ...base, status: 'skipped_no_connection' })).toContain('not connected')
  })
})

describe('lastRunText', () => {
  it('should say a source that never ran has never run', () => {
    expect(lastRunText(null)).toBe('Never run')
  })

  it('should show the status and counts of the last run', () => {
    const text = lastRunText({ status: 'skipped_budget', finishedAt: null, imported: 0, removed: 0, errorCode: null })

    expect(text).toBe('Last run: Skipped, AI limit used up, imported 0, removed 0')
  })
})

describe('nextRunText', () => {
  const now = new Date('2026-11-04T10:00:00.000Z')

  it('should tell the learner how long until the next scheduled run', () => {
    expect(nextRunText('2026-11-04T13:00:00.000Z', now)).toBe('Next run in 3 hours')
    expect(nextRunText('2026-11-04T10:01:00.000Z', now)).toBe('Next run in 1 minute')
    expect(nextRunText('2026-11-06T10:00:00.000Z', now)).toBe('Next run in 2 days')
  })

  it('should say a run is due when its time has passed and show nothing for manual sources', () => {
    expect(nextRunText('2026-11-04T09:00:00.000Z', now)).toBe('Next run due now')
    expect(nextRunText(null, now)).toBeNull()
  })
})

describe('last run date and wording', () => {
  it('should show the date as medium date, comma, short time after the status', () => {
    const text = lastRunText({
      status: 'ok',
      finishedAt: '2026-10-30T01:00:12.000Z',
      imported: 4,
      removed: 0,
      errorCode: null,
    })

    expect(text).toMatch(/^Last run: Done, [A-Z][a-z]{2} \d{1,2}, 2026, \d{1,2}:\d{2} (AM|PM), imported 4, removed 0$/)
  })
})

describe('failure and warning wording', () => {
  it('should explain a failed last run in plain words and stay silent for other statuses', () => {
    const failed = { status: 'failed', finishedAt: null, imported: 0, removed: 0, errorCode: 'notion_unauthorized' } as const

    expect(lastRunFailureText(failed)).toContain('Notion refused access')
    expect(lastRunFailureText({ ...failed, status: 'ok' })).toBeNull()
    expect(failureReasonText('run_failed')).toBe('Something went wrong while running.')
  })

  it('should warn when the page was cut off and say how many phrases are still waiting', () => {
    const text = notionRunResultText({ ...base, truncated: true, pendingAfterLimit: 7 })

    expect(text).toContain('Page was cut off at 500 blocks')
    expect(text).toContain('7 more waiting.')
  })

  it('should tell a bad token from an unreachable Notion', () => {
    expect(connectionFailureText('invalid_token')).toContain('did not accept the token')
    expect(connectionFailureText('unreachable')).toContain('could not be reached')
    expect(connectionFailureText('not_connected')).toContain('No Notion token')
  })

  it('should only treat http and https addresses as links', () => {
    expect(safeHttpUrl('https://www.notion.so/a')).toBe('https://www.notion.so/a')
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpUrl('not a url')).toBeNull()
  })
})
