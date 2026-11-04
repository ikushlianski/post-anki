// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { RejectedCardNote } from './rejected-card-note'

afterEach(cleanup)

describe('RejectedCardNote', () => {
  it('should show a short note in full without an expand control', () => {
    render(<RejectedCardNote id="a" note="Too vague" />)

    expect(screen.getByTestId('rejected-card-note-a').textContent).toBe('Too vague')
    expect(screen.queryByTestId('rejected-card-note-toggle-a')).toBeNull()
  })

  it('should truncate a long note, keep the full text in the title, and expand on request', async () => {
    const note = 'x'.repeat(300)

    render(<RejectedCardNote id="a" note={note} />)

    const el = screen.getByTestId('rejected-card-note-a')

    expect(el.getAttribute('title')).toBe(note)
    expect(el.textContent).not.toContain(note)

    await userEvent.click(screen.getByTestId('rejected-card-note-toggle-a'))

    expect(el.textContent).toContain(note)
  })
})
