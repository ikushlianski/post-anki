import type { StudyForecast } from '@post-anki/shared'
import { plural } from '../shared/plural'

const DAY_MS = 86_400_000

export function formatForecastDay(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${date}T00:00:00Z`))
}

function gapBeforeExam(finishOn: string, examDate: string): string {
  const days = Math.round((Date.parse(examDate) - Date.parse(finishOn)) / DAY_MS)

  return days >= 14 ? `${Math.round(days / 7)} weeks before the exam` : `${plural(days, 'day')} before the exam`
}

function newMaterialLine(forecast: StudyForecast): string {
  const { newCards, examDate } = forecast

  if (newCards.remaining === 0) {
    return 'No new cards waiting.'
  }

  if (newCards.finishOn === null) {
    return 'New material: not at the current pace.'
  }

  const when = `New material done around ${formatForecastDay(newCards.finishOn)}`

  if (newCards.finishesBeforeExam === false) {
    return `${when}, after the exam: raise new cards per day.`
  }

  return newCards.finishesBeforeExam && examDate
    ? `${when}, ${gapBeforeExam(newCards.finishOn, examDate)}.`
    : `${when}.`
}

export function StudyForecastPanel({ forecast }: { forecast: StudyForecast }) {
  const { reviews, newCards } = forecast
  const lines: { id: string; text: string; alert?: boolean }[] = []

  if (forecast.examPassed) {
    lines.push({ id: 'passed', text: 'Exam date passed: set a new date or switch to Long-term.', alert: true })
  } else if (forecast.daysLeft !== null) {
    lines.push({
      id: 'days-left',
      text: `${forecast.daysLeft} ${forecast.daysLeft === 1 ? 'day' : 'days'} left until the exam`,
    })
  }

  if (!forecast.hasCards) {
    lines.push({ id: 'empty', text: 'No cards yet.' })
  } else {
    lines.push({ id: 'due-today', text: `${plural(reviews.dueToday, 'review')} due today` })
    lines.push({
      id: 'per-day',
      text: `About ${plural(Math.round(reviews.averagePerDay), 'review')} a day over the next ${plural(reviews.horizonDays, 'day')}${
        reviews.peakOn ? ` (busiest: ${reviews.peakPerDay} on ${formatForecastDay(reviews.peakOn)})` : ''
      }`,
    })
    lines.push({ id: 'new-material', text: newMaterialLine(forecast) })

    if (newCards.pausedToday) {
      lines.push({
        id: 'paused',
        text: `New cards paused: ${plural(reviews.dueToday, 'review')} waiting (limit ${newCards.pauseThreshold})`,
        alert: true,
      })
    }
  }

  return (
    <section data-testid="study-forecast" className="mt-8">
      <h2 className="text-lg font-semibold tracking-tight">Forecast</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {lines.map((line) => (
          <li
            key={line.id}
            data-testid={`study-forecast-${line.id}`}
            className={line.alert ? 'text-amber-700' : 'text-neutral-700'}
          >
            {line.text}
          </li>
        ))}
      </ul>
    </section>
  )
}
