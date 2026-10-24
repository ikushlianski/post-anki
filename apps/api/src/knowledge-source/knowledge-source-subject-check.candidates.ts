import { collectSubjectSubtreeIds, cosineSimilarity, type SubjectHierarchyRow } from "@post-anki/core";
import type { SubjectKind } from "../subject/subject-kind.js";

export const SUBJECT_CHECK_CANDIDATE_CAP = 15;
export const SUBJECT_CHECK_DESCRIPTION_CHARS = 120;
export const SUBJECT_CHECK_SAMPLE_CHARS = 100;
export const SUBJECT_CHECK_SAMPLE_COUNT = 2;

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

function hasComparableEmbedding(candidate: SubjectCheckCandidate, query: number[]): boolean {
  return candidate.embedding !== null && candidate.embedding.length === query.length;
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

  if (!queryEmbedding || queryEmbedding.length === 0) {
    return ordered.slice(0, cap);
  }

  const embedded = ordered
    .filter((candidate) => hasComparableEmbedding(candidate, queryEmbedding))
    .map((candidate) => ({ candidate, score: cosineSimilarity(queryEmbedding, candidate.embedding ?? []) }))
    .sort((a, b) => b.score - a.score || byLabel(a.candidate, b.candidate))
    .map((entry) => entry.candidate);
  const unembedded = ordered.filter((candidate) => !hasComparableEmbedding(candidate, queryEmbedding));

  return [...embedded, ...unembedded].slice(0, cap);
}
