import http from "node:http";
import crypto from "node:crypto";
import { loadEnv } from "./shared/env.js";
import { resolveCorsDecision } from "./shared/cors.js";
import { log } from "./shared/log.js";
import { sendError, sendJson } from "./shared/http.js";
import { LlmBudgetCheckUnavailableError, LlmBudgetExceededError, secondsUntilUtcMidnight } from "./shared/spend-guard.js";
import {
  handleCreateSubject,
  handleDeleteSubject,
  handleListSubjects,
  handleMergeSubjects,
  handleReorderSubjects,
  handleUpdateSubject,
} from "./subject/subject.controller.js";
import {
  handleGetKnowledgeSourceRegeneration,
  handleRegenerateKnowledgeSource,
} from "./knowledge-source/knowledge-source-regeneration.controller.js";
import { handleDiscardKnowledgeSource } from "./knowledge-source/knowledge-source-discard.controller.js";
import { handleCreateKnowledgeSource } from "./knowledge-source/knowledge-source.controller.js";
import { handleCreateKnowledgeSourceSubjectCheck } from "./knowledge-source/knowledge-source-subject-check.controller.js";
import { handleCreateKnowledgeSourceFromNotion } from "./knowledge-source/notion-knowledge-source.controller.js";
import {
  handleDetectKnowledgeBits,
  handleTriggerKnowledgeBitEmbeddingScan,
  handleTriggerKnowledgeBitTaggingScan,
  handleTriggerKnowledgeBitQuestionGenerationScan,
  handleTriggerKnowledgeBitFillBlankGenerationScan,
  handleTriggerKnowledgeBitBasicCardGenerationScan,
  handleTriggerKnowledgeBitQuestionVariantEmbeddingScan,
  handleTriggerKnowledgeBitPlacementScan,
  handleListPendingPlacementSuggestions,
  handleResolvePlacementSuggestion,
} from "./knowledge-bit/detect-knowledge-bits.controller.js";
import { handleListSubjectReviewDueCounts } from "./knowledge-bit/subject-review-due-counts.controller.js";
import { handleGradeKnowledgeBitVariantAnswer } from "./knowledge-bit/grade-knowledge-bit-variant-answer.controller.js";
import { handleListNextKnowledgeBitQuestionVariants } from "./knowledge-bit/list-next-knowledge-bit-question-variants.controller.js";
import {
  handleListKnowledgeBitReviewCards,
  handleRecordKnowledgeBitReview,
  handleUndoKnowledgeBitReview,
  handleUpdateKnowledgeBitScheduleControls,
} from "./knowledge-bit/knowledge-bit-review.controller.js";
import { handleListSuspendedKnowledgeBits } from "./knowledge-bit/knowledge-bit-suspended.controller.js";
import {
  handleCountKnowledgeBitBrowserSubjects,
  handleListKnowledgeBitBrowser,
} from "./knowledge-bit/knowledge-bit-browser.controller.js";
import { handleGetKnowledgeBitDetail } from "./knowledge-bit/knowledge-bit-detail.controller.js";
import { handleKnowledgeBitBrowserMatches } from "./knowledge-bit/knowledge-bit-browser-matches.controller.js";
import {
  handleDistillTriageSession,
  handleFinishTriageSession,
  handleGetTriageSession,
  handleStartTriageSession,
} from "./card-triage/card-triage-session.controller.js";
import { handleListCardStyleNotes, handleUpdateCardStyleNote } from "./card-triage/card-style-note.controller.js";
import { handleListKnowledgeBitOverview } from "./knowledge-bit/knowledge-bit-overview.controller.js";
import { handleExportKnowledgeBits } from "./knowledge-bit/knowledge-bit-export.controller.js";
import {
  handleClearAllKnowledge,
  handleDeleteKnowledgeSource,
  handlePurgeKnowledgeBits,
} from "./knowledge-bit/knowledge-cleanup.controller.js";
import { handleBulkDeleteKnowledgeBits } from "./knowledge-bit/knowledge-bit-delete.controller.js";
import { handleBulkMoveKnowledgeBits } from "./knowledge-bit/knowledge-bit-move.controller.js";
import {
  handleBulkApproveKnowledgeBits,
  handleCountPendingKnowledgeBits,
} from "./knowledge-bit/knowledge-bit-bulk-approval.controller.js";
import {
  handleApproveKnowledgeBit,
  handleEditKnowledgeBitQuestionVariant,
  handleListPendingKnowledgeBitsForReview,
  handleRejectKnowledgeBit,
} from "./knowledge-bit/knowledge-bit-approval.controller.js";
import { handleTriageKnowledgeBit } from "./knowledge-bit/knowledge-bit-triage.controller.js";
import { handleUndoTriageKnowledgeBit } from "./knowledge-bit/knowledge-bit-triage-undo.controller.js";
import {
  handleCreateSubjectCategory,
  handleListAllSubjectCategories,
  handleListSubjectCategories,
  handleMoveCategory,
  handleRenameCategory,
} from "./subject-category/subject-category.controller.js";
import {
  handleAddSources,
  handleApproveSources,
  handleCompletePreAssessment,
  handleConfirmCurriculum,
  handleConfirmStructure,
  handleCreateCurriculum,
  handleDeleteCurriculum,
  handleDeleteSource,
  handleGetCurriculum,
  handleGetStructureTurns,
  handleListCurricula,
  handleMergeCurricula,
  handleMoveCurriculum,
  handleReorderCurricula,
  handleReparse,
  handleResolveSupplementalResearch,
  handleRetryDraftStructure,
  handleRetryResearch,
  handleSubmitStructureTurn,
  handleUpdateCurriculum,
} from "./curriculum/curriculum.controller.js";
import {
  handleListCourseRefocusSuggestions,
  handleDismissCourseRefocusSuggestion,
} from "./curriculum/course-refocus.controller.js";
import {
  handleCreateModule,
  handleDeleteModule,
  handleReorderModules,
  handleUpdateModule,
} from "./module/module.controller.js";
import {
  handleCreateTopic,
  handleDeleteTopic,
  handleListDueTopics,
  handleListTopicGaps,
  handleReorderTopics,
  handleUpdateTopic,
} from "./topic/topic.controller.js";
import {
  handleAddModuleComment,
  handleAddTopicComment,
} from "./node-feedback/node-feedback.controller.js";
import {
  handleStartProbe,
  handleSubmitProbe,
} from "./probe/probe.controller.js";
import {
  handleActiveProbeSession,
  handleAnswerProbeSession,
  handlePrepareProbeSession,
} from "./probe-session/probe-session.controller.js";
import {
  handleAnswerSocratic,
  handleCheckSocraticSessionIdle,
  handleCompleteSocraticSession,
  handleStartSocratic,
} from "./socratic/socratic.controller.js";
import {
  handleAutoDeferSweep,
  handleCurateGap,
  handleDeclareGap,
  handleDueForResurface,
  handleMarkResurfaced,
  handleTriageGap,
} from "./gap/gap.controller.js";
import { handleDailyPush, handleDueQueue } from "./push/push.controller.js";
import {
  handleListTagNodes,
  handleSearch,
  handleSearchTopicsAndModules,
} from "./search/search.controller.js";
import {
  handleCreateDecideSession,
  handleListDecideSessions,
  handleResolveDecideBlindSpot,
} from "./decide/decide.controller.js";
import { handleCrossCutting } from "./concern/concern.controller.js";
import { handleGapMasteryCrossCuttingNudge } from "./gap/cross-cutting-nudge.controller.js";
import {
  handleGetAdminSettings,
  handleUpdateAdminSettings,
} from "./admin-settings/admin-settings.controller.js";
import {
  handleGetKnowledgeBitFeedbackByModel,
  handleGradeKnowledgeBit,
  handleRestoreRejectedKnowledgeBit,
  handleSetKnowledgeBitFeedbackReason,
} from "./knowledge-bit/knowledge-bit-feedback.controller.js";
import { handleGetAdminObservability } from "./admin-observability/admin-observability.controller.js";
import {
  handleSubmitProbeQuestionFeedback,
  handleSubmitSocraticTurnFeedback,
} from "./feedback/feedback.controller.js";
import {
  handleCaptureProbeQuestionOpenQuestion,
  handleCaptureSocraticTurnOpenQuestion,
  handleListOpenQuestions,
  handleResolveOpenQuestion,
} from "./open-questions/open-questions.controller.js";
import { handleAskStudyChat } from "./study-chat/study-chat.controller.js";
import { handleAskQaChat } from "./qa-chat/qa-chat.controller.js";
import { handleAskGlobalCardChat } from "./global-card-chat/global-card-chat.controller.js";
import { handleAskSubjectChat } from "./subject-chat/subject-chat.controller.js";
import { handleAskKnowledgeBitChat } from "./knowledge-bit/knowledge-bit-chat.controller.js";
import { handleDraftKnowledgeBitChat } from "./knowledge-bit/knowledge-bit-chat-draft.controller.js";
import { handleCreateDerivedKnowledgeItem } from "./knowledge-bit/knowledge-bit-derived-item.controller.js";
import { handleListKnowledgeBitVariants } from "./knowledge-bit/list-knowledge-bit-variants.controller.js";
import { handleGenerateKnowledgeBitVariants } from "./knowledge-bit/knowledge-bit-generate-variants.controller.js";
import { handleEditKnowledgeBit } from "./knowledge-bit/knowledge-bit-edit.controller.js";
import {
  handleGenerateRecommendations,
  handleGetCurriculumStats,
} from "./stats/stats.controller.js";
import { handleGetStreak } from "./streak/streak.controller.js";
import { handleGetGamificationProfile } from "./gamification/gamification.controller.js";
import { handleGetHomeSummary } from "./home/home.controller.js";
import { handleCreateTranscription } from "./transcription/transcription.controller.js";
import { handleGetElectricShape } from "./electric/electric-proxy.controller.js";
import {
  handleAssignTag,
  handleCreateTag,
  handleGetTagMastery,
  handleListTags,
  handleMergeTags,
  handleRemoveTagAssignment,
} from "./tag/tag.controller.js";
import {
  handleCompileLecture,
  handleGatherLectureSources,
  handleGetLecture,
  handleListLectureSourceCandidates,
  handleReviewLectureSourceCandidate,
} from "./lecture/lecture.controller.js";
import {
  handleCompileCards,
  handleFindTopMatchingCards,
  handleGetCards,
  handleGetCurriculumCardsSummary,
  handleListCurriculumCards,
  handleTriggerCardEmbeddingScan,
} from "./cards/cards.controller.js";
import {
  handleCreateAttempts,
  handleCreatePhraseBatch,
  handleCreateWritingCheck,
  handleGetPhraseBank,
  handleGetPracticeSettings,
  handleListWritingChecks,
  handleUpdatePracticeSettings,
} from "./practice/practice.controller.js";
import {
  handleGetDomainMap,
  handleGetDomainPriorityReviewStatus,
  handleListDocScanSuggestions,
  handleListPrioritySuggestions,
  handleMergeDomainNodes,
  handleResolveDomainSupersessionSuggestion,
  handleResolveDomainTopicSuggestion,
  handleResolvePrioritySuggestion,
  handleTriggerAllDocScans,
  handleTriggerDocScan,
  handleTriggerDomainPriorityReview,
  handleUpdateDomainNode,
} from "./domain-map/domain-map.controller.js";
import {
  handleListDomainRecommendations,
  handleResolveDomainRecommendation,
  handleTriggerDomainRecommendations,
} from "./domain-recommendation/domain-recommendation.controller.js";
import {
  handleListSubjectDuplicateSuggestions,
  handleResolveSubjectDuplicateSuggestion,
  handleTriggerSubjectDuplicateScan,
} from "./subject-duplicate/subject-duplicate.controller.js";
import {
  handleListSubjectSuggestions,
  handleResolveSubjectSuggestion,
  handleTriggerSubjectSuggestionScan,
} from "./subject-suggestion/subject-suggestion.controller.js";
import {
  handleListCurriculumDomainMappings,
  handleResolveCurriculumDomainMapping,
  handleTriggerCurriculumDomainMapping,
} from "./curriculum-domain-mapping/curriculum-domain-mapping.controller.js";
import {
  handleCaptureLearningListItem,
  handleChooseLearningListDestination,
  handleClassifyLearningListItem,
  handleCreateLearningListNudgeResponse,
  handleGetLearningListItem,
  handleListLearningListItems,
  handleResolveLearningListRecommendation,
} from "./learning-list/learning-list.controller.js";
import { handleCreateNudgeResponse } from "./liveness/liveness.controller.js";
import {
  handleAbandonLearningPath,
  handleCreateLearningPath,
  handleGetLearningPath,
  handleGetLearningPathStepPush,
  handleListLearningPaths,
  handleListRoleTemplates,
} from "./learning-path/learning-path.controller.js";
import {
  handleCaptureNote,
  handleListNotesForNode,
  handleSearchNotes,
} from "./note/note.controller.js";
import { handleReviewNote } from "./note/note-review.service.js";
import {
  handleGetCoverageReport,
  handleGetRetentionReport,
  handleGetWeeklyDigest,
} from "./analytics/analytics.controller.js";
import {
  handleCreateStudySession,
  handleEndStudySession,
  handleGetStudySession,
  handleGetStudySessionConsistency,
  handleGetStudySessionPush,
  handleListStudySessions,
  handleRecordStudySessionAnswer,
  handleStartStudySession,
} from "./study-session/study-session.controller.js";
import {
  handleListLibrarySources,
  handleRefetchSource,
} from "./content-library/content-library.controller.js";
import {
  handleListSourceDuplicateSuggestions,
  handleResolveSourceDuplicateSuggestion,
  handleTriggerSourceDuplicateScan,
} from "./source-duplicate/source-duplicate.controller.js";
import {
  handleListContentInbox,
  handleTriggerBizEducationDistill,
} from "./biz-education-distiller/content-inbox.controller.js";
import { handleGetMilestones } from "./milestone/milestone.controller.js";
import {
  handleListStudyMaterials,
  handleRequestStudyMaterial,
} from "./study-material/study-material.controller.js";
import { resolveRoute } from "./router.js";
import { hashApiToken } from "./api-token/api-token.hash.js";
import { findActiveTokenByHash, touchLastUsed } from "./api-token/api-token.repo.js";
import { handleAuthRequest, handleWebAuthCheck, isAuthPath } from "./auth/web-auth.controller.js";
import { handleCreateSyncToken, handleListSyncKeys } from "./sync-auth/sync-auth.controller.js";
import { handleMcpRequest, handleMcpMethodNotAllowed } from "./mcp/mcp.route.js";
import { createInngestServeHandler } from "./shared/inngest-serve.js";
import { backgroundJobFunction } from "./background-job/background-job.workflow.js";
import {
  extractionCancelHandler,
  extractionInngestFunction,
} from "./knowledge-bit/extraction-inngest.workflow.js";
import {
  cardsCompileFunction,
  cardsCompileTimeoutHandler,
} from "./cards/cards-inngest.workflow.js";
import {
  curriculumResearchFunction,
  curriculumResearchTimeoutHandler,
} from "./curriculum/curriculum-research-inngest.workflow.js";
import {
  curriculumDraftFunction,
  curriculumDraftTimeoutHandler,
} from "./curriculum/curriculum-draft-inngest.workflow.js";
import {
  curriculumParseFunction,
  curriculumParseTimeoutHandler,
} from "./curriculum/curriculum-parse-inngest.workflow.js";
import {
  pipelineKickFollowUpFunction,
  pipelineKickInngestFunction,
} from "./knowledge-bit/pipeline-kick-inngest.workflow.js";

