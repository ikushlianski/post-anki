// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { KnowledgeOverviewDeleteDialog } from '../knowledge-bit/knowledge-overview-delete-dialog'
import { KnowledgeOverviewMoveDialog } from '../knowledge-bit/knowledge-overview-move-dialog'

function Host({ kind }: { kind: 'delete' | 'move' }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        opener
      </button>
      {open && kind === 'delete' ? (
        <KnowledgeOverviewDeleteDialog count={2} busy={false} error={null} onConfirm={close} onCancel={close} />
      ) : null}
      {open && kind === 'move' ? (
        <KnowledgeOverviewMoveDialog count={2} subjectOptions={[]} busy={false} error={null} onConfirm={close} onCancel={close} />
      ) : null}
    </>
  )
}

afterEach(cleanup)

describe('useRestoreFocus', () => {
  it('should return focus to the opener after the Delete dialog is cancelled', () => {
    render(<Host kind="delete" />)

    const opener = screen.getByRole('button', { name: 'opener' })

    opener.focus()
    fireEvent.click(opener)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(document.activeElement).toBe(opener)
  })

  it('should return focus to the opener after the Move dialog is cancelled', () => {
    render(<Host kind="move" />)

    const opener = screen.getByRole('button', { name: 'opener' })

    opener.focus()
    fireEvent.click(opener)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(document.activeElement).toBe(opener)
  })
})
