import type { ReactNode } from 'react'
import { KnowledgeBrowserPhrasings } from './knowledge-browser-phrasings'
import { KnowledgeBrowserOriginCell } from './knowledge-browser-origin-cell'
import { BROWSER_ORIGIN_LABELS } from './knowledge-browser-filters'
import type { KnowledgeBitBrowserItem, KnowledgeBitBrowserOrigin } from '@post-anki/shared'
import { safeHref } from '../shared/safe-href'

export type BrowserColumnId = 'phrasings' | 'answer' | 'source' | 'sourceUrl' | 'addedBy' | 'addedAt'

export const DEFAULT_BROWSER_COLUMNS: BrowserColumnId[] = [
  'phrasings',
  'answer',
  'source',
  'sourceUrl',
  'addedBy',
  'addedAt',
]

export const BROWSER_COLUMN_LABELS: Record<BrowserColumnId, string> = {
  phrasings: 'Question',
  answer: 'Answer',
  source: 'Source',
  sourceUrl: 'Source URL',
  addedBy: 'Added by',
  addedAt: 'Created',
}

function addedByLabel(origin: KnowledgeBitBrowserOrigin): string {
  return origin === 'ai_web' ? 'AI web search' : 'You'
}

export function formatAddedAt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatCreatedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function matchPercentOf(item: KnowledgeBitBrowserItem): number | null {
  return 'similarity' in item && typeof item.similarity === 'number'
    ? Math.round(item.similarity * 100)
    : null
}

function MatchPercent({ percent }: { percent: number }) {
  return (
    <span
      data-testid="knowledge-browser-match-percent"
      className="mr-2 shrink-0 rounded bg-neutral-100 px-1.5 text-xs font-medium text-neutral-700"
    >
      {percent}% match
    </span>
  )
}

export interface BrowserSourceCellActions {
  countFor: (sourceId: string) => number
  onDeleteSource: (sourceId: string) => void
}

export function renderBrowserCell(
  columnId: BrowserColumnId,
  item: KnowledgeBitBrowserItem,
  sourceActions?: BrowserSourceCellActions,
): ReactNode {
  switch (columnId) {
    case 'phrasings': {
      const percent = matchPercentOf(item)

      if (percent === null) {
        return <KnowledgeBrowserPhrasings phrasings={item.phrasings} />
      }

      return (
        <span className="flex items-center">
          <MatchPercent percent={percent} />
          <span className="min-w-0 flex-1">
            <KnowledgeBrowserPhrasings phrasings={item.phrasings} />
          </span>
        </span>
      )
    }
    case 'source':
      return <KnowledgeBrowserOriginCell label={BROWSER_ORIGIN_LABELS[item.origin]} item={item} actions={sourceActions} />
    case 'sourceUrl':
      return safeHref(item.sourceUrl) ? (
        <a href={safeHref(item.sourceUrl)} target="_blank" rel="noreferrer" title={item.sourceUrl ?? undefined} className="text-blue-700 underline">
          {item.sourceUrl}
        </a>
      ) : (
        (item.sourceUrl ?? '')
      )
    case 'addedBy':
      return addedByLabel(item.origin)
    case 'addedAt':
      return formatCreatedAt(item.addedAt)
    case 'answer':
      return <span title={item.answer}>{item.answer}</span>
  }
}
