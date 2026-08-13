import { eq } from "drizzle-orm";
import {
  planQuestionCeiling,
  planSeriesModules,
  resolveKnownSeriesParts,
  type SeriesPart,
} from "@post-anki/core";
import type {
  LearningListItem,
  LearningListRecommendation,
  NudgeResponse,
  LivenessStatus,
} from "@post-anki/shared";
import { resolveSourceMergeAction } from "../curriculum/curriculum-rules.js";
import { mergeSourcesIntoCurriculum } from "../curriculum/curriculum-parse.orchestrator.js";
import {
  createCurriculum,
  getCurriculum,
  getCurriculumSourceRows,
  insertPendingSources,
  setCurriculumConcern,
} from "../curriculum/curriculum.repo.js";
import { triggerCurriculumDomainMapping } from "../curriculum-domain-mapping/curriculum-domain-mapping.orchestrator.js";
import { insertSuggestedMappings } from "../curriculum-domain-mapping/curriculum-domain-mapping.repo.js";
import { getDb } from "../db/client.js";
import { modules, sources } from "../db/schema.js";
import { discoverGithubChapters } from "./github-chapters.js";
import { recordNudgeResponse, startLivenessTracking } from "../liveness/liveness.repo.js";
import { newId } from "../shared/id.js";
import { log } from "../shared/log.js";
import { approveFoldInRecommendation } from "./learning-list-fold-in.orchestrator.js";
import {
  DEFAULT_PLACEMENT_DEPTH,
  sourcesForItem,
  type ApprovedRecommendation,
  type ResolveRecommendationError,
} from "./learning-list-approval-shared.js";
import {
  claimRecommendation,
  getLearningListItem,
  linkCurriculum,
  releaseRecommendationClaim,
  setQuestionCeiling,
} from "./learning-list.repo.js";
import { releaseNextSliceSafely } from "./slice-release.js";

export type { ApprovedRecommendation, ResolveRecommendationError };

export async function approveRecommendation(
  itemId: string,
): Promise<ApprovedRecommendation | { error: ResolveRecommendationError }> {
  const existing = await getLearningListItem(itemId);

  if (!existing) {
    return { error: "not_found" as const };
  }

  const recommendation = existing.recommendation;

  if (
    !recommendation ||
    (recommendation.destination !== "mini_course" &&
      recommendation.destination !== "extend_curriculum" &&
      recommendation.destination !== "fold_in")
  ) {
    return { error: "not_awaiting_decision" as const };
  }

  const claimed = await claimRecommendation(itemId, "course_created");

  if ("error" in claimed) {
    return { error: claimed.error };
  }

  if (recommendation.destination === "extend_curriculum") {
    return approveExtendRecommendation(itemId, claimed, recommendation);
  }

  if (recommendation.destination === "fold_in") {
    return approveFoldInRecommendation(itemId, claimed, recommendation);
  }

  return approveMiniCourseRecommendation(itemId, claimed, recommendation);
}

async function approveMiniCourseRecommendation(
  itemId: string,
  claimed: LearningListItem,
  recommendation: LearningListRecommendation,
): Promise<ApprovedRecommendation | { error: ResolveRecommendationError }> {
  const curriculum = await createCurriculum({
    subjectId: recommendation.subjectId,
    name: claimed.title ?? claimed.url ?? "Captured series",
    sources: sourcesForItem(claimed),
  });

  if ("error" in curriculum) {
    await releaseRecommendationClaim(itemId);

    return { error: "subject_not_found" as const };
  }

  if (recommendation.concern !== null) {
    await setCurriculumConcern(curriculum.id, recommendation.concern);
  }

  const subSubjectNodeId = recommendation.subSubjectNodeId;

  const [linked, , , seededPartCount] = await Promise.all([
    linkCurriculum(itemId, curriculum.id),
    startLivenessTracking({ entityType: "learning_list_item", entityId: itemId }),
    subSubjectNodeId
      ? insertSuggestedMappings(curriculum.id, [
          { nodeId: subSubjectNodeId, depth: DEFAULT_PLACEMENT_DEPTH },
        ])
      : Promise.resolve([]),
    seedKnownSeriesModules(curriculum.id, claimed),
  ]);

  await reconcileCeilingToSeededParts(itemId, claimed, seededPartCount);

  await Promise.all([suggestDomainMappings(curriculum.id), releaseNextSliceSafely(itemId)]);

  log.info({ itemId, curriculumId: curriculum.id }, "learning_list_mini_course_approved");

  return { item: linked ?? claimed, curriculumId: curriculum.id };
}

async function approveExtendRecommendation(
  itemId: string,
  claimed: LearningListItem,
  recommendation: LearningListRecommendation,
): Promise<ApprovedRecommendation | { error: ResolveRecommendationError }> {
  const existingCurriculumId = recommendation.existingCurriculumMatch?.curriculumId ?? null;
  const target = existingCurriculumId ? await getCurriculum(existingCurriculumId) : null;

  if (!existingCurriculumId || !target) {
    await releaseRecommendationClaim(itemId);

    return { error: "extend_target_missing" as const };
  }

  const action = resolveSourceMergeAction(target.status);

  if (action === "blocked_by_shaping") {
    await releaseRecommendationClaim(itemId);

    return { error: "extend_target_busy" as const };
  }

  const [linked] = await Promise.all([
    linkCurriculum(itemId, existingCurriculumId),
    startLivenessTracking({ entityType: "learning_list_item", entityId: itemId }),
  ]);

  const drafts = sourcesForItem(claimed);

  if (action === "queue_for_approval") {
    await insertPendingSources(
      existingCurriculumId,
      drafts.map((s) => ({
        kind: s.kind,
        url: s.value,
        title: s.title ?? s.value,
        fetchedText: null,
      })),
    );
  } else {
    void mergeSourcesIntoCurriculum(existingCurriculumId, drafts).catch((err) =>
      log.error(
        { err, itemId, curriculumId: existingCurriculumId },
        "learning_list_extend_merge_failed",
      ),
    );
  }

  await releaseNextSliceSafely(itemId);

  log.info(
    { itemId, curriculumId: existingCurriculumId },
    "learning_list_extended_existing_curriculum",
  );

  return { item: linked ?? claimed, curriculumId: existingCurriculumId };
}

