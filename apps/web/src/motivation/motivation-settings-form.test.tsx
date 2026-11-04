// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { MotivationSettingsForm } from './motivation-settings-form'

afterEach(cleanup)

const initial = { timeZone: 'UTC', timeZoneConfigured: false, streakMinReviews: 5, restDaysPerMonth: 2 }

describe('MotivationSettingsForm', () => {
  it('should save a new time zone so late-evening reviews land on the learner\'s own day', async () => {
    const onSave = vi.fn().mockResolvedValue({ ...initial, timeZone: 'Europe/Berlin', timeZoneConfigured: true })

    render(<MotivationSettingsForm initial={initial} onSave={onSave} />)
    fireEvent.change(screen.getByTestId('motivation-time-zone'), { target: { value: 'Europe/Berlin' } })
    fireEvent.click(screen.getByTestId('motivation-settings-save'))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ timeZone: 'Europe/Berlin' })))
  })

  it('should allow switching rest days off', async () => {
    const onSave = vi.fn().mockResolvedValue(initial)

    render(<MotivationSettingsForm initial={initial} onSave={onSave} />)
    fireEvent.change(screen.getByTestId('motivation-rest-days'), { target: { value: '0' } })
    fireEvent.click(screen.getByTestId('motivation-settings-save'))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ restDaysPerMonth: 0 })))
  })

  it('should block an invented time zone', () => {
    render(<MotivationSettingsForm initial={initial} onSave={vi.fn()} />)
    fireEvent.change(screen.getByTestId('motivation-time-zone'), { target: { value: 'Mars/Olympus' } })

    expect(screen.getByTestId('motivation-settings-invalid')).toBeTruthy()
    expect((screen.getByTestId('motivation-settings-save') as HTMLButtonElement).disabled).toBe(true)
  })

  it('should not offer saving when nothing changed', () => {
    render(<MotivationSettingsForm initial={initial} onSave={vi.fn()} />)

    expect((screen.getByTestId('motivation-settings-save') as HTMLButtonElement).disabled).toBe(true)
  })

  it('should tell the learner when saving fails', async () => {
    render(<MotivationSettingsForm initial={initial} onSave={vi.fn().mockRejectedValue(new Error('x'))} />)
    fireEvent.change(screen.getByTestId('motivation-min-reviews'), { target: { value: '10' } })
    fireEvent.click(screen.getByTestId('motivation-settings-save'))

    await waitFor(() => expect(screen.getByTestId('motivation-settings-error')).toBeTruthy())
  })
})
