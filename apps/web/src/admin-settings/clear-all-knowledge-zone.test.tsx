// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { KnowledgeDeletionCounts } from '@post-anki/shared'
import { ClearAllKnowledgeZone } from './clear-all-knowledge-zone'

afterEach(cleanup)

const counts: KnowledgeDeletionCounts = {
  knowledgeBits: 12,
  questionVariants: 30,
  variantAttempts: 0,
  schedules: 12,
  reviews: 40,
  feedback: 0,
  tagAssignments: 0,
  knowledgeSources: 3,
  extractionGrades: 0,
  topicCardVariants: 0,
  facts: 0,
  triageSessions: 0,
}

function setup(onClear = vi.fn().mockResolvedValue({ counts })) {
  const onCleared = vi.fn()

  render(<ClearAllKnowledgeZone onClear={onClear} onCleared={onCleared} />)
  fireEvent.click(screen.getByTestId('clear-all-knowledge-open'))

  return { onClear, onCleared, input: screen.getByTestId('clear-all-knowledge-input') }
}

const confirmButton = () => screen.getByTestId('clear-all-knowledge-confirm') as HTMLButtonElement

describe('ClearAllKnowledgeZone', () => {
  it('should keep the delete button disabled until the exact phrase is typed', () => {
    const { input } = setup()

    expect(confirmButton().disabled).toBe(true)

    fireEvent.change(input, { target: { value: 'delete all knowledge' } })
    expect(confirmButton().disabled).toBe(true)

    fireEvent.change(input, { target: { value: 'DELETE ALL KNOWLEDGE' } })
    expect(confirmButton().disabled).toBe(false)
  })

  it('should clear once, show what was deleted and refresh the page data', async () => {
    const { input, onClear, onCleared } = setup()

    fireEvent.change(input, { target: { value: 'DELETE ALL KNOWLEDGE' } })
    fireEvent.click(confirmButton())

    const result = await screen.findByTestId('clear-all-knowledge-result')

    expect(result.textContent).toContain('12 knowledge pieces')
    expect(result.textContent).toContain('3 sources')
    expect(result.textContent).toContain('40 reviews')
    expect(onClear).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(onCleared).toHaveBeenCalledTimes(1))
  })

  it('should show an error and allow a retry when clearing fails', async () => {
    const onClear = vi.fn().mockRejectedValue(new Error('boom'))
    const { input, onCleared } = setup(onClear)

    fireEvent.change(input, { target: { value: 'DELETE ALL KNOWLEDGE' } })
    fireEvent.click(confirmButton())

    expect(await screen.findByTestId('clear-all-knowledge-error')).toBeTruthy()
    expect(screen.queryByTestId('clear-all-knowledge-result')).toBeNull()
    expect(onCleared).not.toHaveBeenCalled()
    await waitFor(() => expect(confirmButton().disabled).toBe(false))
  })

  it('should tell the learner subjects and settings are kept', () => {
    setup()

    expect(screen.getByTestId('clear-all-knowledge-zone').textContent).toContain(
      'Subjects and settings are kept',
    )
  })
})
