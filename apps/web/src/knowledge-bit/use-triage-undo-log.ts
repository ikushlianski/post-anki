import { useRef, useState } from 'react'

export type TriageUndoEntry =
  | { kind: 'decision'; bitId: string }
  | { kind: 'inbox'; bitId: string }
  | { kind: 'chat'; bitId: string }
  | { kind: 'example'; bitId: string; body: string; previous: string | null }

export function useTriageUndoLog({
  isLive,
  run,
}: {
  isLive: (entry: TriageUndoEntry) => boolean
  run: (entry: TriageUndoEntry) => Promise<boolean>
}) {
  const [entries, setEntries] = useState<TriageUndoEntry[]>([])
  const running = useRef(false)
  const liveEntries = entries.filter(isLive)

  function push(entry: TriageUndoEntry) {
    setEntries((prev) => [
      ...prev.filter((item) => !(item.kind === entry.kind && item.kind !== 'example' && item.bitId === entry.bitId)),
      entry,
    ])
  }

  async function undoLast() {
    const entry = liveEntries[liveEntries.length - 1]

    if (!entry || running.current) {
      return
    }

    running.current = true

    try {
      if (await run(entry)) {
        setEntries((prev) => prev.filter((item) => item !== entry))
      }
    } finally {
      running.current = false
    }
  }

  return { canUndo: liveEntries.length > 0, push, undoLast }
}
