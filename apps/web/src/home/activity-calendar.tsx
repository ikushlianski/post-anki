import type { StudyOverviewActivityDay } from '@post-anki/shared'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`)
}

export function describeActivityDay(day: StudyOverviewActivityDay): string {
  const parsed = parseDate(day.date)
  const label = `${WEEKDAYS[parsed.getUTCDay()]} ${parsed.getUTCDate()} ${MONTHS[parsed.getUTCMonth()]}`
  const noun = day.count === 1 ? 'review' : 'reviews'

  return `${day.count} ${noun} on ${label}`
}

function shade(count: number): string {
  if (count === 0) {
    return 'bg-neutral-100'
  }

  if (count < 5) {
    return 'bg-green-200'
  }

  if (count < 10) {
    return 'bg-green-400'
  }

  if (count < 20) {
    return 'bg-green-600'
  }

  return 'bg-green-800'
}

function leadingBlanks(firstDate: string): number {
  return (parseDate(firstDate).getUTCDay() + 6) % 7
}

export function ActivityCalendar({ activity }: { activity: StudyOverviewActivityDay[] }) {
  if (activity.length === 0) {
    return null
  }

  const total = activity.reduce((sum, day) => sum + day.count, 0)
  const lastIndex = activity.length - 1

  return (
    <div data-testid="activity-calendar">
      <p className="sr-only">
        {total} reviews in the last {activity.length} days
      </p>
      <ul className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: leadingBlanks(activity[0]!.date) }, (_, index) => (
          <li key={`blank-${index}`} aria-hidden="true" className="aspect-square" />
        ))}
        {activity.map((day, index) => {
          const label = describeActivityDay(day)

          return (
            <li
              key={day.date}
              data-testid="activity-day"
              data-date={day.date}
              data-count={day.count}
              aria-label={label}
              title={label}
              className={`aspect-square rounded-sm ${shade(day.count)} ${
                index === lastIndex ? 'ring-2 ring-neutral-900 ring-offset-1' : ''
              }`}
            />
          )
        })}
      </ul>
    </div>
  )
}
