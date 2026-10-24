export function resolveCardSubjectId(card: { subjectId?: string | null } | null): string | null {
  return card?.subjectId ?? null
}
