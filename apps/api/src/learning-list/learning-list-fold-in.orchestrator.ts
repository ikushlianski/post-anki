import type { LearningListItem, LearningListRecommendation } from "@post-anki/shared";
import { resolveSourceMergeAction } from "../curriculum/curriculum-rules.js";
import { mergeSourcesIntoCurriculum } from "../curriculum/curriculum-parse.orchestrator.js";
import { insertPendingSources } from "../curriculum/curriculum.repo.js";
import { insertConfirmedMappingIdempotent } from "../curriculum-domain-mapping/curriculum-domain-mapping.repo.js";
import { startLivenessTracking } from "../liveness/liveness.repo.js";
import { log } from "../shared/log.js";
import { findOrCreateAreaContainer } from "./area-container.repo.js";
import {
  DEFAULT_PLACEMENT_DEPTH,
  sourcesForItem,
  type ApprovedRecommendation,
  type ResolveRecommendationError,
} from "./learning-list-approval-shared.js";
import { linkFoldInCurriculum, releaseRecommendationClaim } from "./learning-list.repo.js";
import { releaseNextSliceSafely } from "./slice-release.js";

// learning-list-fold-in — the DEFAULT intake path: a single article never
// spawns a course, it lands inside the implicit per-Area container (see
// area-container.repo.ts / schema.ts's containerAreaNodeId comment). Mirrors
// learning-list-approval.orchestrator.ts's approveExtendRecommendation
// closely on purpose — same claim/release convention, same
// resolveSourceMergeAction/sourcesForItem reuse for merging the item's own
// source in — because folding into the container is the exact same "absorb
// one more source into an existing curriculum" operation extend already
// performs; only WHICH curriculum it targets, the taxonomy mapping, and the
// terminal status differ.
export async function approveFoldInRecommendation(
  itemId: string,
  claimed: LearningListItem,
  recommendation: LearningListRecommendation,
): Promise<ApprovedRecommendation | { error: ResolveRecommendationError }> {
  const areaId = recommendation.areaId;
  const areaName = recommendation.areaName;

  if (areaId === null || areaName === null) {
    await releaseRecommendationClaim(itemId);

    return { error: "fold_in_area_missing" as const };
  }

  const container = await findOrCreateAreaContainer({
    subjectId: recommendation.subjectId,
    areaNodeId: areaId,
    areaName,
  });

  if ("error" in container) {
    await releaseRecommendationClaim(itemId);

    return { error: "subject_not_found" as const };
  }

  const action = resolveSourceMergeAction(container.status);

  if (action === "blocked_by_shaping") {
    await releaseRecommendationClaim(itemId);

    return { error: "extend_target_busy" as const };
  }

  const [linked] = await Promise.all([
    linkFoldInCurriculum(itemId, container.id),
    startLivenessTracking({ entityType: "learning_list_item", entityId: itemId }),
    insertConfirmedMappingIdempotent(
      { curriculumId: container.id, domainNodeId: areaId, depth: DEFAULT_PLACEMENT_DEPTH, source: "auto" },
    ),
  ]);

  const drafts = sourcesForItem(claimed);

  if (action === "queue_for_approval") {
    await insertPendingSources(
      container.id,
      drafts.map((s) => ({
        kind: s.kind,
        url: s.value,
        title: s.title ?? s.value,
        fetchedText: null,
      })),
    );
  } else {
    void mergeSourcesIntoCurriculum(container.id, drafts).catch((err) =>
      log.error({ err, itemId, curriculumId: container.id }, "learning_list_fold_in_merge_failed"),
    );
  }

  await releaseNextSliceSafely(itemId);

  log.info(
    { itemId, curriculumId: container.id, areaId },
    "learning_list_folded_into_area_container",
  );

  return { item: linked ?? claimed, curriculumId: container.id };
}
