import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenQuestion } from "@post-anki/shared";

const mockInsertOpenQuestion = vi.fn();
const mockListOpenQuestions = vi.fn();
const mockCountOpenQuestions = vi.fn();
const mockResolveOpenQuestionRow = vi.fn();

vi.mock("./open-questions.repo.js", () => ({
  insertOpenQuestion: (...args: unknown[]) => mockInsertOpenQuestion(...args),
  listOpenQuestions: (...args: unknown[]) => mockListOpenQuestions(...args),
  countOpenQuestions: (...args: unknown[]) => mockCountOpenQuestions(...args),
  resolveOpenQuestion: (...args: unknown[]) => mockResolveOpenQuestionRow(...args),
}));

const mockResolveProbeQuestionItem = vi.fn();
const mockResolveSocraticTurnItem = vi.fn();

vi.mock("../shared/study-item.js", () => ({
  resolveProbeQuestionItem: (...args: unknown[]) => mockResolveProbeQuestionItem(...args),
  resolveSocraticTurnItem: (...args: unknown[]) => mockResolveSocraticTurnItem(...args),
}));

const {
  handleCaptureProbeQuestionOpenQuestion,
  handleCaptureSocraticTurnOpenQuestion,
  handleListOpenQuestions,
  handleResolveOpenQuestion,
} = await import("./open-questions.controller.js");

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

