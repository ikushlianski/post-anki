import { eq } from "drizzle-orm";
import { planSeriesModules, type SeriesPart } from "@post-anki/core";
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

  const [linked] = await Promise.all([
    linkCurriculum(itemId, curriculum.id),
    startLivenessTracking({ entityType: "learning_list_item", entityId: itemId }),
    subSubjectNodeId
      ? insertSuggestedMappings(curriculum.id, [
          { nodeId: subSubjectNodeId, depth: DEFAULT_PLACEMENT_DEPTH },
        ])
      : Promise.resolve([]),
    seedKnownSeriesModules(curriculum.id, claimed),
  ]);

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

// "Known parts" today only ever resolves from a GitHub book's own chapter
// listing (packages/core/src/github-book) — no discoverer is wired up yet
// for any other host (e.g. an AWS guide index's sibling pages). This is the
// one place that host knowledge lives: `planSeriesModules` and everything
// downstream of it (slice-generation.orchestrator.ts) only ever see the
// host-agnostic SeriesPart shape, so a second discoverer slots in here
// later without touching any of that logic.
async function discoverKnownSeriesParts(url: string): Promise<SeriesPart[]> {
  const discovery = await discoverGithubChapters(url);

  return discovery.chapters.map((chapter) => ({ url: chapter.url, title: chapter.title }));
}

// Approving a series with known parts shapes the course like the book
// itself up front: one module per part, in the book's own order, each
// paired with a `sources` row carrying that part's own URL so a later
// slice can fetch and generate from that document alone
// (slice-generation.orchestrator.ts's own module-filling logic). The
// captured item's own chapter already has a source row from
// `createCurriculum`'s `sourcesForItem(claimed)` — matched here by URL and
// re-titled to its derived chapter title rather than duplicated.
//
// A series whose parts aren't known (a single-part discovery result, or no
// discoverer wired up for its host) seeds nothing: generateSliceContent
// then falls back to its original all-source-text "Slice N" behaviour
// exactly as before. Never throws — a discovery hiccup here must not fail
// an approval that already created real content elsewhere.
async function seedKnownSeriesModules(
  curriculumId: string,
  item: LearningListItem,
): Promise<void> {
  if (item.kind === "video" || !item.url) {
    return;
  }

  try {
    const planned = planSeriesModules(await discoverKnownSeriesParts(item.url));

    if (planned.length <= 1) {
      return;
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
  } catch (err) {
    log.error({ err, curriculumId, itemId: item.id }, "learning_list_series_modules_seed_failed");
  }
}
