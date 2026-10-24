import { describe, expect, it, vi } from "vitest";

const registerWorkflowMock = vi.hoisted(() => vi.fn((fn: unknown) => fn));

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("./detect-knowledge-bits.orchestrator.js", () => ({ defaultGenerateItemsDeps: vi.fn() }));
vi.mock("./knowledge-bit.repo.js", () => ({
  claimOrLoadSourceForExtraction: vi.fn(),
  failProcessingSourcesWithEndedWorkflows: vi.fn(),
  getKnowledgeSourceRawText: vi.fn(),
}));
vi.mock("@dbos-inc/dbos-sdk", () => ({
  DBOS: { registerWorkflow: registerWorkflowMock, setConfig: vi.fn(), launch: vi.fn(), runStep: vi.fn() },
}));

const { buildDbosConfig, createExecutorId } = await import("./durable-extraction.workflow.js");

const ENV = {
  DATABASE_URL: "postgres://x/y",
  DBOS_APPLICATION_VERSION: "release-7",
  DBOS_EXECUTOR_ID: undefined,
} as unknown as Parameters<typeof buildDbosConfig>[0];

describe("DBOS executor id", () => {
  it("should give every launch its own executor id instead of the shared default", () => {
    const first = createExecutorId();
    const second = createExecutorId();

    expect(first).not.toBe(second);
    expect(first).not.toBe("local");
    expect(first).toContain(String(process.pid));
  });

  it("should use a unique executor id in the engine config and pin the application version", () => {
    const a = buildDbosConfig(ENV);
    const b = buildDbosConfig(ENV);

    expect(a.executorID).not.toBe(b.executorID);
    expect(a.applicationVersion).toBe("release-7");
    expect(a.systemDatabaseUrl).toBe("postgres://x/y");
  });

  it("should let a single-instance deployment pin a stable executor id so a restart resumes its own runs", () => {
    const config = buildDbosConfig({ ...ENV, DBOS_EXECUTOR_ID: "api-main" } as Parameters<typeof buildDbosConfig>[0]);

    expect(config.executorID).toBe("api-main");
  });
});

describe("workflow registration", () => {
  it("should cap engine recovery attempts so a crashing run cannot loop on the model forever", () => {
    expect(registerWorkflowMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ name: "extractSource", maxRecoveryAttempts: 3 }),
    );
  });
});
