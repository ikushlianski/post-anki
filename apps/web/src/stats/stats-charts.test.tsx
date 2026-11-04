import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AiSpendChart } from './ai-spend-chart'
import { DailyReviewsChart } from './daily-reviews-chart'
import { HourlyHistogram } from './hourly-histogram'
import { emptyLearningFixture, emptySpendFixture, learningFixture, spendFixture } from './stats.fixtures'

describe('DailyReviewsChart', () => {
  it('should list every day with reviews and new cards for screen readers', () => {
    render(<DailyReviewsChart days={learningFixture.daily} />)

    expect(screen.getByText('20 reviews')).toBeTruthy()
    expect(screen.getByText('5 new')).toBeTruthy()
  })

  it('should say there are no reviews when the period is empty', () => {
    render(<DailyReviewsChart days={emptyLearningFixture.daily} />)

    expect(screen.getByText('No reviews in this period.')).toBeTruthy()
  })
})

describe('HourlyHistogram', () => {
  it('should show review counts per hour', () => {
    render(<HourlyHistogram hourly={learningFixture.hourly} />)

    expect(screen.getByText('9:00').nextSibling?.textContent).toBe('15')
  })

  it('should say there are no reviews when every hour is zero', () => {
    render(<HourlyHistogram hourly={emptyLearningFixture.hourly} />)

    expect(screen.getByText('No reviews in this period.')).toBeTruthy()
  })
})

describe('AiSpendChart', () => {
  it('should flag spend as estimated with the unpriced call count and list models', () => {
    render(<AiSpendChart spend={spendFixture} />)

    expect(screen.getByTestId('spend-estimate-note').textContent).toBe('Estimated; 7 calls unpriced.')
    expect(screen.getByText('deepseek-v4-flash')).toBeTruthy()
    expect(screen.getByText('$0.500')).toBeTruthy()
  })

  it('should scroll the model table and break long model ids on a phone', () => {
    render(<AiSpendChart spend={spendFixture} />)

    const scroll = screen.getByTestId('spend-by-model-scroll')

    expect(scroll.className).toContain('overflow-x-auto')
    expect(scroll.contains(screen.getByTestId('spend-by-model'))).toBe(true)
    expect(screen.getByText('deepseek-v4-flash').className).toContain('break-all')
  })

  it('should render an empty state without models', () => {
    render(<AiSpendChart spend={emptySpendFixture} />)

    expect(screen.getByText('No AI spend in this period.')).toBeTruthy()
    expect(screen.getByTestId('spend-estimate-note').textContent).toBe('Estimated; 0 calls unpriced.')
  })
})
