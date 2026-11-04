import { useQuery } from '@tanstack/react-query'
import type { StudyForecast } from '@post-anki/shared'

import { formatForecastDay } from './study-forecast-panel'
import { browserTimeZone, getStudyForecast } from './study-forecast.api'

const COMPACT_DAYS = 5

export function StudyForecastCompact({ forecast }: { forecast: StudyForecast }) {
  const upcoming = forecast.days.slice(1, 1 + COMPACT_DAYS)

  if (!forecast.hasCards || upcoming.length === 0) {
    return null
  }

  const rows = upcoming.filter((day) => day.reviews > 0)

  return (
    <section data-testid="study-forecast-compact" className="flex flex-col gap-1">
      <h2 className="text-sm font-medium">Coming up</h2>
      {rows.length === 0 ? (
        <p data-testid="study-forecast-compact-empty" className="text-sm text-neutral-500">
          Nothing due in the next {upcoming.length} day{upcoming.length === 1 ? '' : 's'}.
        </p>
      ) : (
        <ul className="text-sm text-neutral-600">
          {rows.map((day) => (
            <li key={day.date} data-testid={`study-forecast-compact-${day.date}`}>
              {formatForecastDay(day.date)}: {day.reviews} review{day.reviews === 1 ? '' : 's'}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function SubjectForecastLoader({ subjectId }: { subjectId: string }) {
  const forecast = useQuery({
    queryKey: ['study-forecast', subjectId],
    queryFn: () => getStudyForecast({ data: { subjectId, tz: browserTimeZone() } }),
    retry: false,
  })

  if (!forecast.data) {
    return null
  }

  return <StudyForecastCompact forecast={forecast.data} />
}
