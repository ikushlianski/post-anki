// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { AiSuggestionBlock } from './ai-suggestion-block'

afterEach(cleanup)

describe('AiSuggestionBlock', () => {
  it('should show the original phrase beside the AI suggestion with an AI badge', () => {
    render(<AiSuggestionBlock original="touch the base" aiSuggestion="touch base" />)

    expect(screen.getByText('touch the base')).toBeTruthy()
    expect(screen.getByText('touch base')).toBeTruthy()
    expect(screen.getByText('AI')).toBeTruthy()
  })

  it('should show nothing when the phrase has no AI suggestion', () => {
    const { container } = render(<AiSuggestionBlock original="touch base" aiSuggestion={null} />)

    expect(container.innerHTML).toBe('')
  })
})
