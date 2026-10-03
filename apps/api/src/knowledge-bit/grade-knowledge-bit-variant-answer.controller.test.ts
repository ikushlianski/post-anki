import type http from "node:http";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const mockGradeKnowledgeBitVariantAnswer = vi.fn();

vi.mock("./grade-knowledge-bit-variant-answer.orchestrator.js", () => ({
  gradeKnowledgeBitVariantAnswer: (...args: unknown[]) =>
    mockGradeKnowledgeBitVariantAnswer(...args),
}));

const { handleGradeKnowledgeBitVariantAnswer } = await import(
  "./grade-knowledge-bit-variant-answer.controller.js"
);

function fakeReq(body: unknown): http.IncomingMessage {
  const readable = new Readable({
    read() {
      this.push(JSON.stringify(body));
      this.push(null);
    },
  });

  return readable as unknown as http.IncomingMessage;
}

function fakeRes(): http.ServerResponse & { status: number | null; body: unknown } {
  const res = {
    status: null as number | null,
    body: undefined as unknown,
    writeHead(status: number) {
      res.status = status;
      return res;
    },
    end(payload?: string) {
      res.body = payload ? JSON.parse(payload) : undefined;
    },
  };

  return res as unknown as http.ServerResponse & { status: number | null; body: unknown };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleGradeKnowledgeBitVariantAnswer", () => {
  it("returns 200 with the grade on success", async () => {
    mockGradeKnowledgeBitVariantAnswer.mockResolvedValue({
      ok: true,
      score: 8,
      verdict: "Ok",
      feedback: "Good.",
      followUpQuestion: "What would happen if this were reversed?",
      tagIds: ["tag_x"],
    });

    const req = fakeReq({ userAnswer: "Because of Y." });
    const res = fakeRes();

    await handleGradeKnowledgeBitVariantAnswer(req, res, "kbqv_1");

    expect(mockGradeKnowledgeBitVariantAnswer).toHaveBeenCalledWith("kbqv_1", "Because of Y.");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      score: 8,
      verdict: "Ok",
      feedback: "Good.",
      followUpQuestion: "What would happen if this were reversed?",
      tagIds: ["tag_x"],
    });
  });

  it("returns 400 on an empty userAnswer, never reaching the orchestrator", async () => {
    const req = fakeReq({ userAnswer: "" });
    const res = fakeRes();

    await handleGradeKnowledgeBitVariantAnswer(req, res, "kbqv_1");

    expect(res.status).toBe(400);
    expect(mockGradeKnowledgeBitVariantAnswer).not.toHaveBeenCalled();
  });

  it("returns 404 when the variant doesn't exist, never a silent 200", async () => {
    mockGradeKnowledgeBitVariantAnswer.mockResolvedValue({
      ok: false,
      error: "variant_not_found",
    });

    const req = fakeReq({ userAnswer: "Something." });
    const res = fakeRes();

    await handleGradeKnowledgeBitVariantAnswer(req, res, "kbqv_missing");

    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe("variant_not_found");
  });

  it("should return 403 when the variant's bit isn't approved yet", async () => {
    mockGradeKnowledgeBitVariantAnswer.mockResolvedValue({
      ok: false,
      error: "not_approved",
    });

    const req = fakeReq({ userAnswer: "Something." });
    const res = fakeRes();

    await handleGradeKnowledgeBitVariantAnswer(req, res, "kbqv_1");

    expect(res.status).toBe(403);
    expect((res.body as { error: string }).error).toBe("not_approved");
  });

  it("returns 502 with an error message when grading throws, never a silent 200", async () => {
    mockGradeKnowledgeBitVariantAnswer.mockRejectedValue(new Error("grader provider down"));

    const req = fakeReq({ userAnswer: "Something." });
    const res = fakeRes();

    await handleGradeKnowledgeBitVariantAnswer(req, res, "kbqv_1");

    expect(res.status).toBe(502);
    expect((res.body as { error: string }).error).toBe("grading_failed");
    expect((res.body as { message: string }).message).toBe("grader provider down");
  });
});
