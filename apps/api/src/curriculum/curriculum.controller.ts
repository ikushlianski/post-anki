import type http from "node:http";
import {
  addSourcesInput,
  approveSourcesInput,
  createCurriculumInput,
  mergeCurriculaInput,
  resolveSupplementalResearchInput,
  submitStructureTurnInput,
  updateCurriculumInput,
} from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { getSubject } from "../subject/subject.repo.js";
import { resolveDomainPlacement } from "../domain-map/domain-placement.orchestrator.js";
import { getDomainNode } from "../domain-map/domain-map.repo.js";
import {
  confirmCurriculum,
  createCurriculum,
  deleteCurriculum,
  deleteSource,
  getApprovableSourceCount,
  getCurriculum,
  getCurriculumDetail,
  getStructureTurns,
  insertApprovedTextSource,
  insertPendingSources,
  listCurricula,
  markPreAssessmentCompleted,
  mergeCurricula,
  updateCurriculum,
} from "./curriculum.repo.js";
import {
  isApproveSourcesBlocked,
  isDocUrlAndResearchTopicConflict,
  isPastedMaterialAndResearchConflict,
  isPastedMaterialAndSourcesConflict,
  isResearchAndSourcesConflict,
  isSourceMandateUnmet,
} from "./curriculum-rules.js";
import {
  generateCurriculumFromApprovedSources,
  mergeSourcesIntoCurriculum,
  parseCurriculum,
  reparseCurriculum,
  researchCurriculum,
  retryResearch,
} from "./curriculum-parse.orchestrator.js";
import {
  confirmStructure,
  generateDraftStructure,
  resolveSupplementalResearch,
  retryDraftStructure,
  submitStructureTurn,
} from "./curriculum-structure.js";

export async function handleListCurricula(
  res: http.ServerResponse,
  subjectId: string | null,
): Promise<void> {
  sendJson(res, 200, await listCurricula(subjectId ?? undefined));
}

export async function handleCreateCurriculum(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, createCurriculumInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const sources = body.data.sources ?? [];
  const researchTopic = body.data.researchTopic ?? null;
  const docUrl = body.data.docUrl ?? null;
  const pastedMaterial = body.data.pastedMaterial ?? null;
  const researchTriggered = Boolean(researchTopic) || Boolean(docUrl);
  const materialPasted = Boolean(pastedMaterial && pastedMaterial.trim().length > 0);
  const subject = await getSubject(body.data.subjectId);

  if (!subject) {
    sendError(res, 404, "subject_not_found");
    return;
  }

  if (isDocUrlAndResearchTopicConflict(docUrl, researchTopic)) {
    sendError(
      res,
      400,
      "doc_url_and_research_topic_conflict",
      "a curriculum cannot be created with both a documentation URL and a legacy research topic",
    );
    return;
  }

  if (isResearchAndSourcesConflict(researchTriggered, sources.length)) {
    sendError(
      res,
      400,
      "research_and_sources_conflict",
      "a curriculum cannot be created with both research (a research topic or a documentation URL) and pasted sources",
    );
    return;
  }

  if (isPastedMaterialAndResearchConflict(pastedMaterial, researchTriggered)) {
    sendError(
      res,
      400,
      "pasted_material_and_research_conflict",
      "a curriculum cannot be created with both pasted material and research (a research topic or a documentation URL)",
    );
    return;
  }

  if (isPastedMaterialAndSourcesConflict(pastedMaterial, sources.length)) {
    sendError(
      res,
      400,
      "pasted_material_and_sources_conflict",
      "a curriculum cannot be created with both pasted material and a separate sources list",
    );
    return;
  }

  if (
    !researchTriggered &&
    !materialPasted &&
    isSourceMandateUnmet(subject.requireSources, sources.length)
  ) {
    sendError(
      res,
      400,
      "sources_required",
      "this subject requires at least one source for every curriculum",
    );
    return;
  }

  const placement = await resolveDomainPlacement({
    subjectId: body.data.subjectId,
    name: body.data.name,
    domainNodeId: body.data.domainNodeId,
  });

  const created = await createCurriculum({
    ...body.data,
    sources,
    domainNodeId: placement.domainNodeId,
  });

  // The subject can disappear between the pre-check above and the insert —
  // a concurrent subject merge deletes the source subject once it has
  // reassigned that subject's curricula. createCurriculum re-checks under the
  // merge's own lock, so this is the same 404 the pre-check would have sent,
  // just decided later and correctly.
  if ("error" in created) {
    sendError(res, 404, created.error);
    return;
  }

  const curriculum = created;

  sendJson(res, 202, curriculum);

  if (materialPasted) {
    void insertApprovedTextSource(curriculum.id, pastedMaterial!)
      .then(() => generateDraftStructure(curriculum.id))
      .catch((err) =>
        log.error({ err, curriculumId: curriculum.id }, "pasted_material_dispatch_failed"),
      );

    return;
  }

  if (docUrl) {
    void researchCurriculum(curriculum.id, { name: curriculum.name, docUrl }).catch((err) =>
      log.error({ err, curriculumId: curriculum.id }, "research_dispatch_failed"),
    );

    return;
  }

  if (researchTopic) {
    void researchCurriculum(curriculum.id, { name: researchTopic }).catch((err) =>
      log.error({ err, curriculumId: curriculum.id }, "research_dispatch_failed"),
    );

    return;
  }

  void parseCurriculum(curriculum.id).catch((err) =>
    log.error({ err, curriculumId: curriculum.id }, "parse_dispatch_failed"),
  );
}

