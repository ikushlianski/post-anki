import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeReq, fakeRes } from "../shared/fake-http.test-mocks.js";

const createSubjectPriority = vi.fn();
const listCurrentPriorities = vi.fn();
const listSubjectPriorities = vi.fn();
const removeSubjectPriority = vi.fn();
const updateSubjectPriority = vi.fn();

vi.mock("./subject-priority.orchestrator.js", () => ({
  createSubjectPriority: (...args: unknown[]) => createSubjectPriority(...args),
  listCurrentPriorities: (...args: unknown[]) => listCurrentPriorities(...args),
  listSubjectPriorities: (...args: unknown[]) => listSubjectPriorities(...args),
  removeSubjectPriority: (...args: unknown[]) => removeSubjectPriority(...args),
  updateSubjectPriority: (...args: unknown[]) => updateSubjectPriority(...args),
}));

const {
  handleCreateSubjectPriority,
  handleDeleteSubjectPriority,
  handleListCurrentPriorities,
  handleListSubjectPriorities,
  handleUpdateSubjectPriority,
} = await import("./subject-priority.controller.js");

const createBody = JSON.stringify({ periodKind: "week", periodKey: "2026-W10", title: "Read" });

describe("subject priority routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("list for a subject", () => {
    it("should answer 400 for an unknown period kind", async () => {
      const res = fakeRes();

      await handleListSubjectPriorities(res, "s1", "period=decade");

      expect(res.status).toBe(400);
      expect((res.body as { error: string }).error).toBe("invalid_input");
      expect(listSubjectPriorities).not.toHaveBeenCalled();
    });

    it("should answer 400 for an unknown time zone", async () => {
      const res = fakeRes();

      await handleListSubjectPriorities(res, "s1", "tz=Mars/Base");

      expect(res.status).toBe(400);
    });

    it("should answer 404 subject_not_found when the subject is unknown", async () => {
      listSubjectPriorities.mockResolvedValue(null);
      const res = fakeRes();

      await handleListSubjectPriorities(res, "missing", "");

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "subject_not_found" });
    });

    it("should answer 200 with the list", async () => {
      listSubjectPriorities.mockResolvedValue({ priorities: [] });
      const res = fakeRes();

      await handleListSubjectPriorities(res, "s1", "period=week&includeDescendants=true");

      expect(res.status).toBe(200);
      expect(listSubjectPriorities).toHaveBeenCalledWith(
        "s1",
        expect.objectContaining({ period: "week", includeDescendants: true }),
      );
    });
  });

  describe("list current priorities", () => {
    it("should answer 400 for an unknown time zone", async () => {
      const res = fakeRes();

      await handleListCurrentPriorities(res, "tz=Nope");

      expect(res.status).toBe(400);
      expect(listCurrentPriorities).not.toHaveBeenCalled();
    });

    it("should default to the week in UTC and answer 200", async () => {
      listCurrentPriorities.mockResolvedValue([]);
      const res = fakeRes();

      await handleListCurrentPriorities(res, "");

      expect(res.status).toBe(200);
      expect(listCurrentPriorities).toHaveBeenCalledWith("week", "UTC", expect.any(Date));
    });
  });

  describe("create", () => {
    it("should answer 400 and create nothing for a bad time zone", async () => {
      const res = fakeRes();

      await handleCreateSubjectPriority(fakeReq(createBody), res, "s1", "tz=Nope");

      expect(res.status).toBe(400);
      expect(createSubjectPriority).not.toHaveBeenCalled();
    });

    it("should answer 400 for a period key that does not match the period kind", async () => {
      const res = fakeRes();

      await handleCreateSubjectPriority(
        fakeReq(JSON.stringify({ periodKind: "week", periodKey: "2026", title: "Read" })),
        res,
        "s1",
        "",
      );

      expect(res.status).toBe(400);
      expect(createSubjectPriority).not.toHaveBeenCalled();
    });

    it("should answer 400 when the body is not valid JSON", async () => {
      const res = fakeRes();

      await handleCreateSubjectPriority(fakeReq("{nope"), res, "s1", "");

      expect(res.status).toBe(400);
    });

    it("should answer 400 when the service rejects the period key", async () => {
      createSubjectPriority.mockResolvedValue({ ok: false, error: "invalid_period_key" });
      const res = fakeRes();

      await handleCreateSubjectPriority(fakeReq(createBody), res, "s1", "");

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "invalid_input", message: "periodKey: no such period" });
    });

    it("should answer 404 subject_not_found when the subject is unknown", async () => {
      createSubjectPriority.mockResolvedValue({ ok: false, error: "subject_not_found" });
      const res = fakeRes();

      await handleCreateSubjectPriority(fakeReq(createBody), res, "missing", "");

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "subject_not_found" });
    });

    it("should answer 201 with the created priority", async () => {
      createSubjectPriority.mockResolvedValue({ ok: true, priority: { id: "p1" } });
      const res = fakeRes();

      await handleCreateSubjectPriority(fakeReq(createBody), res, "s1", "tz=Europe/Paris");

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ id: "p1" });
      expect(createSubjectPriority).toHaveBeenCalledWith("s1", expect.objectContaining({ title: "Read" }), "Europe/Paris");
    });
  });

  describe("update", () => {
    it("should answer 400 for an empty update", async () => {
      const res = fakeRes();

      await handleUpdateSubjectPriority(fakeReq("{}"), res, "p1", "");

      expect(res.status).toBe(400);
      expect(updateSubjectPriority).not.toHaveBeenCalled();
    });

    it("should answer 400 for a bad time zone", async () => {
      const res = fakeRes();

      await handleUpdateSubjectPriority(fakeReq(JSON.stringify({ done: true })), res, "p1", "tz=Nope");

      expect(res.status).toBe(400);
    });

    it("should answer 404 priority_not_found when the priority is unknown", async () => {
      updateSubjectPriority.mockResolvedValue({ ok: false, error: "priority_not_found" });
      const res = fakeRes();

      await handleUpdateSubjectPriority(fakeReq(JSON.stringify({ done: true })), res, "missing", "");

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "priority_not_found" });
    });

    it("should answer 200 with the updated priority", async () => {
      updateSubjectPriority.mockResolvedValue({ ok: true, priority: { id: "p1", done: true } });
      const res = fakeRes();

      await handleUpdateSubjectPriority(fakeReq(JSON.stringify({ done: true })), res, "p1", "");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: "p1", done: true });
    });
  });

  describe("delete", () => {
    it("should answer 404 priority_not_found when nothing was removed", async () => {
      removeSubjectPriority.mockResolvedValue(false);
      const res = fakeRes();

      await handleDeleteSubjectPriority(res, "missing");

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "priority_not_found" });
    });

    it("should answer 200 when the priority is removed", async () => {
      removeSubjectPriority.mockResolvedValue(true);
      const res = fakeRes();

      await handleDeleteSubjectPriority(res, "p1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ deleted: true });
    });
  });
});
