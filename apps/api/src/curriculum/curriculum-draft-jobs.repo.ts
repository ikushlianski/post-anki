import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { getDb, type DbExecutor } from "../db/client.js";
import { curricula, curriculumStructureTurns } from "../db/schema.js";
import { ownedBy, ownerPatch } from "./curriculum-job-owner.js";

const DRAFT_FAILED_TURN_MESSAGE = "The mentor couldn't draft a structure for this course.";

async function failPendingTurns(curriculumIds: string[], db: DbExecutor): Promise<void> {
  if (curriculumIds.length === 0) {
    return;
  }

  await db
    .update(curriculumStructureTurns)
    .set({ status: "failed", message: DRAFT_FAILED_TURN_MESSAGE })
    .where(
      and(
        inArray(curriculumStructureTurns.curriculumId, curriculumIds),
        eq(curriculumStructureTurns.role, "assistant"),
        eq(curriculumStructureTurns.status, "pending"),
      ),
    );
}

export async function touchDraftJob(curriculumId: string, ownerToken?: string): Promise<boolean> {
  const rows = await getDb()
    .update(curricula)
    .set({ status: "shaping_structure", researchTouchedAt: new Date(), ...ownerPatch(ownerToken) })
    .where(eq(curricula.id, curriculumId))
    .returning({ id: curricula.id });

  return rows.length > 0;
}

export async function claimDraftJob(curriculumId: string, liveWindowMs: number): Promise<{ liveRunActive: boolean }> {
  return getDb().transaction(async (tx) => {
    const [prev] = await tx
      .select({ touched: curricula.researchTouchedAt, status: curricula.status })
      .from(curricula)
      .where(eq(curricula.id, curriculumId))
      .for("update");

    await tx
      .update(curricula)
      .set({ status: "shaping_structure", researchTouchedAt: new Date() })
      .where(eq(curricula.id, curriculumId));

    const liveRunActive =
      prev?.status === "shaping_structure" &&
      prev.touched !== null &&
      Date.now() - prev.touched.getTime() < liveWindowMs;

    return { liveRunActive };
  });
}

export async function finishDraftJob(curriculumId: string, ownerToken?: string): Promise<void> {
  await getDb()
    .update(curricula)
    .set({ researchTouchedAt: null })
    .where(ownedBy(curriculumId, ownerToken));
}

export async function failDraftJob(curriculumId: string, ownerToken?: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    const rows = await tx
      .update(curricula)
      .set({ status: "failed", researchTouchedAt: null })
      .where(
        and(
          ownedBy(curriculumId, ownerToken),
          inArray(curricula.status, ["shaping_structure", "curating"]),
        ),
      )
      .returning({ id: curricula.id });

    await failPendingTurns(rows.map((r) => r.id), tx);
  });
}

export async function failStaleDraftJobs(olderThanMs: number): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);

  return getDb().transaction(async (tx) => {
    const rows = await tx
      .update(curricula)
      .set({ status: "failed", researchTouchedAt: null })
      .where(
        and(
          eq(curricula.status, "shaping_structure"),
          isNotNull(curricula.researchTouchedAt),
          lt(curricula.researchTouchedAt, cutoff),
        ),
      )
      .returning({ id: curricula.id });

    await failPendingTurns(rows.map((r) => r.id), tx);

    return rows.length;
  });
}
