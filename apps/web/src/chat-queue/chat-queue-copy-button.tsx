import { useEffect, useRef, useState } from 'react'

import { TEXT_BUTTON_CLASS } from '../knowledge-bit/knowledge-bit-review-classes'
import { copyText } from './chat-queue-copy'

const COPIED_MS = 2000

type CopyState = 'idle' | 'copied' | 'failed'

export function ChatQueueCopyButton({ text, seq }: { text: string; seq: string }) {
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current)
      }
    },
    [],
  )

  async function copy() {
    const copied = await copyText(text)

    if (timer.current) {
      clearTimeout(timer.current)
    }

    setState(copied ? 'copied' : 'failed')
    timer.current = setTimeout(() => setState('idle'), COPIED_MS)
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        data-testid={`chat-queue-copy-${seq}`}
        aria-label="Copy reply"
        onClick={() => void copy()}
        className={TEXT_BUTTON_CLASS}
      >
        {state === 'copied' ? 'Copied' : 'Copy'}
      </button>
      <span aria-live="polite" className="text-xs text-neutral-500">
        {state === 'failed' ? 'Copy failed' : ''}
      </span>
    </span>
  )
}
