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
  insertPendingSources,
  setCurriculumConcern,
} from "../curriculum/curriculum.repo.js";
import { triggerCurriculumDomainMapping } from "../curriculum-domain-mapping/curriculum-domain-mapping.orchestrator.js";
import { insertSuggestedMappings } from "../curriculum-domain-mapping/curriculum-domain-mapping.repo.js";
import { recordNudgeResponse, startLivenessTracking } from "../liveness/liveness.repo.js";
import { log } from "../shared/log.js";
import {
  claimRecommendation,
  getLearningListItem,
  linkCurriculum,
  releaseRecommendationClaim,
} from "./learning-list.repo.js";
import { releaseNextSliceSafely } from "./slice-release.js";

export type ResolveRecommendationError =
  | "not_found"
  | "not_awaiting_decision"
  | "subject_not_found"
  | "extend_target_missing"
  | "extend_target_busy";

export interface ApprovedRecommendation {
  item: LearningListItem;
  curriculumId: string;
}

const DEFAULT_PLACEMENT_DEPTH = "working" as const;

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
      recommendation.destination !== "extend_curriculum")
  ) {
    return { error: "not_awaiting_decision" as const };
  }

  const claimed = await claimRecommendation(itemId, "course_created");

  if ("error" in claimed) {
    return { error: claimed.error };
  }

  return recommendation.destination === "extend_curriculum"
    ? approveExtendRecommendation(itemId, claimed, recommendation)
    : approveMiniCourseRecommendation(itemId, claimed, recommendation);
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

function sourcesForItem(item: LearningListItem) {
  if (item.kind === "video") {
    return item.rawText
      ? [{ kind: "text" as const, value: item.rawText, title: item.title ?? undefined }]
      : [];
  }

  return item.url
    ? [{ kind: "link" as const, value: item.url, title: item.title ?? undefined }]
    : [];
}

async function suggestDomainMappings(curriculumId: string): Promise<void> {
  try {
    await triggerCurriculumDomainMapping(curriculumId);
  } catch (err) {
    log.error({ err, curriculumId }, "learning_list_domain_mapping_failed");
  }
}
