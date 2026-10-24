import { useState } from 'react'
import {
  CLEAR_ALL_KNOWLEDGE_CONFIRMATION,
  type KnowledgeDeletionCounts,
} from '@post-anki/shared'

const COUNT_LABELS: Array<[keyof KnowledgeDeletionCounts, string]> = [
  ['knowledgeBits', 'knowledge pieces'],
  ['knowledgeSources', 'sources'],
  ['questionVariants', 'question variants'],
  ['reviews', 'reviews'],
  ['schedules', 'schedules'],
  ['variantAttempts', 'attempts'],
  ['feedback', 'feedback entries'],
  ['tagAssignments', 'tag assignments'],
  ['extractionGrades', 'extraction grades'],
  ['topicCardVariants', 'topic cards'],
  ['facts', 'facts'],
  ['triageSessions', 'triage sessions'],
]

export function ClearAllKnowledgeZone({
  onClear,
  onCleared,
}: {
  onClear: () => Promise<{ counts: KnowledgeDeletionCounts }>
  onCleared?: () => void | Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [counts, setCounts] = useState<KnowledgeDeletionCounts | null>(null)

  const matches = typed === CLEAR_ALL_KNOWLEDGE_CONFIRMATION

  function close() {
    setOpen(false)
    setTyped('')
    setFailed(false)
  }

  async function confirm() {
    if (!matches || busy) return

    setBusy(true)
    setFailed(false)

    try {
      const result = await onClear()

      setCounts(result.counts)
      close()
      await Promise.resolve(onCleared?.()).catch(() => undefined)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      data-testid="clear-all-knowledge-zone"
      className="mt-8 rounded-lg border border-red-200 p-4"
    >
      <h2 className="text-lg font-semibold tracking-tight text-red-700">Danger zone</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Permanently deletes every knowledge piece, every source and all review history. Subjects
        and settings are kept. This cannot be undone.
      </p>

      {counts ? (
        <div data-testid="clear-all-knowledge-result" role="status" className="mt-3 text-sm">
          <p className="font-medium">All knowledge cleared. Deleted:</p>
          <ul className="mt-1 list-disc pl-5 text-neutral-600">
            {COUNT_LABELS.filter(([key]) => counts[key] > 0).map(([key, label]) => (
              <li key={key}>
                {counts[key]} {label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {open ? (
        <div className="mt-3 space-y-2">
          <label htmlFor="clear-all-knowledge-input" className="block text-sm">
            Type <strong>{CLEAR_ALL_KNOWLEDGE_CONFIRMATION}</strong> to confirm.
          </label>
          <input
            id="clear-all-knowledge-input"
            data-testid="clear-all-knowledge-input"
            value={typed}
            disabled={busy}
            autoComplete="off"
            onChange={(event) => setTyped(event.target.value)}
            className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm"
          />
          {failed ? (
            <p role="alert" data-testid="clear-all-knowledge-error" className="text-sm text-red-600">
              Could not clear knowledge, nothing was confirmed deleted. Try again.
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="clear-all-knowledge-confirm"
              disabled={!matches || busy}
              onClick={() => void confirm()}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy ? 'Clearing...' : 'Permanently delete everything'}
            </button>
            <button
              type="button"
              data-testid="clear-all-knowledge-cancel"
              disabled={busy}
              onClick={close}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          data-testid="clear-all-knowledge-open"
          onClick={() => {
            setCounts(null)
            setOpen(true)
          }}
          className="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700"
        >
          Clear all knowledge
        </button>
      )}
    </section>
  )
}
