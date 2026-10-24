import { describe, expect, it } from 'vitest'

import { shortenExcerpt } from './shorten-excerpt'

describe('shortenExcerpt', () => {
  it('should leave a text that already fits untouched', () => {
    expect(shortenExcerpt('  Короткий текст.  ', 100)).toEqual({ text: 'Короткий текст.', shortened: false })
  })

  it('should keep whole paragraphs and drop the ones that do not fit', () => {
    const result = shortenExcerpt('Первый абзац.\n\nВторой абзац.\n\nТретий абзац, который уже не влезает.', 32)

    expect(result).toEqual({ text: 'Первый абзац.\n\nВторой абзац.', shortened: true })
  })

  it('should cut a single oversize paragraph at a word boundary, never mid-word', () => {
    const result = shortenExcerpt('слово '.repeat(50).trim(), 23)

    expect(result.shortened).toBe(true)
    expect(result.text.length).toBeLessThanOrEqual(23)
    expect(result.text.split(' ').every((word) => word === 'слово')).toBe(true)
  })

  it('should cut an unbroken string at the limit when there is no space to cut at', () => {
    expect(shortenExcerpt('а'.repeat(40), 10)).toEqual({ text: 'а'.repeat(10), shortened: true })
  })
})
