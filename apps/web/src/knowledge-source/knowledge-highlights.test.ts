import { describe, expect, it } from 'vitest'

import { mergeHighlights } from '@post-anki/shared'
import { addHighlight, highlightSegments, shiftHighlightsOnEdit, trimHighlights } from './knowledge-highlights'

describe('knowledge highlights', () => {
  it('should merge overlapping and adjacent ranges into one passage', () => {
    expect(mergeHighlights([{ start: 10, end: 14 }, { start: 0, end: 5 }, { start: 5, end: 8 }, { start: 12, end: 20 }])).toEqual([
      { start: 0, end: 8 },
      { start: 10, end: 20 },
    ])
  })

  it('should ignore an empty selection', () => {
    expect(addHighlight([], { start: 3, end: 3 }, 10)).toEqual([])
  })

  it('should keep at most 20 highlights', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => ({ start: i * 3, end: i * 3 + 1 }))

    expect(addHighlight(twenty, { start: 100, end: 102 }, 200)).toEqual(twenty)
    expect(addHighlight(twenty, { start: 0, end: 4 }, 200)).toHaveLength(19)
  })

  it('should move a highlight when text is typed before it', () => {
    expect(shiftHighlightsOnEdit('hello world', 'oh hello world', [{ start: 6, end: 11 }])).toEqual([{ start: 9, end: 14 }])
  })

  it('should keep a highlight when text is typed after it', () => {
    expect(shiftHighlightsOnEdit('hello world', 'hello world!', [{ start: 0, end: 5 }])).toEqual([{ start: 0, end: 5 }])
  })

  it('should keep a highlight and resize it when text inside it is edited', () => {
    expect(shiftHighlightsOnEdit('hello world', 'hello wXrld', [{ start: 6, end: 11 }])).toEqual([{ start: 6, end: 11 }])
    expect(shiftHighlightsOnEdit('hello world', 'hello wo-rld', [{ start: 6, end: 11 }])).toEqual([{ start: 6, end: 12 }])
    expect(shiftHighlightsOnEdit('hello world', 'hello wrld', [{ start: 6, end: 11 }])).toEqual([{ start: 6, end: 10 }])
  })

  it('should drop a highlight only when the edit covers all of it', () => {
    expect(shiftHighlightsOnEdit('hello world', 'hello there', [{ start: 6, end: 11 }])).toEqual([])
  })

  it('should not grow a highlight when text is typed right at its start or end', () => {
    expect(shiftHighlightsOnEdit('ab cd ef', 'ab Xcd ef', [{ start: 3, end: 5 }])).toEqual([{ start: 4, end: 6 }])
    expect(shiftHighlightsOnEdit('ab cd ef', 'ab cdX ef', [{ start: 3, end: 5 }])).toEqual([{ start: 3, end: 5 }])
  })

  it('should line highlights up with the trimmed text that is sent', () => {
    expect(trimHighlights('  abc def  ', [{ start: 2, end: 5 }, { start: 0, end: 1 }])).toEqual([{ start: 0, end: 3 }])
  })

  it('should split text into marked and plain parts for the mark layer', () => {
    expect(highlightSegments('abcdef', [{ start: 1, end: 3 }])).toEqual([
      { text: 'a', marked: false },
      { text: 'bc', marked: true },
      { text: 'def', marked: false },
    ])
  })
})
