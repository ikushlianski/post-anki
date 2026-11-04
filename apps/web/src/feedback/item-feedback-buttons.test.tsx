// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { ItemFeedbackButtons } from './item-feedback-buttons'

vi.mock('./feedback.api', () => ({
  submitProbeQuestionFeedback: vi.fn().mockResolvedValue(null),
  submitSocraticTurnFeedback: vi.fn().mockResolvedValue(null),
}))

afterEach(cleanup)

describe('ItemFeedbackButtons phone targets', () => {
  it('should give thumbs, note box, Save and Close a 44px phone size', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ItemFeedbackButtons itemType="probe_question" itemId="q1" />
      </QueryClientProvider>,
    )

    expect(screen.getByTestId('feedback-up-q1').className).toContain('min-h-[44px]')
    expect(screen.getByTestId('feedback-down-q1').className).toContain('min-h-[44px]')

    fireEvent.click(screen.getByTestId('feedback-up-q1'))

    expect(screen.getByTestId('feedback-comment-input-q1').className).toContain('min-h-[44px]')
    expect(screen.getByTestId('feedback-comment-submit-q1').className).toContain('min-h-[44px]')
    expect(screen.getByText('Close').className).toContain('min-h-[44px]')
  })
})
