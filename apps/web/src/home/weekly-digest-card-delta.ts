export function describeDelta(current: number, previous: number): string {
  const diff = current - previous

  if (diff === 0) {
    return 'same as last week'
  }

  return diff > 0 ? `up ${diff} from last week` : `down ${-diff} from last week`
}
