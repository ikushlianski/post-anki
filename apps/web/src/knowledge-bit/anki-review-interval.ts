const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MONTH = 30 * DAY

function trimmed(value: number): string {
  return String(Math.round(value * 10) / 10)
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
