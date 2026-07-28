export type RouteName =
  | "listSubjects"
  | "createSubject"
  | "deleteSubject"
  | "listCurricula"
  | "createCurriculum"
  | "getCurriculum"
  | "updateCurriculum"
  | "deleteCurriculum"
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
  | "declareGap"
  | "curateGap"
  | "dailyPush"
  | "decide"
  | "crossCutting"
  | "getAdminSettings"
  | "updateAdminSettings"
  | "getAdminObservability"
  | "submitProbeQuestionFeedback"
  | "submitSocraticTurnFeedback"
  | "askStudyChat"
  | "getCurriculumStats"
  | "generateRecommendations"
  | "getStreak"
  | "getElectricShape"
  | "listTags"
  | "createTag"
  | "assignTag"
  | "removeTagAssignment"
  | "gatherLectureSources"
  | "listLectureSourceCandidates"
  | "reviewLectureSourceCandidate"
  | "compileLecture"
  | "getLecture"
  | "getPracticeSettings"
  | "updatePracticeSettings"
  | "createPhraseBatch"
  | "createAttempts"
  | "getPhraseBank"
  | "createWritingCheck"
  | "listWritingChecks"
  | "getDomainMap";

export interface ResolvedRoute {
  name: RouteName;
  params: Record<string, string>;
}

interface RouteDef {
  method: string;
  pattern: string | RegExp;
  name: RouteName;
  param?: string;
  params?: string[];
}

