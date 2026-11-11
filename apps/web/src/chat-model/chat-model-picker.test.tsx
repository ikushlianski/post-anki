// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { ChatModelPicker } from './chat-model-picker'
import { CHAT_MODEL_STORAGE_KEY } from './use-chat-model'

describe('ChatModelPicker', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(cleanup)

  const pickerValue = () => (screen.getByTestId('chat-model-picker') as HTMLSelectElement).value

  it('should show the default model until the learner picks another', () => {
    render(<ChatModelPicker />)

    expect(pickerValue()).toBe('')
  })

  it('should remember the pick for later chats and offer only listed models', () => {
    const { unmount } = render(<ChatModelPicker />)
    const picker = screen.getByTestId('chat-model-picker')

    fireEvent.change(picker, { target: { value: 'openrouter/google/gemma-4-31b-it' } })

    expect(window.localStorage.getItem(CHAT_MODEL_STORAGE_KEY)).toBe('openrouter/google/gemma-4-31b-it')

    unmount()
    render(<ChatModelPicker />)

    expect(pickerValue()).toBe('openrouter/google/gemma-4-31b-it')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toContain('Gemma 4 31B')
  })

  it('should ignore a stored model that is no longer allowed', () => {
    window.localStorage.setItem(CHAT_MODEL_STORAGE_KEY, 'openrouter/evil/model')
    render(<ChatModelPicker />)

    expect(pickerValue()).toBe('')
  })
})
