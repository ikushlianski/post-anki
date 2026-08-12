import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { nextIngestionSlice, QUESTIONS_PER_TOPIC } from "@post-anki/core";
import { confirmCurriculum, getCurriculum, setCurriculumStatus } from "../curriculum/curriculum.repo.js";
import { getDb, type DbExecutor } from "../db/client.js";
import { learningListItems, modules, topics } from "../db/schema.js";
import { readLivenessStatus } from "../liveness/liveness.repo.js";
import { log } from "../shared/log.js";
import { advanceIngestionCursor, getLearningListItem } from "./learning-list.repo.js";
import { generateSliceContent, type ReleasedSlice, type SliceGenerationRequest } from "./slice-generation.orchestrator.js";

// The only two destinations that ever spawn or fold into a curriculum this
// module itself owns outright (a brand-new mini-course, or a fold-in Area
// container — see `confirmLearningListCurriculum`'s own comment). Read off
// the item's own `recommendation.destination` rather than trusted-by-caller,
// so this stays correct regardless of which caller triggered the release —
// the two approval orchestrators today, `answer-activity.ts`'s post-answer
// re-release tomorrow, or any future trigger — without each one having to
// remember to opt in.
const CONFIRMABLE_DESTINATIONS = new Set(["mini_course", "fold_in"]);

export type { ReleasedSlice };

// NULL and "queued" both mean "still releasable" (see topic-progress.repo.ts's
// TopicReleaseState); only "declined" excludes a topic. `!= 'declined'` would
// silently drop every NULL row too (SQL: NULL != 'declined' is NULL, not
// true), which is exactly the bug this predicate exists to avoid — hence
// `IS DISTINCT FROM`.
async function nextUnreleasedTopicIds(
  curriculumId: string,
  limit: number,
  db: DbExecutor,
): Promise<string[]> {
  const rows = await db
    .select({ id: topics.id })
    .from(topics)
    .innerJoin(modules, eq(topics.moduleId, modules.id))
    .where(
      and(
        eq(topics.curriculumId, curriculumId),
        eq(topics.included, false),
        sql`${topics.releaseState} IS DISTINCT FROM 'declined'`,
      ),
    )
    .orderBy(asc(modules.order), asc(topics.order))
    .limit(limit);

  return rows.map((row) => row.id);
}

type SliceDecision =
  | { kind: "released"; result: ReleasedSlice }
  | { kind: "needs_generation"; request: SliceGenerationRequest };

