import { useStyleNotes } from './use-style-notes'
import { StyleNoteRow } from './style-note-row'

export function StyleNotesList() {
  const { notes, subjects, update } = useStyleNotes()
  const savingId = update.isPending ? update.variables.noteId : null
  const errorId = update.isError ? update.variables.noteId : null

  if (notes.isPending) {
    return <p className="text-sm text-neutral-600">Loading style notes…</p>
  }

  if (notes.isError) {
    return (
      <p role="alert" className="text-sm text-red-700">
        Couldn't load style notes. Reload to try again.
      </p>
    )
  }

  if (notes.data.length === 0) {
    return (
      <p data-testid="style-notes-empty" className="text-sm text-neutral-600">
        No style notes yet. Finish a triage session with feedback to create some.
      </p>
    )
  }

  return (
    <ul data-testid="style-notes-list" className="space-y-3">
      {notes.data.map((note) => (
        <StyleNoteRow
          key={`${note.id}:${note.text}`}
          note={note}
          subjects={subjects.data ?? []}
          saving={savingId === note.id}
          error={errorId === note.id}
          onChange={(patch) => update.mutate({ noteId: note.id, ...patch })}
        />
      ))}
    </ul>
  )
}
