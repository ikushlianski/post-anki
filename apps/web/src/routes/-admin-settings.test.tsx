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
vi.mock('../knowledge-bit/knowledge-bit.api')
vi.mock('../curriculum/curriculum.api')
vi.mock('../knowledge-bit/placement-suggestions-panel', () => ({
  PlacementSuggestionsPanel: () => <div data-testid="placement-panel" />,
}))

import { updateAdminSettings } from '../admin-settings/admin-settings.api'
import { Route } from './admin-settings'

const mockedUpdate = vi.mocked(updateAdminSettings)
const Page = (Route as unknown as { component: () => ReactNode }).component

function setLoaderData(placementOk: boolean) {
  loaderData.current = {
    settings: {
      testToggle: false,
      modelTier: 'balanced',
      knowledgeItemModelId: 'x',
      newCardsPerDay: 20,
    },
    placementSuggestions: placementOk ? { ok: true, data: [] } : { ok: false },
    board: { ok: true, data: { subjects: [], curricula: [] } },
  }
}

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('AdminSettingsPage', () => {
  it('should tell the learner a save failed, keep the last saved limit and keep the page usable', async () => {
    setLoaderData(true)
    mockedUpdate.mockRejectedValue(new Error('boom'))
    render(<Page />)

    const input = screen.getByTestId('admin-settings-new-cards-per-day-input') as HTMLInputElement

    fireEvent.change(input, { target: { value: '60' } })
    fireEvent.blur(input)

    expect(await screen.findByTestId('admin-settings-save-error-newCardsPerDay')).toBeTruthy()
    await waitFor(() => expect(input.value).toBe('20'))
    expect(input.disabled).toBe(false)
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(false)
  })

  it('should not report a failed save when the save succeeded and only the page refresh failed', async () => {
    setLoaderData(true)
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

  it('should still show the settings when the placement suggestions fail to load', () => {
    setLoaderData(false)
    render(<Page />)

    expect(screen.getByTestId('admin-settings-placement-load-error')).toBeTruthy()
    expect(screen.getByTestId('admin-settings-new-cards-per-day-input')).toBeTruthy()
  })
})
