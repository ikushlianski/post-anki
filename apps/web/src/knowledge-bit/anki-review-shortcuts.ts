import type { Shortcut } from '../shortcuts-help/shortcut'

export const ANKI_REVIEW_SHORTCUTS: readonly Shortcut[] = [
  { keys: 'Space / Enter', action: 'Show the answer' },
  { keys: '1 2 3 4', action: 'Grade: again, hard, good, easy' },
  { keys: 'Space / Enter', action: 'Grade good, once the answer is shown' },
  { keys: 'z', action: 'Undo the last grade' },
  { keys: 'e', action: 'Edit the card' },
  { keys: 'c', action: 'Chat about the card' },
  { keys: '-', action: 'Bury the card until tomorrow' },
  { keys: '@', action: 'Suspend the card' },
  { keys: '?', action: 'Show this help' },
  { keys: 'Esc', action: 'Close this help' },
]
