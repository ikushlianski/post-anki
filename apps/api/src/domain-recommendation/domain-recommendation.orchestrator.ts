import type { DomainNodeTreeItem, DomainRecommendation } from "@post-anki/shared";
import { computeDeepenCandidates, computeWidenCandidates } from "@post-anki/core";
import { getDomainMapForSubject, getDomainNode } from "../domain-map/domain-map.repo.js";
import { createCurriculum } from "../curriculum/curriculum.repo.js";
import { researchCurriculum } from "../curriculum/curriculum-parse.orchestrator.js";
import { log } from "../shared/log.js";
import {
  insertRecommendation,
  listExistingDomainNodeIds,
  releaseRecommendationClaim,
  resolveRecommendationClaim,
  setCreatedCurriculumId,
  type ResolveRecommendationClaimError,
} from "./domain-recommendation.repo.js";

const SOURCE = "structural";

export type TriggerDomainRecommendationsError = "no_domain_nodes" | "not_taxonomy_backed";

function isTaxonomyBacked(tree: DomainNodeTreeItem[]): boolean {
  return tree.some(
    (node) => node.source === "static_taxonomy" || isTaxonomyBacked(node.children),
  );
}

// spec.md "Orchestrator" — triggerDomainRecommendations. Loads the tree via
// the existing, unmodified getDomainMapForSubject(), gates on the subject
// having any domain_nodes rows at all and on the tree being taxonomy-backed
// (Decision 6 — the deepen/widen rules assume the curated 15-domain shape),
// computes both axes via the pure functions (@post-anki/core, no LLM call —
// Decision 1), and inserts one row per candidate whose (subjectId,
// domainNodeId) has no existing row of ANY status — the true unique index
// is the hard backstop, this is the no-op-avoidance fast path (mirrors
// insertSuggestedMappings' existence-check idiom, but status-agnostic: see
// domain-recommendation.repo.ts's listExistingDomainNodeIds comment for why
// this must not reuse that table's ne(status, "rejected") filter).
export async function triggerDomainRecommendations(
  subjectId: string,
): Promise<DomainRecommendation[] | { error: TriggerDomainRecommendationsError }> {
  const tree = await getDomainMapForSubject(subjectId);

  if (tree.length === 0) {
    return { error: "no_domain_nodes" as const };
  }

  if (!isTaxonomyBacked(tree)) {
    return { error: "not_taxonomy_backed" as const };
  }

  const candidates = [...computeDeepenCandidates(tree), ...computeWidenCandidates(tree)];
  const existingNodeIds = await listExistingDomainNodeIds(subjectId);

  const inserted: DomainRecommendation[] = [];

  for (const candidate of candidates) {
    if (existingNodeIds.has(candidate.domainNodeId)) {
      continue;
    }

    const row = await insertRecommendation({
      subjectId,
      domainNodeId: candidate.domainNodeId,
      sourceNodeId: candidate.sourceNodeId,
      axis: candidate.axis,
      reason: candidate.reason,
      source: SOURCE,
    });

    inserted.push(row);
    existingNodeIds.add(candidate.domainNodeId);
  }

  return inserted;
}

export type ResolveDomainRecommendationError =
  | ResolveRecommendationClaimError
  | "subject_not_found";

// spec.md "Orchestrator" — resolveDomainRecommendation. Claims the row
// first (claim-first, same shape as resolvePrioritySuggestion). Rejecting
// stops there — no side effect, the row is already resolved. Accepting
// reuses the exact createCurriculum({ ..., researchTopic, domainNodeId,
// domainNodeSource: "manual" }) call shape the research-topic intake path
// already uses for a bare topic name (curriculum.repo.ts's own
// "placement... in the same subject-locked transaction" comment), and then
// dispatches researchCurriculum the same fire-and-forget way
// handleCreateCurriculum does for that path — createCurriculum ITSELF never
// dispatches research (only the controller does), so this orchestrator has
// to reproduce that dispatch explicitly or an accepted recommendation would
// create a curriculum that's permanently stuck at "curating" with nothing in
// it.
//
// If createCurriculum loses the subject-existence race (the subject was
// deleted between the recommendation being generated and accepted), the
// claim is released back to "pending" rather than left stuck "accepted"
// with a null createdCurriculumId — the same recovery
// approveMiniCourseRecommendation uses on the identical failure shape
// (Decision 12).
export async function resolveDomainRecommendation(
  id: string,
  status: "accepted" | "rejected",
): Promise<DomainRecommendation | { error: ResolveDomainRecommendationError }> {
  const claimed = await resolveRecommendationClaim(id, status);

  if ("error" in claimed) {
    return claimed;
  }

  if (status === "rejected") {
    return claimed;
  }

  const node = await getDomainNode(claimed.domainNodeId);
  const nodeName = node?.name ?? claimed.domainNodeId;

  const created = await createCurriculum({
    subjectId: claimed.subjectId,
    name: nodeName,
    sources: [],
    researchTopic: nodeName,
    domainNodeId: claimed.domainNodeId,
    domainNodeSource: "manual",
  });

  if ("error" in created) {
    await releaseRecommendationClaim(id);

    return { error: "subject_not_found" as const };
  }

  const resolved = await setCreatedCurriculumId(id, created.id);

  void researchCurriculum(created.id, { name: nodeName }).catch((err) =>
    log.error({ err, curriculumId: created.id }, "domain_recommendation_research_dispatch_failed"),
  );

  return resolved;
}
