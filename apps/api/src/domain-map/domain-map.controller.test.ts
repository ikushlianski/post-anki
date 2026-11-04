import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("./domain-map.repo.js", () => ({
  getDomainMapForSubject: vi.fn(),
  getDomainNode: vi.fn(),
  getLastReviewedAt: vi.fn(),
  listDomainSupersessionSuggestions: vi.fn(),
  listDomainTopicSuggestions: vi.fn(),
  listPrioritySuggestionsForSubject: vi.fn(),
  mergeDomainNodes: vi.fn(),
  resolveDomainSupersessionSuggestion: vi.fn(),
  resolveDomainTopicSuggestion: vi.fn(),
  resolvePrioritySuggestion: vi.fn(),
  updateDomainNodeTargetDepth: vi.fn(),
}));
vi.mock("./domain-priority-review.orchestrator.js", () => ({ triggerDomainPriorityReview: vi.fn() }));
vi.mock("./doc-scan.orchestrator.js", () => ({ runDocScan: vi.fn(), runDocScanForAllTrackedSubjects: vi.fn() }));

const repo = await import("./domain-map.repo.js");
const orchestrator = await import("./domain-priority-review.orchestrator.js");
const {
  handleListDocScanSuggestions,
  handleListPrioritySuggestions,
  handleMergeDomainNodes,
  handleResolveDomainTopicSuggestion,
  handleResolvePrioritySuggestion,
  handleTriggerDocScan,
  handleTriggerDomainPriorityReview,
  handleUpdateDomainNode,
} = await import("./domain-map.controller.js");

function fakeReq(body: unknown): http.IncomingMessage {
  return Readable.from([JSON.stringify(body)]) as unknown as http.IncomingMessage;
}

function fakeRes() {
  const res = {
    status: null as number | null,
    body: undefined as unknown,
    setHeader() {},
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

describe("handleUpdateDomainNode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should reject a malformed target depth without touching the node", async () => {
    const res = fakeRes();

    await handleUpdateDomainNode(fakeReq({ targetDepth: "nonsense" }), res, "dn_1");

    expect(res.status).toBe(400);
    expect(repo.updateDomainNodeTargetDepth).not.toHaveBeenCalled();
  });

  it("should answer not found for an unknown node", async () => {
    vi.mocked(repo.getDomainNode).mockResolvedValue(null as never);
    const res = fakeRes();

    await handleUpdateDomainNode(fakeReq({ targetDepth: null }), res, "dn_missing");

    expect(res.status).toBe(404);
    expect(repo.updateDomainNodeTargetDepth).not.toHaveBeenCalled();
  });
});

describe("handleMergeDomainNodes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should answer not found when either node is missing", async () => {
    vi.mocked(repo.mergeDomainNodes).mockResolvedValue({ error: "not_found" } as never);
    const res = fakeRes();

    await handleMergeDomainNodes(fakeReq({ sourceDomainNodeId: "dn_a" }), res, "dn_b");

    expect(res.status).toBe(404);
  });

  it("should refuse a merge that would create a cycle with a 400 and the reason", async () => {
    vi.mocked(repo.mergeDomainNodes).mockResolvedValue({ error: "cycle" } as never);
    const res = fakeRes();

    await handleMergeDomainNodes(fakeReq({ sourceDomainNodeId: "dn_a" }), res, "dn_b");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "cycle" });
  });

  it("should return the merge result on success", async () => {
    vi.mocked(repo.mergeDomainNodes).mockResolvedValue({ id: "dn_b" } as never);
    const res = fakeRes();

    await handleMergeDomainNodes(fakeReq({ sourceDomainNodeId: "dn_a" }), res, "dn_b");

    expect(res.status).toBe(200);
    expect(repo.mergeDomainNodes).toHaveBeenCalledWith("dn_b", "dn_a");
  });
});

describe("handleTriggerDomainPriorityReview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should answer 502 with a generic reason instead of the raw error when the review fails", async () => {
    vi.mocked(orchestrator.triggerDomainPriorityReview).mockRejectedValue(new Error("secret detail"));
    const res = fakeRes();

    await handleTriggerDomainPriorityReview({} as http.IncomingMessage, res, "s1");

    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain("secret detail");
  });
});

describe("status filters", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should reject an unknown priority suggestion status filter", async () => {
    const res = fakeRes();

    await handleListPrioritySuggestions(res, "s1", "bogus");

    expect(res.status).toBe(400);
    expect(repo.listPrioritySuggestionsForSubject).not.toHaveBeenCalled();
  });

  it("should reject an unknown doc scan suggestion status filter", async () => {
    const res = fakeRes();

    await handleListDocScanSuggestions(res, "s1", "bogus");

    expect(res.status).toBe(400);
    expect(repo.listDomainTopicSuggestions).not.toHaveBeenCalled();
  });
});

describe("handleTriggerDocScan", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should answer not found for a subject with no domain map", async () => {
    vi.mocked(repo.getDomainMapForSubject).mockResolvedValue([]);
    const res = fakeRes();

    await handleTriggerDocScan(res, "s1");

    expect(res.status).toBe(404);
  });
});

describe("resolving suggestions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("should answer 409 when a topic suggestion was already resolved", async () => {
    vi.mocked(repo.resolveDomainTopicSuggestion).mockResolvedValue({ error: "already_resolved" } as never);
    const res = fakeRes();

    await handleResolveDomainTopicSuggestion(fakeReq({ status: "accepted" }), res, "sg_1");

    expect(res.status).toBe(409);
  });

  it("should answer 404 when the suggestion's subject is gone", async () => {
    vi.mocked(repo.resolveDomainTopicSuggestion).mockResolvedValue({ error: "subject_not_found" } as never);
    const res = fakeRes();

    await handleResolveDomainTopicSuggestion(fakeReq({ status: "accepted" }), res, "sg_1");

    expect(res.status).toBe(404);
  });

  it("should answer 409 when a priority suggestion was already resolved", async () => {
    vi.mocked(repo.resolvePrioritySuggestion).mockResolvedValue({ error: "already_resolved" } as never);
    const res = fakeRes();

    await handleResolvePrioritySuggestion(fakeReq({ status: "rejected" }), res, "ps_1");

    expect(res.status).toBe(409);
  });
});
