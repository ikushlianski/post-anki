import {
  collectSubjectAncestorIds,
  resolveStudyOptions,
  resolveStudyPlan,
  type ResolvedStudyOptions,
  type ResolvedStudyPlan,
} from "@post-anki/core";
import type { NewCardOrder, StudyOptions } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { getStudyDefaults } from "../admin-settings/admin-settings.repo.js";
import { listSubjectStudyOptionRows } from "./subject-study-options.repo.js";

export interface StudyOptionsResolver {
  defaults: StudyOptions;
  hasExamSubjects: boolean;
  resolve: (subjectId: string | null) => ResolvedStudyOptions;
  newCardOrderFor: (subjectId: string | null) => NewCardOrder;
  newestFirstSubjectIds: () => string[];
  resolvePlan: (subjectId: string | null) => ResolvedStudyPlan;
}

export async function loadStudyOptionsResolver(db: DbExecutor = getDb()): Promise<StudyOptionsResolver> {
  const [rows, defaults] = await Promise.all([listSubjectStudyOptionRows(db), getStudyDefaults(db)]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const cache = new Map<string, ResolvedStudyOptions>();
  const planCache = new Map<string, ResolvedStudyPlan>();

  const resolveOptions = (subjectId: string | null): ResolvedStudyOptions => {
    if (subjectId === null) {
      return resolveStudyOptions([], defaults);
    }

    const cached = cache.get(subjectId);

    if (cached) {
      return cached;
    }

    const chain = collectSubjectAncestorIds(subjectId, rows).flatMap((id) => {
      const row = byId.get(id);

      return row ? [{ subjectId: id, options: row.options, complexityLevel: row.complexityLevel }] : [];
    });
    const resolved = resolveStudyOptions(chain, defaults);

    cache.set(subjectId, resolved);

    return resolved;
  };

  return {
    defaults,
    hasExamSubjects: rows.some((row) => row.studyIntent === "exam"),
    resolve: resolveOptions,
    newCardOrderFor: (subjectId) => resolveOptions(subjectId).effective.newCardOrder,
    newestFirstSubjectIds: () =>
      rows.filter((row) => resolveOptions(row.id).effective.newCardOrder === "newest-first").map((row) => row.id),
    resolvePlan(subjectId) {
      if (subjectId === null) {
        return resolveStudyPlan([], defaults);
      }

      const cached = planCache.get(subjectId);

      if (cached) {
        return cached;
      }

      const chain = collectSubjectAncestorIds(subjectId, rows).flatMap((id) => {
        const row = byId.get(id);

        return row
          ? [
              {
                subjectId: id,
                options: row.options,
                complexityLevel: row.complexityLevel,
                studyIntent: row.studyIntent,
                examDate: row.examDate,
                examPlannedAt: row.examPlannedAt,
              },
            ]
          : [];
      });
      const resolved = resolveStudyPlan(chain, defaults);

      planCache.set(subjectId, resolved);

      return resolved;
    },
  };
}
