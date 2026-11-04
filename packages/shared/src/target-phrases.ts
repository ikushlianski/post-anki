import { z } from "zod";

export const TARGET_PHRASES_MAX = 5;
export const TARGET_PHRASE_MAX_CHARS = 200;

export const targetPhrasesSchema = z
  .array(z.string().trim().min(1).max(TARGET_PHRASE_MAX_CHARS))
  .max(TARGET_PHRASES_MAX);

export function normalizeTargetPhrases(list: readonly string[] | null | undefined): string[] | null {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of list ?? []) {
    const phrase = entry.trim();
    const key = phrase.toLowerCase();

    if (phrase.length === 0 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(phrase);
  }

  return result.length === 0 ? null : result;
}

interface SubjectNode {
  id: string;
  name: string;
  parentId: string | null;
}

export function isEnglishSubject(
  subjectId: string | null | undefined,
  subjects: readonly SubjectNode[],
): boolean {
  if (!subjectId) {
    return false;
  }

  const byId = new Map(subjects.map((subject) => [subject.id, subject]));
  const visited = new Set<string>();
  let current = byId.get(subjectId);

  while (current) {
    if (visited.has(current.id)) {
      return false;
    }

    visited.add(current.id);

    if (current.parentId === null) {
      return current.name.trim().toLowerCase() === "english";
    }

    current = byId.get(current.parentId);
  }

  return false;
}
