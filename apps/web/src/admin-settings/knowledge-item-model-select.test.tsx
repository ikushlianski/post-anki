// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { DEFAULT_KNOWLEDGE_ITEM_MODEL_ID, type KnowledgeItemModelId } from '@post-anki/shared'
import { KnowledgeItemModelSelect } from './knowledge-item-model-select'

const TEST_ID = 'admin-settings-knowledge-item-model'
const DEFAULT_ID: KnowledgeItemModelId = DEFAULT_KNOWLEDGE_ITEM_MODEL_ID
const GEMMA_3_ID: KnowledgeItemModelId = 'openrouter/google/gemma-3-12b-it'
const FLASH_LITE_ID: KnowledgeItemModelId = 'openrouter/google/gemini-2.5-flash-lite'

function renderSelect({ value = DEFAULT_ID, disabled = false }: { value?: KnowledgeItemModelId; disabled?: boolean } = {}) {
  const onChange = vi.fn()

  render(
    <KnowledgeItemModelSelect
      label="Knowledge item model"
      description="Model for detecting and writing knowledge items."
      value={value}
      onChange={onChange}
      disabled={disabled}
      testId={TEST_ID}
    />,
  )

  return { onChange }
}

describe('KnowledgeItemModelSelect', () => {
  afterEach(() => {
    cleanup()
  })

  it('should show one radio per allowlisted model with its input and output prices', () => {
    renderSelect()

    const radios = screen.getAllByRole('radio')

    expect(radios).toHaveLength(5)
    expect(screen.getByText('$0.09 in / $0.34 out per 1M tokens')).toBeTruthy()
    expect(screen.getByText('$0.1 in / $0.4 out per 1M tokens')).toBeTruthy()
    expect(screen.getByText('$0.05 in / $0.08 out per 1M tokens')).toBeTruthy()
    expect(screen.getByText('$0.05 in / $0.15 out per 1M tokens')).toBeTruthy()
    expect(screen.getByText('$0.1 in / $0.5 out per 1M tokens')).toBeTruthy()
  })

  it('should label the Claude Haiku option as premium', () => {
    renderSelect()

    expect(screen.getByText('Claude Haiku 5.5 (premium)')).toBeTruthy()
  })

  it('should check the radio for the stored model', () => {
    renderSelect({ value: DEFAULT_ID })

    const checked = screen.getAllByRole('radio').filter((radio) => (radio as HTMLInputElement).checked)

    expect(checked).toHaveLength(1)
    expect(screen.getByTestId(`${TEST_ID}-option-${DEFAULT_ID}`)).toBe(checked[0])
  })

  it('should show the date the prices were checked', () => {
    renderSelect()

    expect(screen.getAllByText('Prices checked 2026-10-11')).toHaveLength(5)
  })

  it('should show the OpenRouter expiry date on a model that expires within 60 days', () => {
    renderSelect()

    expect(screen.getByText('Expires 2026-10-20 on OpenRouter')).toBeTruthy()
  })

  it('should show no expiry line for the default model', () => {
    renderSelect({ value: DEFAULT_ID })

    expect(screen.getAllByText(/^Expires /)).toHaveLength(1)
    expect(screen.getByTestId(`${TEST_ID}-option-${DEFAULT_ID}`).closest('label')?.textContent).not.toContain('Expires')
  })

  it('should call onChange with the chosen model id when a different radio is clicked', () => {
    const { onChange } = renderSelect()

    fireEvent.click(screen.getByTestId(`${TEST_ID}-option-${GEMMA_3_ID}`))

    expect(onChange).toHaveBeenCalledWith(GEMMA_3_ID)
  })

  it('should not call onChange when the control is disabled', () => {
    const { onChange } = renderSelect({ disabled: true })

    fireEvent.click(screen.getByTestId(`${TEST_ID}-option-${FLASH_LITE_ID}`))

    expect(onChange).not.toHaveBeenCalled()
  })
})
