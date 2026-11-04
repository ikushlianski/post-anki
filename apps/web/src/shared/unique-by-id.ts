export function uniqueById<T>(rows: readonly T[], key: (row: T) => string): T[] {
  const seen = new Set<string>()
  const result: T[] = []

  for (const row of rows) {
    const id = key(row)

    if (!seen.has(id)) {
      seen.add(id)
      result.push(row)
    }
  }

  return result
}
