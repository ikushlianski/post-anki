import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import { TopicMasteryDot } from './topic-mastery-dot'

describe('TopicMasteryDot', () => {
  it('renders with gap color for 0%', () => {
    const { container } = render(<TopicMasteryDot maturity={0} />)
    const dot = container.querySelector('div')
    expect(dot?.className).toContain('bg-rose-100')
  })

  it('renders with first progress color for 25%', () => {
    const { container } = render(<TopicMasteryDot maturity={25} />)
    const dot = container.querySelector('div')
    expect(dot?.className).toContain('bg-emerald-50')
  })

  it('renders with second progress color for 50%', () => {
    const { container } = render(<TopicMasteryDot maturity={50} />)
    const dot = container.querySelector('div')
    expect(dot?.className).toContain('bg-emerald-200')
  })

  it('renders with third progress color for 75%', () => {
    const { container } = render(<TopicMasteryDot maturity={75} />)
    const dot = container.querySelector('div')
    expect(dot?.className).toContain('bg-emerald-400')
  })

  it('renders with fourth progress color for 90%', () => {
    const { container } = render(<TopicMasteryDot maturity={90} />)
    const dot = container.querySelector('div')
    expect(dot?.className).toContain('bg-emerald-500')
  })

  it('renders with mastered color for 100%', () => {
    const { container } = render(<TopicMasteryDot maturity={100} />)
    const dot = container.querySelector('div')
    expect(dot?.className).toContain('bg-emerald-700')
  })

  it('applies size and border classes', () => {
    const { container } = render(<TopicMasteryDot maturity={50} />)
    const dot = container.querySelector('div')
    expect(dot?.className).toContain('h-2')
    expect(dot?.className).toContain('w-2')
    expect(dot?.className).toContain('rounded-full')
    expect(dot?.className).toContain('shrink-0')
    expect(dot?.className).toContain('border')
  })
})
