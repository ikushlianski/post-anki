import http from "node:http";
import { loadEnv } from "./shared/env.js";
import { log } from "./shared/log.js";
import { sendError, sendJson } from "./shared/http.js";
import {
  handleCreateSubject,
  handleDeleteSubject,
  handleListSubjects,
  handleMergeSubjects,
} from "./subject/subject.controller.js";
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
import { handleDailyPush } from "./push/push.controller.js";
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
import {
  handleGenerateRecommendations,
  handleGetCurriculumStats,
} from "./stats/stats.controller.js";
import { handleGetStreak } from "./streak/streak.controller.js";
import { handleGetHomeSummary } from "./home/home.controller.js";
import { handleCreateTranscription } from "./transcription/transcription.controller.js";
import { handleGetElectricShape } from "./electric/electric-proxy.controller.js";
import {
  handleAssignTag,
  handleCreateTag,
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
  handleGetCards,
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
import { handleGetMilestones } from "./milestone/milestone.controller.js";
import {
  handleListStudyMaterials,
  handleRequestStudyMaterial,
} from "./study-material/study-material.controller.js";
import { resolveRoute } from "./router.js";
import { hashApiToken } from "./api-token/api-token.hash.js";
import { findActiveTokenByHash, touchLastUsed } from "./api-token/api-token.repo.js";
import { flushTracing } from "./mastra/mastra.js";
import { closeDb } from "./db/client.js";

const env = loadEnv();

async function authorized(req: http.IncomingMessage): Promise<boolean> {
  if (!env.API_SHARED_SECRET) {
    return true;
  }

  const header = req.headers.authorization;

  if (header === `Bearer ${env.API_SHARED_SECRET}`) {
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

  void touchLastUsed(token.id);

  return true;
}

const server = http.createServer((req, res) => {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  if (method === "GET" && path === "/_healthz") {
    sendJson(res, 200, { ok: true });
    return;
  }

  void handleRequest(req, res, method, path, url);
});

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

    await route(req, res, method, path, url);
  } catch (err) {
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
    case "listSubjects":
      return handleListSubjects(res);
    case "createSubject":
      return handleCreateSubject(req, res);
    case "deleteSubject":
      return handleDeleteSubject(res, id);
    case "mergeSubjects":
      return handleMergeSubjects(req, res, id);
    case "listCurricula":
      return handleListCurricula(res, url.searchParams.get("subjectId"));
    case "createCurriculum":
      return handleCreateCurriculum(req, res);
    case "getCurriculum":
      return handleGetCurriculum(res, id);
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
      return handleDailyPush(res, url.searchParams.get("mode"));
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
    case "getCurriculumStats":
      return handleGetCurriculumStats(res, id);
    case "generateRecommendations":
      return handleGenerateRecommendations(res, id);
    case "getStreak":
      return handleGetStreak(res);
    case "getHomeSummary":
      return handleGetHomeSummary(res);
    case "createTranscription":
      return handleCreateTranscription(req, res);
    case "getElectricShape":
      return handleGetElectricShape(res, url.search);
    case "listTags":
      return handleListTags(res);
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

server.listen(env.PORT, () => {
  log.info({ port: env.PORT }, "api_listening");
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  log.info({ signal }, "api_shutting_down");
  server.close();
  await flushTracing();
  await closeDb();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