export async function declineRecommendation(
  itemId: string,
): Promise<LearningListItem | { error: ResolveRecommendationError }> {
  const claimed = await claimRecommendation(itemId, "declined");

  if ("error" in claimed) {
    return { error: claimed.error };
  }

  return claimed;
}

export type RespondToNudgeError = "not_found" | "not_tracked";

export async function respondToLearningListNudge(
  itemId: string,
  response: NudgeResponse,
): Promise<LivenessStatus | { error: RespondToNudgeError }> {
  const item = await getLearningListItem(itemId);

  if (!item) {
    return { error: "not_found" as const };
  }

  const result = await recordNudgeResponse(
    { entityType: "learning_list_item", entityId: itemId },
    response,
  );

  if ("error" in result) {
    return { error: "not_tracked" as const };
  }

  return result;
}

async function suggestDomainMappings(curriculumId: string): Promise<void> {
  try {
    await triggerCurriculumDomainMapping(curriculumId);
  } catch (err) {
    log.error({ err, curriculumId }, "learning_list_domain_mapping_failed");
  }
}

// GitHub's own chapter listing is the one host-specific discoverer wired up
// today (packages/core/src/github-book); planSeriesModules and everything
// downstream only ever see the host-agnostic SeriesPart shape.
async function discoverGithubSeriesParts(url: string): Promise<SeriesPart[]> {
  const discovery = await discoverGithubChapters(url);

  return discovery.chapters.map((chapter) => ({ url: chapter.url, title: chapter.title }));
}

// Shapes the course like the book itself up front: one module per known
// part, in book order, each paired with a `sources` row carrying that
// part's own URL for slice-generation.orchestrator.ts to fill from later.
// The captured item's own source row (`createCurriculum`'s
// `sourcesForItem(claimed)`) is matched by URL and re-titled, not duplicated.
//
// `resolveKnownSeriesParts` (packages/core) prefers a fresh GitHub discovery
// (re-run here, not trusted from classification time) over the sibling URLs
// already safety-validated and persisted on the recommendation. Neither
// present means nothing seeds — generateSliceContent falls back to its
// original all-source-text "Slice N" path. Never throws: a discovery hiccup
// must not fail an approval that already created real content elsewhere.
async function seedKnownSeriesModules(
  curriculumId: string,
  item: LearningListItem,
): Promise<number> {
  if (item.kind === "video" || !item.url) {
    return 0;
  }

  try {
    const discoveredChapters = await discoverGithubSeriesParts(item.url);
    const parts = resolveKnownSeriesParts({
      discoveredChapters,
      siblingUrls: item.recommendation?.siblingUrls ?? [],
      capturedUrl: item.url,
      capturedTitle: item.title,
    });
    const planned = planSeriesModules(parts);

    if (planned.length <= 1) {
      return 0;
    }

    const existingByUrl = new Map(
      (await getCurriculumSourceRows(curriculumId)).map((source) => [source.value, source]),
    );

    await getDb().transaction(async (tx) => {
      for (const part of planned) {
        const existing = existingByUrl.get(part.url);

        if (existing) {
          await tx.update(sources).set({ title: part.title }).where(eq(sources.id, existing.id));
        } else {
          await tx.insert(sources).values({
            id: newId("src"),
            curriculumId,
            kind: "link",
            value: part.url,
            title: part.title,
          });
        }

        await tx.insert(modules).values({
          id: newId("mod"),
          curriculumId,
          title: part.title,
          order: part.order,
        });
      }
    });

    log.info({ curriculumId, parts: planned.length }, "learning_list_series_modules_seeded");

    return planned.length;
  } catch (err) {
    log.error({ err, curriculumId, itemId: item.id }, "learning_list_series_modules_seed_failed");

    return 0;
  }
}

// The ceiling is planned at classification time, but the modules are seeded
// at approval time from a fresh discovery — a listing that was rate-limited
// or capped at capture can succeed later, and vice versa. Left alone, the
// course would promise N modules while the budget only funded M. The seeded
// count is the one that matches what the learner can actually see, so it
// wins. Never lowers a ceiling: shrinking it after questions were already
// generated would strand content the learner has, and planQuestionCeiling
// only ever raises for known parts anyway.
async function reconcileCeilingToSeededParts(
  itemId: string,
  item: LearningListItem,
  seededPartCount: number,
): Promise<void> {
  const verdict = item.recommendation?.verdict ?? null;

  if (verdict === null || seededPartCount <= 0) {
    return;
  }

  const reconciled = planQuestionCeiling(
    verdict,
    item.recommendation?.partCount ?? seededPartCount,
    seededPartCount,
  );

  const current = item.questionCeiling ?? 0;

  if (reconciled <= current) {
    return;
  }

  await setQuestionCeiling(itemId, reconciled);

  log.info(
    { itemId, from: current, to: reconciled, seededPartCount },
    "learning_list_question_ceiling_reconciled",
  );
}
