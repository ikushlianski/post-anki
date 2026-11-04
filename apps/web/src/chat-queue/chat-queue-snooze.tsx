import { useState } from 'react'
import { CHAT_QUEUE_SNOOZE_OPTIONS_DAYS, type ChatQueueKnowledgeBit } from '@post-anki/shared'

import { snoozeChatQueueCard, unsnoozeChatQueueCard } from './chat-queue.api'
import { isSnoozed } from './is-snoozed'

interface ChatQueueSnoozeProps {
  item: ChatQueueKnowledgeBit
  onChanged: (id: string, snoozedUntil: string | null) => void
  now?: Date
}

function formatUntil(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function ChatQueueSnooze({ item, onChanged, now = new Date() }: ChatQueueSnoozeProps) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function run(call: () => ReturnType<typeof snoozeChatQueueCard>) {
    setBusy(true)
    setFailed(false)

    try {
      const outcome = await call()

      if (outcome.ok) {
        onChanged(item.id, outcome.data.snoozedUntil)
      } else {
        setFailed(true)
      }
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-1 flex items-center gap-3 px-1 text-xs text-neutral-500">
      {item.snoozedUntil && isSnoozed(item, now) ? (
        <>
          <span data-testid={`chat-queue-snoozed-${item.id}`}>
            Snoozed until {formatUntil(item.snoozedUntil)}
          </span>
          <button
            type="button"
            disabled={busy}
            data-testid={`chat-queue-unsnooze-${item.id}`}
            onClick={() => void run(() => unsnoozeChatQueueCard({ data: { bitId: item.id } }))}
            className="underline disabled:opacity-50"
          >
            Unsnooze
          </button>
        </>
      ) : (
        <select
          aria-label="Snooze reminders"
          data-testid={`chat-queue-snooze-${item.id}`}
          disabled={busy}
          value=""
          onChange={(event) => {
            const days = Number(event.target.value)

            if (days > 0) {
              void run(() => snoozeChatQueueCard({ data: { bitId: item.id, days } }))
            }
          }}
          className="rounded border border-neutral-200 bg-transparent px-1 py-0.5"
        >
          <option value="">Snooze…</option>
          {CHAT_QUEUE_SNOOZE_OPTIONS_DAYS.map((days) => (
            <option key={days} value={days}>
              {days === 1 ? '1 day' : `${days} days`}
            </option>
          ))}
        </select>
      )}
      {failed ? (
        <span role="alert" className="text-red-700">
          Could not update. Try again.
        </span>
      ) : null}
    </div>
  )
}
