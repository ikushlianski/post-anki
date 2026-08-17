export interface NoteReviewCandidate {
  id: string;
  lastSurfacedAt: string | null;
  createdAt: string;
}

export function selectNoteForReview(
  candidates: NoteReviewCandidate[],
  now: string,
  excludeIds: string[] = [],
): string | null {
  void now;

  const excluded = new Set(excludeIds);
  const eligible = candidates.filter((candidate) => !excluded.has(candidate.id));

  if (eligible.length === 0) {
    return null;
  }

  const sorted = [...eligible].sort((a, b) => {
    const aNeverSurfaced = a.lastSurfacedAt === null;
    const bNeverSurfaced = b.lastSurfacedAt === null;

    if (aNeverSurfaced !== bNeverSurfaced) {
      return aNeverSurfaced ? -1 : 1;
    }

    if (!aNeverSurfaced && !bNeverSurfaced && a.lastSurfacedAt !== b.lastSurfacedAt) {
      return (a.lastSurfacedAt as string) < (b.lastSurfacedAt as string) ? -1 : 1;
    }

    return a.createdAt < b.createdAt ? -1 : 1;
  });

  return sorted[0]!.id;
}
