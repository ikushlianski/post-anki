import type { InboxKnowledgeBit } from '@post-anki/shared'

import { NoteForm } from './anki-review-note-editor'
import { KnowledgeBitChatPanel } from './knowledge-bit-chat-panel'
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from './knowledge-bit-review-classes'
import { ConfirmDelete } from '../curriculum/shape-controls'
import { useInboxRowExample } from './use-inbox-row-example'
import { useInboxRowNoteEdit } from './use-inbox-row-note-edit'

export function KnowledgeBitInboxRow({
  item,
  busy,
  error,
  onBackToTriage,
  onSendToChat,
  onDiscard,
  onChange,
}: {
  item: InboxKnowledgeBit
  busy: boolean
  error: string | null
  onBackToTriage: (id: string) => void
  onSendToChat: (id: string) => void
  onDiscard: (id: string) => void
  onChange: (id: string, change: Partial<Omit<InboxKnowledgeBit, 'id'>>) => void
}) {
  const example = useInboxRowExample(item, (change) => onChange(item.id, change))
  const noteEdit = useInboxRowNoteEdit(item, (change) => onChange(item.id, change))
  const locked = busy || example.busy || noteEdit.busy
  const message = error ?? example.error

  return (
    <li
      data-testid={`knowledge-bit-inbox-row-${item.id}`}
      className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {item.subjectName ?? 'No subject'} · {item.cardCount} {item.cardCount === 1 ? 'card' : 'cards'}
      </p>
      {noteEdit.editing && item.note ? (
        <NoteForm
          mode={item.note.mode}
          initial={item.note.text}
          error={noteEdit.error}
          disabled={noteEdit.busy}
          onSave={(text) => void noteEdit.save(text)}
          onCancel={noteEdit.cancel}
        />
      ) : (
        <p data-testid={`knowledge-bit-inbox-body-${item.id}`} className="text-sm font-medium text-neutral-800">
          {item.body}
        </p>
      )}
      {item.background ? (
        <p data-testid={`knowledge-bit-inbox-example-${item.id}`} className="text-sm text-neutral-500">
          {item.exampleAiGeneratedAt ? (
            <span className="mr-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600">
              AI
            </span>
          ) : null}
          {item.background}
        </p>
      ) : null}
      {message ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start gap-2">
        {item.note && !noteEdit.editing ? (
          <button
            type="button"
            data-testid={`knowledge-bit-inbox-edit-${item.id}`}
            disabled={locked}
            onClick={noteEdit.open}
            className={SECONDARY_BUTTON_CLASS}
          >
            Edit
          </button>
        ) : null}
        <button
          type="button"
          data-testid={`knowledge-bit-inbox-example-button-${item.id}`}
          disabled={locked}
          onClick={() => void example.generate()}
          className={SECONDARY_BUTTON_CLASS}
        >
          {item.exampleAiGeneratedAt ? 'New AI example' : 'AI example'}
        </button>
        {example.canUndo ? (
          <button
            type="button"
            data-testid={`knowledge-bit-inbox-example-undo-${item.id}`}
            disabled={locked}
            onClick={() => void example.undoExample()}
            className={SECONDARY_BUTTON_CLASS}
          >
            Undo example
          </button>
        ) : null}
        <button
          type="button"
          data-testid={`knowledge-bit-inbox-back-${item.id}`}
          disabled={locked}
          onClick={() => onBackToTriage(item.id)}
          className={PRIMARY_BUTTON_CLASS}
        >
          Back to triage
        </button>
        <button
          type="button"
          data-testid={`knowledge-bit-inbox-chat-${item.id}`}
          disabled={locked}
          onClick={() => onSendToChat(item.id)}
          className={SECONDARY_BUTTON_CLASS}
        >
          Send to Chat
        </button>
        <ConfirmDelete
          busy={locked}
          hydrated
          label="Discard"
          actionLabel="Discard"
          consequence="You can not review it later."
          testId={`knowledge-bit-inbox-discard-${item.id}`}
          onConfirm={() => onDiscard(item.id)}
        />
      </div>
      <KnowledgeBitChatPanel knowledgeBitId={item.id} />
    </li>
  )
}
