import { useEffect, useState } from 'react'
import { normalizeBrowserSite, knowledgeBitBrowserOriginValues, knowledgeBitOverviewStateSchema } from '@post-anki/shared'
import type { KnowledgeBitBrowserFilters } from '@post-anki/shared'

import {
  applyFilterPatch,
  BROWSER_ADDED_BY_LABELS,
  BROWSER_ORIGIN_LABELS,
  BROWSER_STATE_LABELS,
  isDateRangeReversed,
} from './knowledge-browser-filters'
import { TEXT_FIELD_CLASS } from './knowledge-bit-review-classes'

export type BrowserFilterTarget =
  | 'phrasings'
  | 'answer'
  | 'source'
  | 'sourceUrl'
  | 'addedBy'
  | 'addedAt'
  | 'state'

export type BrowserFilterChangeMode = 'replace' | 'push'

export type BrowserFiltersChange = (
  next: KnowledgeBitBrowserFilters,
  mode: BrowserFilterChangeMode,
) => void

export const DATE_RANGE_MESSAGE = 'The From date is after the To date. No pieces are requested.'

const DEBOUNCE_MS = 250

function DebouncedText({
  value,
  label,
  testId,
  placeholder,
  onCommit,
}: {
  value: string
  label: string
  testId: string
  placeholder?: string
  onCommit: (value: string) => void
}) {
  const [local, setLocal] = useState(value)

  useEffect(() => setLocal(value), [value])

  useEffect(() => {
    if (local === value) {
      return
    }

    const timer = setTimeout(() => onCommit(local), DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [local])

  return (
    <input
      type="text"
      aria-label={label}
      data-testid={testId}
      value={local}
      maxLength={200}
      placeholder={placeholder}
      className={TEXT_FIELD_CLASS}
      onChange={(event) => setLocal(event.target.value)}
    />
  )
}

function CheckList<T extends string>({
  options,
  selected,
  testPrefix,
  onChange,
}: {
  options: readonly { value: T; label: string }[]
  selected: readonly T[]
  testPrefix: string
  onChange: (next: T[]) => void
}) {
  return (
    <ul className="flex flex-col gap-1">
      {options.map((option) => (
        <li key={option.value}>
          <label className="flex min-h-8 items-center gap-2">
            <input
              type="checkbox"
              data-testid={`${testPrefix}-${option.value}`}
              checked={selected.includes(option.value)}
              onChange={(event) =>
                onChange(
                  options
                    .map((item) => item.value)
                    .filter((value) =>
                      value === option.value ? event.target.checked : selected.includes(value),
                    ),
                )
              }
            />
            {option.label}
          </label>
        </li>
      ))}
    </ul>
  )
}

const ORIGIN_OPTIONS = knowledgeBitBrowserOriginValues.map((value) => ({
  value,
  label: BROWSER_ORIGIN_LABELS[value],
}))

const ADDED_BY_OPTIONS = (['you', 'ai'] as const).map((value) => ({
  value,
  label: BROWSER_ADDED_BY_LABELS[value],
}))

const STATE_OPTIONS = knowledgeBitOverviewStateSchema.options.map((value) => ({
  value,
  label: BROWSER_STATE_LABELS[value],
}))

const LINK_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'has', label: 'Has a link' },
  { value: 'none', label: 'No link' },
] as const

export function KnowledgeBrowserColumnFilter({
  column,
  filters,
  onChange,
}: {
  column: BrowserFilterTarget
  filters: KnowledgeBitBrowserFilters
  onChange: BrowserFiltersChange
}) {
  const change = (patch: Parameters<typeof applyFilterPatch>[1], mode: BrowserFilterChangeMode) =>
    onChange(applyFilterPatch(filters, patch), mode)

  switch (column) {
    case 'phrasings':
      return (
        <DebouncedText
          value={filters.question ?? ''}
          label="Question contains"
          testId="filter-question"
          placeholder="Question contains…"
          onCommit={(value) => change({ question: value }, 'replace')}
        />
      )
    case 'answer':
      return (
        <DebouncedText
          value={filters.answer ?? ''}
          label="Answer contains"
          testId="filter-answer"
          placeholder="Answer contains…"
          onCommit={(value) => change({ answer: value }, 'replace')}
        />
      )
    case 'source':
      return (
        <CheckList
          options={ORIGIN_OPTIONS}
          selected={filters.origins ?? []}
          testPrefix="filter-origin"
          onChange={(origins) => change({ origins }, 'push')}
        />
      )
    case 'addedBy':
      return (
        <CheckList
          options={ADDED_BY_OPTIONS}
          selected={filters.addedBy ?? []}
          testPrefix="filter-added-by"
          onChange={(addedBy) => change({ addedBy }, 'push')}
        />
      )
    case 'state':
      return (
        <CheckList
          options={STATE_OPTIONS}
          selected={filters.states ?? []}
          testPrefix="filter-state"
          onChange={(states) => change({ states }, 'push')}
        />
      )
    case 'sourceUrl':
      return (
        <div className="flex flex-col gap-2">
          <div role="radiogroup" aria-label="Source link" className="flex flex-wrap gap-3">
            {LINK_OPTIONS.map((option) => (
              <label key={option.value} className="flex min-h-8 items-center gap-1">
                <input
                  type="radio"
                  name="filter-link"
                  data-testid={`filter-link-${option.value || 'any'}`}
                  checked={(filters.link ?? '') === option.value}
                  onChange={() =>
                    change(
                      { link: option.value, ...(option.value === 'has' ? {} : { site: undefined }) },
                      'push',
                    )
                  }
                />
                {option.label}
              </label>
            ))}
          </div>
          <DebouncedText
            value={filters.site ?? ''}
            label="Website"
            testId="filter-site"
            placeholder="Website, e.g. wikipedia.org"
            onCommit={(value) => {
              const site = normalizeBrowserSite(value)

              change(site ? { site, link: 'has' } : { site: undefined }, 'replace')
            }}
          />
        </div>
      )
    case 'addedAt':
      return (
        <div className="flex flex-col gap-2">
          <label className="flex items-center justify-between gap-2">
            From
            <input
              type="date"
              data-testid="filter-from"
              value={filters.from ?? ''}
              className={`${TEXT_FIELD_CLASS} w-40`}
              onChange={(event) => change({ from: event.target.value }, 'push')}
            />
          </label>
          <label className="flex items-center justify-between gap-2">
            To
            <input
              type="date"
              data-testid="filter-to"
              value={filters.to ?? ''}
              className={`${TEXT_FIELD_CLASS} w-40`}
              onChange={(event) => change({ to: event.target.value }, 'push')}
            />
          </label>
          {isDateRangeReversed(filters) && (
            <p role="alert" data-testid="filter-date-reversed" className="text-xs text-red-700">
              {DATE_RANGE_MESSAGE}
            </p>
          )}
        </div>
      )
  }
}
