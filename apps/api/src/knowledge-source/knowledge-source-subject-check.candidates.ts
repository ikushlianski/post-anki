import { collectSubjectSubtreeIds, cosineSimilarity, type SubjectHierarchyRow } from "@post-anki/core";
import type { SubjectKind } from "../subject/subject-kind.js";

export const SUBJECT_CHECK_CANDIDATE_CAP = 15;
export const SUBJECT_CHECK_DESCRIPTION_CHARS = 120;
export const SUBJECT_CHECK_SAMPLE_CHARS = 100;
export const SUBJECT_CHECK_SAMPLE_COUNT = 2;
export const SUBJECT_CHECK_UNEMBEDDED_RESERVE = 3;

export interface SubjectCheckCandidate {
  id: string;
  label: string;
  description: string | null;
  kind: SubjectKind;
  embedding: number[] | null;
  samples: string[];
}

export interface SubjectCheckParent {
  id: string;
  label: string;
}

export function trimToChars(text: string | null, limit: number): string | null {
  const collapsed = (text ?? "").replace(/\s+/g, " ").trim();

  if (collapsed.length === 0) {
    return null;
  }

  return collapsed.length > limit ? collapsed.slice(0, limit).trimEnd() : collapsed;
}

export function buildCandidateSamples(statements: string[]): string[] {
  return statements
    .map((statement) => trimToChars(statement, SUBJECT_CHECK_SAMPLE_CHARS))
    .filter((statement): statement is string => statement !== null)
    .slice(0, SUBJECT_CHECK_SAMPLE_COUNT);
}

export function scopeCandidatesToParent(
  candidates: SubjectCheckCandidate[],
  hierarchy: SubjectHierarchyRow[],
  parentSubjectId: string | undefined,
): SubjectCheckCandidate[] {
  if (!parentSubjectId) {
    return candidates;
  }

  const scope = new Set(collectSubjectSubtreeIds(parentSubjectId, hierarchy));

  return candidates.filter((candidate) => scope.has(candidate.id));
}

function byLabel(a: SubjectCheckCandidate, b: SubjectCheckCandidate): number {
  return a.label.localeCompare(b.label);
}

function hasComparableEmbedding(candidate: SubjectCheckCandidate, query: number[] | null): boolean {
  if (candidate.embedding === null) {
    return false;
  }

  return query === null || candidate.embedding.length === query.length;
}

export function shortlistCandidates(
  candidates: SubjectCheckCandidate[],
  queryEmbedding: number[] | null,
  cap: number = SUBJECT_CHECK_CANDIDATE_CAP,
): SubjectCheckCandidate[] {
  const ordered = [...candidates].sort(byLabel);

  if (ordered.length <= cap) {
    return ordered;
  }

  const query = queryEmbedding && queryEmbedding.length > 0 ? queryEmbedding : null;
  const embedded = ordered.filter((candidate) => hasComparableEmbedding(candidate, query));
  const unembedded = ordered.filter((candidate) => !hasComparableEmbedding(candidate, query));
  const ranked = query
    ? embedded
        .map((candidate) => ({ candidate, score: cosineSimilarity(query, candidate.embedding ?? []) }))
        .sort((a, b) => b.score - a.score || byLabel(a.candidate, b.candidate))
        .map((entry) => entry.candidate)
    : embedded;
  const reserved = Math.min(SUBJECT_CHECK_UNEMBEDDED_RESERVE, unembedded.length);
  const picked = ranked.slice(0, cap - reserved);

  return [...picked, ...unembedded.slice(0, cap - picked.length)];
}
