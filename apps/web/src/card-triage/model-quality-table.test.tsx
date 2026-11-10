// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { CardQualityModelRow } from '@post-anki/shared'

import { getCardQualityByModel } from './card-quality.api'
import { ModelQualityTable } from './model-quality-table'

vi.mock('./card-quality.api', () => ({ getCardQualityByModel: vi.fn() }))

const mockedGet = vi.mocked(getCardQualityByModel)

function row(overrides: Partial<CardQualityModelRow>): CardQualityModelRow {
  return {
    modelId: 'model-a',
    approved: 3,
    rejected: 1,
    chat: 0,
    pending: 2,
    superseded: 0,
    approvalRate: 0.75,
    averageRating: 4.25,
    topReasons: [],
    ...overrides,
  }
}

function renderTable() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <ModelQualityTable />
    </QueryClientProvider>,
  )
}

describe('ModelQualityTable', () => {
  beforeEach(() => {
    mockedGet.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('should show each model with its approval rate and average rating', async () => {
    mockedGet.mockResolvedValue({ ok: true, data: { models: [row({})] } })
    renderTable()

    const line = await screen.findByTestId('model-quality-row-model-a')

    expect(line.textContent).toContain('75%')
    expect(line.textContent).toContain('4.3')
  })

  it('should label cards from before tracking as unknown and show a dash when no rate exists', async () => {
    mockedGet.mockResolvedValue({
      ok: true,
      data: { models: [row({ modelId: 'unknown', approved: 0, rejected: 0, approvalRate: null, averageRating: null })] },
    })
    renderTable()

    const line = await screen.findByTestId('model-quality-row-unknown')

    expect(line.textContent).toContain('Unknown (before tracking)')
    expect(line.textContent).toContain('–')
  })

  it('should say so when there are no cards', async () => {
    mockedGet.mockResolvedValue({ ok: true, data: { models: [] } })
    renderTable()

    expect(await screen.findByTestId('model-quality-empty')).toBeTruthy()
  })
})
