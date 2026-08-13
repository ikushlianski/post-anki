import { Readable } from "node:stream";
import type http from "node:http";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { LearningListItem } from "@post-anki/shared";

const mockClaimForClassification = vi.fn();
const mockReleaseClassificationClaim = vi.fn();
const mockClaimParkedDestination = vi.fn();
const mockGetLearningListItem = vi.fn();
const mockListLearningListItems = vi.fn();

vi.mock("./learning-list.repo.js", () => ({
  claimForClassification: (...args: unknown[]) => mockClaimForClassification(...args),
  releaseClassificationClaim: (...args: unknown[]) => mockReleaseClassificationClaim(...args),
  claimParkedDestination: (...args: unknown[]) => mockClaimParkedDestination(...args),
  getLearningListItem: (...args: unknown[]) => mockGetLearningListItem(...args),
  listLearningListItems: (...args: unknown[]) => mockListLearningListItems(...args),
}));

const mockCaptureLearningListItem = vi.fn();

vi.mock("./learning-list-classification.orchestrator.js", () => ({
  captureLearningListItem: (...args: unknown[]) => mockCaptureLearningListItem(...args),
}));

const mockApproveRecommendation = vi.fn();
const mockDeclineRecommendation = vi.fn();
const mockRespondToLearningListNudge = vi.fn();

vi.mock("./learning-list-approval.orchestrator.js", () => ({
  approveRecommendation: (...args: unknown[]) => mockApproveRecommendation(...args),
  declineRecommendation: (...args: unknown[]) => mockDeclineRecommendation(...args),
  respondToLearningListNudge: (...args: unknown[]) => mockRespondToLearningListNudge(...args),
}));

vi.mock("../liveness/liveness.repo.js", () => ({
  readLivenessStatuses: vi.fn(async () => new Map()),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  handleChooseLearningListDestination,
  handleClassifyLearningListItem,
} from "./learning-list.controller.js";

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

const item: LearningListItem = {
  id: "llitem_1",
  url: "https://aws.example.com/guide-1",
  rawText: null,
  title: null,
  kind: "article",
  verdict: null,
  recommendation: null,
  status: "captured",
  curriculumId: null,
  questionsGenerated: 0,
  questionCeiling: null,
  createdAt: "2026-08-13T00:00:00.000Z",
  updatedAt: "2026-08-13T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleClassifyLearningListItem — running the classification pipeline on demand", () => {
  it("classifies a captured sibling stub once claimed", async () => {
    mockClaimForClassification.mockResolvedValue(item);
    mockCaptureLearningListItem.mockResolvedValue({ ...item, status: "classified" });

    const req = fakeReq({ subjectId: "sub_1", subSubjectNodeId: null });
    const res = fakeRes();

    await handleClassifyLearningListItem(req, res, item.id);

    expect(mockClaimForClassification).toHaveBeenCalledWith(item.id);
    expect(mockCaptureLearningListItem).toHaveBeenCalledWith({
      url: item.url,
      kind: item.kind,
      pastedDescription: null,
      subjectId: "sub_1",
      subSubjectNodeId: null,
    });
    expect(res.status).toBe(200);
  });

  it("rejects a request with no subjectId before claiming anything", async () => {
    const req = fakeReq({});
    const res = fakeRes();

    await handleClassifyLearningListItem(req, res, item.id);

    expect(res.status).toBe(400);
    expect(mockClaimForClassification).not.toHaveBeenCalled();
  });

  it("blocks a second concurrent classify request with a 409, the double-submission guard", async () => {
    mockClaimForClassification.mockResolvedValue({ error: "not_capturable" });

    const req = fakeReq({ subjectId: "sub_1", subSubjectNodeId: null });
    const res = fakeRes();

    await handleClassifyLearningListItem(req, res, item.id);

    expect(res.status).toBe(409);
    expect(mockCaptureLearningListItem).not.toHaveBeenCalled();
  });

  it("reports a missing item as not found without touching the pipeline", async () => {
    mockClaimForClassification.mockResolvedValue({ error: "not_found" });

    const req = fakeReq({ subjectId: "sub_1", subSubjectNodeId: null });
    const res = fakeRes();

    await handleClassifyLearningListItem(req, res, "missing");

    expect(res.status).toBe(404);
    expect(mockCaptureLearningListItem).not.toHaveBeenCalled();
  });

  it("releases the claim back to captured when the classifier throws, so it can be retried", async () => {
    mockClaimForClassification.mockResolvedValue(item);
    mockCaptureLearningListItem.mockRejectedValue(new Error("no structured output"));

    const req = fakeReq({ subjectId: "sub_1", subSubjectNodeId: null });
    const res = fakeRes();

    await handleClassifyLearningListItem(req, res, item.id);

    expect(mockReleaseClassificationClaim).toHaveBeenCalledWith(item.id);
    expect(res.status).toBe(502);
  });
});

describe("handleChooseLearningListDestination — resolving a parked item's ambiguity", () => {
  it("reuses approveRecommendation once the destination is claimed, unforked", async () => {
    const claimedItem: LearningListItem = { ...item, status: "classified" };

    mockClaimParkedDestination.mockResolvedValue(claimedItem);
    mockApproveRecommendation.mockResolvedValue({
      item: { ...claimedItem, status: "course_created" },
      curriculumId: "cur_1",
    });

    const req = fakeReq({ destination: "mini_course" });
    const res = fakeRes();

    await handleChooseLearningListDestination(req, res, item.id);

    expect(mockClaimParkedDestination).toHaveBeenCalledWith(item.id, "mini_course");
    expect(mockApproveRecommendation).toHaveBeenCalledWith(item.id);
    expect(res.status).toBe(200);
  });

  it("rejects an unsupported destination before claiming anything", async () => {
    const req = fakeReq({ destination: "extend_curriculum" });
    const res = fakeRes();

    await handleChooseLearningListDestination(req, res, item.id);

    expect(res.status).toBe(400);
    expect(mockClaimParkedDestination).not.toHaveBeenCalled();
  });

  it("blocks a second concurrent choice with a 409, the double-submission guard", async () => {
    mockClaimParkedDestination.mockResolvedValue({ error: "not_parked" });

    const req = fakeReq({ destination: "fold_in" });
    const res = fakeRes();

    await handleChooseLearningListDestination(req, res, item.id);

    expect(res.status).toBe(409);
    expect(mockApproveRecommendation).not.toHaveBeenCalled();
  });

  it("surfaces a downstream approval failure, such as a missing Area, instead of pretending it worked", async () => {
    mockClaimParkedDestination.mockResolvedValue({ ...item, status: "classified" });
    mockApproveRecommendation.mockResolvedValue({ error: "fold_in_area_missing" });

    const req = fakeReq({ destination: "fold_in" });
    const res = fakeRes();

    await handleChooseLearningListDestination(req, res, item.id);

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("fold_in_area_missing");
  });
});
