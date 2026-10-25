import {
  isBrowserDateRangeReversed,
  parseKnowledgeBitBrowserFilters,
} from '@post-anki/shared'
import type {
  KnowledgeBitBrowserFilters,
  KnowledgeBitBrowserOrigin,
  KnowledgeBitOverviewState,
} from '@post-anki/shared'

export type BrowserFilterColumnId =
  | 'phrasings'
  | 'answer'
  | 'source'
  | 'sourceUrl'
  | 'addedBy'
  | 'addedAt'

export type BrowserSearch = {
  subject?: string
  view?: 'subjects'
  question?: string
  answer?: string
  origins?: string
  addedBy?: string
  link?: 'has' | 'none'
  site?: string
  from?: string
  to?: string
  states?: string
}

export const BROWSER_ORIGIN_LABELS: Record<KnowledgeBitBrowserOrigin, string> = {
  manual: 'Typed in',
  pasted: 'Pasted text',
  article: 'Article',
  notion: 'Notion',
  ai_web: 'AI web search',
}

export const BROWSER_ADDED_BY_LABELS = { you: 'You', ai: 'AI web search' } as const

export const BROWSER_STATE_LABELS: Record<KnowledgeBitOverviewState, string> = {
  new: 'New',
  learning: 'Learning',
  review: 'Review',
  relearning: 'Relearning',
  suspended: 'Suspended',
  buried: 'Buried',
}

export interface BrowserFilterChip {
  key: string
  label: string
  clears: (keyof KnowledgeBitBrowserFilters)[]
}

const FILTER_KEYS: (keyof KnowledgeBitBrowserFilters)[] = [
  'question',
  'answer',
  'origins',
  'addedBy',
  'link',
  'site',
  'from',
  'to',
  'states',
]

function rawFromAny(raw: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      typeof value === 'number' || typeof value === 'boolean' ? String(value) : value,
    ]),
  )
}

export function searchFromFilters(filters: KnowledgeBitBrowserFilters): BrowserSearch {
  return {
    ...(filters.question ? { question: filters.question } : {}),
    ...(filters.answer ? { answer: filters.answer } : {}),
    ...(filters.origins?.length ? { origins: filters.origins.join(',') } : {}),
    ...(filters.addedBy?.length ? { addedBy: filters.addedBy.join(',') } : {}),
    ...(filters.link ? { link: filters.link } : {}),
    ...(filters.site ? { site: filters.site } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    ...(filters.states?.length ? { states: filters.states.join(',') } : {}),
  }
}

export function filtersFromSearch(raw: Record<string, unknown>): KnowledgeBitBrowserFilters {
  return parseKnowledgeBitBrowserFilters(rawFromAny(raw))
}

export function parseBrowserSearch(raw: Record<string, unknown>): BrowserSearch {
  return {
    ...(typeof raw.subject === 'string' && raw.subject !== '' ? { subject: raw.subject } : {}),
    ...(raw.view === 'subjects' ? { view: 'subjects' as const } : {}),
    ...searchFromFilters(filtersFromSearch(raw)),
  }
}

export function applyFilterPatch(
  filters: KnowledgeBitBrowserFilters,
  patch: Partial<Record<keyof KnowledgeBitBrowserFilters, unknown>>,
): KnowledgeBitBrowserFilters {
  const merged: Record<string, unknown> = { ...filters }

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      delete merged[key]
    } else {
      merged[key] = value
    }
  }

  return filtersFromSearch(searchFromFilters(merged as KnowledgeBitBrowserFilters))
}

export function localDayBound(bound: string, edge: 'start' | 'end'): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bound)

  if (!match) {
    return bound
  }

  const [, year, month, day] = match
  const date =
    edge === 'start'
      ? new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0)
      : new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999)

  return date.toISOString()
}

export function toApiFilters(filters: KnowledgeBitBrowserFilters): KnowledgeBitBrowserFilters {
  return {
    ...filters,
    ...(filters.from ? { from: localDayBound(filters.from, 'start') } : {}),
    ...(filters.to ? { to: localDayBound(filters.to, 'end') } : {}),
  }
}

export function isDateRangeReversed(filters: KnowledgeBitBrowserFilters): boolean {
  return isBrowserDateRangeReversed(filters)
}

function dateLabel(filters: KnowledgeBitBrowserFilters): string | null {
  if (filters.from && filters.to) return `Added ${filters.from} to ${filters.to}`
  if (filters.from) return `Added from ${filters.from}`
  if (filters.to) return `Added until ${filters.to}`

  return null
}

function linkLabel(filters: KnowledgeBitBrowserFilters): string | null {
  if (filters.site) return `Site: ${filters.site}`
  if (filters.link === 'has') return 'Has a link'
  if (filters.link === 'none') return 'No link'

  return null
}

export function buildFilterChips(filters: KnowledgeBitBrowserFilters): BrowserFilterChip[] {
  const chips: (BrowserFilterChip | null)[] = [
    filters.question
      ? { key: 'question', label: `Question: ${filters.question}`, clears: ['question'] }
      : null,
    filters.answer ? { key: 'answer', label: `Answer: ${filters.answer}`, clears: ['answer'] } : null,
    filters.origins?.length
      ? {
          key: 'origins',
          label: `Source: ${filters.origins.map((value) => BROWSER_ORIGIN_LABELS[value]).join(', ')}`,
          clears: ['origins'],
        }
      : null,
    filters.addedBy?.length
      ? {
          key: 'addedBy',
          label: `Added by: ${filters.addedBy.map((value) => BROWSER_ADDED_BY_LABELS[value]).join(', ')}`,
          clears: ['addedBy'],
        }
      : null,
    linkLabel(filters) ? { key: 'link', label: linkLabel(filters) ?? '', clears: ['link', 'site'] } : null,
    dateLabel(filters) ? { key: 'date', label: dateLabel(filters) ?? '', clears: ['from', 'to'] } : null,
    filters.states?.length
      ? {
          key: 'states',
          label: `Study state: ${filters.states.map((value) => BROWSER_STATE_LABELS[value]).join(', ')}`,
          clears: ['states'],
        }
      : null,
  ]

  return chips.filter((chip): chip is BrowserFilterChip => chip !== null)
}

export function removeChip(
  filters: KnowledgeBitBrowserFilters,
  chip: BrowserFilterChip,
): KnowledgeBitBrowserFilters {
  return applyFilterPatch(
    filters,
    Object.fromEntries(chip.clears.map((key) => [key, undefined])),
  )
}

export function countActiveFilters(filters: KnowledgeBitBrowserFilters): number {
  return buildFilterChips(filters).length
}

export function hasAnyFilter(filters: KnowledgeBitBrowserFilters): boolean {
  return FILTER_KEYS.some((key) => filters[key] !== undefined)
}

export function filteredColumns(filters: KnowledgeBitBrowserFilters): Set<BrowserFilterColumnId> {
  const columns = new Set<BrowserFilterColumnId>()

  if (filters.question) columns.add('phrasings')
  if (filters.answer) columns.add('answer')
  if (filters.origins?.length) columns.add('source')
  if (filters.addedBy?.length) columns.add('addedBy')
  if (filters.link || filters.site) columns.add('sourceUrl')
  if (filters.from || filters.to) columns.add('addedAt')

  return columns
}
