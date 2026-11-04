import type { Shortcut } from '../shortcuts-help/shortcut'

export const FOCUS_SHORTCUTS: readonly Shortcut[] = [
  { keys: 'a / Enter', action: 'Accept the card' },
  { keys: '↑ / ↓ / ← / →', action: 'Choose a sentence when the card offers several' },
  { keys: 'r / x', action: 'Reject the card' },
  { keys: 'z', action: 'Undo the last decision' },
  { keys: 'c', action: 'Chat about this card' },
  { keys: 'i', action: 'Move the card to Inbox' },
  { keys: 'e', action: 'Show an example' },
  { keys: '/ or Ctrl+K', action: 'Search' },
  { keys: '?', action: 'Show this help' },
  { keys: 'Esc', action: 'Close this help' },
]
