// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { KNOWLEDGE_ITEM_MODEL_IDS, type AdminSettingsResponse } from '@post-anki/shared'

import { FusionModeSection } from './fusion-mode-section'

const [a, b, c, d, e, f] = KNOWLEDGE_ITEM_MODEL_IDS

const off: Pick<AdminSettingsResponse, 'fusionEnabled' | 'fusionModelIds' | 'fusionEstimate'> = {
  fusionEnabled: false,
  fusionModelIds: [],
  fusionEstimate: { perModel: [], totalEstimatedCostUsd: 0 },
}

afterEach(cleanup)

describe('FusionModeSection', () => {
  it('should be off by default', () => {
    render(<FusionModeSection initial={off} onSave={vi.fn()} />)

    expect(screen.getByRole('switch', { name: 'Fusion mode' }).getAttribute('aria-checked')).toBe(
      'false',
    )
  })

  it('should stop the learner picking a sixth model', () => {
    render(<FusionModeSection initial={{ ...off, fusionModelIds: [a, b, c, d, e] }} onSave={vi.fn()} />)

    expect((screen.getByTestId(`fusion-model-${f}`) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByTestId(`fusion-model-${a}`) as HTMLInputElement).disabled).toBe(false)
  })

  it('should warn that fusion needs two models when fewer are picked while on', () => {
    render(<FusionModeSection initial={{ ...off, fusionEnabled: true, fusionModelIds: [a] }} onSave={vi.fn()} />)

    expect(screen.getByTestId('fusion-too-few')).toBeTruthy()
    fireEvent.click(screen.getByTestId(`fusion-model-${b}`))
    expect(screen.queryByTestId('fusion-too-few')).toBeNull()
  })

  it('should send the choice and show the refreshed cost estimate', async () => {
    const onSave = vi.fn().mockResolvedValue({
      ok: true,
      settings: {
        ...off,
        fusionEnabled: true,
        fusionModelIds: [a, b],
        fusionEstimate: {
          perModel: [
            { modelId: a, estimatedCostUsd: 0.01 },
            { modelId: b, estimatedCostUsd: 0.02 },
          ],
          totalEstimatedCostUsd: 0.03,
        },
      },
    })
    render(<FusionModeSection initial={off} onSave={onSave} />)

    fireEvent.click(screen.getByRole('switch', { name: 'Fusion mode' }))
    fireEvent.click(screen.getByTestId(`fusion-model-${a}`))
    fireEvent.click(screen.getByTestId(`fusion-model-${b}`))
    fireEvent.click(screen.getByTestId('fusion-save'))

    await waitFor(() => expect(screen.getByTestId('fusion-estimate-total').textContent).toBe('$0.0300'))
    expect(onSave).toHaveBeenCalledWith({ fusionEnabled: true, fusionModelIds: [a, b] })
  })

  it('should show the server message when the save is refused', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: false, message: 'Fusion mode needs 2 to 5 models' })
    render(<FusionModeSection initial={off} onSave={onSave} />)

    fireEvent.click(screen.getByTestId('fusion-save'))

    expect((await screen.findByTestId('fusion-save-error')).textContent).toBe(
      'Fusion mode needs 2 to 5 models',
    )
  })
})
