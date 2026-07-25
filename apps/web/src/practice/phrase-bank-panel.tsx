import { queryOptions, useQuery } from '@tanstack/react-query'

import type { PhraseBankEntry, PhraseBankStatus } from '@post-anki/shared'

import { getPhraseBank } from './phrase-bank.api'

const STATUS_LABELS: Record<PhraseBankStatus, string> = {
  new: 'New',
  practicing: 'Practicing',
  struggling: 'Struggling',
  mastered: 'Mastered',
}

const STATUS_STYLES: Record<PhraseBankStatus, string> = {
  new: 'border-neutral-300 bg-neutral-50 text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400',
  practicing:
    'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300',
  struggling:
    'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  mastered:
    'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
}

export function phraseBankQuery(subjectId: string) {
  return queryOptions({
    queryKey: ['phrase-bank', subjectId] as const,
    queryFn: () => getPhraseBank({ data: subjectId }),
  })
}

export function PhraseBankPanel({ subjectId }: { subjectId: string }) {
  const { data, isLoading } = useQuery(phraseBankQuery(subjectId))

  if (isLoading) {
    return (
      <div
        data-testid="phrase-bank-panel"
        className="rounded-lg border border-neutral-200 p-4 text-sm text-neutral-500 dark:border-neutral-800"
      >
        Loading phrase bank…
      </div>
    )
  }

  const active = data?.active ?? []
  const mastered = data?.mastered ?? []

  return (
    <div
      data-testid="phrase-bank-panel"
      className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Phrase bank</h2>

      {active.length === 0 && mastered.length === 0 && (
        <p data-testid="phrase-bank-empty" className="mt-2 text-sm text-neutral-500">
          No tracked phrases yet — keep practicing.
        </p>
      )}

      {active.length > 0 && (
        <div className="mt-3" data-testid="phrase-bank-active">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Active</p>
          <ul className="mt-1 flex flex-col gap-1">
            {active.map((entry) => (
              <PhraseBankEntryRow key={entry.id} entry={entry} />
            ))}
          </ul>
        </div>
      )}

      {mastered.length > 0 && (
        <div className="mt-3" data-testid="phrase-bank-mastered">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Mastered</p>
          <ul className="mt-1 flex flex-col gap-1">
            {mastered.map((entry) => (
              <PhraseBankEntryRow key={entry.id} entry={entry} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function PhraseBankEntryRow({ entry }: { entry: PhraseBankEntry }) {
  return (
    <li
      data-testid={`phrase-bank-entry-${entry.id}`}
      className="flex items-center justify-between gap-2 text-sm"
    >
      <span>{entry.phraseText}</span>
      <span
        data-testid={`phrase-bank-entry-status-${entry.id}`}
        className={'rounded-full border px-2 py-0.5 text-xs ' + STATUS_STYLES[entry.status]}
      >
        {STATUS_LABELS[entry.status]}
      </span>
    </li>
  )
}
