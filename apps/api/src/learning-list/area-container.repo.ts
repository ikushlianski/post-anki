import { and, eq } from "drizzle-orm";
import type { Curriculum } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { curricula } from "../db/schema.js";
import { createCurriculum, getCurriculum } from "../curriculum/curriculum.repo.js";

const POSTGRES_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  );
}

export interface AreaContainerParams {
  subjectId: string;
  areaNodeId: string;
  areaName: string;
}

export type FindOrCreateAreaContainerError = "subject_not_found";

async function getAreaContainer(
  subjectId: string,
  areaNodeId: string,
): Promise<Curriculum | null> {
  const row = (
    await getDb()
      .select({ id: curricula.id })
      .from(curricula)
      .where(and(eq(curricula.subjectId, subjectId), eq(curricula.containerAreaNodeId, areaNodeId)))
      .limit(1)
  )[0];

  return row ? getCurriculum(row.id) : null;
}

// learning-list-fold-in — resolves the ONE implicit catch-all curriculum for
// a (subject, Area) pair, creating it on first use. Pre-check-free create
// attempt whose real duplicate guard is curricula_container_area_node_id_
// unique (schema.ts) — mirrors milestone.repo.ts's awardIfNew precedent: a
// losing concurrent create's 23505 is caught here and resolved by re-reading
// the winner that committed first, never surfaced as an error and never a
// second container for the same Area. The cheap SELECT-first path above is
// what makes every fold-in AFTER the first one avoid the create attempt
// entirely, the same "cheap for the common case" reasoning
// evaluateAndAwardMilestones documents for its own pre-filter.
export async function findOrCreateAreaContainer(
  params: AreaContainerParams,
): Promise<Curriculum | { error: FindOrCreateAreaContainerError }> {
  const existing = await getAreaContainer(params.subjectId, params.areaNodeId);

  if (existing) {
    return existing;
  }

  try {
    // No categoryId is ever passed here, so createCurriculum's
    // "category_wrong_subject" outcome (subject-category-nesting) can never
    // actually occur on this path — narrowed away rather than widening this
    // function's own error union for an outcome it cannot produce.
    const created = await createCurriculum({
      subjectId: params.subjectId,
      name: params.areaName,
      sources: [],
      containerAreaNodeId: params.areaNodeId,
    });

    if ("error" in created && created.error === "category_wrong_subject") {
      throw new Error("unreachable: findOrCreateAreaContainer never sets categoryId");
    }

    return created as Curriculum | { error: FindOrCreateAreaContainerError };
  } catch (err) {
    if (isUniqueViolation(err)) {
      const winner = await getAreaContainer(params.subjectId, params.areaNodeId);

      if (winner) {
        return winner;
      }
    }

    throw err;
  }
}
