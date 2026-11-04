// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DailyGoalForm } from './daily-goal-field'

afterEach(cleanup)

describe('DailyGoalForm', () => {
  it('should save the typed number as the daily review goal', async () => {
    const onSave = vi.fn().mockResolvedValue({ dailyReviewTarget: 50 })

    render(<DailyGoalForm initial={{ dailyReviewTarget: null }} onSave={onSave} />)
    fireEvent.change(screen.getByTestId('daily-goal-input'), { target: { value: '50' } })
    fireEvent.click(screen.getByTestId('daily-goal-save'))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ dailyReviewTarget: 50 }))
  })

  it('should clear the goal when the field is emptied', async () => {
    const onSave = vi.fn().mockResolvedValue({ dailyReviewTarget: null })

    render(<DailyGoalForm initial={{ dailyReviewTarget: 30 }} onSave={onSave} />)
    fireEvent.change(screen.getByTestId('daily-goal-input'), { target: { value: '' } })
    fireEvent.click(screen.getByTestId('daily-goal-save'))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ dailyReviewTarget: null }))
  })

  it('should block saving a number that is not a positive whole number', () => {
    render(<DailyGoalForm initial={{ dailyReviewTarget: null }} onSave={vi.fn()} />)
    fireEvent.change(screen.getByTestId('daily-goal-input'), { target: { value: '0' } })

    expect(screen.getByTestId('daily-goal-invalid')).toBeTruthy()
    expect((screen.getByTestId('daily-goal-save') as HTMLButtonElement).disabled).toBe(true)
  })

  it('should tell the learner when saving fails', async () => {
    render(<DailyGoalForm initial={{ dailyReviewTarget: null }} onSave={vi.fn().mockRejectedValue(new Error('x'))} />)
    fireEvent.change(screen.getByTestId('daily-goal-input'), { target: { value: '20' } })
    fireEvent.click(screen.getByTestId('daily-goal-save'))

    await waitFor(() => expect(screen.getByTestId('daily-goal-error')).toBeTruthy())
  })
})
