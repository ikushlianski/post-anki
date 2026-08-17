import type { Note } from '@post-anki/shared'

export interface NotesSearchResultsProps {
  results: Note[]
  searched: boolean
}

export function NotesSearchResults({ results, searched }: NotesSearchResultsProps) {
  if (!searched) {
    return null
  }

  if (results.length === 0) {
    return (
      <p
        data-testid="notes-search-empty"
        className="mt-4 rounded-lg border border-dashed border-neutral-300 bg-white p-4 text-center text-sm text-neutral-500"
      >
        Nothing matched.
      </p>
    )
  }

  return (
    <ul data-testid="notes-search-results" className="mt-4 space-y-2">
      {results.map((note) => (
        <li
          key={note.id}
          data-testid="note-result"
          data-is-highlight={note.isHighlight}
          className={
            note.isHighlight
              ? 'rounded-lg border-l-4 border-amber-400 bg-amber-50 p-3 italic'
              : 'rounded-lg border border-neutral-200 bg-white p-3'
          }
        >
          <p className="text-xs text-neutral-400">
            {note.nodeType}
            {note.concern ? ` · ${note.concern}` : ''}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">
            {note.body}
          </p>
        </li>
      ))}
    </ul>
  )
}
