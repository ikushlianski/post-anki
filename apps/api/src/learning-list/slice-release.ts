import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { nextIngestionSlice, QUESTIONS_PER_TOPIC } from "@post-anki/core";
import { confirmCurriculum, getCurriculum, setCurriculumStatus } from "../curriculum/curriculum.repo.js";
import { getDb, type DbExecutor } from "../db/client.js";
import { gaps, learningListItems, modules, topics } from "../db/schema.js";
import { readLivenessStatus } from "../liveness/liveness.repo.js";
import { log } from "../shared/log.js";
import {
  advanceIngestionCursor,
  getLearningListItem,
  touchLearningListItem,
} from "./learning-list.repo.js";
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

// The exhaustion signal `nextIngestionSlice`'s `unansweredCount` needs:
// reuses `gaps.state === "open"` — the same answered/covered notion
// `openGaps`/`gapMaturity` (packages/core/src/curriculum/gap.ts) already
// read everywhere else a gap's answered-ness matters — rather than
// inventing a second one here, scoped to `topics.included = true`, the same
// "currently released to the learner" flag `nextUnreleasedTopicIds` above
// reads the negation of.
//
// Returns a count of *topics*, not raw open gaps, and on purpose treats a
// released topic with NO gap rows at all the same as one with an open gap
// (i.e. still unfinished) rather than the same as fully covered. A
// pre-drafted topic (the `nextUnreleasedTopicIds` branch below) is flipped
// to `included` with its gaps still undiscovered — they surface later,
// live, during study (see `insertDiscoveredGaps` in gap.repo.ts) — so "zero
// open gaps" there means "nothing generated for it yet", not "the learner
// answered everything". Only a topic that has real gaps AND none of them
// are still open counts as finished/exhausted.
async function unfinishedReleasedTopicCount(
  curriculumId: string,
  db: DbExecutor,
): Promise<number> {
  const result = await db.execute<{ topicId: string }>(sql`
    SELECT ${topics.id} AS "topicId"
    FROM ${topics}
    LEFT JOIN ${gaps} ON ${gaps.topicId} = ${topics.id}
    WHERE ${topics.curriculumId} = ${curriculumId} AND ${topics.included} = true
    GROUP BY ${topics.id}
    HAVING count(${gaps.id}) = 0 OR bool_or(${gaps.state} = 'open')
  `);

  return result.rows.length;
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

    // Pacing anchor: post-approval, `updatedAt` is touched by
    // `advanceIngestionCursor` on a successful release and by
    // `touchLearningListItem` on a failed one (see `backOffAfterFailedRelease`
    // below) — both are deliberately "an attempt happened just now", which is
    // exactly what pacing needs to bound. Before the first release,
    // `questionsGenerated` is still 0, which is exactly when this must NOT
    // gate — otherwise the approval-time writes that link the curriculum and
    // reconcile the ceiling, which also bump `updatedAt`, would be mistaken
    // for a prior release and block the very first slice.
    const lastReleasedAt = item.questionsGenerated > 0 ? item.updatedAt.toISOString() : null;
    const unfinishedTopicCount = await unfinishedReleasedTopicCount(item.curriculumId, tx);

    const slice = nextIngestionSlice(
      {
        liveness: status.score,
        questionsAlreadyGenerated: item.questionsGenerated,
        ceiling: item.questionCeiling,
        lastReleasedAt,
        unansweredCount: unfinishedTopicCount,
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

// Pacing reads `updatedAt` as the last-release marker. An exhausted item has
// no unanswered questions left, so the exhaustion exception bypasses pacing on
// every answer — and a generation attempt that throws advances nothing, so
// without this the next answer retries generation immediately, and the one
// after that, indefinitely. Touching the row on failure puts a failed attempt
// back under the same daily bound a successful one gets, so a permanently
// unfetchable part costs one attempt a day rather than one per answer.
async function backOffAfterFailedRelease(itemId: string): Promise<void> {
  try {
    await touchLearningListItem(itemId);
  } catch (err) {
    log.error({ err, itemId }, "learning_list_slice_backoff_failed");
  }
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

    await backOffAfterFailedRelease(itemId);

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
