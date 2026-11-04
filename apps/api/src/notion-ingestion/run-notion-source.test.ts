import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotionSourceRow } from "./notion-ingestion-source.repo.js";
import { FakeNotionPageGateway } from "./fake-notion-page.gateway.js";

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../shared/spend-guard.js", async () => {
  class LlmBudgetExceededError extends Error {}
  class LlmBudgetCheckUnavailableError extends Error {}

  return { assertLlmBudgetAvailable: vi.fn(), LlmBudgetExceededError, LlmBudgetCheckUnavailableError };
});
vi.mock("./notion-ingestion-source.repo.js", () => ({ getNotionSourceRow: vi.fn() }));
vi.mock("./notion-ingestion-run.repo.js", () => ({ startNotionRun: vi.fn(), finishNotionRun: vi.fn() }));
vi.mock("../knowledge-source/phrase-knowledge-source.repo.js", () => ({ findExistingImportKeys: vi.fn() }));
vi.mock("../knowledge-source/phrase-import.service.js", () => ({ importPhraseLines: vi.fn() }));

const { log } = await import("../shared/log.js");
const spend = await import("../shared/spend-guard.js");
const runRepo = await import("./notion-ingestion-run.repo.js");
const { getNotionSourceRow } = await import("./notion-ingestion-source.repo.js");
const { findExistingImportKeys } = await import("../knowledge-source/phrase-knowledge-source.repo.js");
const { importPhraseLines } = await import("../knowledge-source/phrase-import.service.js");
const { runNotionSource: runNotionSourceRaw } = await import("./run-notion-source.js");

function runNotionSource(...args: Parameters<typeof runNotionSourceRaw>) {
  vi.mocked(getNotionSourceRow).mockResolvedValue(args[0]);

  return runNotionSourceRaw(...args);
}

const PAGE = "0123456789abcdef0123456789abcdef";

