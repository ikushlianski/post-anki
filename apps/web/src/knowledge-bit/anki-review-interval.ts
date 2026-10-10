const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MONTH = 30 * DAY

function trimmed(value: number): string {
  return String(Math.round(value * 10) / 10)
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`
}

export function describeIntervalSeconds(seconds: number): string {
  if (seconds < MINUTE) {
    return 'less than a minute'
  }

  if (seconds < HOUR) {
    return plural(Math.round(seconds / MINUTE), 'minute')
  }

  if (seconds < DAY) {
    return plural(Math.round(seconds / HOUR), 'hour')
  }

  if (seconds < MONTH) {
    return plural(Math.round(seconds / DAY), 'day')
  }

  return plural(Number(trimmed(seconds / MONTH)), 'month')
}

export function formatIntervalSeconds(seconds: number): string {
  if (seconds < MINUTE) {
    return '<1m'
  }

  if (seconds < HOUR) {
    return `${Math.round(seconds / MINUTE)}m`
  }

  if (seconds < DAY) {
    return `${Math.round(seconds / HOUR)}h`
  }

  if (seconds < MONTH) {
    return `${Math.round(seconds / DAY)}d`
  }

  return `${trimmed(seconds / MONTH)}mo`
}
