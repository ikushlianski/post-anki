import type { MasteryBreakdownEntry } from '@post-anki/shared'

import { formatRetention, formatTimeToMastery } from './digest-format'

export interface MasteryBreakdownTableProps {
  entries: MasteryBreakdownEntry[]
}

export function MasteryBreakdownTable({ entries }: MasteryBreakdownTableProps) {
  if (entries.length === 0) {
    return (
      <p data-testid="mastery-breakdown-empty" className="text-sm text-neutral-500">
        No mastery data yet.
      </p>
    )
  }

  return (
    <div
      data-testid="mastery-breakdown-table"
      className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800"
    >
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-50 text-xs uppercase text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
          <tr>
            <th className="px-3 py-2">Area</th>
            <th className="px-3 py-2">Time to mastery</th>
            <th className="px-3 py-2">Retention</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.key} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="px-3 py-2 text-neutral-900 dark:text-neutral-100">{entry.key}</td>
              <td className="px-3 py-2 text-neutral-500">{formatTimeToMastery(entry.timeToMastery)}</td>
              <td className="px-3 py-2 text-neutral-500">{formatRetention(entry.retention)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