function openQuestion(overrides: Partial<OpenQuestion> & { id: string }): OpenQuestion {
  return {
    sourceType: "probe_question",
    sourceItemId: "pq_1",
    topicId: null,
    topicTitle: null,
    questionText: "Why?",
    status: "open",
    answerText: null,
    createdAt: "2026-09-12T00:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleCaptureProbeQuestionOpenQuestion", () => {
  it("404s when the probe question no longer exists, without capturing anything", async () => {
    mockResolveProbeQuestionItem.mockResolvedValue(null);

    const res = fakeRes();
    await handleCaptureProbeQuestionOpenQuestion(fakeReq({ questionText: "Why?" }), res, "pq_missing");

    expect(res.status).toBe(404);
    expect(mockInsertOpenQuestion).not.toHaveBeenCalled();
  });

  it("captures with the topic resolved server-side, never from the client", async () => {
    mockResolveProbeQuestionItem.mockResolvedValue({
      topicId: "t1",
      topicTitle: "Async iterators",
      itemText: "the probe prompt",
    });
    mockInsertOpenQuestion.mockResolvedValue(
      openQuestion({ id: "oq_1", topicId: "t1", topicTitle: "Async iterators", questionText: "Why?" }),
    );

    const res = fakeRes();
    await handleCaptureProbeQuestionOpenQuestion(fakeReq({ questionText: "Why?" }), res, "pq_1");

    expect(mockInsertOpenQuestion).toHaveBeenCalledWith({
      sourceType: "probe_question",
      sourceItemId: "pq_1",
      topicId: "t1",
      topicTitle: "Async iterators",
      questionText: "Why?",
    });
    expect(res.status).toBe(200);
    expect((res.body as OpenQuestion).id).toBe("oq_1");
  });

  it("rejects a blank question text before resolving or capturing", async () => {
    const res = fakeRes();
    await handleCaptureProbeQuestionOpenQuestion(fakeReq({ questionText: "   " }), res, "pq_1");

    expect(res.status).toBe(400);
    expect(mockResolveProbeQuestionItem).not.toHaveBeenCalled();
    expect(mockInsertOpenQuestion).not.toHaveBeenCalled();
  });
});

describe("handleCaptureSocraticTurnOpenQuestion", () => {
  it("404s when the socratic turn no longer exists", async () => {
    mockResolveSocraticTurnItem.mockResolvedValue(null);

    const res = fakeRes();
    await handleCaptureSocraticTurnOpenQuestion(fakeReq({ questionText: "Why?" }), res, "st_missing");

    expect(res.status).toBe(404);
    expect(mockInsertOpenQuestion).not.toHaveBeenCalled();
  });

  it("captures the turn with the topic resolved from its session", async () => {
    mockResolveSocraticTurnItem.mockResolvedValue({
      topicId: "t2",
      topicTitle: "Closures",
      itemText: "the turn prompt",
    });
    mockInsertOpenQuestion.mockResolvedValue(
      openQuestion({
        id: "oq_2",
        sourceType: "socratic_turn",
        sourceItemId: "st_1",
        topicId: "t2",
        topicTitle: "Closures",
        questionText: "Why?",
      }),
    );

    const res = fakeRes();
    await handleCaptureSocraticTurnOpenQuestion(fakeReq({ questionText: "Why?" }), res, "st_1");

    expect(mockInsertOpenQuestion).toHaveBeenCalledWith({
      sourceType: "socratic_turn",
      sourceItemId: "st_1",
      topicId: "t2",
      topicTitle: "Closures",
      questionText: "Why?",
    });
    expect(res.status).toBe(200);
  });
});

describe("handleListOpenQuestions", () => {
  it("400s on an unknown status filter", async () => {
    const res = fakeRes();
    await handleListOpenQuestions(res, "not_a_status", null);

    expect(res.status).toBe(400);
    expect(mockListOpenQuestions).not.toHaveBeenCalled();
  });

  it("400s on a non-positive limit", async () => {
    const res = fakeRes();
    await handleListOpenQuestions(res, null, "0");

    expect(res.status).toBe(400);
    expect(mockListOpenQuestions).not.toHaveBeenCalled();
  });

  it("returns items plus the total count for the applied filter, coercing a string limit", async () => {
    mockListOpenQuestions.mockResolvedValue([openQuestion({ id: "oq_1" }), openQuestion({ id: "oq_2" })]);
    mockCountOpenQuestions.mockResolvedValue(2);

    const res = fakeRes();
    await handleListOpenQuestions(res, "open", "5");

    expect(mockListOpenQuestions).toHaveBeenCalledWith("open", 5);
    expect(mockCountOpenQuestions).toHaveBeenCalledWith("open");
    expect(res.status).toBe(200);
    expect((res.body as { totalCount: number }).totalCount).toBe(2);
    expect((res.body as { items: OpenQuestion[] }).items).toHaveLength(2);
  });

  it("lists everything when no filter is supplied", async () => {
    mockListOpenQuestions.mockResolvedValue([]);
    mockCountOpenQuestions.mockResolvedValue(0);

    const res = fakeRes();
    await handleListOpenQuestions(res, null, null);

    expect(mockListOpenQuestions).toHaveBeenCalledWith(undefined, undefined);
    expect(mockCountOpenQuestions).toHaveBeenCalledWith(undefined);
    expect(res.status).toBe(200);
  });
});

describe("handleResolveOpenQuestion", () => {
  it("400s on a status that is not answered or dismissed", async () => {
    const res = fakeRes();
    await handleResolveOpenQuestion(fakeReq({ status: "open" }), res, "oq_1");

    expect(res.status).toBe(400);
    expect(mockResolveOpenQuestionRow).not.toHaveBeenCalled();
  });

  it("404s when the question is missing or already resolved", async () => {
    mockResolveOpenQuestionRow.mockResolvedValue(null);

    const res = fakeRes();
    await handleResolveOpenQuestion(fakeReq({ status: "answered", answerText: "Because" }), res, "oq_1");

    expect(res.status).toBe(404);
  });

  it("passes the answer text through and returns the resolved question", async () => {
    mockResolveOpenQuestionRow.mockResolvedValue(
      openQuestion({ id: "oq_1", status: "answered", answerText: "Because", resolvedAt: "2026-09-12T01:00:00.000Z" }),
    );

    const res = fakeRes();
    await handleResolveOpenQuestion(fakeReq({ status: "answered", answerText: "Because" }), res, "oq_1");

    expect(mockResolveOpenQuestionRow).toHaveBeenCalledWith("oq_1", "answered", "Because");
    expect(res.status).toBe(200);
    expect((res.body as OpenQuestion).status).toBe("answered");
  });

  it("passes null as the answer when dismissing without one", async () => {
    mockResolveOpenQuestionRow.mockResolvedValue(openQuestion({ id: "oq_1", status: "dismissed" }));

    const res = fakeRes();
    await handleResolveOpenQuestion(fakeReq({ status: "dismissed" }), res, "oq_1");

    expect(mockResolveOpenQuestionRow).toHaveBeenCalledWith("oq_1", "dismissed", null);
    expect(res.status).toBe(200);
  });
});
