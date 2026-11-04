const PATH_SEPARATOR = ' › '

export function subjectPathOptions(names: Iterable<string | null>): string[] {
  const paths = new Set<string>()

  for (const name of names) {
    if (!name) continue

    const parts = name.split(PATH_SEPARATOR)

    for (let end = 1; end <= parts.length; end += 1) {
      paths.add(parts.slice(0, end).join(PATH_SEPARATOR))
    }
  }

  return [...paths].sort((a, b) => a.localeCompare(b))
}

export function matchesSubjectPath(name: string | null, path: string): boolean {
  return name === path || (name?.startsWith(path + PATH_SEPARATOR) ?? false)
}
