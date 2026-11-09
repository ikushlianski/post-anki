import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const mockRunPipelineSweep = vi.fn();

vi.mock("./pipeline-sweep.orchestrator.js", () => ({
  runPipelineSweep: (...args: unknown[]) => mockRunPipelineSweep(...args),
}));

import { handleSweepKnowledgePipeline } from "./pipeline-sweep.controller.js";

function makeRes() {
  const res = { writeHead: vi.fn(), end: vi.fn() };

  return res as unknown as http.ServerResponse & typeof res;
}

describe("handleSweepKnowledgePipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should answer 200 with the sweep result", async () => {
    mockRunPipelineSweep.mockResolvedValue({ requeued: 1, deferred: 0, kickSent: true });
    const res = makeRes();

    await handleSweepKnowledgePipeline(res);

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.anything());
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ requeued: 1, deferred: 0, kickSent: true }));
  });

  it("should answer 502 when the sweep throws", async () => {
    mockRunPipelineSweep.mockRejectedValue(new Error("boom"));
    const res = makeRes();

    await handleSweepKnowledgePipeline(res);

    expect(res.writeHead).toHaveBeenCalledWith(502, expect.anything());
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining("sweep_failed"));
  });
});
