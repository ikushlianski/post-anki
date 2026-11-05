// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

const loaderData = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
const invalidate = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: { component: () => ReactNode }) => ({
    useLoaderData: () => loaderData.current,
    component: config.component,
  }),
  Link: ({ children }: { children: ReactNode }) => <a href="#">{children}</a>,
  useRouter: () => ({ invalidate }),
}))

vi.mock('../admin-settings/admin-settings.api')
vi.mock('../notion-source/notion-source.api', () => ({
  getNotionConnection: () => new Promise(() => {}),
}))
vi.mock('../chat-usage/chat-usage.api', () => ({ getChatUsage: () => new Promise(() => {}) }))

import { updateAdminSettings } from '../admin-settings/admin-settings.api'
import { Route } from './admin-settings'

const mockedUpdate = vi.mocked(updateAdminSettings)
const Page = (Route as unknown as { component: () => ReactNode }).component

function setLoaderData() {
  loaderData.current = {
    settings: {
      testToggle: false,
      modelTier: 'balanced',
      knowledgeItemModelId: 'x',
      newCardsPerDay: 20,
      maxReviewsPerDay: 200,
      mixNewWithDue: true,
      learningStepsMinutes: [1, 10],
      relearningStepsMinutes: [10],
      desiredRetention: 0.9,
      fusionEnabled: false,
      fusionModelIds: [],
      fusionEstimate: { perModel: [], totalEstimatedCostUsd: 0 },
    },
  }
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('AdminSettingsPage', () => {
  it('should not show developer placeholder wording on the test toggle', () => {
    setLoaderData()
    render(<Page />)

    expect(screen.queryByText(/placeholder/i)).toBeNull()
  })

  it('should tell the learner a save failed, keep the last saved limit and keep the page usable', async () => {
    setLoaderData()
    mockedUpdate.mockRejectedValue(new Error('boom'))
    render(<Page />)

    const input = screen.getByTestId('admin-settings-new-cards-per-day-input') as HTMLInputElement

    fireEvent.change(input, { target: { value: '60' } })
    fireEvent.blur(input)

    expect(await screen.findByTestId('admin-settings-save-error-newCardsPerDay')).toBeTruthy()
    await waitFor(() => expect(input.value).toBe('20'))
    expect(input.disabled).toBe(false)
    expect((screen.getByRole('switch', { name: 'Test toggle' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('should save the reviews per day limit and show an error when it fails', async () => {
    setLoaderData()
    mockedUpdate.mockRejectedValue(new Error('boom'))
    render(<Page />)

    const input = screen.getByTestId('admin-settings-max-reviews-per-day-input') as HTMLInputElement

    fireEvent.change(input, { target: { value: '0' } })
    fireEvent.blur(input)

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith({ data: { maxReviewsPerDay: 0 } }),
    )
    expect(await screen.findByTestId('admin-settings-save-error-maxReviewsPerDay')).toBeTruthy()
    await waitFor(() => expect(input.value).toBe('200'))
  })

  it('should not report a failed save when the save succeeded and only the page refresh failed', async () => {
    setLoaderData()
    mockedUpdate.mockResolvedValue(undefined as never)
    invalidate.mockRejectedValue(new Error('refresh failed'))
    render(<Page />)

    const input = screen.getByTestId('admin-settings-new-cards-per-day-input') as HTMLInputElement

    fireEvent.change(input, { target: { value: '60' } })
    fireEvent.blur(input)

    await waitFor(() => expect(invalidate).toHaveBeenCalled())
    await waitFor(() => expect(input.disabled).toBe(false))
    expect(screen.queryByTestId('admin-settings-save-error-newCardsPerDay')).toBeNull()
    expect(screen.getByTestId('admin-settings-refresh-error')).toBeTruthy()
    expect(input.value).toBe('60')
  })

  it('should save the mix setting when the learner turns it off', async () => {
    setLoaderData()
    mockedUpdate.mockResolvedValue(undefined as never)
    invalidate.mockResolvedValue(undefined)
    render(<Page />)

    const toggle = screen.getByRole('switch', { name: "Mix new cards with cards I've already seen" })

    expect(toggle.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(toggle)

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith({ data: { mixNewWithDue: false } }))
  })
})
