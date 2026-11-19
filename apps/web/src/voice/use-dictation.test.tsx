import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FakeRecognition, installRecognition, removeRecognition } from './speech-test-mocks'
import { mergeDictation, useDictation } from './use-dictation'

describe('mergeDictation', () => {
  it('should append spoken words after what the learner already typed', () => {
    expect(mergeDictation('What is ', 'a closure')).toBe('What is a closure')
  })

  it('should keep the typed text when nothing was heard', () => {
    expect(mergeDictation('typed', '  ')).toBe('typed')
  })
})

describe('useDictation', () => {
  beforeEach(installRecognition)
  afterEach(removeRecognition)

  it('should fill the draft with the dictated words without sending anything', () => {
    const onDraft = vi.fn()
    const { result } = renderHook(() => useDictation('Explain', onDraft))

    act(() => result.current.start())
    act(() => FakeRecognition.instances[0]?.say('how', ' promises work'))

    expect(onDraft).toHaveBeenLastCalledWith('Explain how promises work')
    expect(result.current.listening).toBe(true)
  })

  it('should stop listening when recognition ends', () => {
    const { result } = renderHook(() => useDictation('', vi.fn()))

    act(() => result.current.start())
    act(() => result.current.stop())

    expect(result.current.listening).toBe(false)
  })

  it('should tell the learner when microphone access is denied', () => {
    const { result } = renderHook(() => useDictation('', vi.fn()))

    act(() => result.current.start())
    act(() => FakeRecognition.instances[0]?.onerror?.({ error: 'not-allowed' }))

    expect(result.current.error).toContain('Microphone access is off')
  })

  it('should stay quiet when no speech was heard', () => {
    const { result } = renderHook(() => useDictation('', vi.fn()))

    act(() => result.current.start())
    act(() => FakeRecognition.instances[0]?.onerror?.({ error: 'no-speech' }))

    expect(result.current.error).toBeNull()
  })

  it('should abort dictation when the draft is cleared by sending', () => {
    const { result, rerender } = renderHook(({ draft }) => useDictation(draft, vi.fn()), {
      initialProps: { draft: '' },
    })

    act(() => result.current.start())
    act(() => FakeRecognition.instances[0]?.say('hello'))
    rerender({ draft: 'hello' })
    rerender({ draft: '' })

    expect(FakeRecognition.instances[0]?.abort).toHaveBeenCalled()
    expect(result.current.listening).toBe(false)
  })

  it('should report unsupported browsers so the mic stays hidden', () => {
    removeRecognition()

    const { result } = renderHook(() => useDictation('', vi.fn()))

    expect(result.current.supported).toBe(false)
  })
})
