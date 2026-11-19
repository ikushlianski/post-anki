import { describe, expect, it } from 'vitest'

import { cleanTextForSpeech } from './speech-text'

describe('cleanTextForSpeech', () => {
  it('should read cloze answers without markers or hints', () => {
    expect(cleanTextForSpeech('The capital is {{c1::Paris::city}}.')).toBe('The capital is Paris.')
  })

  it('should drop markdown emphasis, headings, bullets and links but keep their words', () => {
    const text = '## Title\n- **bold** and _soft_\n- see [the docs](https://x.dev/a)'

    expect(cleanTextForSpeech(text)).toBe('Title. bold and soft. see the docs')
  })

  it('should skip code blocks and bare urls so they are not read out', () => {
    const text = 'Run this:\n```ts\nconst a = 1\n```\nThen visit https://example.com now'

    expect(cleanTextForSpeech(text)).toBe('Run this:. Then visit now')
  })

  it('should drop parenthesised hints', () => {
    expect(cleanTextForSpeech('Name the layer (hint: starts with T)')).toBe('Name the layer')
  })

  it('should return empty text when nothing speakable remains', () => {
    expect(cleanTextForSpeech('```\ncode\n```')).toBe('')
  })
})
