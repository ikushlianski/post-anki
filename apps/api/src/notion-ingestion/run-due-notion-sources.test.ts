import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotionSourceRow } from "./notion-ingestion-source.repo.js";
import { FakeNotionPageGateway } from "./fake-notion-page.gateway.js";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("./notion-source-due.repo.js", () => ({
  listDueNotionSources: vi.fn(),
  claimDueNotionSource: vi.fn(),
  restoreNextRunAt: vi.fn(),
  settleNextRunAt: vi.fn(),
}));
vi.mock("./run-notion-source.js", () => ({ runNotionSource: vi.fn() }));

const due = await import("./notion-source-due.repo.js");
const { runNotionSource } = await import("./run-notion-source.js");
const { runDueNotionSources } = await import("./run-due-notion-sources.js");

const NOW = new Date("2026-10-30T01:00:00Z");

function row(id: string): NotionSourceRow {
  return { id, nextRunAt: NOW, frequency: "nightly", paused: false } as NotionSourceRow;
}

const okResult = {
  status: "ok",
  read: 0,
  imported: 0,
  skippedExisting: 0,
  ignored: 0,
  removed: 0,
  removeFailed: 0,
  truncated: false,
  pendingAfterLimit: 0,
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(due.claimDueNotionSource).mockImplementation(async (candidate) => ({
    source: candidate,
    previousNextRunAt: NOW,
  }));
  vi.mocked(runNotionSource).mockResolvedValue({ kind: "finished", result: okResult });
});

describe("runDueNotionSources", () => {
  it("should run each due source once as a scheduled run", async () => {
    vi.mocked(due.listDueNotionSources).mockResolvedValue([row("a"), row("b")]);

    const reports = await runDueNotionSources(new FakeNotionPageGateway(), () => NOW);

    expect(reports.map((r) => r.sourceId)).toEqual(["a", "b"]);
    expect(vi.mocked(runNotionSource).mock.calls.map((call) => call[1])).toEqual(["scheduled", "scheduled"]);
  });

  it("should skip a source another tick already claimed", async () => {
    vi.mocked(due.listDueNotionSources).mockResolvedValue([row("a"), row("b")]);
    vi.mocked(due.claimDueNotionSource).mockResolvedValueOnce(null);

    const reports = await runDueNotionSources(new FakeNotionPageGateway(), () => NOW);

    expect(reports.map((r) => r.sourceId)).toEqual(["b"]);
  });

  it("should stop the tick and give the source its old due time back when the budget trips", async () => {
    vi.mocked(due.listDueNotionSources).mockResolvedValue([row("a"), row("b")]);
    vi.mocked(runNotionSource).mockResolvedValue({
      kind: "finished",
      result: { ...okResult, status: "skipped_budget" },
    });

    const reports = await runDueNotionSources(new FakeNotionPageGateway(), () => NOW);

    expect(reports.map((r) => r.status)).toEqual(["skipped_budget"]);
    expect(runNotionSource).toHaveBeenCalledTimes(1);
    expect(due.restoreNextRunAt).toHaveBeenCalledTimes(1);
  });

  it("should keep going after one source throws and settle its slot", async () => {
    vi.mocked(due.listDueNotionSources).mockResolvedValue([row("a"), row("b")]);
    vi.mocked(runNotionSource).mockRejectedValueOnce(new Error("boom"));

    const reports = await runDueNotionSources(new FakeNotionPageGateway(), () => NOW);

    expect(reports.map((r) => r.status)).toEqual(["failed", "ok"]);
    expect(due.restoreNextRunAt).not.toHaveBeenCalled();
    expect(due.settleNextRunAt).toHaveBeenCalledTimes(2);
  });

  it("should do nothing when no source is due", async () => {
    vi.mocked(due.listDueNotionSources).mockResolvedValue([]);

    expect(await runDueNotionSources(new FakeNotionPageGateway(), () => NOW)).toEqual([]);
  });

  it("should settle the real next slot after a finished run, whatever the outcome", async () => {
    vi.mocked(due.listDueNotionSources).mockResolvedValue([row("a"), row("b")]);
    vi.mocked(runNotionSource)
      .mockResolvedValueOnce({ kind: "finished", result: { ...okResult, status: "skipped_no_connection" } })
      .mockResolvedValueOnce({ kind: "finished", result: { ...okResult, status: "partial" } });

    await runDueNotionSources(new FakeNotionPageGateway(), () => NOW);

    expect(due.settleNextRunAt).toHaveBeenCalledTimes(2);
    expect(due.restoreNextRunAt).not.toHaveBeenCalled();
  });

  it("should give the slot back, not consume it, when the source is already running, and continue", async () => {
    vi.mocked(due.listDueNotionSources).mockResolvedValue([row("a"), row("b")]);
    vi.mocked(runNotionSource).mockResolvedValueOnce({ kind: "already_running" });

    const reports = await runDueNotionSources(new FakeNotionPageGateway(), () => NOW);

    expect(reports.map((r) => r.status)).toEqual(["already_running", "ok"]);
    expect(due.restoreNextRunAt).toHaveBeenCalledTimes(1);
    expect(due.settleNextRunAt).toHaveBeenCalledTimes(1);
  });

  it("should record a database error on claim as failed for that source and continue", async () => {
    vi.mocked(due.listDueNotionSources).mockResolvedValue([row("a"), row("b")]);
    vi.mocked(due.claimDueNotionSource).mockRejectedValueOnce(new Error("db down"));

    const reports = await runDueNotionSources(new FakeNotionPageGateway(), () => NOW);

    expect(reports.map((r) => [r.sourceId, r.status])).toEqual([
      ["a", "failed"],
      ["b", "ok"],
    ]);
  });

  it("should record a database error while settling as failed and continue", async () => {
    vi.mocked(due.listDueNotionSources).mockResolvedValue([row("a"), row("b")]);
    vi.mocked(due.settleNextRunAt).mockRejectedValueOnce(new Error("db down"));

    const reports = await runDueNotionSources(new FakeNotionPageGateway(), () => NOW);

    expect(reports.map((r) => r.status)).toEqual(["failed", "ok"]);
  });

  it("should stop starting new sources after the wall time and leave the rest due", async () => {
    vi.mocked(due.listDueNotionSources).mockResolvedValue([row("a"), row("b"), row("c")]);

    let clock = NOW.getTime();

    vi.mocked(runNotionSource).mockImplementation(async () => {
      clock += 130_000;

      return { kind: "finished", result: okResult };
    });

    const reports = await runDueNotionSources(new FakeNotionPageGateway(), () => new Date(clock), 240_000);

    expect(reports.map((r) => r.sourceId)).toEqual(["a", "b"]);
    expect(due.claimDueNotionSource).toHaveBeenCalledTimes(2);
  });
});
