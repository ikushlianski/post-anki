import type { SubjectSuggestionKind } from "@post-anki/shared";

export function normalizeSubjectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildDedupeKey(
  kind: SubjectSuggestionKind,
  parentId: string | null,
  name: string,
): string {
  return `${kind}:${parentId ?? "root"}:${normalizeSubjectName(name)}`;
}
