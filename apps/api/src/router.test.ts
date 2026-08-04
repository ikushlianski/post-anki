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
    });
  });
});