export async function handleApproveSources(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const body = await readJsonBody(req, approveSourcesInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const curriculum = await getCurriculum(curriculumId);

  if (!curriculum) {
    sendError(res, 404, "not_found");
    return;
  }

  if (curriculum.status !== "awaiting_source_approval") {
    sendError(
      res,
      409,
      "not_awaiting_approval",
      "curriculum is not currently awaiting source approval",
    );
    return;
  }

  const override = body.data.override ?? false;
  const approvableCount = await getApprovableSourceCount(curriculumId);

  if (isApproveSourcesBlocked(approvableCount, override)) {
    sendError(
      res,
      400,
      "no_approved_sources",
      "approve or add at least one source, or explicitly generate without sources",
    );
    return;
  }

  sendJson(res, 202, { ...curriculum, status: "curating" });

  void generateCurriculumFromApprovedSources(curriculumId).catch((err) =>
    log.error({ err, curriculumId }, "generate_from_approved_sources_dispatch_failed"),
  );
}

export async function handleGetStructureTurns(
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const curriculum = await getCurriculum(curriculumId);

  if (!curriculum) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, await getStructureTurns(curriculumId));
}

export async function handleSubmitStructureTurn(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const body = await readJsonBody(req, submitStructureTurnInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const curriculum = await getCurriculum(curriculumId);

  if (!curriculum) {
    sendError(res, 404, "not_found");
    return;
  }

  if (curriculum.status !== "shaping_structure") {
    sendError(
      res,
      409,
      "not_shaping_structure",
      "curriculum is not currently in structure shaping",
    );
    return;
  }

  const result = await submitStructureTurn(curriculumId, body.data);

  if (!result.ok && result.code === "turn_in_progress") {
    sendError(
      res,
      409,
      "turn_in_progress",
      "a message is already being processed for this curriculum",
    );
    return;
  }

  if (!result.ok && result.code === "turn_limit_reached") {
    sendError(
      res,
      409,
      "turn_limit_reached",
      "this structure-shaping conversation has reached its turn limit",
    );
    return;
  }

  sendJson(res, 200, await getStructureTurns(curriculumId));
}

export async function handleResolveSupplementalResearch(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const body = await readJsonBody(req, resolveSupplementalResearchInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const curriculum = await getCurriculum(curriculumId);

  if (!curriculum) {
    sendError(res, 404, "not_found");
    return;
  }

  if (curriculum.status !== "shaping_structure") {
    sendError(
      res,
      409,
      "not_shaping_structure",
      "curriculum is not currently in structure shaping",
    );
    return;
  }

  const result = await resolveSupplementalResearch(curriculumId, body.data);

  if (!result.ok && result.code === "turn_in_progress") {
    sendError(
      res,
      409,
      "turn_in_progress",
      "a message is already being processed for this curriculum",
    );
    return;
  }

  if (!result.ok && result.code === "turn_limit_reached") {
    sendError(
      res,
      409,
      "turn_limit_reached",
      "this structure-shaping conversation has reached its turn limit",
    );
    return;
  }

  sendJson(res, 200, await getStructureTurns(curriculumId));
}

export async function handleConfirmStructure(
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const result = await confirmStructure(curriculumId);

  if (result === "not_found") {
    sendError(res, 404, "not_found");
    return;
  }

  if (result === "not_shaping_structure") {
    sendError(
      res,
      409,
      "not_shaping_structure",
      "curriculum is not currently in structure shaping",
    );
    return;
  }

  if (result === "no_snapshot") {
    sendError(
      res,
      400,
      "no_structure_snapshot",
      "no drafted structure to confirm yet",
    );
    return;
  }

  sendJson(res, 200, result);
}

export async function handleDeleteSource(
  res: http.ServerResponse,
  sourceId: string,
): Promise<void> {
  const ok = await deleteSource(sourceId);

  if (!ok) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, { id: sourceId, deleted: true });
}

export async function handleRetryResearch(
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const curriculum = await getCurriculum(curriculumId);

  if (!curriculum) {
    sendError(res, 404, "not_found");
    return;
  }

  if (curriculum.status === "curating") {
    sendError(res, 409, "already_curating");
    return;
  }

  sendJson(res, 202, { ...curriculum, status: "curating" });

  void retryResearch(curriculumId).catch((err) =>
    log.error({ err, curriculumId }, "retry_research_dispatch_failed"),
  );
}

/**
 * Recovery specifically for a `generateDraftStructure` failure — see
 * `retryDraftStructure`'s own comment for why this is a separate action
 * from `handleRetryResearch`/`handleReparse`. Gated to `failed` only: the
 * retry button that dispatches here only ever renders for a curriculum
 * already sitting at that status.
 */
export async function handleRetryDraftStructure(
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const curriculum = await getCurriculum(curriculumId);

  if (!curriculum) {
    sendError(res, 404, "not_found");
    return;
  }

  if (curriculum.status !== "failed") {
    sendError(
      res,
      409,
      "not_failed",
      "curriculum must be in a failed state to retry draft structure generation",
    );
    return;
  }

  sendJson(res, 202, { ...curriculum, status: "curating" });

  void retryDraftStructure(curriculumId).catch((err) =>
    log.error({ err, curriculumId }, "retry_draft_structure_dispatch_failed"),
  );
}

export async function handleDeleteCurriculum(
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const ok = await deleteCurriculum(curriculumId);

  if (!ok) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, { id: curriculumId, deleted: true });
}