function source(overrides: Partial<NotionSourceRow> = {}): NotionSourceRow {
  return {
    id: "nis_1",
    name: "Phrases",
    pageId: PAGE,
    pageUrl: `https://www.notion.so/P-${PAGE}`,
    subjectId: "sub_it",
    pipeline: "meeting_phrases",
    itemsPerRun: 20,
    frequency: "manual",
    removeAfterImport: false,
    paused: false,
    nextRunAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function gatewayWith(...texts: string[]): FakeNotionPageGateway {
  const gateway = new FakeNotionPageGateway();

  gateway.setPage(
    PAGE,
    texts.map((text, i) => ({ id: `blk_${i}`, text })),
  );

  return gateway;
}

function keyOf(text: string): string {
  return `phrase:${text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").trim()}`;
}

function importsEverything(): void {
  vi.mocked(importPhraseLines).mockImplementation(async ({ lines }) => ({
    received: lines.length,
    imported: lines.length,
    skippedExisting: 0,
    ignored: 0,
    duplicatesInInput: 0,
    importedKeys: lines.map(keyOf),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(runRepo.startNotionRun).mockResolvedValue({ kind: "started", runId: "nir_1" });
  vi.mocked(findExistingImportKeys).mockResolvedValue(new Set());
  vi.mocked(spend.assertLlmBudgetAvailable).mockResolvedValue();
  importsEverything();
});

describe("runNotionSource", () => {
  it("should import at most the per-run cap of new phrases", async () => {
    const gateway = gatewayWith("touch base", "circle back", "loop in", "reach out");

    const outcome = await runNotionSource(source({ itemsPerRun: 2 }), "manual", gateway);

    expect(vi.mocked(importPhraseLines).mock.calls[0]?.[0].lines).toEqual(["touch base", "circle back"]);
    expect(outcome).toMatchObject({ kind: "finished", result: { status: "ok", imported: 2 } });
  });

  it("should skip already imported lines before counting so a kept page does not stall", async () => {
    vi.mocked(findExistingImportKeys).mockResolvedValue(new Set([keyOf("touch base"), keyOf("circle back")]));

    const gateway = gatewayWith("touch base", "circle back", "loop in", "reach out");

    const outcome = await runNotionSource(source({ itemsPerRun: 2 }), "manual", gateway);

    expect(vi.mocked(importPhraseLines).mock.calls[0]?.[0].lines).toEqual(["loop in", "reach out"]);
    expect(outcome).toMatchObject({ result: { skippedExisting: 2, imported: 2 } });
  });

  it("should import the unsure version of a phrase repeated on the page", async () => {
    const gateway = gatewayWith("wrap it up", "loop in", "wrap it up ???");

    const outcome = await runNotionSource(source(), "manual", gateway);

    expect(vi.mocked(importPhraseLines).mock.calls[0]?.[0].lines).toEqual(["wrap it up ???", "loop in"]);
    expect(outcome).toMatchObject({ result: { imported: 2, skippedExisting: 1 } });
  });

  it("should count lines over 500 characters and non-phrases as ignored", async () => {
    const gateway = gatewayWith("x".repeat(501), "привет", "touch base");

    const outcome = await runNotionSource(source(), "manual", gateway);

    expect(outcome).toMatchObject({ result: { read: 3, ignored: 2, imported: 1 } });
  });

  it("should leave the Notion page untouched when removal is off", async () => {
    const gateway = gatewayWith("touch base");

    await runNotionSource(source({ removeAfterImport: false }), "manual", gateway);

    expect(gateway.removeCalls).toBe(0);
    expect(gateway.removedIds).toEqual([]);
  });

  it("should remove exactly the items it imported when removal is on", async () => {
    vi.mocked(findExistingImportKeys).mockResolvedValue(new Set([keyOf("circle back")]));

    const gateway = gatewayWith("touch base", "circle back", "loop in");

    const outcome = await runNotionSource(source({ removeAfterImport: true, itemsPerRun: 1 }), "manual", gateway);

    expect(gateway.removedIds).toEqual(["blk_0"]);
    expect(outcome).toMatchObject({ result: { status: "ok", imported: 1, removed: 1 } });
  });

  it("should not remove an item whose import was skipped", async () => {
    vi.mocked(importPhraseLines).mockResolvedValue({
      received: 2,
      imported: 1,
      skippedExisting: 1,
      ignored: 0,
      duplicatesInInput: 0,
      importedKeys: [keyOf("loop in")],
    });

    const gateway = gatewayWith("touch base", "loop in");

    await runNotionSource(source({ removeAfterImport: true }), "manual", gateway);

    expect(gateway.removedIds).toEqual(["blk_1"]);
  });

  it("should not remove anything when the import itself fails", async () => {
    vi.mocked(importPhraseLines).mockRejectedValue(new Error("db down"));

    const gateway = gatewayWith("touch base");

    const outcome = await runNotionSource(source({ removeAfterImport: true }), "manual", gateway);

    expect(gateway.removeCalls).toBe(0);
    expect(outcome).toMatchObject({ result: { status: "failed" } });
    expect(runRepo.finishNotionRun).toHaveBeenCalledWith("nir_1", "failed", expect.anything(), "run_failed", expect.any(Date));
  });

  it("should report partial and keep the import when a removal fails", async () => {
    const gateway = gatewayWith("touch base", "loop in");

    gateway.failRemovalFor.add("blk_1");

    const outcome = await runNotionSource(source({ removeAfterImport: true }), "manual", gateway);

    expect(outcome).toMatchObject({ result: { status: "partial", imported: 2, removed: 1, removeFailed: 1 } });
  });

  it("should import nothing and read nothing when the daily budget is used up", async () => {
    vi.mocked(spend.assertLlmBudgetAvailable).mockRejectedValue(new spend.LlmBudgetExceededError(5, 5));

    const gateway = gatewayWith("touch base");

    const outcome = await runNotionSource(source(), "manual", gateway);

    expect(outcome).toMatchObject({ result: { status: "skipped_budget", imported: 0 } });
    expect(gateway.readCalls).toBe(0);
    expect(importPhraseLines).not.toHaveBeenCalled();
  });

  it("should record skipped_no_connection when no Notion token is configured", async () => {
    const gateway = gatewayWith("touch base");

    gateway.connected = false;

    const outcome = await runNotionSource(source(), "manual", gateway);

    expect(outcome).toMatchObject({ result: { status: "skipped_no_connection" } });
    expect(importPhraseLines).not.toHaveBeenCalled();
  });

  it("should add nothing on a repeated run once the phrases exist", async () => {
    const gateway = gatewayWith("touch base");

    vi.mocked(findExistingImportKeys).mockResolvedValue(new Set([keyOf("touch base")]));

    const outcome = await runNotionSource(source(), "manual", gateway);

    expect(importPhraseLines).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ result: { status: "ok", imported: 0, skippedExisting: 1 } });
  });

  it("should store only a short code when the run throws", async () => {
    const gateway = gatewayWith("touch base");

    gateway.readError = new Error("secret_token_abc leaked in provider message");

    await runNotionSource(source(), "manual", gateway);

    const finishArgs = vi.mocked(runRepo.finishNotionRun).mock.calls[0];

    expect(finishArgs?.[3]).toBe("run_failed");
    expect(JSON.stringify(vi.mocked(log.error).mock.calls)).not.toContain("secret_token_abc");
  });

  it("should answer already_running without touching Notion when a run is in progress", async () => {
    vi.mocked(runRepo.startNotionRun).mockResolvedValue({ kind: "busy" });

    const gateway = gatewayWith("touch base");
    const outcome = await runNotionSource(source(), "manual", gateway);

    expect(outcome).toEqual({ kind: "already_running" });
    expect(gateway.readCalls).toBe(0);
  });

  it("should log a removal with source and block ids but no item text", async () => {
    const gateway = gatewayWith("touch base secret phrase");

    await runNotionSource(source({ removeAfterImport: true }), "manual", gateway);

    expect(log.info).toHaveBeenCalledWith({ sourceId: "nis_1", blockId: "blk_0" }, "notion_item_removed");
    expect(JSON.stringify(vi.mocked(log.info).mock.calls)).not.toContain("secret phrase");
  });

  it("should not remove a block that has nested children and should report partial", async () => {
    const gateway = gatewayWith("touch base", "loop in");

    gateway.blocksWithChildren.add("blk_0");

    const outcome = await runNotionSource(source({ removeAfterImport: true }), "manual", gateway);

    expect(gateway.removedIds).toEqual(["blk_1"]);
    expect(outcome).toMatchObject({ result: { status: "partial", imported: 2, removed: 1, removeFailed: 1 } });
  });

  it("should honour a removal switch turned on after the source row was first read", async () => {
    const gateway = gatewayWith("touch base");
    const stale = source({ removeAfterImport: false });

    vi.mocked(getNotionSourceRow).mockResolvedValue(source({ removeAfterImport: true }));
    await runNotionSourceRaw(stale, "manual", gateway);

    expect(gateway.removedIds).toEqual(["blk_0"]);
  });

  it("should not remove anything when the removal switch was turned off during the wait", async () => {
    const gateway = gatewayWith("touch base");

    vi.mocked(getNotionSourceRow).mockResolvedValue(source({ removeAfterImport: false }));
    await runNotionSourceRaw(source({ removeAfterImport: true }), "manual", gateway);

    expect(gateway.removeCalls).toBe(0);
  });

  it("should stop without reading Notion when the source was deleted before the run began", async () => {
    const gateway = gatewayWith("touch base");

    vi.mocked(getNotionSourceRow).mockResolvedValue(null);

    expect(await runNotionSourceRaw(source(), "manual", gateway)).toEqual({ kind: "source_missing" });
    expect(gateway.readCalls).toBe(0);
  });

  it("should stop when the source vanished while starting the run", async () => {
    vi.mocked(runRepo.startNotionRun).mockResolvedValue({ kind: "source_missing" });

    expect(await runNotionSource(source(), "manual", gatewayWith("x"))).toEqual({ kind: "source_missing" });
  });
});