// A short, read-mostly transaction: decides whether anything can release at
// all (liveness, ceiling, pacing), and — only when pre-drafted topics
// already exist for this curriculum (the ordinary, non-learning-list
// `confirmStructure` flow; see topics.releaseState's schema comment) —
// flips them and commits within this same lock. When nothing is pre-drafted
// (every learning-list mini-course today), it commits with no writes and
// hands the caller a generation request instead — deliberately never
// holding this transaction across the LLM call generation requires (see
// slice-generation.orchestrator.ts's own comment).
async function decideSlice(itemId: string, now: string): Promise<SliceDecision | null> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${itemId})::bigint)`);

    const item = (
      await tx.select().from(learningListItems).where(eq(learningListItems.id, itemId)).limit(1)
    )[0];

    if (!item || item.curriculumId === null || item.questionCeiling === null) {
      return null;
    }

    const status = await readLivenessStatus(
      { entityType: "learning_list_item", entityId: itemId },
      now,
      tx,
    );

    if (!status.generationAllowed) {
      return null;
    }

    // Pacing anchor: `updatedAt` is only ever touched, post-approval, by
    // `advanceIngestionCursor` (see learning-list.repo.ts) — so once a slice
    // has actually been released, it reliably reflects that release's
    // timestamp. Before the first release, `questionsGenerated` is still 0,
    // which is exactly when this must NOT gate — otherwise the approval-time
    // write that links the curriculum (`linkCurriculum`, which also bumps
    // `updatedAt`) would be mistaken for a prior release and block the very
    // first slice.
    const lastReleasedAt = item.questionsGenerated > 0 ? item.updatedAt.toISOString() : null;

    const slice = nextIngestionSlice(
      {
        liveness: status.score,
        questionsAlreadyGenerated: item.questionsGenerated,
        ceiling: item.questionCeiling,
        lastReleasedAt,
      },
      now,
    );

    if (slice === null) {
      return null;
    }

    const topicIds = await nextUnreleasedTopicIds(item.curriculumId, slice.topicCount, tx);

    if (topicIds.length === 0) {
      return {
        kind: "needs_generation",
        request: {
          curriculumId: item.curriculumId,
          topicCount: slice.topicCount,
          questionCount: slice.questionCount,
        },
      };
    }

    await tx.update(topics).set({ included: true }).where(inArray(topics.id, topicIds));

    // This branch flips PRE-DRAFTED topics whose own gaps get discovered
    // later, live, during study (`insertDiscoveredGaps` — see gap.repo.ts) —
    // there is no real gap count to read here yet. `slice.questionCount`
    // (already clamped to the ceiling's remaining budget by
    // `nextIngestionSlice`) is this branch's own planned capacity, not
    // untrusted model output, so advancing by it is not the "intent, never
    // actual" problem 0.9 is about — that guarantee applies to the
    // generation branch below, which writes real gap rows and advances by
    // exactly how many it wrote.
    const questionsGenerated = Math.min(slice.questionCount, topicIds.length * QUESTIONS_PER_TOPIC);

    await advanceIngestionCursor(itemId, item.questionsGenerated + questionsGenerated, now, tx);

    return { kind: "released", result: { itemId, topicIds, questionsGenerated } };
  });
}

export async function releaseNextSlice(
  itemId: string,
  now: string = new Date().toISOString(),
): Promise<ReleasedSlice | null> {
  const decision = await decideSlice(itemId, now);

  if (decision === null) {
    return null;
  }

  if (decision.kind === "released") {
    return decision.result;
  }

  return generateSliceContent(itemId, decision.request, now);
}

export async function releaseNextSliceSafely(
  itemId: string,
  now: string = new Date().toISOString(),
): Promise<ReleasedSlice | null> {
  let released: ReleasedSlice | null;

  try {
    released = await releaseNextSlice(itemId, now);

    if (released) {
      log.info(
        { itemId, topics: released.topicIds.length, questions: released.questionsGenerated },
        "learning_list_slice_released",
      );
    }
  } catch (err) {
    log.error({ err, itemId }, "learning_list_slice_release_failed");

    return null;
  }

  // Deliberately outside the try/catch above: real content was just
  // committed, so `released` is the true outcome of this call regardless of
  // what happens next. `confirmIfLearningListOwned` never throws, but this
  // ordering keeps that guarantee even if it someday did — a caller must
  // never see a successful release reported as a failure because the
  // curriculum's status update ran into trouble.
  if (released) {
    await confirmIfLearningListOwned(itemId);
  }

  return released;
}

async function confirmIfLearningListOwned(itemId: string): Promise<void> {
  try {
    const item = await getLearningListItem(itemId);
    const destination = item?.recommendation?.destination;

    if (!item || item.curriculumId === null || !destination || !CONFIRMABLE_DESTINATIONS.has(destination)) {
      return;
    }

    await confirmLearningListCurriculum(item.curriculumId);
  } catch (err) {
    log.error({ err, itemId }, "learning_list_curriculum_confirm_lookup_failed");
  }
}

// Reuses `setCurriculumStatus`/`confirmCurriculum` rather than writing
// `status` directly, so `confirmCurriculum`'s `hasStudyableContent` check
// still gates the transition. Never throws: a caller just wrote real
// content for the learner, and a confirmation failure must not undo that.
async function confirmLearningListCurriculum(curriculumId: string): Promise<void> {
  try {
    const curriculum = await getCurriculum(curriculumId);

    if (!curriculum || curriculum.status === "confirmed") {
      return;
    }

    if (curriculum.status !== "ready") {
      await setCurriculumStatus(curriculumId, "ready");
    }

    const result = await confirmCurriculum(curriculumId);

    if (typeof result === "string") {
      log.error({ curriculumId, result }, "learning_list_curriculum_confirm_failed");
    }
  } catch (err) {
    log.error({ err, curriculumId }, "learning_list_curriculum_confirm_failed");
  }
}
