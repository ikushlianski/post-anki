import { ROUTES } from "./router-table.js";

export type RouteName =
  | "listSubjects"
  | "createSubject"
  | "deleteSubject"
  | "mergeSubjects"
  | "listCurricula"
  | "createCurriculum"
  | "getCurriculum"
  | "updateCurriculum"
  | "deleteCurriculum"
  | "mergeCurricula"
  | "moveCurriculum"
  | "confirmCurriculum"
  | "completePreAssessment"
  | "addSources"
  | "reparse"
  | "retryResearch"
  | "retryDraftStructure"
  | "approveSources"
  | "getStructureTurns"
  | "submitStructureTurn"
  | "resolveSupplementalResearch"
  | "confirmStructure"
  | "deleteSource"
  | "reorderCurricula"
  | "reorderModules"
  | "createModule"
  | "reorderTopics"
  | "createTopic"
  | "updateModule"
  | "deleteModule"
  | "updateTopic"
  | "deleteTopic"
  | "listTopicGaps"
  | "addModuleComment"
  | "addTopicComment"
  | "startProbe"
  | "submitProbe"
  | "prepareProbeSession"
  | "activeProbeSession"
  | "answerProbeSession"
  | "startSocratic"
  | "answerSocratic"
  | "checkSocraticSessionIdle"
  | "completeSocraticSessionRoute"
  | "declareGap"
  | "curateGap"
  | "triageGap"
  | "listGapsDueForResurface"
  | "markGapResurfaced"
  | "sweepAutoDeferGaps"
  | "dailyPush"
  | "createDecideSession"
  | "listDecideSessions"
  | "resolveDecideBlindSpot"
  | "crossCutting"
  | "gapMasteryCrossCuttingNudge"
  | "getAdminSettings"
  | "updateAdminSettings"
  | "getAdminObservability"
  | "submitProbeQuestionFeedback"
  | "submitSocraticTurnFeedback"
  | "captureProbeQuestionOpenQuestion"
  | "captureSocraticTurnOpenQuestion"
  | "listOpenQuestions"
  | "resolveOpenQuestion"
  | "askStudyChat"
  | "getCurriculumStats"
  | "generateRecommendations"
  | "getStreak"
  | "createTranscription"
  | "getElectricShape"
  | "listTags"
  | "createTag"
  | "assignTag"
  | "removeTagAssignment"
  | "mergeTags"
  | "gatherLectureSources"
  | "listLectureSourceCandidates"
  | "reviewLectureSourceCandidate"
  | "compileLecture"
  | "getLecture"
  | "compileCards"
  | "getCards"
  | "getPracticeSettings"
  | "updatePracticeSettings"
  | "createPhraseBatch"
  | "createAttempts"
  | "getPhraseBank"
  | "createWritingCheck"
  | "listWritingChecks"
  | "getDomainMap"
  | "updateDomainNode"
  | "mergeDomainNodes"
  | "triggerDomainPriorityReview"
  | "listPrioritySuggestions"
  | "resolvePrioritySuggestion"
  | "getDomainPriorityReviewStatus"
  | "triggerDomainRecommendations"
  | "listDomainRecommendations"
  | "resolveDomainRecommendation"
  | "triggerDocScan"
  | "triggerAllDocScans"
  | "listDocScanSuggestions"
  | "resolveDomainTopicSuggestion"
  | "resolveDomainSupersessionSuggestion"
  | "triggerSubjectDuplicateScan"
  | "listSubjectDuplicateSuggestions"
  | "resolveSubjectDuplicateSuggestion"
  | "triggerCurriculumDomainMapping"
  | "listCurriculumDomainMappings"
  | "resolveCurriculumDomainMapping"
  | "captureLearningListItem"
  | "listLearningListItems"
  | "getLearningListItem"
  | "resolveLearningListRecommendation"
  | "chooseLearningListDestination"
  | "classifyLearningListItem"
  | "createLearningListNudgeResponse"
  | "createNudgeResponse"
  | "listRoleTemplates"
  | "createLearningPath"
  | "listLearningPaths"
  | "getLearningPath"
  | "updateLearningPath"
  | "getLearningPathStepPush"
  | "captureNote"
  | "listNotesForNode"
  | "searchNotes"
  | "reviewNote"
  | "getCoverageReport"
  | "getRetentionReport"
  | "getWeeklyDigest"
  | "createStudySession"
  | "listStudySessions"
  | "getStudySessionConsistency"
  | "getStudySession"
  | "startStudySession"
  | "endStudySession"
  | "recordStudySessionAnswer"
  | "getStudySessionPush"
  | "listLibrarySources"
  | "refetchSource"
  | "triggerSourceDuplicateScan"
  | "listSourceDuplicateSuggestions"
  | "resolveSourceDuplicateSuggestion"
  | "listMilestones"
  | "requestStudyMaterial"
  | "listStudyMaterials"
  | "listCourseRefocusSuggestions"
  | "dismissCourseRefocusSuggestion";

export interface ResolvedRoute {
  name: RouteName;
  params: Record<string, string>;
}

export function resolveRoute(method: string, path: string): ResolvedRoute | null {
  for (const def of ROUTES) {
    if (def.method !== method) {
      continue;
    }

    if (typeof def.pattern === "string") {
      if (def.pattern === path) {
        return { name: def.name, params: {} };
      }

      continue;
    }

    const match = path.match(def.pattern);

    if (match) {
      if (def.params) {
        const params: Record<string, string> = {};

        def.params.forEach((name, i) => {
          params[name] = match[i + 1]!;
        });

        return { name: def.name, params };
      }

      return { name: def.name, params: { [def.param!]: match[1]! } };
    }
  }

  return null;
}
