import { StyleNotesList } from './style-notes-list'

export function StyleNotesPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Card style notes</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Short preferences learned from your triage feedback. Switched-off notes are not used when
          cards are written.
        </p>
      </header>

      <StyleNotesList />
    </main>
  )
}
