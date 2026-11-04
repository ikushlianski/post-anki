import {
  APP_STUDY_OPTION_SOURCE,
  STUDY_OPTION_KEYS,
  type StudyOptionKey,
  type StudyOptions,
  type StudyOptionsOverride,
} from "@post-anki/shared";

export const MAX_STUDY_OPTIONS_CHAIN_DEPTH = 20;

export interface StudyOptionsChainLink {
  subjectId: string;
  options: StudyOptionsOverride;
}

export interface StudyOptionsAncestorRow {
  id: string;
  parentId: string | null;
}

export interface ResolvedStudyOptions {
  effective: StudyOptions;
  sources: Record<StudyOptionKey, string>;
}

export function collectSubjectAncestorIds(
  subjectId: string,
  rows: StudyOptionsAncestorRow[],
): string[] {
  const parentById = new Map(rows.map((row) => [row.id, row.parentId]));
  const chain: string[] = [];
  const visited = new Set<string>();
  let cursor: string | null | undefined = subjectId;

  while (
    cursor !== null &&
    cursor !== undefined &&
    parentById.has(cursor) &&
    !visited.has(cursor) &&
    chain.length < MAX_STUDY_OPTIONS_CHAIN_DEPTH
  ) {
    visited.add(cursor);
    chain.push(cursor);
    cursor = parentById.get(cursor);
  }

  return chain;
}

export function resolveStudyOptions(
  chain: StudyOptionsChainLink[],
  appDefaults: StudyOptions,
): ResolvedStudyOptions {
  const effective: StudyOptions = { ...appDefaults };
  const sources = Object.fromEntries(
    STUDY_OPTION_KEYS.map((key) => [key, APP_STUDY_OPTION_SOURCE]),
  ) as Record<StudyOptionKey, string>;

  for (const key of STUDY_OPTION_KEYS) {
    const link = chain.find((candidate) => candidate.options[key] != null);

    if (link) {
      Object.assign(effective, { [key]: link.options[key] });
      sources[key] = link.subjectId;
    }
  }

  return { effective, sources };
}
