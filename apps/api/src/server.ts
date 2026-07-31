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
  handleReparse,
  handleResolveSupplementalResearch,
  handleRetryDraftStructure,
  handleRetryResearch,
  handleSubmitStructureTurn,
  handleUpdateCurriculum,
} from "./curriculum/curriculum.controller.js";
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
  handleStartSocratic,
} from "./socratic/socratic.controller.js";
import { handleCurateGap, handleDeclareGap } from "./gap/gap.controller.js";
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
import { handleAskStudyChat } from "./study-chat/study-chat.controller.js";
import {
  handleGenerateRecommendations,
  handleGetCurriculumStats,
} from "./stats/stats.controller.js";
import { handleGetStreak } from "./streak/streak.controller.js";
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
  handleListSubjectDuplicateSuggestions,
  handleResolveSubjectDuplicateSuggestion,
  handleTriggerSubjectDuplicateScan,
} from "./subject-duplicate/subject-duplicate.controller.js";
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
    case "reorderModules":
      return handleReorderModules(req, res);
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
    case "declareGap":
      return handleDeclareGap(req, res);
    case "curateGap":
      return handleCurateGap(req, res, id);
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
    case "askStudyChat":
      return handleAskStudyChat(req, res, id);
    case "getCurriculumStats":
      return handleGetCurriculumStats(res, id);
    case "generateRecommendations":
      return handleGenerateRecommendations(res, id);
    case "getStreak":
      return handleGetStreak(res);
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