function timingSafeEqualStrings(a: string, b: string): boolean {
  const digestA = crypto.createHash("sha256").update(a).digest();
  const digestB = crypto.createHash("sha256").update(b).digest();

  return crypto.timingSafeEqual(digestA, digestB);
}

async function authorized(req: http.IncomingMessage): Promise<boolean> {
  const env = loadEnv();

  if (!env.API_SHARED_SECRET) {
    return true;
  }

  const header = req.headers.authorization;
  const expected = `Bearer ${env.API_SHARED_SECRET}`;

  if (header !== undefined && timingSafeEqualStrings(header, expected)) {
    return true;
  }

  if (!header?.startsWith("Bearer ")) {
    return false;
  }

  const rawToken = header.slice("Bearer ".length);
  const token = await findActiveTokenByHash(hashApiToken(rawToken));

  if (!token) {
    return false;
  }

  await touchLastUsed(token.id).catch((err: unknown) => log.error({ err }, "api_token_touch_last_used_failed"));

  return true;
}

function requiresSharedSecretOnly(path: string): boolean {
  return isAuthPath(path) || path === "/web-auth/checks";
}

function hasSharedSecret(req: http.IncomingMessage): boolean {
  const env = loadEnv();

  if (!env.API_SHARED_SECRET) {
    return env.NODE_ENV !== "production";
  }

  const header = req.headers.authorization;

  return header !== undefined && timingSafeEqualStrings(header, `Bearer ${env.API_SHARED_SECRET}`);
}

