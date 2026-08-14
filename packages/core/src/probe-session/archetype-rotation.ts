import { ARCHETYPE_CANONICAL_ORDER, type Archetype } from "@post-anki/shared";

export type ArchetypeLastUsedAt = Record<Archetype, string | null>;

export function zeroArchetypeLastUsedAt(): ArchetypeLastUsedAt {
  return Object.fromEntries(
    ARCHETYPE_CANONICAL_ORDER.map((a) => [a, null]),
  ) as ArchetypeLastUsedAt;
}

// Falls back to the full canonical set when the model's classification came
// back empty (agent error / malformed output) — least-restrictive failure
// mode, matching probe.service.ts's own fallbackQuestion precedent of
// degrading gracefully rather than blocking generation.
export function normalizeApplicableArchetypes(raw: Archetype[]): Archetype[] {
  const deduped = Array.from(new Set(raw));

  return deduped.length > 0 ? deduped : [...ARCHETYPE_CANONICAL_ORDER];
}

/**
 * Deterministic LRU selection over the applicable subset.
 *
 * - A single-item subset short-circuits: the exclusion rule is suspended
 *   (issue #36's own "single-applicable-archetype" edge case) — that one
 *   archetype is always returned.
 * - Otherwise: the candidate with the maximum non-null lastUsedAt timestamp
 *   is excluded (the "most recently used" rule). Full timestamp comparison,
 *   NOT calendar-date truncation — truncating to a date would let canonical
 *   order override genuine same-day recency (an archetype used an hour ago
 *   would tie with one used that morning). "Same date" in the issue text is
 *   read as "identical stored value" — realistically only ever true for two
 *   never-used (null) candidates.
 * - Among the remaining candidates, the smallest recency key wins — null
 *   (never used) sorts before any real timestamp. Ties (all-null, including
 *   the whole-subset first-session case, or an exact-timestamp tie) break by
 *   canonical order, earliest wins. This single rule covers BOTH of the
 *   issue's named tiebreak situations (first session, LRU tie) without a
 *   special case for either.
 */
export function selectArchetype(
  applicable: Archetype[],
  lastUsedAt: ArchetypeLastUsedAt,
): Archetype {
  if (applicable.length === 1) {
    return applicable[0]!;
  }

  const byCanonicalOrder = (a: Archetype, b: Archetype) =>
    ARCHETYPE_CANONICAL_ORDER.indexOf(a) - ARCHETYPE_CANONICAL_ORDER.indexOf(b);

  const withTimestamps = applicable
    .map((a) => ({ a, t: lastUsedAt[a] ?? null }))
    .sort((x, y) => {
      if (x.t === y.t) return byCanonicalOrder(x.a, y.a);
      if (x.t === null) return -1;
      if (y.t === null) return 1;
      return x.t < y.t ? -1 : 1;
    });

  const mostRecent = withTimestamps[withTimestamps.length - 1]!;
  const hasRealMostRecent = mostRecent.t !== null;
  const pool = hasRealMostRecent
    ? withTimestamps.filter((x) => x.a !== mostRecent.a)
    : withTimestamps;

  return pool[0]!.a;
}
