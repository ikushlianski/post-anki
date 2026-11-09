export const HIGHLIGHT_SHORTCUT_STORAGE_KEY = 'post-anki:add-knowledge:highlight-shortcut'

export interface HighlightShortcut {
  key: string
  shift: boolean
  alt: boolean
}

export interface ShortcutKeyEvent {
  key: string
  code?: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

export const DEFAULT_HIGHLIGHT_SHORTCUT: HighlightShortcut = { key: 'd', shift: false, alt: false }

export const HIGHLIGHT_SHORTCUT_CHOICES: HighlightShortcut[] = [
  DEFAULT_HIGHLIGHT_SHORTCUT,
  { key: 'h', shift: true, alt: false },
]

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }

  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
}

export function serializeHighlightShortcut(shortcut: HighlightShortcut): string {
  return `${shortcut.shift ? 'shift+' : ''}${shortcut.alt ? 'alt+' : ''}${shortcut.key}`
}

export function parseHighlightShortcut(raw: string | null): HighlightShortcut | null {
  const match = raw?.match(/^(shift\+)?(alt\+)?([a-z])$/)

  if (!match) {
    return null
  }

  return { key: match[3], shift: Boolean(match[1]), alt: Boolean(match[2]) }
}

export function describeHighlightShortcut(shortcut: HighlightShortcut, mac = isMacPlatform()): string {
  const parts = [mac ? 'Cmd' : 'Ctrl', ...(shortcut.shift ? ['Shift'] : []), ...(shortcut.alt ? ['Alt'] : []), shortcut.key.toUpperCase()]

  return parts.join('+')
}

export function matchesHighlightShortcut(event: ShortcutKeyEvent, shortcut: HighlightShortcut, mac = isMacPlatform()): boolean {
  const primary = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey

  if (!primary || event.shiftKey !== shortcut.shift || event.altKey !== shortcut.alt) {
    return false
  }

  return event.key.toLowerCase() === shortcut.key || event.code === `Key${shortcut.key.toUpperCase()}`
}

export function readHighlightShortcut(): HighlightShortcut {
  try {
    return parseHighlightShortcut(window.localStorage.getItem(HIGHLIGHT_SHORTCUT_STORAGE_KEY)) ?? DEFAULT_HIGHLIGHT_SHORTCUT
  } catch {
    return DEFAULT_HIGHLIGHT_SHORTCUT
  }
}

export function writeHighlightShortcut(shortcut: HighlightShortcut): void {
  try {
    if (serializeHighlightShortcut(shortcut) === serializeHighlightShortcut(DEFAULT_HIGHLIGHT_SHORTCUT)) {
      window.localStorage.removeItem(HIGHLIGHT_SHORTCUT_STORAGE_KEY)

      return
    }

    window.localStorage.setItem(HIGHLIGHT_SHORTCUT_STORAGE_KEY, serializeHighlightShortcut(shortcut))
  } catch {
    return
  }
}
