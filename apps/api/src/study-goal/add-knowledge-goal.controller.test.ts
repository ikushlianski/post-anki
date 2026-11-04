import type http from "node:http";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const putGoal = vi.hoisted(() => vi.fn());
const removeGoal = vi.hoisted(() => vi.fn());
const listGoalProgress = vi.hoisted(() => vi.fn());

vi.mock("./add-knowledge-goal.orchestrator.js", () => ({
  putGoal,
  removeGoal,
  listGoalProgress,
  listGoals: vi.fn(),
}));

import {
  handleDeleteAddKnowledgeGoal,
  handleListAddKnowledgeGoalProgress,
  handlePutAddKnowledgeGoal,
} from "./add-knowledge-goal.controller.js";

function fakeReq(body: unknown): http.IncomingMessage {
  return Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as http.IncomingMessage;
}

function fakeRes() {
  const res = { writeHead: vi.fn(), end: vi.fn() };

  return res as unknown as http.ServerResponse & typeof res;
}

function sent(res: ReturnType<typeof fakeRes>): { status: number; body: unknown } {
  return {
    status: vi.mocked(res.writeHead).mock.calls[0]![0] as number,
    body: JSON.parse(vi.mocked(res.end).mock.calls[0]![0] as string),
  };
}

beforeEach(() => {
  putGoal.mockReset();
  removeGoal.mockReset();
  listGoalProgress.mockReset();
});

describe("handlePutAddKnowledgeGoal", () => {
  it("should answer 400 when the target is zero", async () => {
    const res = fakeRes();

    await handlePutAddKnowledgeGoal(fakeReq({ subjectId: "s1", targetNotes: 0 }), res);

    expect(sent(res).status).toBe(400);
    expect(putGoal).not.toHaveBeenCalled();
  });

  it("should answer 404 when the subject does not exist", async () => {
    putGoal.mockResolvedValue(null);
    const res = fakeRes();

    await handlePutAddKnowledgeGoal(fakeReq({ subjectId: "nope", targetNotes: 5 }), res);

    expect(sent(res)).toEqual({ status: 404, body: { error: "subject_not_found" } });
  });

  it("should save the goal with a weekly period by default", async () => {
    putGoal.mockResolvedValue({ id: "g1" });
    const res = fakeRes();

    await handlePutAddKnowledgeGoal(fakeReq({ subjectId: "s1", targetNotes: 5 }), res);

    expect(putGoal).toHaveBeenCalledWith({ subjectId: "s1", targetNotes: 5, period: "week" });
    expect(sent(res)).toEqual({ status: 200, body: { id: "g1" } });
  });
});

describe("handleDeleteAddKnowledgeGoal", () => {
  it("should answer 404 for an unknown goal", async () => {
    removeGoal.mockResolvedValue(false);
    const res = fakeRes();

    await handleDeleteAddKnowledgeGoal(res, "nope");

    expect(sent(res)).toEqual({ status: 404, body: { error: "add_knowledge_goal_not_found" } });
  });

  it("should confirm the deletion", async () => {
    removeGoal.mockResolvedValue(true);
    const res = fakeRes();

    await handleDeleteAddKnowledgeGoal(res, "g1");

    expect(sent(res)).toEqual({ status: 200, body: { deleted: true } });
  });
});

describe("handleListAddKnowledgeGoalProgress", () => {
  it("should answer 400 for an unknown time zone", async () => {
    const res = fakeRes();

    await handleListAddKnowledgeGoalProgress(res, "tz=Mars%2FBase");

    expect(sent(res).status).toBe(400);
  });

  it("should return progress in the requested zone", async () => {
    listGoalProgress.mockResolvedValue([]);
    const res = fakeRes();

    await handleListAddKnowledgeGoalProgress(res, "tz=Europe%2FLisbon");

    expect(listGoalProgress.mock.calls[0]![0]).toBe("Europe/Lisbon");
    expect(sent(res)).toEqual({ status: 200, body: { goals: [] } });
  });
});
