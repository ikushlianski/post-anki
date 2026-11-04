const DEFAULT_SUBJECT_KIND = 'architecture-mentor'

export function subjectKindBadge(kind: string | null | undefined): string | null {
  if (!kind || kind === DEFAULT_SUBJECT_KIND) {
    return null
  }

  if (kind === 'language-practice') {
    return 'Language practice'
  }

  const words = kind.replace(/[-_]/g, ' ')

  return words ? words.charAt(0).toUpperCase() + words.slice(1) : null
}
