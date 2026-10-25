// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import {
  DEFAULT_KNOWLEDGE_ITEM_MODEL_ID,
  KNOWLEDGE_ITEM_MODELS,
  KNOWLEDGE_ITEM_MODEL_IDS,
  type KnowledgeItemModelId,
} from '@post-anki/shared'
import { describeExtractionModelOption } from '../knowledge-bit/extraction-model-select'
import { pickSearchableOption, searchableValue } from '../ui/searchable-select-test-utils'
import { KnowledgeItemModelSelect } from './knowledge-item-model-select'

const TEST_ID = 'admin-settings-knowledge-item-model'
const DEFAULT_ID: KnowledgeItemModelId = DEFAULT_KNOWLEDGE_ITEM_MODEL_ID
const LUNA_ID: KnowledgeItemModelId = 'openrouter/openai/gpt-6-luna'

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

  it('should list every allowlisted model with its input and output price per 1M tokens', () => {
    renderSelect()
    fireEvent.click(screen.getByTestId(`${TEST_ID}-select`))

    const options = screen.getAllByRole('option')

    expect(options).toHaveLength(KNOWLEDGE_ITEM_MODEL_IDS.length)
    expect(screen.getByRole('option', { name: /GPT-6 Luna — \$0\.10 in \/ \$0\.50 out per 1M/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: /GPT-OSS 120B — \$0\.037 in \/ \$0\.17 out per 1M/ })).toBeTruthy()
  })

  it('should select the stored model', () => {
    renderSelect({ value: DEFAULT_ID })

    expect(searchableValue(`${TEST_ID}-select`)).toBe(describeExtractionModelOption(KNOWLEDGE_ITEM_MODELS[DEFAULT_ID]))
  })

  it('should show the date the prices were checked', () => {
    renderSelect()

    expect(screen.getByText('Prices checked 2026-10-11')).toBeTruthy()
  })

  it('should not show a retirement date for models with no expiry', () => {
    renderSelect()
    fireEvent.click(screen.getByTestId(`${TEST_ID}-select`))

    const options = screen.getAllByRole('option')

    expect(options.every((opt) => !opt.textContent?.includes('retires'))).toBe(true)
  })

  it('should call onChange with the chosen model id', () => {
    const { onChange } = renderSelect()

    pickSearchableOption(`${TEST_ID}-select`, LUNA_ID)

    expect(onChange).toHaveBeenCalledWith(LUNA_ID)
  })

  it('should not allow changing the model while the control is disabled', () => {
    renderSelect({ disabled: true })

    expect((screen.getByTestId(`${TEST_ID}-select`) as HTMLInputElement).disabled).toBe(true)
  })
})
