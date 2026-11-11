import { describe, expect, it } from 'vitest'

import { hasFencedCode, splitFencedCode } from './split-fenced-code'

describe('splitFencedCode', () => {
  it('should return a plain card as a single prose segment', () => {
    expect(hasFencedCode('plain')).toBe(false)
    expect(splitFencedCode('plain')).toEqual([{ kind: 'prose', text: 'plain' }])
  })

  it('should keep leading indentation and the language tag of a block', () => {
    expect(splitFencedCode('a\n```ts\n  x\n\ty\n```')).toEqual([
      { kind: 'prose', text: 'a\n' },
      { kind: 'code', language: 'ts', code: '  x\n\ty' },
    ])
  })

  it('should treat a block without a language as plain code', () => {
    expect(splitFencedCode('```\nq\n```')).toEqual([{ kind: 'code', language: null, code: 'q' }])
  })
})
