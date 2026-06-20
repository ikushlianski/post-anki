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
      expect(resolveRoute("POST", "/decide")?.name).toBe("decide");
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
      expect(resolveRoute("POST", "/topics/t1/probe/answer")).toEqual({ name: "submitProbe", params: { id: "t1" } });
      expect(resolveRoute("GET", "/topics/t1/gaps")).toEqual({ name: "listTopicGaps", params: { id: "t1" } });
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

    it("distinguishes /curricula/:id/modules from /curricula/:id/modules/order", () => {
      expect(resolveRoute("POST", "/curricula/c1/modules")?.name).toBe("createModule");
      expect(resolveRoute("PATCH", "/curricula/c1/modules/order")?.name).toBe("reorderModules");
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

    it("does not match a trailing-slash variant with an empty id segment", () => {
      expect(resolveRoute("GET", "/subjects/")).toBeNull();
      expect(resolveRoute("DELETE", "/subjects/")).toBeNull();
    });
  });
});
