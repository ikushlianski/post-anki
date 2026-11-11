export interface SubjectPickerRow {
  id: string | null
  label: string
  path: string
  depth: number
}

const PATH_SEPARATOR = ' › '

export function toSubjectPickerRow(id: string | null, path: string): SubjectPickerRow {
  const parts = path.split(PATH_SEPARATOR)

  return { id, label: parts[parts.length - 1] ?? path, path, depth: parts.length - 1 }
}

export function filterSubjectPickerRows(rows: readonly SubjectPickerRow[], query: string): SubjectPickerRow[] {
  const needle = query.trim().toLowerCase()

  if (needle === '') {
    return [...rows]
  }

  return rows.filter((row) => row.label.toLowerCase().includes(needle))
}
