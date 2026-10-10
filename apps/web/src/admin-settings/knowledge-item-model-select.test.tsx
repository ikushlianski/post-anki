// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import type { KnowledgeItemModelId } from '@post-anki/shared'
import { KnowledgeItemModelSelect } from './knowledge-item-model-select'

const TEST_ID = 'admin-settings-knowledge-item-model'
const DEFAULT_ID: KnowledgeItemModelId = 'openrouter/deepseek/deepseek-v4-flash'
const GPT_OSS_ID: KnowledgeItemModelId = 'openrouter/openai/gpt-oss-20b'

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

  it('should show one radio per candidate model with its input and output prices', () => {
    renderSelect()

    const radios = screen.getAllByRole('radio')

    expect(radios).toHaveLength(5)
    expect(screen.getByText('$0.03 in / $1.28 out per 1M tokens')).toBeTruthy()
    expect(screen.getByText('$0.018 in / $0.09 out per 1M tokens')).toBeTruthy()
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

  it('should call onChange with the chosen model id when a different radio is clicked', () => {
    const { onChange } = renderSelect()

    fireEvent.click(screen.getByTestId(`${TEST_ID}-option-${GPT_OSS_ID}`))

    expect(onChange).toHaveBeenCalledWith(GPT_OSS_ID)
  })

  it('should not call onChange when the control is disabled', () => {
    const { onChange } = renderSelect({ disabled: true })

    fireEvent.click(screen.getByTestId(`${TEST_ID}-option-${GPT_OSS_ID}`))

    expect(onChange).not.toHaveBeenCalled()
  })
})
