import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ChatVoiceBar } from './chat-voice-bar'
import {
  FakeRecognition,
  installRecognition,
  installSynthesis,
  removeRecognition,
  removeSynthesis,
} from './speech-test-mocks'
import { READ_ALOUD_STORAGE_KEY, useReadAloud } from './use-read-aloud'

function bar(overrides: Partial<Parameters<typeof ChatVoiceBar>[0]> = {}) {
  return (
    <ChatVoiceBar
      draft=""
      onDraftChange={vi.fn()}
      busy={false}
      lastReply={null}
      testIdPrefix="t"
      {...overrides}
    />
  )
}

describe('ChatVoiceBar', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => {
    removeRecognition()
    removeSynthesis()
  })

  it('should render nothing when the browser has no speech support', () => {
    const { container } = render(bar())

    expect(container.childElementCount).toBe(0)
  })

  it('should show the mic only when dictation is supported', () => {
    installRecognition()
    render(bar())

    expect(screen.getByTestId('t-mic')).toBeTruthy()
    expect(screen.queryByTestId('t-read-aloud')).toBeNull()
  })

  it('should remember the read-aloud choice on this device', () => {
    installSynthesis()
    render(bar())

    fireEvent.click(screen.getByTestId('t-read-aloud'))

    expect(window.localStorage.getItem(READ_ALOUD_STORAGE_KEY)).toBe('true')
  })

  it('should read a finished reply aloud with markdown stripped, only when enabled', () => {
    const synthesis = installSynthesis()
    window.localStorage.setItem(READ_ALOUD_STORAGE_KEY, 'true')

    const { rerender } = render(bar({ busy: true }))

    rerender(bar({ busy: false, lastReply: 'It is **{{c1::Paris}}**' }))

    expect(synthesis.speak).toHaveBeenCalledTimes(1)
    expect(synthesis.speak.mock.calls[0]?.[0]).toMatchObject({ text: 'It is Paris' })
  })

  it('should stay silent when read-aloud is off', () => {
    const synthesis = installSynthesis()
    const { rerender } = render(bar({ busy: true }))

    rerender(bar({ busy: false, lastReply: 'Hello' }))

    expect(synthesis.speak).not.toHaveBeenCalled()
  })

  it('should stop speaking when a new message is sent', () => {
    const synthesis = installSynthesis()
    window.localStorage.setItem(READ_ALOUD_STORAGE_KEY, 'true')

    const { rerender } = render(bar({ busy: true }))

    rerender(bar({ busy: false, lastReply: 'Hello' }))
    synthesis.cancel.mockClear()
    rerender(bar({ busy: true, lastReply: 'Hello' }))

    expect(synthesis.cancel).toHaveBeenCalled()
  })

  it('should stop speaking on unmount', () => {
    const synthesis = installSynthesis()
    const { unmount } = render(bar())

    synthesis.cancel.mockClear()
    unmount()

    expect(synthesis.cancel).toHaveBeenCalled()
  })
})

describe('ChatVoiceBar locking', () => {
  afterEach(removeRecognition)

  it('should stop dictating when the chat becomes locked', () => {
    installRecognition()

    const { rerender } = render(bar())

    fireEvent.click(screen.getByTestId('t-mic'))
    rerender(bar({ disabled: true }))

    expect(FakeRecognition.instances[0]?.abort).toHaveBeenCalled()
  })
})

describe('useReadAloud', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(removeSynthesis)

  it('should report unsupported without speech synthesis', () => {
    const { result } = renderHook(() => useReadAloud())

    expect(result.current.supported).toBe(false)
  })

  it('should cancel speech when the learner turns read-aloud off', () => {
    const synthesis = installSynthesis()
    const { result } = renderHook(() => useReadAloud())

    act(() => result.current.setEnabled(false))

    expect(synthesis.cancel).toHaveBeenCalled()
    expect(window.localStorage.getItem(READ_ALOUD_STORAGE_KEY)).toBe('false')
  })
})
