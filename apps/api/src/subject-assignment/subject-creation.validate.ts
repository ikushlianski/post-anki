import { cosineSimilarity } from "@post-anki/core";
import type { SubjectCreationOutput } from "../mastra/subject-creation.agent.js";
import { sanitizeProposedName } from "../subject-suggestion/subject-suggestion-text.js";
import { normalizeSubjectName } from "../subject-suggestion/subject-suggestion.keys.js";
import {
  SUBJECT_SUGGESTION_MAX_DEPTH,
  SUBJECT_SUGGESTION_MAX_SUBJECT_SIMILARITY,
} from "../subject-suggestion/subject-suggestion.config.js";
import { SUBJECT_CREATION_MIN_EDIT_DISTANCE } from "./subject-creation.config.js";

const ALLOWED_CHARS = /^[\p{L}\p{N} &'\-+.]+$/u;

export interface ExistingSubject {
  id: string;
  name: string;
  parentId: string | null;
  embedding: number[] | null;
}

export interface SubjectCreationContext {
  subjects: ExistingSubject[];
  aliases: Map<string, string>;
  sourceEmbedding: number[] | null;
}

export type SubjectCreationDecision =
  | { create: true; name: string; parentId: string | null }
  | { create: false; reason: string };

function reject(reason: string): SubjectCreationDecision {
  return { create: false, reason };
}

export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_unused, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
    }

    previous = current;
  }

  return previous[b.length]!;
}

function overlapsAsWords(a: string, b: string): boolean {
  return ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `);
}

export function clashesWithExistingName(name: string, subjects: ExistingSubject[], parentId: string | null): boolean {
  const wanted = normalizeSubjectName(name);
  const ordered = [
    ...subjects.filter((subject) => subject.parentId === parentId),
    ...subjects.filter((subject) => subject.parentId !== parentId),
  ];

  return ordered.some((subject) => {
    const existing = normalizeSubjectName(subject.name);

    return (
      existing.length === 0 ||
      overlapsAsWords(wanted, existing) ||
      editDistance(wanted, existing) < SUBJECT_CREATION_MIN_EDIT_DISTANCE
    );
  });
}

export function subjectDepth(subjectId: string, subjects: ExistingSubject[]): number | null {
  const byId = new Map(subjects.map((subject) => [subject.id, subject]));
  let depth = 0;
  let current = byId.get(subjectId);

  while (current) {
    depth += 1;

    if (depth > SUBJECT_SUGGESTION_MAX_DEPTH + 1) {
      return depth;
    }

    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }

  return depth === 0 ? null : depth;
}

function resolveParent(output: SubjectCreationOutput, context: SubjectCreationContext): string | null | undefined {
  if (output.parentAlias === null) {
    return null;
  }

  const parentId = context.aliases.get(output.parentAlias);

  if (parentId === undefined) {
    return undefined;
  }

  const depth = subjectDepth(parentId, context.subjects);

  return depth !== null && depth < SUBJECT_SUGGESTION_MAX_DEPTH ? parentId : undefined;
}

function resemblesExistingContent(context: SubjectCreationContext): boolean {
  const source = context.sourceEmbedding;

  if (source === null) {
    return true;
  }

  return context.subjects.some(
    (subject) =>
      subject.embedding !== null &&
      subject.embedding.length === source.length &&
      cosineSimilarity(source, subject.embedding) >= SUBJECT_SUGGESTION_MAX_SUBJECT_SIMILARITY,
  );
}

export function validateSubjectCreation(
  output: SubjectCreationOutput,
  context: SubjectCreationContext,
): SubjectCreationDecision {
  if (!output.create || output.confidence !== "high") {
    return reject("not_confident");
  }

  const name = sanitizeProposedName(output.name.replace(/\s+/g, " "));

  if (name === null || !ALLOWED_CHARS.test(name)) {
    return reject("bad_name");
  }

  const parentId = resolveParent(output, context);

  if (parentId === undefined) {
    return reject("bad_parent");
  }

  if (clashesWithExistingName(name, context.subjects, parentId)) {
    return reject("duplicate_name");
  }

  if (resemblesExistingContent(context)) {
    return reject("similar_subject_exists");
  }

  return { create: true, name, parentId };
}
