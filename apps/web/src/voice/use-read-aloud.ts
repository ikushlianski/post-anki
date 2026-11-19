import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { isSpeechSynthesisSupported } from './speech-recognition'
import { cleanTextForSpeech } from './speech-text'

export const READ_ALOUD_STORAGE_KEY = 'post-anki.read-replies-aloud'

const listeners = new Set<() => void>()

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(READ_ALOUD_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('storage', listener)

  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

function writeEnabled(value: boolean): void {
  try {
    window.localStorage.setItem(READ_ALOUD_STORAGE_KEY, String(value))
  } catch {
    return
  }

  listeners.forEach((listener) => listener())
}

export function useReadAloud() {
  const supported = useSyncExternalStore(subscribe, isSpeechSynthesisSupported, () => false)
  const enabled = useSyncExternalStore(subscribe, readEnabled, () => false)
  const [speaking, setSpeaking] = useState(false)
  const active = useRef<SpeechSynthesisUtterance | null>(null)

  const stop = useCallback(() => {
    if (!isSpeechSynthesisSupported()) {
      return
    }

    active.current = null
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [])

  const speak = useCallback(
    (text: string) => {
      const spoken = cleanTextForSpeech(text)

      if (!isSpeechSynthesisSupported() || spoken === '') {
        return
      }

      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(spoken)
      const finish = () => {
        if (active.current === utterance) {
          active.current = null
          setSpeaking(false)
        }
      }

      utterance.lang = navigator.language
      utterance.onend = finish
      utterance.onerror = finish
      active.current = utterance
      setSpeaking(true)
      window.speechSynthesis.speak(utterance)
    },
    [],
  )

  const setEnabled = useCallback(
    (value: boolean) => {
      writeEnabled(value)

      if (!value) {
        stop()
      }
    },
    [stop],
  )

  return { supported, enabled, setEnabled, speaking, speak, stop }
}

export function useReadAloudReplies(busy: boolean, lastReply: string | null) {
  const { supported, enabled, setEnabled, speaking, speak, stop } = useReadAloud()
  const wasBusy = useRef(false)
  const reply = useRef(lastReply)
  const enabledRef = useRef(enabled)

  reply.current = lastReply
  enabledRef.current = enabled

  useEffect(() => {
    if (busy) {
      stop()
    } else if (wasBusy.current && enabledRef.current && reply.current) {
      speak(reply.current)
    }

    wasBusy.current = busy
  }, [busy, speak, stop])

  useEffect(() => stop, [stop])

  return { supported, enabled, setEnabled, speaking, stop }
}
