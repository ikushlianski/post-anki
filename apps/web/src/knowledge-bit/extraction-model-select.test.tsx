// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { KNOWLEDGE_ITEM_MODELS, type KnowledgeItemModelId } from '@post-anki/shared'

import { describeExtractionModelOption, ExtractionModelSelect } from './extraction-model-select'

function renderSelect(value: KnowledgeItemModelId | '' = '', emptyLabel?: string) {
  const onChange = vi.fn()

  render(
    <ExtractionModelSelect
      ariaLabel="Model"
      testId="model"
      value={value}
      onChange={onChange}
      emptyLabel={emptyLabel}
    />,
  )

  return { onChange }
}

describe('describeExtractionModelOption', () => {
  it('should show the model name with its price per 1M tokens', () => {
    expect(describeExtractionModelOption(KNOWLEDGE_ITEM_MODELS['openrouter/openai/gpt-5-mini'])).toBe(
      'GPT-5 Mini — $0.25 in / $2.00 out per 1M',
    )
  })

  it('should add the retirement date for a model that is going away', () => {
    expect(describeExtractionModelOption(KNOWLEDGE_ITEM_MODELS['openrouter/google/gemini-2.5-flash-lite'])).toBe(
      'Gemini 2.5 Flash Lite — $0.10 in / $0.40 out per 1M — retires 2026-10-20',
    )
  })
})

describe('ExtractionModelSelect', () => {
  afterEach(() => {
    cleanup()
  })

  it('should offer an empty choice that stands for the default model', () => {
    renderSelect('', 'Default model')

    expect((screen.getByTestId('model') as HTMLSelectElement).value).toBe('')
    expect(screen.getByRole('option', { name: 'Default model' })).toBeTruthy()
  })

  it('should report the chosen model id', () => {
    const { onChange } = renderSelect()

    fireEvent.change(screen.getByTestId('model'), { target: { value: 'openrouter/openai/gpt-6-luna' } })

    expect(onChange).toHaveBeenCalledWith('openrouter/openai/gpt-6-luna')
  })

  it('should report the empty choice when the default is picked again', () => {
    const { onChange } = renderSelect('openrouter/openai/gpt-6-luna', 'Default model')

    fireEvent.change(screen.getByTestId('model'), { target: { value: '' } })

    expect(onChange).toHaveBeenCalledWith('')
  })

  it('should explain the selected model under the field', () => {
    renderSelect('openrouter/openai/gpt-5-mini')

    expect(screen.getByText(KNOWLEDGE_ITEM_MODELS['openrouter/openai/gpt-5-mini'].note)).toBeTruthy()
  })
})