export async function handleMergeCurricula(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  targetId: string,
): Promise<void> {
  const body = await readJsonBody(req, mergeCurriculaInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const result = await mergeCurricula(targetId, body.data.sourceCurriculumId);

  if ("error" in result) {
    if (result.error === "not_found") {
      sendError(res, 404, "not_found");
      return;
    }

    sendJson(res, 400, { error: result.error });
    return;
  }

  sendJson(res, 200, result);
}

export async function handleGetCurriculum(
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const detail = await getCurriculumDetail(curriculumId);

  if (!detail) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, detail);
}

export async function handleConfirmCurriculum(
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const result = await confirmCurriculum(curriculumId);

  if (result === "not_found") {
    sendError(res, 404, "not_found");
    return;
  }

  if (result === "not_ready") {
    sendError(
      res,
      409,
      "not_ready",
      "curriculum must be curated (status ready) before it can be confirmed",
    );
    return;
  }

  if (result === "not_studyable") {
    sendError(
      res,
      409,
      "not_studyable",
      "include at least one topic, or leave a module topic-less, before confirming",
    );
    return;
  }

  sendJson(res, 200, result);
}

export async function handleCompletePreAssessment(
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const result = await markPreAssessmentCompleted(curriculumId);

  if (result === "not_found") {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, result);
}

