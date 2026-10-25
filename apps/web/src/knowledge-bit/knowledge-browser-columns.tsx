import type { ReactNode } from 'react'
import { KnowledgeBrowserPhrasings } from './knowledge-browser-phrasings'
import { KnowledgeBrowserOriginCell } from './knowledge-browser-origin-cell'
import { BROWSER_ORIGIN_LABELS } from './knowledge-browser-filters'
import type { KnowledgeBitBrowserItem, KnowledgeBitBrowserOrigin } from '@post-anki/shared'

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
  addedAt: 'Date added',
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
    case 'phrasings':
      return <KnowledgeBrowserPhrasings phrasings={item.phrasings} />
    case 'source':
      return <KnowledgeBrowserOriginCell label={BROWSER_ORIGIN_LABELS[item.origin]} item={item} actions={sourceActions} />
    case 'sourceUrl':
      return item.sourceUrl ? (
        <a href={item.sourceUrl} target="_blank" rel="noreferrer" title={item.sourceUrl} className="text-blue-700 underline">
          {item.sourceUrl}
        </a>
      ) : (
        ''
      )
    case 'addedBy':
      return addedByLabel(item.origin)
    case 'addedAt':
      return formatAddedAt(item.addedAt)
    case 'answer':
      return <span title={item.answer}>{item.answer}</span>
  }
}
