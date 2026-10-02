import { describe, expect, it, vi } from "vitest";
import type { NotionConnector } from "@post-anki/shared";

vi.mock("../facts/facts-embedding.orchestrator.js", () => ({
  embedFacts: vi.fn().mockResolvedValue({ embeddedCount: 0, reusedCount: 0, capped: false }),
}));

process.env.DATABASE_URL ??= "postgres://postanki:postanki@localhost:5578/postanki_dev";
process.env.OPENROUTER_API_KEY ??= "test-dummy-key";

const { runNotionSync } = await import("./notion-sync.orchestrator.js");

const dailyConnector: NotionConnector = {
  name: "nightly-digest",
  source: { kind: "page", id: "page-1" },
  tag: "SPA",
  destination: { kind: "fact" },
  removeAfterImport: false,
  intervalMinutes: 24 * 60,
  enabled: true,
};

const defaultCadenceConnector: NotionConnector = {
  name: "biz-education-spa",
  source: { kind: "page", id: "page-2" },
  tag: "SPA",
  destination: { kind: "fact" },
  removeAfterImport: false,
  enabled: true,
};

const disabledConnector: NotionConnector = {
  name: "paused-connector",
  source: { kind: "page", id: "page-3" },
  tag: "SPA",
  destination: { kind: "fact" },
  removeAfterImport: false,
  enabled: false,
};

function deps(lastRunAt: Date | null, now: Date) {
  return {
    readItems: vi.fn().mockResolvedValue([]),
    addTodo: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
    lastRunAt: vi.fn().mockResolvedValue(lastRunAt),
    recordRun: vi.fn().mockResolvedValue(undefined),
    now: () => now,
  };
}

describe("runNotionSync", () => {
  it("should skip a connector whose last run is still inside its own configured interval", async () => {
    const now = new Date("2026-10-02T12:00:00Z");
    const lastRunAt = new Date("2026-10-02T06:00:00Z");
    const d = deps(lastRunAt, now);

    const results = await runNotionSync([dailyConnector], d);

    expect(results).toEqual([]);
    expect(d.readItems).not.toHaveBeenCalled();
    expect(d.recordRun).not.toHaveBeenCalled();
  });

  it("should run a connector once its own configured interval has elapsed", async () => {
    const now = new Date("2026-10-02T12:00:00Z");
    const lastRunAt = new Date("2026-10-01T06:00:00Z");
    const d = deps(lastRunAt, now);

    const results = await runNotionSync([dailyConnector], d);

    expect(results).toEqual([{ connector: "nightly-digest", imported: 0, skipped: 0, failed: 0 }]);
    expect(d.readItems).toHaveBeenCalledTimes(1);
    expect(d.recordRun).toHaveBeenCalledWith("nightly-digest", now);
  });

  it("should run a connector with no prior recorded run regardless of its interval", async () => {
    const now = new Date("2026-10-02T12:00:00Z");
    const d = deps(null, now);

    const results = await runNotionSync([dailyConnector], d);

    expect(results).toEqual([{ connector: "nightly-digest", imported: 0, skipped: 0, failed: 0 }]);
    expect(d.readItems).toHaveBeenCalledTimes(1);
  });

  it("should keep running an unconfigured connector on every tick regardless of its last run", async () => {
    const now = new Date("2026-10-02T12:00:00Z");
    const lastRunAt = new Date("2026-10-02T11:59:00Z");
    const d = deps(lastRunAt, now);

    const results = await runNotionSync([defaultCadenceConnector], d);

    expect(results).toEqual([{ connector: "biz-education-spa", imported: 0, skipped: 0, failed: 0 }]);
    expect(d.readItems).toHaveBeenCalledTimes(1);
    expect(d.lastRunAt).not.toHaveBeenCalled();
    expect(d.recordRun).not.toHaveBeenCalled();
  });

  it("should skip a disabled connector entirely, never checking its cadence or reading items", async () => {
    const now = new Date("2026-10-02T12:00:00Z");
    const d = deps(null, now);

    const results = await runNotionSync([disabledConnector], d);

    expect(results).toEqual([]);
    expect(d.lastRunAt).not.toHaveBeenCalled();
    expect(d.readItems).not.toHaveBeenCalled();
    expect(d.recordRun).not.toHaveBeenCalled();
  });
});
