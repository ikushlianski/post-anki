import { vi } from 'vitest'

import type { SpeechRecognitionLike, SpeechResultEventLike } from './speech-recognition'

export class FakeRecognition implements SpeechRecognitionLike {
  static instances: FakeRecognition[] = []

  lang = ''
  continuous = false
  interimResults = false
  onresult: SpeechRecognitionLike['onresult'] = null
  onerror: SpeechRecognitionLike['onerror'] = null
  onend: SpeechRecognitionLike['onend'] = null
  start = vi.fn()
  stop = vi.fn(() => this.onend?.())
  abort = vi.fn()

  constructor() {
    FakeRecognition.instances.push(this)
  }

  say(...phrases: string[]): void {
    const event: SpeechResultEventLike = {
      results: Object.assign(
        phrases.map((transcript) => Object.assign([{ transcript }], { length: 1 })),
        {},
      ),
    }

    this.onresult?.(event)
  }
}

export function installRecognition(): void {
  FakeRecognition.instances = []
  Object.defineProperty(window, 'SpeechRecognition', {
    configurable: true,
    value: FakeRecognition,
  })
}

export function removeRecognition(): void {
  Reflect.deleteProperty(window, 'SpeechRecognition')
  Reflect.deleteProperty(window, 'webkitSpeechRecognition')
}

export class FakeUtterance {
  lang = ''
  onend: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(readonly text: string) {}
}

export function installSynthesis() {
  const speechSynthesis = { speak: vi.fn(), cancel: vi.fn() }

  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: speechSynthesis })
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)

  return speechSynthesis
}

export function removeSynthesis(): void {
  Reflect.deleteProperty(window, 'speechSynthesis')
  vi.unstubAllGlobals()
}
