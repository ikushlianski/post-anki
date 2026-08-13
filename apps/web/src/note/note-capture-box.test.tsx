// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { CaptureNoteInput, NoteNodeType } from '@post-anki/shared'

import { NoteCaptureBox } from './note-capture-box'

afterEach(cleanup)

function renderBox(
  nodeType: NoteNodeType,
  onCapture: (input: CaptureNoteInput) => ReturnType<typeof Promise.resolve>,
  onCaptured = vi.fn(),
) {
  render(
    <NoteCaptureBox
      nodeType={nodeType}
      nodeId="node-1"
      onCapture={onCapture as never}
      onCaptured={onCaptured}
    />,
  )

  return { onCaptured }
}

function typeBody(text: string) {
  fireEvent.change(screen.getByTestId('note-capture-body'), {
    target: { value: text },
  })
}

describe('NoteCaptureBox', () => {
  it.each<NoteNodeType>(['topic', 'gap', 'source'])(
    'should capture a note for a %s node',
    async (nodeType) => {
      const onCapture = vi.fn().mockResolvedValue({ ok: true, data: { id: 'n1' } })
      const { onCaptured } = renderBox(nodeType, onCapture)

      typeBody('idempotency finally clicked')
      fireEvent.click(screen.getByTestId('note-capture-submit'))

      await waitFor(() => expect(onCaptured).toHaveBeenCalled())
      expect(onCapture).toHaveBeenCalledWith({
        nodeType,
        nodeId: 'node-1',
        body: 'idempotency finally clicked',
        isHighlight: false,
        concern: null,
      })
    },
  )

  it('should send isHighlight true once the highlight toggle is active', async () => {
    const onCapture = vi.fn().mockResolvedValue({ ok: true, data: { id: 'n1' } })
    renderBox('source', onCapture)

    fireEvent.click(screen.getByTestId('note-capture-highlight-toggle'))
    typeBody('a quoted passage')
    fireEvent.click(screen.getByTestId('note-capture-submit'))

    await waitFor(() => expect(onCapture).toHaveBeenCalled())
    expect(onCapture.mock.calls[0][0].isHighlight).toBe(true)
  })

  it('should send the selected concern tag', async () => {
    const onCapture = vi.fn().mockResolvedValue({ ok: true, data: { id: 'n1' } })
    renderBox('topic', onCapture)

    typeBody('watch for injection here')
    fireEvent.change(screen.getByTestId('note-capture-concern'), {
      target: { value: 'security' },
    })
    fireEvent.click(screen.getByTestId('note-capture-submit'))

    await waitFor(() => expect(onCapture).toHaveBeenCalled())
    expect(onCapture.mock.calls[0][0].concern).toBe('security')
  })

  it('should keep the submit button disabled without body text', () => {
    renderBox('topic', vi.fn())

    expect(
      screen.getByTestId<HTMLButtonElement>('note-capture-submit').disabled,
    ).toBe(true)
  })

  it('should show the API rejection reason and not clear the form on failure', async () => {
    const onCapture = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      code: 'not_found',
      message: null,
    })
    const { onCaptured } = renderBox('gap', onCapture)

    typeBody('a note for a gap that vanished')
    fireEvent.click(screen.getByTestId('note-capture-submit'))

    const alert = await screen.findByTestId('note-capture-error')

    expect(alert.textContent).toContain('could not be found')
    expect(onCaptured).not.toHaveBeenCalled()
    expect(screen.getByTestId<HTMLTextAreaElement>('note-capture-body').value).toBe(
      'a note for a gap that vanished',
    )
  })
})
