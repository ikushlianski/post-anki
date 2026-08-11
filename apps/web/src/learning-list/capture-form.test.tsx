// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { CaptureLearningListItemInput } from '@post-anki/shared'

import { CaptureForm } from './capture-form'

const SUBJECTS = [{ id: 'subject-1', name: 'Web Development' }]

afterEach(cleanup)

function renderForm(
  onCapture: (
    input: CaptureLearningListItemInput,
  ) => ReturnType<typeof Promise.resolve>,
  onCaptured = vi.fn(),
) {
  render(
    <CaptureForm
      subjects={SUBJECTS}
      onCapture={onCapture as never}
      onCaptured={onCaptured}
    />,
  )

  return { onCaptured }
}

function typeUrl(url: string) {
  fireEvent.change(screen.getByTestId('capture-url'), { target: { value: url } })
}

describe('CaptureForm', () => {
  it('should capture an article URL', async () => {
    const onCapture = vi.fn().mockResolvedValue({ ok: true, data: { id: 'i1' } })
    const { onCaptured } = renderForm(onCapture)

    typeUrl('https://react.dev/learn/you-might-not-need-an-effect')
    fireEvent.click(screen.getByTestId('capture-submit'))

    await waitFor(() => expect(onCaptured).toHaveBeenCalled())
    expect(onCapture).toHaveBeenCalledWith({
      url: 'https://react.dev/learn/you-might-not-need-an-effect',
      kind: 'article',
      pastedDescription: null,
      subjectId: 'subject-1',
      subSubjectNodeId: null,
    })
  })

  it('should only offer a description field for a video', () => {
    renderForm(vi.fn())

    expect(screen.queryByTestId('capture-description')).toBeNull()

    fireEvent.click(screen.getByTestId('capture-kind-video'))

    expect(screen.getByTestId('capture-description')).toBeTruthy()
  })

  it('should send a blank video description as null so the API can reject it', async () => {
    const onCapture = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { id: 'i1' } })
    renderForm(onCapture)

    fireEvent.click(screen.getByTestId('capture-kind-video'))
    typeUrl('https://youtu.be/abc')
    fireEvent.change(screen.getByTestId('capture-description'), {
      target: { value: '   ' },
    })
    fireEvent.click(screen.getByTestId('capture-submit'))

    await waitFor(() => expect(onCapture).toHaveBeenCalled())
    expect(onCapture.mock.calls[0][0].pastedDescription).toBeNull()
  })

  it('should show the API rejection reason for a video with no description', async () => {
    const onCapture = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      code: 'video_requires_description',
      message: 'a video capture needs its description',
    })
    const { onCaptured } = renderForm(onCapture)

    fireEvent.click(screen.getByTestId('capture-kind-video'))
    typeUrl('https://youtu.be/abc')
    fireEvent.click(screen.getByTestId('capture-submit'))

    const alert = await screen.findByTestId('capture-error')

    expect(alert.textContent).toContain('paste the video description')
    expect(alert.textContent).toContain('Nothing was captured')
    expect(onCaptured).not.toHaveBeenCalled()
  })

  it('should surface a blocked source rather than failing silently', async () => {
    const onCapture = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      code: 'source_blocked',
      message: null,
    })
    renderForm(onCapture)

    typeUrl('http://169.254.169.254/latest/meta-data')
    fireEvent.click(screen.getByTestId('capture-submit'))

    expect((await screen.findByTestId('capture-error')).textContent).toContain(
      'not allowed to be fetched',
    )
  })

  it('should keep the submit button disabled without a URL', () => {
    renderForm(vi.fn())

    expect(
      screen.getByTestId<HTMLButtonElement>('capture-submit').disabled,
    ).toBe(true)
  })
})