export async function handleAddSources(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const body = await readJsonBody(
    req,
    addSourcesInput.omit({ curriculumId: true }),
  );

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const curriculum = await getCurriculum(curriculumId);

  if (!curriculum) {
    sendError(res, 404, "not_found");
    return;
  }

  if (curriculum.status === "awaiting_source_approval") {
    // A manually-added link during the approval review — inserted as
    // pending, same as an auto-discovered candidate, so it's treated
    // identically once the learner clicks "Approve & generate" (SCENARIO
    // 3). Crucially, this must NOT trigger generation — the gate is still
    // in effect until the learner explicitly approves.
    await insertPendingSources(
      curriculumId,
      body.data.sources.map((s) => ({
        kind: s.kind,
        url: s.value,
        title: s.title ?? s.value,
        fetchedText: null,
      })),
    );

    sendJson(res, 200, curriculum);
    return;
  }

  if (curriculum.status === "shaping_structure") {
    // Structure shaping's only sourcing path is the in-chat "research this
    // more" flow (see `submitStructureTurn`'s `researchGapLabels`) — adding
    // sources directly here would bypass that chat and the draft it's
    // building toward.
    sendError(
      res,
      409,
      "shaping_structure_in_progress",
      "use the structure chat's research request instead of adding sources directly while shaping structure",
    );
    return;
  }

  sendJson(res, 202, { ...curriculum, status: "curating" });

  void mergeSourcesIntoCurriculum(curriculumId, body.data.sources).catch((err) =>
    log.error({ err, curriculumId }, "merge_dispatch_failed"),
  );
}

export async function handleReparse(
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const curriculum = await getCurriculum(curriculumId);

  if (!curriculum) {
    sendError(res, 404, "not_found");
    return;
  }

  if (curriculum.status === "curating") {
    sendError(res, 409, "already_curating");
    return;
  }

  if (curriculum.status === "awaiting_source_approval") {
    // Reparse is a pasted-sources-path recovery action (see FailedBanner,
    // which only routes here for origin "sources") and reads every source
    // row with no approvalStatus filter — it must never become a second,
    // ungated path to synthesis for a curriculum still sitting at the
    // approval gate. The only way out of this state is the approve-sources
    // action (or its explicit override).
    sendError(
      res,
      409,
      "awaiting_source_approval",
      "curriculum is awaiting source approval — approve or override sources instead of reparsing",
    );
    return;
  }

  if (curriculum.status === "shaping_structure") {
    // Same reasoning as the awaiting-approval guard above — the legacy
    // one-shot `parseCurriculum` path must never become a second way to
    // reach "ready" for a curriculum that's mid structure-shaping-chat.
    sendError(
      res,
      409,
      "shaping_structure",
      "curriculum is in structure shaping — confirm the drafted structure instead of reparsing",
    );
    return;
  }

  sendJson(res, 202, { ...curriculum, status: "curating" });

  void reparseCurriculum(curriculumId).catch((err) =>
    log.error({ err, curriculumId }, "reparse_dispatch_failed"),
  );
}

export async function handleUpdateCurriculum(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  curriculumId: string,
): Promise<void> {
  const body = await readJsonBody(
    req,
    updateCurriculumInput.omit({ curriculumId: true }),
  );

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  if (body.data.domainNodeId) {
    const curriculum = await getCurriculum(curriculumId);

    if (!curriculum) {
      sendError(res, 404, "not_found");
      return;
    }

    const targetNode = await getDomainNode(body.data.domainNodeId);

    if (!targetNode || targetNode.subjectId !== curriculum.subjectId) {
      sendError(
        res,
        400,
        "domain_node_wrong_subject",
        "the target domain node does not belong to this curriculum's own subject",
      );
      return;
    }
  }

  const result = await updateCurriculum({ ...body.data, curriculumId });

  if (!result) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, result);
}