const inngestServeHandler = createInngestServeHandler([
  extractionInngestFunction,
  extractionCancelHandler,
  backgroundJobFunction,
  pipelineKickInngestFunction,
  pipelineKickFollowUpFunction,
  cardsCompileFunction,
  cardsCompileTimeoutHandler,
  curriculumResearchFunction,
  curriculumResearchTimeoutHandler,
  curriculumDraftFunction,
  curriculumDraftTimeoutHandler,
  curriculumParseFunction,
  curriculumParseTimeoutHandler,
]);

export function createApiRequestListener(): http.RequestListener {
  return (req, res) => {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    const env = loadEnv();
    const extraOrigins = env.WEB_ORIGINS
      ? env.WEB_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
      : undefined;

    const cors = resolveCorsDecision({
      requestOrigin: req.headers.origin,
      webOrigin: env.WEB_ORIGIN,
      extensionId: env.EXTENSION_ID,
      extraOrigins,
    });

    res.setHeader("Vary", "Origin");

    if ("forbidden" in cors) {
      sendError(res, 403, "origin_not_allowed");
      return;
    }
    res.setHeader(
      "Access-Control-Allow-Origin",
      "allowedOrigin" in cors ? cors.allowedOrigin : env.WEB_ORIGIN,
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (method === "GET" && path === "/_healthz") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === "GET" && path === "/sync-keys") {
      void handleListSyncKeys(res).catch((err: unknown) => {
        log.error({ err }, "sync_keys_failed");

        if (!res.headersSent) {
          sendError(res, 500, "internal_error");
        }
      });
      return;
    }

    if (path === "/api/inngest") {
      inngestServeHandler(req, res);
      return;
    }

    void handleRequest(req, res, method, path, url);
  };
}