const ROUTES: RouteDef[] = [
  { method: "GET", pattern: "/subjects", name: "listSubjects" },
  { method: "POST", pattern: "/subjects", name: "createSubject" },
  { method: "DELETE", pattern: /^\/subjects\/([^/]+)$/, name: "deleteSubject", param: "id" },
  { method: "GET", pattern: "/curricula", name: "listCurricula" },
  { method: "POST", pattern: "/curricula", name: "createCurriculum" },
  { method: "POST", pattern: /^\/curricula\/([^/]+)\/confirm$/, name: "confirmCurriculum", param: "id" },
  { method: "POST", pattern: /^\/curricula\/([^/]+)\/complete-pre-assessment$/, name: "completePreAssessment", param: "id" },
  { method: "POST", pattern: /^\/curricula\/([^/]+)\/sources$/, name: "addSources", param: "id" },
  { method: "POST", pattern: /^\/curricula\/([^/]+)\/reparse$/, name: "reparse", param: "id" },
  { method: "POST", pattern: /^\/curricula\/([^/]+)\/retry-research$/, name: "retryResearch", param: "id" },
  { method: "POST", pattern: /^\/curricula\/([^/]+)\/retry-structure-draft$/, name: "retryDraftStructure", param: "id" },
  { method: "POST", pattern: /^\/curricula\/([^/]+)\/approve-sources$/, name: "approveSources", param: "id" },
  { method: "GET", pattern: /^\/curricula\/([^/]+)\/structure-turns$/, name: "getStructureTurns", param: "id" },
  { method: "POST", pattern: /^\/curricula\/([^/]+)\/structure-turns$/, name: "submitStructureTurn", param: "id" },
  { method: "POST", pattern: /^\/curricula\/([^/]+)\/resolve-research-candidates$/, name: "resolveSupplementalResearch", param: "id" },
  { method: "POST", pattern: /^\/curricula\/([^/]+)\/confirm-structure$/, name: "confirmStructure", param: "id" },
  { method: "DELETE", pattern: /^\/sources\/([^/]+)$/, name: "deleteSource", param: "id" },
  { method: "PATCH", pattern: /^\/curricula\/([^/]+)\/modules\/order$/, name: "reorderModules", param: "id" },
  { method: "POST", pattern: /^\/curricula\/([^/]+)\/modules$/, name: "createModule", param: "id" },
  { method: "GET", pattern: /^\/curricula\/([^/]+)$/, name: "getCurriculum", param: "id" },
  { method: "PATCH", pattern: /^\/curricula\/([^/]+)$/, name: "updateCurriculum", param: "id" },
  { method: "DELETE", pattern: /^\/curricula\/([^/]+)$/, name: "deleteCurriculum", param: "id" },
  { method: "PATCH", pattern: /^\/modules\/([^/]+)\/topics\/order$/, name: "reorderTopics", param: "id" },
  { method: "POST", pattern: /^\/modules\/([^/]+)\/topics$/, name: "createTopic", param: "id" },
  { method: "PATCH", pattern: /^\/modules\/([^/]+)$/, name: "updateModule", param: "id" },
  { method: "DELETE", pattern: /^\/modules\/([^/]+)$/, name: "deleteModule", param: "id" },
  { method: "POST", pattern: /^\/modules\/([^/]+)\/comments$/, name: "addModuleComment", param: "id" },
  { method: "GET", pattern: /^\/topics\/([^/]+)\/gaps$/, name: "listTopicGaps", param: "id" },
  { method: "POST", pattern: /^\/topics\/([^/]+)\/comments$/, name: "addTopicComment", param: "id" },
  { method: "POST", pattern: /^\/topics\/([^/]+)\/probe\/answer$/, name: "submitProbe", param: "id" },
  { method: "POST", pattern: /^\/topics\/([^/]+)\/probe$/, name: "startProbe", param: "id" },
  { method: "GET", pattern: "/probe-sessions/active", name: "activeProbeSession" },
  { method: "POST", pattern: "/probe-sessions", name: "prepareProbeSession" },
  { method: "POST", pattern: /^\/probe-sessions\/([^/]+)\/answer$/, name: "answerProbeSession", param: "id" },
  { method: "POST", pattern: "/socratic-sessions", name: "startSocratic" },
  { method: "POST", pattern: /^\/socratic-sessions\/([^/]+)\/answer$/, name: "answerSocratic", param: "id" },
  { method: "PATCH", pattern: /^\/topics\/([^/]+)$/, name: "updateTopic", param: "id" },
  { method: "DELETE", pattern: /^\/topics\/([^/]+)$/, name: "deleteTopic", param: "id" },
  { method: "POST", pattern: "/gaps", name: "declareGap" },
  { method: "PATCH", pattern: /^\/gaps\/([^/]+)$/, name: "curateGap", param: "id" },
  { method: "GET", pattern: "/daily-push", name: "dailyPush" },
  { method: "POST", pattern: "/decide", name: "decide" },
  { method: "GET", pattern: "/cross-cutting", name: "crossCutting" },
  { method: "GET", pattern: "/admin/settings", name: "getAdminSettings" },
  { method: "PATCH", pattern: "/admin/settings", name: "updateAdminSettings" },
  { method: "GET", pattern: "/admin/observability", name: "getAdminObservability" },
  {
    method: "POST",
    pattern: /^\/probe-session-questions\/([^/]+)\/feedback$/,
    name: "submitProbeQuestionFeedback",
    param: "id",
  },
  {
    method: "POST",
    pattern: /^\/socratic-turns\/([^/]+)\/feedback$/,
    name: "submitSocraticTurnFeedback",
    param: "id",
  },
  {
    method: "POST",
    pattern: /^\/topics\/([^/]+)\/study-chat$/,
    name: "askStudyChat",
    param: "id",
  },
  {
    method: "GET",
    pattern: /^\/curricula\/([^/]+)\/stats$/,
    name: "getCurriculumStats",
    param: "id",
  },
  {
    method: "POST",
    pattern: /^\/curricula\/([^/]+)\/stats\/recommendations$/,
    name: "generateRecommendations",
    param: "id",
  },
  { method: "GET", pattern: "/streak", name: "getStreak" },
  { method: "GET", pattern: "/electric/v1/shape", name: "getElectricShape" },
  { method: "GET", pattern: "/tags", name: "listTags" },
  { method: "POST", pattern: "/tags", name: "createTag" },
  {
    method: "POST",
    pattern: /^\/tags\/([^/]+)\/assignments$/,
    name: "assignTag",
    param: "id",
  },
  {
    method: "DELETE",
    pattern: /^\/tags\/([^/]+)\/assignments\/([^/]+)$/,
    name: "removeTagAssignment",
    params: ["id", "assignmentId"],
  },
  {
    method: "POST",
    pattern: /^\/topics\/([^/]+)\/lecture\/sources$/,
    name: "gatherLectureSources",
    param: "id",
  },
  {
    method: "GET",
    pattern: /^\/topics\/([^/]+)\/lecture\/sources$/,
    name: "listLectureSourceCandidates",
    param: "id",
  },
  {
    method: "PATCH",
    pattern: /^\/lecture-source-candidates\/([^/]+)$/,
    name: "reviewLectureSourceCandidate",
    param: "id",
  },
  {
    method: "POST",
    pattern: /^\/topics\/([^/]+)\/lecture$/,
    name: "compileLecture",
    param: "id",
  },
  {
    method: "GET",
    pattern: /^\/topics\/([^/]+)\/lecture$/,
    name: "getLecture",
    param: "id",
  },
  {
    method: "GET",
    pattern: /^\/subjects\/([^/]+)\/practice-settings$/,
    name: "getPracticeSettings",
    param: "id",
  },
  {
    method: "PATCH",
    pattern: /^\/subjects\/([^/]+)\/practice-settings$/,
    name: "updatePracticeSettings",
    param: "id",
  },
  {
    method: "POST",
    pattern: /^\/subjects\/([^/]+)\/phrase-batches$/,
    name: "createPhraseBatch",
    param: "id",
  },
  {
    method: "POST",
    pattern: /^\/subjects\/([^/]+)\/attempts$/,
    name: "createAttempts",
    param: "id",
  },
  {
    method: "GET",
    pattern: /^\/subjects\/([^/]+)\/phrase-bank$/,
    name: "getPhraseBank",
    param: "id",
  },
  {
    method: "POST",
    pattern: /^\/subjects\/([^/]+)\/writing-checks$/,
    name: "createWritingCheck",
    param: "id",
  },
  {
    method: "GET",
    pattern: /^\/subjects\/([^/]+)\/writing-checks$/,
    name: "listWritingChecks",
    param: "id",
  },
  {
    method: "GET",
    pattern: /^\/subjects\/([^/]+)\/domain-map$/,
    name: "getDomainMap",
    param: "id",
  },
];

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
