import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("./background-job.handlers.js", () => ({ runBackgroundJob: vi.fn() }));

const { backgroundJobFunction } = await import("./background-job.workflow.js");

describe("backgroundJobFunction options", () => {
  const opts = backgroundJobFunction.opts;

  it("should not retry a failed job so paid model calls are not multiplied", () => {
    expect(opts.retries).toBe(0);
  });

  it("should cap how many jobs run at once", () => {
    expect(opts.concurrency).toEqual([{ limit: 5 }]);
  });
});