export function createApiServer(): http.Server {
  return http.createServer(createApiRequestListener());
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  path: string,
  url: URL,
): Promise<void> {
  try {
    if (!(await authorized(req))) {
      sendError(res, 401, "unauthorized");
      return;
    }

    if (requiresSharedSecretOnly(path) && !hasSharedSecret(req)) {
      sendError(res, 401, "unauthorized");
      return;
    }

    if (isAuthPath(path)) {
      await handleAuthRequest(req, res);
      return;
    }

    await route(req, res, method, path, url);
  } catch (err) {
    if (err instanceof LlmBudgetExceededError) {
      log.warn({ method, path }, "llm_budget_exceeded");

      if (!res.headersSent) {
        res.setHeader("Retry-After", String(secondsUntilUtcMidnight()));
        sendError(res, 429, "llm_budget_exceeded", err.message);
      }

      return;
    }

    if (err instanceof LlmBudgetCheckUnavailableError) {
      log.error({ err, method, path }, "llm_budget_check_unavailable");

      if (!res.headersSent) {
        res.setHeader("Retry-After", "30");
        sendError(res, 503, "llm_budget_check_unavailable", err.message);
      }

      return;
    }

    log.error({ err, method, path }, "request_failed");

    if (!res.headersSent) {
      sendError(res, 500, "internal_error");
    }
  }
}

