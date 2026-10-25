import { Link } from '@tanstack/react-router'

import type { AddedNote } from './added-note-progress'

function noteStatusText(note: AddedNote): string {
  if (note.phase === 'queued') {
    return 'Queued. Waiting to start.'
  }

  if (note.phase === 'working') {
    return 'Working on it. Cards usually appear within a minute or two.'
  }

  if (note.phase === 'ready') {
    const count = note.cardCount ?? 0
    const cards = `${count} ${count === 1 ? 'card' : 'cards'}`
    const flagged = note.flaggedCount ?? 0
    const flaggedText = flagged > 0 ? ` ${flagged} of them need a manual check.` : ''

    return `Ready with ${cards}.${flaggedText}`
  }

  if (note.phase === 'attention') {
    return `Needs attention. ${note.reason ?? ''}`.trim()
  }

  return 'Still working. Check Knowledge triage for the result.'
}

export function AddedNoteProgressList({ notes }: { notes: AddedNote[] }) {
  if (notes.length === 0) {
    return null
  }

  return (
    <ul className="space-y-1 text-sm" data-testid="knowledge-added-notes">
      {notes.map((note) => {
        const tone = note.phase === 'attention' ? 'text-amber-800' : 'text-neutral-700'

        return (
          <li
            key={note.sourceId}
            data-testid={`knowledge-added-note-${note.sourceId}`}
            data-phase={note.phase}
            className={`flex flex-wrap items-baseline gap-x-2 ${tone}`}
          >
            <span className="font-medium">{note.label || 'Your note'}</span>
            <span data-testid={`knowledge-added-note-status-${note.sourceId}`}>{noteStatusText(note)}</span>
            {(note.phase === 'ready' || note.phase === 'attention') && (
              <Link
                to="/knowledge-bit-review"
                data-testid={`knowledge-added-note-link-${note.sourceId}`}
                className="underline"
              >
                Open Knowledge triage
              </Link>
            )}
          </li>
        )
      })}
    </ul>
  )
}
