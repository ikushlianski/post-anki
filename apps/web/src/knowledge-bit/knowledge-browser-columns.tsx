import type { ReactNode } from 'react'
import { KnowledgeBrowserPhrasings } from './knowledge-browser-phrasings'
import type { KnowledgeBitBrowserItem, KnowledgeBitBrowserOrigin } from '@post-anki/shared'

export type BrowserColumnId = 'phrasings' | 'addedBy' | 'addedAt' | 'answer'

export const DEFAULT_BROWSER_COLUMNS: BrowserColumnId[] = ['phrasings', 'addedBy', 'addedAt', 'answer']

export const BROWSER_COLUMN_LABELS: Record<BrowserColumnId, string> = {
  phrasings: 'Phrasings',
  addedBy: 'Added by',
  addedAt: 'Date added',
  answer: 'Answer',
}

const ORIGIN_LABELS: Record<KnowledgeBitBrowserOrigin, string> = {
  manual: 'You (typed in)',
  ai_web: 'AI web search',
  pasted: 'Extracted from pasted text',
  notion: 'Extracted from Notion',
  article: 'Extracted from article',
}

export function formatAddedAt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function renderBrowserCell(columnId: BrowserColumnId, item: KnowledgeBitBrowserItem): ReactNode {
  switch (columnId) {
    case 'phrasings':
      return <KnowledgeBrowserPhrasings phrasings={item.phrasings} />
    case 'addedBy':
      return ORIGIN_LABELS[item.origin]
    case 'addedAt':
      return formatAddedAt(item.addedAt)
    case 'answer':
      return <span className="whitespace-pre-wrap">{item.answer}</span>
  }
}
