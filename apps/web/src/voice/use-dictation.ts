import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import {
  dictationErrorMessage,
  getSpeechRecognitionCtor,
  type SpeechRecognitionLike,
  type SpeechResultEventLike,
} from './speech-recognition'

const noopSubscribe = () => () => undefined

export function mergeDictation(base: string, transcript: string): string {
  const spoken = transcript.trim()

  if (spoken === '') {
    return base
  }

  return base.trim() === '' ? spoken : `${base.trimEnd()} ${spoken}`
}

function transcriptOf(event: SpeechResultEventLike): string {
  let text = ''

  for (let index = 0; index < event.results.length; index += 1) {
    text += event.results[index]?.[0]?.transcript ?? ''
  }

  return text
}

export function useDictation(draft: string, onDraftChange: (value: string) => void) {
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => getSpeechRecognitionCtor() !== null,
    () => false,
  )
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognition = useRef<SpeechRecognitionLike | null>(null)
  const base = useRef('')
  const emitted = useRef<string | null>(null)
  const onChange = useRef(onDraftChange)

  onChange.current = onDraftChange

  const cancel = useCallback(() => {
    const active = recognition.current

    recognition.current = null

    if (active) {
      active.onresult = null
      active.onerror = null
      active.onend = null
      active.abort()
    }

    emitted.current = null
    setListening(false)
  }, [])

  const stop = useCallback(() => recognition.current?.stop(), [])

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor()

    if (!Ctor || recognition.current) {
      return
    }

    const next = new Ctor()

    next.lang = typeof navigator === 'undefined' ? 'en-US' : navigator.language
    next.continuous = true
    next.interimResults = true
    base.current = draft
    next.onresult = (event) => {
      const merged = mergeDictation(base.current, transcriptOf(event))

      emitted.current = merged
      onChange.current(merged)
    }
    next.onerror = (event) => {
      setError(dictationErrorMessage(event.error))
    }
    next.onend = () => {
      recognition.current = null
      emitted.current = null
      setListening(false)
    }
    recognition.current = next
    setError(null)

    try {
      next.start()
      setListening(true)
    } catch {
      recognition.current = null
      setError("Voice input isn't available right now.")
    }
  }, [draft])

  useEffect(() => {
    if (recognition.current && emitted.current !== null && draft !== emitted.current) {
      cancel()
    }
  }, [draft, cancel])

  useEffect(() => cancel, [cancel])

  return { supported, listening, error, start, stop, cancel }
}
