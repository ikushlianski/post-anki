import { describe, it, expect } from "vitest";
import { resolveRoute } from "./router.js";

describe("resolveRoute", () => {
  describe("exact paths", () => {
    it("matches collection routes by method", () => {
      expect(resolveRoute("GET", "/subjects")?.name).toBe("listSubjects");
      expect(resolveRoute("POST", "/subjects")?.name).toBe("createSubject");
      expect(resolveRoute("GET", "/curricula")?.name).toBe("listCurricula");
      expect(resolveRoute("POST", "/gaps")?.name).toBe("declareGap");
      expect(resolveRoute("GET", "/daily-push")?.name).toBe("dailyPush");
      // decide-mode: POST /decide is a legacy RPC-shaped route being
      // replaced by the noun-based /decide-sessions resource (spec.md's
      // Route design section) — RED right now, on two counts: router.ts
      // still resolves POST /decide to "decide" (see the "legacy route
      // removed" assertion in the misses block below), and it does not yet
      // resolve POST/GET /decide-sessions at all.
      expect(resolveRoute("POST", "/decide-sessions")?.name).toBe("createDecideSession");
      expect(resolveRoute("GET", "/decide-sessions")?.name).toBe("listDecideSessions");
      expect(resolveRoute("GET", "/cross-cutting")?.name).toBe("crossCutting");
      expect(resolveRoute("GET", "/admin/settings")?.name).toBe(
        "getAdminSettings",
      );
      expect(resolveRoute("PATCH", "/admin/settings")?.name).toBe(
        "updateAdminSettings",
      );
    });

    it("matches the entity-agnostic nudge-response route, so a nudged curriculum can be answered", () => {
      expect(resolveRoute("POST", "/nudge-responses")?.name).toBe("createNudgeResponse");
      expect(resolveRoute("GET", "/nudge-responses")).toBeNull();
    });

    it("matches the learning-list collection routes by method", () => {
      expect(resolveRoute("POST", "/learning-list-items")?.name).toBe(
        "captureLearningListItem",
      );
      expect(resolveRoute("GET", "/learning-list-items")?.name).toBe(
        "listLearningListItems",
      );
    });
  });

  describe("param routes capture the id", () => {
    it("captures curriculum id and distinguishes method", () => {
      expect(resolveRoute("GET", "/curricula/c1")).toEqual({ name: "getCurriculum", params: { id: "c1" } });
      expect(resolveRoute("PATCH", "/curricula/c1")).toEqual({ name: "updateCurriculum", params: { id: "c1" } });
      expect(resolveRoute("DELETE", "/curricula/c1")).toEqual({ name: "deleteCurriculum", params: { id: "c1" } });
    });

    it("captures nested action routes", () => {
      expect(resolveRoute("POST", "/curricula/c1/confirm")).toEqual({ name: "confirmCurriculum", params: { id: "c1" } });
      expect(resolveRoute("POST", "/curricula/c1/merge")).toEqual({ name: "mergeCurricula", params: { id: "c1" } });
      expect(resolveRoute("POST", "/curricula/c1/move")).toEqual({ name: "moveCurriculum", params: { id: "c1" } });
      expect(resolveRoute("POST", "/topics/t1/probe/answer")).toEqual({ name: "submitProbe", params: { id: "t1" } });
      expect(resolveRoute("GET", "/topics/t1/gaps")).toEqual({ name: "listTopicGaps", params: { id: "t1" } });
      expect(resolveRoute("POST", "/topics/t1/study-chat")).toEqual({ name: "askStudyChat", params: { id: "t1" } });
    });

    it("captures the source-approval routes", () => {
      expect(resolveRoute("POST", "/curricula/c1/approve-sources")).toEqual({
        name: "approveSources",
        params: { id: "c1" },
      });
      expect(resolveRoute("DELETE", "/sources/s1")).toEqual({
        name: "deleteSource",
        params: { id: "s1" },
      });
    });

    it("captures the structure-shaping routes", () => {
      expect(resolveRoute("GET", "/curricula/c1/structure-turns")).toEqual({
        name: "getStructureTurns",
        params: { id: "c1" },
      });
      expect(resolveRoute("POST", "/curricula/c1/structure-turns")).toEqual({
        name: "submitStructureTurn",
        params: { id: "c1" },
      });
      expect(resolveRoute("POST", "/curricula/c1/confirm-structure")).toEqual({
        name: "confirmStructure",
        params: { id: "c1" },
      });
    });

    it("captures the supplemental-research resolution route", () => {
      expect(resolveRoute("POST", "/curricula/c1/resolve-research-candidates")).toEqual({
        name: "resolveSupplementalResearch",
        params: { id: "c1" },
      });
    });
  });

  describe("specificity — anchored patterns never collide", () => {
    it("distinguishes /modules/:id from /modules/:id/topics and /topics/order", () => {
      expect(resolveRoute("PATCH", "/modules/m1")?.name).toBe("updateModule");
      expect(resolveRoute("POST", "/modules/m1/topics")?.name).toBe("createTopic");
      expect(resolveRoute("PATCH", "/modules/m1/topics/order")?.name).toBe("reorderTopics");
    });

    it("distinguishes /topics/:id/probe from /topics/:id/probe/answer", () => {
      expect(resolveRoute("POST", "/topics/t1/probe")?.name).toBe("startProbe");
      expect(resolveRoute("POST", "/topics/t1/probe/answer")?.name).toBe("submitProbe");
    });

    it("distinguishes /topics/:id/probe from /topics/:id/study-chat", () => {
      expect(resolveRoute("POST", "/topics/t1/probe")?.name).toBe("startProbe");
      expect(resolveRoute("POST", "/topics/t1/study-chat")?.name).toBe("askStudyChat");
    });

    it("distinguishes /curricula/:id/modules from /curricula/:id/modules/order", () => {
      expect(resolveRoute("POST", "/curricula/c1/modules")?.name).toBe("createModule");
      expect(resolveRoute("PATCH", "/curricula/c1/modules/order")?.name).toBe("reorderModules");
    });

    it("captures the item id on both feedback sub-resource routes", () => {
      expect(resolveRoute("POST", "/probe-session-questions/q1/feedback")).toEqual({
        name: "submitProbeQuestionFeedback",
        params: { id: "q1" },
      });
      expect(resolveRoute("POST", "/socratic-turns/t1/feedback")).toEqual({
        name: "submitSocraticTurnFeedback",
        params: { id: "t1" },
      });
    });

    it("captures both ids on the two-param tag-assignment delete route", () => {
      expect(resolveRoute("DELETE", "/tags/tag1/assignments/asg1")).toEqual({
        name: "removeTagAssignment",
        params: { id: "tag1", assignmentId: "asg1" },
      });
    });

    it("distinguishes the tag-assignment create route from its delete counterpart", () => {
      expect(resolveRoute("POST", "/tags/tag1/assignments")).toEqual({
        name: "assignTag",
        params: { id: "tag1" },
      });
    });

    it("captures the blind-spot id on the decide-mode PATCH route", () => {
      expect(resolveRoute("PATCH", "/decide-blind-spots/bs1")).toEqual({
        name: "resolveDecideBlindSpot",
        params: { id: "bs1" },
      });
    });

    it("captures the item id on the learning-list item route", () => {
      expect(resolveRoute("GET", "/learning-list-items/li1")).toEqual({
        name: "getLearningListItem",
        params: { id: "li1" },
      });
    });

    it("distinguishes the recommendation sub-resource from the item itself", () => {
      expect(resolveRoute("PATCH", "/learning-list-items/li1/recommendation")).toEqual({
        name: "resolveLearningListRecommendation",
        params: { id: "li1" },
      });
      expect(resolveRoute("GET", "/learning-list-items/li1/recommendation")).toBeNull();
    });

    it("distinguishes the nudge-response sub-resource from the item itself", () => {
      expect(resolveRoute("POST", "/learning-list-items/li1/nudge-responses")).toEqual({
        name: "createLearningListNudgeResponse",
        params: { id: "li1" },
      });
      expect(resolveRoute("GET", "/learning-list-items/li1/nudge-responses")).toBeNull();
    });
  });

  describe("misses", () => {
    it("returns null for an unknown path", () => {
      expect(resolveRoute("GET", "/nope")).toBeNull();
    });

    it("returns null for a known path with the wrong method", () => {
      expect(resolveRoute("PUT", "/subjects")).toBeNull();
      expect(resolveRoute("GET", "/decide")).toBeNull();
    });

    it("the legacy POST /decide route no longer resolves — replaced by POST /decide-sessions (decide-mode Backend DoD)", () => {
      expect(resolveRoute("POST", "/decide")).toBeNull();
    });

    it("does not match a trailing-slash variant with an empty id segment", () => {
      expect(resolveRoute("GET", "/subjects/")).toBeNull();
      expect(resolveRoute("DELETE", "/subjects/")).toBeNull();
      expect(resolveRoute("GET", "/learning-list-items/")).toBeNull();
    });

    it("returns null for a learning-list sub-resource with the wrong method", () => {
      expect(resolveRoute("DELETE", "/learning-list-items/li1")).toBeNull();
      expect(resolveRoute("POST", "/learning-list-items/li1/recommendation")).toBeNull();
    });
  });

  describe("learning-path routes", () => {
    it("matches the role-templates and learning-paths collection routes by method", () => {
      expect(resolveRoute("GET", "/role-templates")?.name).toBe("listRoleTemplates");
      expect(resolveRoute("POST", "/learning-paths")?.name).toBe("createLearningPath");
      expect(resolveRoute("GET", "/learning-paths")?.name).toBe("listLearningPaths");
    });

    it("captures the path id on the detail and abandon routes", () => {
      expect(resolveRoute("GET", "/learning-paths/p1")).toEqual({
        name: "getLearningPath",
        params: { id: "p1" },
      });
      expect(resolveRoute("PATCH", "/learning-paths/p1")).toEqual({
        name: "updateLearningPath",
        params: { id: "p1" },
      });
    });

    it("distinguishes the step-push sub-resource from the path detail route (specific before generic)", () => {
      expect(resolveRoute("GET", "/learning-paths/p1/steps/s1/push")).toEqual({
        name: "getLearningPathStepPush",
        params: { id: "p1", stepId: "s1" },
      });
      expect(resolveRoute("GET", "/learning-paths/p1")).toEqual({
        name: "getLearningPath",
        params: { id: "p1" },
      });
    });

    it("returns null for an unknown learning-path sub-resource", () => {
      expect(resolveRoute("POST", "/learning-paths/p1/steps/s1/push")).toBeNull();
      expect(resolveRoute("DELETE", "/learning-paths/p1")).toBeNull();
    });
  });

  describe("note routes", () => {
    it("matches the notes collection routes by method", () => {
      expect(resolveRoute("POST", "/notes")?.name).toBe("captureNote");
      expect(resolveRoute("GET", "/notes")?.name).toBe("listNotesForNode");
    });

    it("distinguishes /notes/search and /notes/review from the generic /notes collection route (specific before generic)", () => {
      expect(resolveRoute("GET", "/notes/search")?.name).toBe("searchNotes");
      expect(resolveRoute("GET", "/notes/review")?.name).toBe("reviewNote");
      expect(resolveRoute("GET", "/notes")?.name).toBe("listNotesForNode");
    });

    it("returns null for an unknown method on the notes sub-resources", () => {
      expect(resolveRoute("POST", "/notes/search")).toBeNull();
      expect(resolveRoute("POST", "/notes/review")).toBeNull();
    });
  });

  describe("analytics routes", () => {
    it("matches the coverage, retention and digest routes by method", () => {
      expect(resolveRoute("GET", "/analytics/coverage")?.name).toBe("getCoverageReport");
      expect(resolveRoute("GET", "/analytics/retention")?.name).toBe("getRetentionReport");
      expect(resolveRoute("GET", "/analytics/digest")?.name).toBe("getWeeklyDigest");
    });
  });

  describe("milestone routes", () => {
    it("matches the milestones collection route", () => {
      expect(resolveRoute("GET", "/milestones")?.name).toBe("listMilestones");
    });
  });

  describe("study-material routes", () => {
    it("captures the topic id on both the request and list study-material routes", () => {
      expect(resolveRoute("POST", "/topics/t1/study-materials")).toEqual({
        name: "requestStudyMaterial",
        params: { id: "t1" },
      });
      expect(resolveRoute("GET", "/topics/t1/study-materials")).toEqual({
        name: "listStudyMaterials",
        params: { id: "t1" },
      });
    });
  });

  describe("content-library and source-duplicate routes", () => {
    it("matches the sources listing route and coexists with the pre-existing DELETE /sources/:id route", () => {
      expect(resolveRoute("GET", "/sources")?.name).toBe("listLibrarySources");
      expect(resolveRoute("DELETE", "/sources/s1")).toEqual({
        name: "deleteSource",
        params: { id: "s1" },
      });
      expect(resolveRoute("POST", "/sources/s1/refetch")).toEqual({
        name: "refetchSource",
        params: { id: "s1" },
      });
    });

    it("matches the source-duplicate scan, list and resolve routes", () => {
      expect(resolveRoute("POST", "/source-duplicate-scans")?.name).toBe(
        "triggerSourceDuplicateScan",
      );
      expect(resolveRoute("GET", "/source-duplicate-suggestions")?.name).toBe(
        "listSourceDuplicateSuggestions",
      );
      expect(resolveRoute("PATCH", "/source-duplicate-suggestions/sd1")).toEqual({
        name: "resolveSourceDuplicateSuggestion",
        params: { id: "sd1" },
      });
    });
  });

  describe("study-session routes", () => {
    it("matches the collection routes by method", () => {
      expect(resolveRoute("POST", "/study-sessions")?.name).toBe("createStudySession");
      expect(resolveRoute("GET", "/study-sessions")?.name).toBe("listStudySessions");
    });

    it("distinguishes the consistency sub-resource from the session detail route (specific before generic)", () => {
      expect(resolveRoute("GET", "/study-sessions/consistency")?.name).toBe(
        "getStudySessionConsistency",
      );
      expect(resolveRoute("GET", "/study-sessions/s1")).toEqual({
        name: "getStudySession",
        params: { id: "s1" },
      });
    });

    it("captures the session id on the start, end, answers and push sub-resource routes", () => {
      expect(resolveRoute("PATCH", "/study-sessions/s1/start")).toEqual({
        name: "startStudySession",
        params: { id: "s1" },
      });
      expect(resolveRoute("PATCH", "/study-sessions/s1/end")).toEqual({
        name: "endStudySession",
        params: { id: "s1" },
      });
      expect(resolveRoute("PATCH", "/study-sessions/s1/answers")).toEqual({
        name: "recordStudySessionAnswer",
        params: { id: "s1" },
      });
      expect(resolveRoute("GET", "/study-sessions/s1/push")).toEqual({
        name: "getStudySessionPush",
        params: { id: "s1" },
      });
    });
  });
});
