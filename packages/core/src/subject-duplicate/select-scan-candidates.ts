export interface ScanCandidateSubject {
  id: string;
  contentHash: string;
  cachedHash: string | null;
}

export interface SelectSubjectsForScanResult {
  toEmbed: string[];
  reused: string[];
  capped: boolean;
}

// Decision #3 / architecture.md's "Cap bounds the embedding call only":
// the cap here bounds ONLY the paid embedding call (toEmbed) — it never
// shrinks the comparison set. `reused` (subjects whose cached hash already
// matches their current content) is returned in full, uncapped, every time
// — the orchestrator hands BOTH toEmbed (after embedding) and reused to the
// comparison step together. Never-yet-embedded subjects (cachedHash ===
// null) are prioritized first within the cap so backlog coverage converges
// across successive scans instead of permanently starving older subjects
// once the corpus outgrows the cap.
export function selectSubjectsForScan(
  subjects: ScanCandidateSubject[],
  cap: number,
): SelectSubjectsForScanResult {
  const reused: string[] = [];
  const neverEmbedded: string[] = [];
  const stale: string[] = [];

  for (const subject of subjects) {
    if (subject.cachedHash === subject.contentHash) {
      reused.push(subject.id);
    } else if (subject.cachedHash === null) {
      neverEmbedded.push(subject.id);
    } else {
      stale.push(subject.id);
    }
  }

  const eligible = [...neverEmbedded, ...stale];
  const toEmbed = eligible.slice(0, cap);
  const capped = eligible.length > cap;

  return { toEmbed, reused, capped };
}
