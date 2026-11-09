// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_HIGHLIGHT_SHORTCUT,
  describeHighlightShortcut,
  matchesHighlightShortcut,
  parseHighlightShortcut,
  readHighlightShortcut,
  writeHighlightShortcut,
} from './highlight-shortcut'

const press = (overrides: Partial<Parameters<typeof matchesHighlightShortcut>[0]>) => ({
  key: 'd',
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...overrides,
})

describe('highlight shortcut', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('should default to Cmd+D on a Mac and Ctrl+D elsewhere', () => {
    expect(matchesHighlightShortcut(press({ metaKey: true }), DEFAULT_HIGHLIGHT_SHORTCUT, true)).toBe(true)
    expect(matchesHighlightShortcut(press({ ctrlKey: true }), DEFAULT_HIGHLIGHT_SHORTCUT, true)).toBe(false)
    expect(matchesHighlightShortcut(press({ ctrlKey: true }), DEFAULT_HIGHLIGHT_SHORTCUT, false)).toBe(true)
    expect(describeHighlightShortcut(DEFAULT_HIGHLIGHT_SHORTCUT, true)).toBe('Cmd+D')
    expect(describeHighlightShortcut(DEFAULT_HIGHLIGHT_SHORTCUT, false)).toBe('Ctrl+D')
  })

  it('should not fire when extra modifiers are held', () => {
    expect(matchesHighlightShortcut(press({ ctrlKey: true, shiftKey: true }), DEFAULT_HIGHLIGHT_SHORTCUT, false)).toBe(false)
  })

  it('should never accept a combo that could clash with submit', () => {
    expect(parseHighlightShortcut('enter')).toBeNull()
    expect(parseHighlightShortcut('shift+enter')).toBeNull()
    expect(parseHighlightShortcut('garbage')).toBeNull()
  })

  it('should fall back to the default when the stored value is unusable', () => {
    window.localStorage.setItem('post-anki:add-knowledge:highlight-shortcut', 'enter')

    expect(readHighlightShortcut()).toEqual(DEFAULT_HIGHLIGHT_SHORTCUT)
  })

  it('should keep a chosen shortcut on this device', () => {
    writeHighlightShortcut({ key: 'l', shift: true, alt: false })

    expect(readHighlightShortcut()).toEqual({ key: 'l', shift: true, alt: false })
  })
})
