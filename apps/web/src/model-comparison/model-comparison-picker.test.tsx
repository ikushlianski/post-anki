// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MODEL_COMPARISON_MAX_MODELS, type KnowledgeItemModelId } from '@post-anki/shared'

import { ModelComparisonPicker } from './model-comparison-picker'

function Harness({ initial = [] as KnowledgeItemModelId[] }) {
  const [selected, setSelected] = useState<KnowledgeItemModelId[]>(initial)

  return <ModelComparisonPicker selected={selected} onChange={setSelected} />
}

afterEach(cleanup)

describe('ModelComparisonPicker', () => {
  it('should start with no model chosen and show a price for each one', () => {
    render(<Harness />)

    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]

    expect(boxes.length).toBeGreaterThan(5)
    expect(boxes.every((box) => !box.checked)).toBe(true)
    expect(screen.getAllByText(/per 1M/).length).toBe(boxes.length)
  })

  it('should stop offering more models once the limit is reached', () => {
    render(<Harness />)

    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]

    boxes.slice(0, MODEL_COMPARISON_MAX_MODELS).forEach((box) => fireEvent.click(box))

    expect(boxes.filter((box) => box.checked)).toHaveLength(MODEL_COMPARISON_MAX_MODELS)
    expect(boxes.filter((box) => !box.checked).every((box) => box.disabled)).toBe(true)
  })

  it('should let a chosen model be unchecked again', () => {
    render(<Harness />)

    const [first] = screen.getAllByRole('checkbox') as HTMLInputElement[]

    fireEvent.click(first!)
    fireEvent.click(first!)

    expect(first!.checked).toBe(false)
  })
})
