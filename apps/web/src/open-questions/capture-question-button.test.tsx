// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { CaptureQuestionButton } from './capture-question-button'

vi.mock('./open-questions.api', () => ({
  captureProbeQuestionOpenQuestion: vi.fn(),
  captureSocraticTurnOpenQuestion: vi.fn(),
}))

afterEach(cleanup)

describe('CaptureQuestionButton phone targets', () => {
  it('should give Ask later, the question box, Save and Close a 44px phone size', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CaptureQuestionButton itemType="probe_question" itemId="q1" />
      </QueryClientProvider>,
    )

    expect(screen.getByTestId('capture-question-q1').className).toContain('min-h-[44px]')

    fireEvent.click(screen.getByTestId('capture-question-q1'))

    expect(screen.getByTestId('capture-question-input-q1').className).toContain('min-h-[44px]')
    expect(screen.getByTestId('capture-question-submit-q1').className).toContain('min-h-[44px]')
    expect(screen.getByRole('button', { name: 'Close' }).className).toContain('min-h-[44px]')
  })
})
