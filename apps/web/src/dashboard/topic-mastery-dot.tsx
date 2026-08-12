function getBgClass(percent: number): string {
  if (percent <= 0) {
    return 'bg-rose-100'
  }
  if (percent <= 25) {
    return 'bg-emerald-50'
  }
  if (percent <= 50) {
    return 'bg-emerald-200'
  }
  if (percent <= 75) {
    return 'bg-emerald-400'
  }
  if (percent < 100) {
    return 'bg-emerald-500'
  }
  return 'bg-emerald-700'
}

export function TopicMasteryDot({ maturity }: { maturity: number }) {
  return (
    <div
      className={`h-2 w-2 rounded-full shrink-0 border ${getBgClass(maturity)}`}
    />
  )
}
