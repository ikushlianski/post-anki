// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { StudyForecastPanel } from './study-forecast-panel'
import { emptyForecast, examForecast } from './test-mocks'

afterEach(cleanup)

const text = (id: string) => screen.getByTestId(`study-forecast-${id}`).textContent

describe('StudyForecastPanel', () => {
  it('should show days left, due today, reviews per day and the busiest day', () => {
    render(<StudyForecastPanel forecast={examForecast} />)

    expect(text('days-left')).toBe('40 days left until the exam')
    expect(text('due-today')).toBe('34 reviews due today')
    expect(text('per-day')).toBe('About 52 reviews a day over the next 40 days (busiest: 80 on Wed 4 Nov)')
    expect(text('new-material')).toBe('New material done around Mon 30 Nov, 3 weeks before the exam.')
  })

  it('should use singular wording when exactly one review is due', () => {
    render(
      <StudyForecastPanel
        forecast={{ ...examForecast, reviews: { ...examForecast.reviews, dueToday: 1, averagePerDay: 1, horizonDays: 1 } }}
      />,
    )

    expect(text('due-today')).toBe('1 review due today')
    expect(text('per-day')).toContain('About 1 review a day over the next 1 day')
  })

  it('should flag new material finishing after the exam', () => {
    render(
      <StudyForecastPanel
        forecast={{ ...examForecast, newCards: { ...examForecast.newCards, finishOn: '2026-12-25', finishesBeforeExam: false } }}
      />,
    )

    expect(text('new-material')).toContain('after the exam: raise new cards per day')
  })

  it('should say new material is not finishing when the pace is zero', () => {
    render(<StudyForecastPanel forecast={{ ...examForecast, newCards: { ...examForecast.newCards, finishOn: null } }} />)

    expect(text('new-material')).toBe('New material: not at the current pace.')
  })

  it('should explain a pause with the waiting count', () => {
    render(
      <StudyForecastPanel
        forecast={{ ...examForecast, reviews: { ...examForecast.reviews, dueToday: 430 }, newCards: { ...examForecast.newCards, pausedToday: true, pauseThreshold: 400 } }}
      />,
    )

    expect(text('paused')).toBe('New cards paused: 430 reviews waiting (limit 400)')
  })

  it('should prompt when the exam date has passed', () => {
    render(<StudyForecastPanel forecast={{ ...examForecast, examPassed: true, daysLeft: 0 }} />)

    expect(text('passed')).toBe('Exam date passed: set a new date or switch to Long-term.')
  })

  it('should show "No cards yet." for an empty subject', () => {
    render(<StudyForecastPanel forecast={emptyForecast} />)

    expect(text('empty')).toBe('No cards yet.')
    expect(screen.queryByTestId('study-forecast-due-today')).toBeNull()
  })
})
