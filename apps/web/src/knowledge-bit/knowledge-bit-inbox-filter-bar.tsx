import { SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'

type Props = {
  query: string
  subject: string
  subjects: string[]
  shown: number
  total: number
  active: boolean
  onQueryChange: (query: string) => void
  onSubjectChange: (subject: string) => void
  onClear: () => void
}

export function KnowledgeBitInboxFilterBar({
  query,
  subject,
  subjects,
  shown,
  total,
  active,
  onQueryChange,
  onSubjectChange,
  onClear,
}: Props) {
  return (
    <div data-testid="knowledge-bit-inbox-filter" className="mb-4 space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          aria-label="Search Inbox"
          data-testid="knowledge-bit-inbox-search"
          placeholder="Search Inbox"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          aria-label="Filter by subject"
          data-testid="knowledge-bit-inbox-subject"
          value={subject}
          onChange={(event) => onSubjectChange(event.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="">All subjects</option>
          {subjects.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p
          aria-live="polite"
          data-testid="knowledge-bit-inbox-count"
          className="text-xs text-neutral-500"
        >
          {shown} of {total}
        </p>
        {active ? (
          <button
            type="button"
            data-testid="knowledge-bit-inbox-clear-filters"
            onClick={onClear}
            className={SECONDARY_BUTTON_CLASS}
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  )
}
