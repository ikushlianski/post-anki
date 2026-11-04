import { useState } from 'react'

import { ShortcutsHelp } from '../shortcuts-help/shortcuts-help'
import { ANKI_REVIEW_SHORTCUTS } from './anki-review-shortcuts'

export function AnkiReviewShortcutsHelp() {
  const [open, setOpen] = useState(false)

  return (
    <ShortcutsHelp
      open={open}
      onOpenChange={setOpen}
      shortcuts={ANKI_REVIEW_SHORTCUTS}
      testId="anki-review-shortcuts-dialog"
    />
  )
}