async function route(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  path: string,
  url: URL,
): Promise<void> {
  const resolved = resolveRoute(method, path);

  if (!resolved) {
    sendError(res, 404, "not_found");
    return;
  }

  const id = resolved.params.id ?? "";

  switch (resolved.name) {
    case "mcp":
      return handleMcpRequest(req, res);
    case "mcpMethodNotAllowed":
      return handleMcpMethodNotAllowed(res);
    case "createSyncToken":
      return handleCreateSyncToken(req, res);
    case "listSyncKeys":
      return handleListSyncKeys(res);
    case "checkWebAuth":
      return handleWebAuthCheck(req, res);
    case "listSubjects":
      return handleListSubjects(res, url.searchParams.get("query"));
    case "createSubject":
      return handleCreateSubject(req, res);
    case "createKnowledgeSource":
      return handleCreateKnowledgeSource(req, res);
    case "createKnowledgeSourceFromNotion":
      return handleCreateKnowledgeSourceFromNotion(req, res);
    case "createKnowledgeSourceSubjectCheck":
      return handleCreateKnowledgeSourceSubjectCheck(req, res);
    case "detectKnowledgeBits":
      return handleDetectKnowledgeBits(res);
    case "triggerKnowledgeBitEmbeddingScan":
      return handleTriggerKnowledgeBitEmbeddingScan(res);
    case "triggerKnowledgeBitTaggingScan":
      return handleTriggerKnowledgeBitTaggingScan(res);
    case "triggerKnowledgeBitQuestionGenerationScan":
      return handleTriggerKnowledgeBitQuestionGenerationScan(res);
    case "triggerKnowledgeBitFillBlankGenerationScan":
      return handleTriggerKnowledgeBitFillBlankGenerationScan(res);
    case "triggerKnowledgeBitBasicCardGenerationScan":
      return handleTriggerKnowledgeBitBasicCardGenerationScan(res);
    case "triggerKnowledgeBitQuestionVariantEmbeddingScan":
      return handleTriggerKnowledgeBitQuestionVariantEmbeddingScan(res);
    case "triggerKnowledgeBitPlacementScan":
      return handleTriggerKnowledgeBitPlacementScan(res);
    case "listPendingPlacementSuggestions":
      return handleListPendingPlacementSuggestions(res);
    case "resolvePlacementSuggestion":
      return handleResolvePlacementSuggestion(req, res, id);
    case "gradeKnowledgeBitVariantAnswer":
      return handleGradeKnowledgeBitVariantAnswer(req, res, id);
    case "listNextKnowledgeBitQuestionVariants":
      return handleListNextKnowledgeBitQuestionVariants(res, url.search);
    case "listKnowledgeBitReviewCards":
      return handleListKnowledgeBitReviewCards(res, url.search);
    case "listSuspendedKnowledgeBits":
      return handleListSuspendedKnowledgeBits(res, url.search);
    case "listSubjectReviewDueCounts":
      return handleListSubjectReviewDueCounts(res, url.search);
    case "recordKnowledgeBitReview":
      return handleRecordKnowledgeBitReview(req, res);
    case "undoKnowledgeBitReview":
      return handleUndoKnowledgeBitReview(res, id);
    case "updateKnowledgeBitScheduleControls":
      return handleUpdateKnowledgeBitScheduleControls(req, res, id);
    case "listPendingKnowledgeBitsForReview":
      return handleListPendingKnowledgeBitsForReview(res, url.search);
    case "countPendingKnowledgeBits":
      return handleCountPendingKnowledgeBits(res);
    case "listKnowledgeBitOverview":
      return handleListKnowledgeBitOverview(res, url.search);
    case "listKnowledgeBitBrowser":
      return handleListKnowledgeBitBrowser(res, url.search);
    case "countKnowledgeBitBrowserSubjects":
      return handleCountKnowledgeBitBrowserSubjects(res);
    case "listKnowledgeBitBrowserMatches":
      return handleKnowledgeBitBrowserMatches(res, url.search);
    case "exportKnowledgeBits":
      return handleExportKnowledgeBits(res, url.search);
    case "bulkDeleteKnowledgeBits":
      return handleBulkDeleteKnowledgeBits(req, res);
    case "purgeKnowledgeBits":
      return handlePurgeKnowledgeBits(req, res);
    case "clearAllKnowledge":
      return handleClearAllKnowledge(req, res);
    case "bulkMoveKnowledgeBits":
      return handleBulkMoveKnowledgeBits(req, res);
    case "bulkApproveKnowledgeBits":
      return handleBulkApproveKnowledgeBits(req, res);
    case "regenerateKnowledgeSource":
      return handleRegenerateKnowledgeSource(req, res, id);
    case "getKnowledgeSourceRegeneration":
      return handleGetKnowledgeSourceRegeneration(res, id);
    case "approveKnowledgeBit":
      return handleApproveKnowledgeBit(res, id);
    case "triageKnowledgeBit":
      return handleTriageKnowledgeBit(req, res, id);
    case "undoTriageKnowledgeBit":
      return handleUndoTriageKnowledgeBit(req, res, id);
    case "rejectKnowledgeBit":
      return handleRejectKnowledgeBit(res, id);
    case "startTriageSession":
      return handleStartTriageSession(req, res);
    case "getTriageSession":
      return handleGetTriageSession(res, id);
    case "finishTriageSession":
      return handleFinishTriageSession(req, res, id);
    case "distillTriageSession":
      return handleDistillTriageSession(res, id);
    case "listCardStyleNotes":
      return handleListCardStyleNotes(res, url.search);
    case "updateCardStyleNote":
      return handleUpdateCardStyleNote(req, res, id);
    case "restoreRejectedKnowledgeBit":
      return handleRestoreRejectedKnowledgeBit(res, id);
    case "gradeKnowledgeBit":
      return handleGradeKnowledgeBit(req, res, id);
    case "setKnowledgeBitFeedbackReason":
      return handleSetKnowledgeBitFeedbackReason(req, res, id);
    case "getKnowledgeBitFeedbackByModel":
      return handleGetKnowledgeBitFeedbackByModel(res);
    case "editKnowledgeBitQuestionVariant":
      return handleEditKnowledgeBitQuestionVariant(req, res, id);
    case "discardKnowledgeSource":
      return handleDiscardKnowledgeSource(res, id);
    case "deleteKnowledgeSource":
      return handleDeleteKnowledgeSource(res, id);
    case "deleteSubject":
      return handleDeleteSubject(res, id);
    case "reorderSubjects":
      return handleReorderSubjects(req, res);
    case "updateSubject":
      return handleUpdateSubject(req, res, id);
    case "mergeSubjects":
      return handleMergeSubjects(req, res, id);
    case "listSubjectCategories":
      return handleListSubjectCategories(res, id);
    case "listAllSubjectCategories":
      return handleListAllSubjectCategories(res);
    case "createSubjectCategory":
      return handleCreateSubjectCategory(req, res, id);
    case "moveCategory":
      return handleMoveCategory(req, res, id);
    case "renameCategory":
      return handleRenameCategory(req, res, id);
    case "listCurricula":
      return handleListCurricula(res, url.searchParams.get("subjectId"));
    case "createCurriculum":
      return handleCreateCurriculum(req, res);
    case "getCurriculum":
      return handleGetCurriculum(res, id);
    case "getCurriculumCardsSummary":
      return handleGetCurriculumCardsSummary(res, id);
    case "listCurriculumCards":
      return handleListCurriculumCards(res, id);
    case "triggerCardEmbeddingScan":
      return handleTriggerCardEmbeddingScan(res);
    case "findTopMatchingCards":
      return handleFindTopMatchingCards(res, url.searchParams.get("q"), url.searchParams.get("limit"));
    case "updateCurriculum":
      return handleUpdateCurriculum(req, res, id);
    case "deleteCurriculum":
      return handleDeleteCurriculum(res, id);
    case "mergeCurricula":
      return handleMergeCurricula(req, res, id);
    case "moveCurriculum":
      return handleMoveCurriculum(req, res, id);
    case "confirmCurriculum":
      return handleConfirmCurriculum(res, id);
    case "completePreAssessment":
      return handleCompletePreAssessment(res, id);
    case "addSources":
      return handleAddSources(req, res, id);
    case "reparse":
      return handleReparse(res, id);
    case "retryResearch":
      return handleRetryResearch(res, id);
    case "retryDraftStructure":
      return handleRetryDraftStructure(res, id);
    case "approveSources":
      return handleApproveSources(req, res, id);
    case "getStructureTurns":
      return handleGetStructureTurns(res, id);
    case "submitStructureTurn":
      return handleSubmitStructureTurn(req, res, id);
    case "resolveSupplementalResearch":
      return handleResolveSupplementalResearch(req, res, id);
    case "confirmStructure":
      return handleConfirmStructure(res, id);
    case "deleteSource":
      return handleDeleteSource(res, id);
    case "reorderCurricula":
      return handleReorderCurricula(req, res, id);
    case "reorderModules":
      return handleReorderModules(req, res, id);
    case "createModule":
      return handleCreateModule(req, res, id);
    case "reorderTopics":
      return handleReorderTopics(req, res);
    case "createTopic":
      return handleCreateTopic(req, res, id);
    case "updateModule":
      return handleUpdateModule(req, res, id);
    case "deleteModule":
      return handleDeleteModule(res, id);
    case "updateTopic":
      return handleUpdateTopic(req, res, id);
    case "deleteTopic":
      return handleDeleteTopic(res, id);
    case "listDueTopics":
      return handleListDueTopics(res, url.searchParams.get("limit"));
    case "listTopicGaps":
      return handleListTopicGaps(res, id);
    case "addModuleComment":
      return handleAddModuleComment(req, res, id);
    case "addTopicComment":
      return handleAddTopicComment(req, res, id);
    case "startProbe":
      return handleStartProbe(req, res, id);
    case "submitProbe":
      return handleSubmitProbe(req, res, id);
    case "prepareProbeSession":
      return handlePrepareProbeSession(req, res);
    case "activeProbeSession":
      return handleActiveProbeSession(
        res,
        url.searchParams.get("scope"),
        url.searchParams.get("scopeId"),
        url.searchParams.get("mode"),
      );
    case "answerProbeSession":
      return handleAnswerProbeSession(req, res, id);
    case "startSocratic":
      return handleStartSocratic(req, res);
    case "answerSocratic":
      return handleAnswerSocratic(req, res, id);
    case "checkSocraticSessionIdle":
      return handleCheckSocraticSessionIdle(res, id);
    case "completeSocraticSessionRoute":
      return handleCompleteSocraticSession(res, id);
    case "declareGap":
      return handleDeclareGap(req, res);
    case "curateGap":
      return handleCurateGap(req, res, id);
    case "triageGap":
      return handleTriageGap(req, res, id);
    case "listGapsDueForResurface":
      return handleDueForResurface(res);
    case "markGapResurfaced":
      return handleMarkResurfaced(req, res, id);
    case "sweepAutoDeferGaps":
      return handleAutoDeferSweep(res);
    case "dailyPush":
      return handleDailyPush(
        res,
        url.searchParams.get("mode"),
        url.searchParams.get("subjectId"),
      );
    case "dueQueue":
      return handleDueQueue(res);
    case "search":
      return handleSearch(res, url.searchParams.get("q"));
    case "searchTopicsAndModules":
      return handleSearchTopicsAndModules(
        res,
        url.searchParams.get("q"),
        url.searchParams.get("limit"),
      );
    case "createDecideSession":
      return handleCreateDecideSession(req, res);
    case "listDecideSessions":
      return handleListDecideSessions(res);
    case "resolveDecideBlindSpot":
      return handleResolveDecideBlindSpot(req, res, id);
    case "crossCutting":
      return handleCrossCutting(res);
    case "gapMasteryCrossCuttingNudge":
      return handleGapMasteryCrossCuttingNudge(res);
    case "getAdminSettings":
      return handleGetAdminSettings(res);
    case "updateAdminSettings":
      return handleUpdateAdminSettings(req, res);
    case "getAdminObservability":
      return handleGetAdminObservability(res);
    case "submitProbeQuestionFeedback":
      return handleSubmitProbeQuestionFeedback(req, res, id);
    case "submitSocraticTurnFeedback":
      return handleSubmitSocraticTurnFeedback(req, res, id);
    case "captureProbeQuestionOpenQuestion":
      return handleCaptureProbeQuestionOpenQuestion(req, res, id);
    case "captureSocraticTurnOpenQuestion":
      return handleCaptureSocraticTurnOpenQuestion(req, res, id);
    case "listOpenQuestions":
      return handleListOpenQuestions(
        res,
        url.searchParams.get("status"),
        url.searchParams.get("limit"),
      );
    case "resolveOpenQuestion":
      return handleResolveOpenQuestion(req, res, id);
    case "askStudyChat":
      return handleAskStudyChat(req, res, id);
    case "askQaChat":
      return handleAskQaChat(req, res);
    case "askGlobalCardChat":
      return handleAskGlobalCardChat(req, res);
    case "askSubjectChat":
      return handleAskSubjectChat(req, res);
    case "askKnowledgeBitChat":
      return handleAskKnowledgeBitChat(req, res, id);
    case "draftKnowledgeBitChat":
      return handleDraftKnowledgeBitChat(req, res, id);
    case "createDerivedKnowledgeItem":
      return handleCreateDerivedKnowledgeItem(req, res, id);
    case "listKnowledgeBitVariants":
      return handleListKnowledgeBitVariants(res, id);
    case "generateKnowledgeBitVariants":
      return handleGenerateKnowledgeBitVariants(res, id);
    case "getKnowledgeBitDetail":
      return handleGetKnowledgeBitDetail(res, id);
    case "editKnowledgeBit":
      return handleEditKnowledgeBit(req, res, id);
    case "getCurriculumStats":
      return handleGetCurriculumStats(res, id);
    case "generateRecommendations":
      return handleGenerateRecommendations(res, id);
    case "getStreak":
      return handleGetStreak(res);
    case "getGamificationProfile":
      return handleGetGamificationProfile(res);
    case "getHomeSummary":
      return handleGetHomeSummary(res);
    case "createTranscription":
      return handleCreateTranscription(req, res);
    case "getElectricShape":
      return handleGetElectricShape(res, url.search);
    case "listTags":
      return handleListTags(res);
    case "getTagMastery":
      return handleGetTagMastery(res);
    case "listTagNodes":
      return handleListTagNodes(res, id);
    case "createTag":
      return handleCreateTag(req, res);
    case "assignTag":
      return handleAssignTag(req, res, id);
    case "removeTagAssignment":
      return handleRemoveTagAssignment(res, id, resolved.params.assignmentId ?? "");
    case "mergeTags":
      return handleMergeTags(req, res, id);
    case "gatherLectureSources":
      return handleGatherLectureSources(res, id);
    case "listLectureSourceCandidates":
      return handleListLectureSourceCandidates(res, id);
    case "reviewLectureSourceCandidate":
      return handleReviewLectureSourceCandidate(req, res, id);
    case "compileLecture":
      return handleCompileLecture(res, id);
    case "getLecture":
      return handleGetLecture(res, id);
    case "compileCards":
      return handleCompileCards(res, id);
    case "getCards":
      return handleGetCards(res, id);
    case "getPracticeSettings":
      return handleGetPracticeSettings(res, id);
    case "updatePracticeSettings":
      return handleUpdatePracticeSettings(req, res, id);
    case "createPhraseBatch":
      return handleCreatePhraseBatch(res, id);
    case "createAttempts":
      return handleCreateAttempts(req, res, id);
    case "getPhraseBank":
      return handleGetPhraseBank(res, id);
    case "createWritingCheck":
      return handleCreateWritingCheck(req, res, id);
    case "listWritingChecks":
      return handleListWritingChecks(res, id);
    case "getDomainMap":
      return handleGetDomainMap(res, id);
    case "updateDomainNode":
      return handleUpdateDomainNode(req, res, id);
    case "mergeDomainNodes":
      return handleMergeDomainNodes(req, res, id);
    case "triggerDomainPriorityReview":
      return handleTriggerDomainPriorityReview(req, res, id);
    case "listPrioritySuggestions":
      return handleListPrioritySuggestions(res, id, url.searchParams.get("status"));
    case "resolvePrioritySuggestion":
      return handleResolvePrioritySuggestion(req, res, id);
    case "getDomainPriorityReviewStatus":
      return handleGetDomainPriorityReviewStatus(res, id);
    case "triggerDomainRecommendations":
      return handleTriggerDomainRecommendations(res, id);
    case "listDomainRecommendations":
      return handleListDomainRecommendations(res, id, url.searchParams.get("status"));
    case "resolveDomainRecommendation":
      return handleResolveDomainRecommendation(req, res, id);
    case "triggerDocScan":
      return handleTriggerDocScan(res, id);
    case "triggerAllDocScans":
      return handleTriggerAllDocScans(res);
    case "listDocScanSuggestions":
      return handleListDocScanSuggestions(res, id, url.searchParams.get("status"));
    case "resolveDomainTopicSuggestion":
      return handleResolveDomainTopicSuggestion(req, res, id);
    case "resolveDomainSupersessionSuggestion":
      return handleResolveDomainSupersessionSuggestion(req, res, id);
    case "triggerSubjectDuplicateScan":
      return handleTriggerSubjectDuplicateScan(res);
    case "listSubjectDuplicateSuggestions":
      return handleListSubjectDuplicateSuggestions(res, url.searchParams.get("status"));
    case "resolveSubjectDuplicateSuggestion":
      return handleResolveSubjectDuplicateSuggestion(req, res, id);
    case "triggerSubjectSuggestionScan":
      return handleTriggerSubjectSuggestionScan(res);
    case "listSubjectSuggestions":
      return handleListSubjectSuggestions(res, url.searchParams.get("status"));
    case "resolveSubjectSuggestion":
      return handleResolveSubjectSuggestion(req, res, id);
    case "triggerCurriculumDomainMapping":
      return handleTriggerCurriculumDomainMapping(res, id);
    case "listCurriculumDomainMappings":
      return handleListCurriculumDomainMappings(res, id);
    case "resolveCurriculumDomainMapping":
      return handleResolveCurriculumDomainMapping(req, res, id);
    case "captureLearningListItem":
      return handleCaptureLearningListItem(req, res);
    case "listLearningListItems":
      return handleListLearningListItems(req, res);
    case "getLearningListItem":
      return handleGetLearningListItem(res, id);
    case "resolveLearningListRecommendation":
      return handleResolveLearningListRecommendation(req, res, id);
    case "chooseLearningListDestination":
      return handleChooseLearningListDestination(req, res, id);
    case "classifyLearningListItem":
      return handleClassifyLearningListItem(req, res, id);
    case "createLearningListNudgeResponse":
      return handleCreateLearningListNudgeResponse(req, res, id);
    case "createNudgeResponse":
      return handleCreateNudgeResponse(req, res);
    case "listRoleTemplates":
      return handleListRoleTemplates(res);
    case "createLearningPath":
      return handleCreateLearningPath(req, res);
    case "listLearningPaths":
      return handleListLearningPaths(res, url.searchParams.get("status"));
    case "getLearningPath":
      return handleGetLearningPath(res, id);
    case "updateLearningPath":
      return handleAbandonLearningPath(req, res, id);
    case "getLearningPathStepPush":
      return handleGetLearningPathStepPush(res, id, resolved.params.stepId ?? "");
    case "captureNote":
      return handleCaptureNote(req, res);
    case "listNotesForNode":
      return handleListNotesForNode(
        res,
        url.searchParams.get("nodeType"),
        url.searchParams.get("nodeId"),
      );
    case "searchNotes":
      return handleSearchNotes(
        res,
        url.searchParams.get("q"),
        url.searchParams.get("concern"),
        url.searchParams.get("domainNodeId"),
      );
    case "reviewNote":
      return handleReviewNote(res, url.searchParams.get("excludeIds"));
    case "getCoverageReport":
      return handleGetCoverageReport(res);
    case "getRetentionReport":
      return handleGetRetentionReport(res);
    case "getWeeklyDigest":
      return handleGetWeeklyDigest(res);
    case "createStudySession":
      return handleCreateStudySession(req, res);
    case "listStudySessions":
      return handleListStudySessions(res);
    case "getStudySessionConsistency":
      return handleGetStudySessionConsistency(res, url.searchParams.get("windowDays"));
    case "getStudySession":
      return handleGetStudySession(res, id);
    case "startStudySession":
      return handleStartStudySession(res, id);
    case "endStudySession":
      return handleEndStudySession(req, res, id);
    case "recordStudySessionAnswer":
      return handleRecordStudySessionAnswer(req, res, id);
    case "getStudySessionPush":
      return handleGetStudySessionPush(
        res,
        id,
        url.searchParams.get("excludeGapIds"),
        url.searchParams.get("mode"),
      );
    case "listLibrarySources":
      return handleListLibrarySources(res);
    case "refetchSource":
      return handleRefetchSource(res, id);
    case "listContentInbox":
      return handleListContentInbox(res);
    case "triggerBizEducationDistill":
      return handleTriggerBizEducationDistill(res);
    case "triggerSourceDuplicateScan":
      return handleTriggerSourceDuplicateScan(res);
    case "listSourceDuplicateSuggestions":
      return handleListSourceDuplicateSuggestions(res, url.searchParams.get("status"));
    case "resolveSourceDuplicateSuggestion":
      return handleResolveSourceDuplicateSuggestion(req, res, id);
    case "listMilestones":
      return handleGetMilestones(res);
    case "requestStudyMaterial":
      return handleRequestStudyMaterial(req, res, id);
    case "listStudyMaterials":
      return handleListStudyMaterials(res, id);
    case "listCourseRefocusSuggestions":
      return handleListCourseRefocusSuggestions(res);
    case "dismissCourseRefocusSuggestion":
      return handleDismissCourseRefocusSuggestion(
        res,
        resolved.params.curriculumId ?? "",
        resolved.params.reason ?? "",
      );
  }
}
