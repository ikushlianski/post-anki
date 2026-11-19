import { useEffect } from 'react'

import { useDictation } from './use-dictation'
import { useReadAloudReplies } from './use-read-aloud'

const BUTTON_CLASS =
  'rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50'

export function ChatVoiceBar({
  draft,
  onDraftChange,
  busy,
  lastReply,
  disabled = false,
  testIdPrefix,
}: {
  draft: string
  onDraftChange: (value: string) => void
  busy: boolean
  lastReply: string | null
  disabled?: boolean
  testIdPrefix: string
}) {
  const dictation = useDictation(draft, onDraftChange)
  const readAloud = useReadAloudReplies(busy, lastReply)
  const { cancel } = dictation

  useEffect(() => {
    if (disabled) {
      cancel()
    }
  }, [disabled, cancel])

  if (!dictation.supported && !readAloud.supported) {
    return null
  }

  return (
    <div data-testid={`${testIdPrefix}-voice`} className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
      {dictation.supported ? (
        <button
          type="button"
          data-testid={`${testIdPrefix}-mic`}
          aria-pressed={dictation.listening}
          disabled={disabled}
          onClick={dictation.listening ? dictation.stop : dictation.start}
          className={BUTTON_CLASS}
        >
          {dictation.listening ? 'Stop dictating' : 'Dictate'}
        </button>
      ) : null}

      {readAloud.supported ? (
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            data-testid={`${testIdPrefix}-read-aloud`}
            checked={readAloud.enabled}
            onChange={(event) => readAloud.setEnabled(event.target.checked)}
          />
          Read replies aloud
        </label>
      ) : null}

      {readAloud.speaking ? (
        <button
          type="button"
          data-testid={`${testIdPrefix}-stop-speaking`}
          onClick={readAloud.stop}
          className={BUTTON_CLASS}
        >
          Stop reading
        </button>
      ) : null}

      {dictation.error ? (
        <span role="alert" data-testid={`${testIdPrefix}-voice-error`} className="text-red-700">
          {dictation.error}
        </span>
      ) : null}
    </div>
  )
}
