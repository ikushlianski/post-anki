import { SECONDARY_BUTTON_CLASS } from '../knowledge-bit/knowledge-bit-review-classes'
import type { ChatQueueFilter } from './chat-queue-filter'

type Props = {
  filter: ChatQueueFilter
  subjects: string[]
  shown: number
  total: number
  staleCount: number
  selecting: boolean
  onSelectStale: () => void
  exportSubjectId: string | null
  exporting: boolean
  exportError: string | null
  onExport: (subjectId: string) => void
  onChange: (filter: ChatQueueFilter) => void
}

export function ChatQueueFilterBar({
  filter,
  subjects,
  shown,
  total,
  staleCount,
  selecting,
  onSelectStale,
  exportSubjectId,
  exporting,
  exportError,
  onExport,
  onChange,
}: Props) {
  return (
    <div data-testid="chat-queue-filter" className="mb-4 space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          aria-label="Search cards"
          data-testid="chat-queue-search"
          placeholder="Search cards"
          value={filter.query}
          onChange={(event) => onChange({ ...filter, query: event.target.value })}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          aria-label="Filter by subject"
          data-testid="chat-queue-subject"
          value={filter.subject}
          onChange={(event) => onChange({ ...filter, subject: event.target.value })}
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
        <p data-testid="chat-queue-count" className="text-xs text-neutral-500">
          {shown} of {total}
        </p>
        <button
          type="button"
          data-testid="chat-queue-export"
          disabled={!exportSubjectId || exporting}
          title={exportSubjectId ? undefined : 'Pick a subject to export its conversations'}
          onClick={() => exportSubjectId && onExport(exportSubjectId)}
          className={SECONDARY_BUTTON_CLASS}
        >
          {exporting ? 'Exporting…' : 'Export Markdown'}
        </button>
      </div>
      {staleCount > 0 ? (
        <button
          type="button"
          data-testid="chat-queue-select-stale"
          disabled={selecting}
          onClick={onSelectStale}
          className={SECONDARY_BUTTON_CLASS}
        >
          Select {staleCount} waiting over 14 days
        </button>
      ) : null}
      {exportError ? (
        <p role="alert" data-testid="chat-queue-export-error" className="text-sm text-red-700">
          {exportError}
        </p>
      ) : null}
    </div>
  )
}
