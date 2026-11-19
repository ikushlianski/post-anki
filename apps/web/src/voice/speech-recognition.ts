export interface SpeechAlternativeLike {
  transcript: string
}

export interface SpeechResultLike {
  readonly length: number
  [index: number]: SpeechAlternativeLike
}

export interface SpeechResultEventLike {
  results: { readonly length: number; [index: number]: SpeechResultLike }
}

export interface SpeechErrorEventLike {
  error: string
}

export interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechResultEventLike) => void) | null
  onerror: ((event: SpeechErrorEventLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike

interface SpeechWindow {
  SpeechRecognition?: SpeechRecognitionCtor
  webkitSpeechRecognition?: SpeechRecognitionCtor
}

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') {
    return null
  }

  const speechWindow = window as unknown as SpeechWindow

  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
}

export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  )
}

export function dictationErrorMessage(code: string): string | null {
  if (code === 'no-speech' || code === 'aborted') {
    return null
  }

  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return 'Microphone access is off. Allow it in your browser settings to dictate.'
  }

  return "Voice input isn't available right now."
}
