import { APIErrorCode, APIResponseError } from "@notionhq/client";
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

const spend = await import("../shared/spend-guard.js");
const runRepo = await import("./notion-ingestion-run.repo.js");
const { getNotionSourceRow } = await import("./notion-ingestion-source.repo.js");
const { findExistingImportKeys } = await import("../knowledge-source/phrase-knowledge-source.repo.js");
const { importPhraseLines } = await import("../knowledge-source/phrase-import.service.js");
const { runNotionSource, FINISH_FAILED_CODE, MAX_PAGE_BLOCKS } = await import("./run-notion-source.js");

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

function gatewayWith(count: number): FakeNotionPageGateway {
  const gateway = new FakeNotionPageGateway();

  gateway.setPage(
    PAGE,
    Array.from({ length: count }, (_, i) => ({ id: `blk_${i}`, text: `phrase number ${String.fromCharCode(97 + (i % 26))}${i}` })),
  );

  return gateway;
}

function run(row: NotionSourceRow, gateway: FakeNotionPageGateway) {
  vi.mocked(getNotionSourceRow).mockResolvedValue(row);

  return runNotionSource(row, "manual", gateway);
}

function recordedErrorCode(): unknown {
  return vi.mocked(runRepo.finishNotionRun).mock.calls[0]?.[3];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(runRepo.startNotionRun).mockResolvedValue({ kind: "started", runId: "nir_1" });
  vi.mocked(findExistingImportKeys).mockResolvedValue(new Set());
  vi.mocked(spend.assertLlmBudgetAvailable).mockResolvedValue();
  vi.mocked(importPhraseLines).mockImplementation(async ({ lines }) => ({
    received: lines.length,
    imported: lines.length,
    skippedExisting: 0,
    ignored: 0,
    duplicatesInInput: 0,
    importedKeys: lines.map((line) => `phrase:${line.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").trim()}`),
  }));
});

describe("runNotionSource failure codes", () => {
  it("should record budget_check_unavailable when the spend check cannot be read", async () => {
    vi.mocked(spend.assertLlmBudgetAvailable).mockRejectedValue(new spend.LlmBudgetCheckUnavailableError("unavailable"));

    const outcome = await run(source(), gatewayWith(1));

    expect(recordedErrorCode()).toBe("budget_check_unavailable");
    expect(outcome).toMatchObject({ result: { status: "failed" } });
  });

  it("should record the Notion error code when Notion rejects the read", async () => {
    const gateway = gatewayWith(1);

    gateway.readError = new APIResponseError({
      code: APIErrorCode.ObjectNotFound,
      status: 404,
      message: "page not shared",
      headers: {},
      rawBodyText: "",
      additional_data: undefined,
      request_id: undefined,
    });

    await run(source(), gateway);

    expect(recordedErrorCode()).toBe("notion_object_not_found");
  });

  it("should record run_failed for any other unexpected error", async () => {
    const gateway = gatewayWith(1);

    gateway.readError = new Error("boom");
    await run(source(), gateway);

    expect(recordedErrorCode()).toBe("run_failed");
  });

  it("should mark the run failed with run_finish_failed when the first close hits a database error", async () => {
    vi.mocked(runRepo.finishNotionRun).mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce();

    const outcome = await run(source(), gatewayWith(1));

    expect(vi.mocked(runRepo.finishNotionRun).mock.calls[1]?.[1]).toBe("failed");
    expect(vi.mocked(runRepo.finishNotionRun).mock.calls[1]?.[3]).toBe(FINISH_FAILED_CODE);
    expect(outcome).toMatchObject({ kind: "finished", result: { status: "ok", imported: 1 } });
  });

  it("should still answer the caller when closing the run fails twice", async () => {
    vi.mocked(runRepo.finishNotionRun).mockRejectedValue(new Error("db down"));

    await expect(run(source(), gatewayWith(1))).resolves.toMatchObject({ kind: "finished" });
  });
});

describe("runNotionSource page limits", () => {
  it("should flag a page longer than the block cap so the user knows later phrases were not read", async () => {
    const outcome = await run(source({ itemsPerRun: 1 }), gatewayWith(MAX_PAGE_BLOCKS + 5));

    expect(outcome).toMatchObject({ result: { truncated: true } });
  });

  it("should not flag a page that fits within the block cap", async () => {
    const outcome = await run(source(), gatewayWith(3));

    expect(outcome).toMatchObject({ result: { truncated: false } });
  });

  it("should report how many new phrases wait after the per-run limit", async () => {
    const outcome = await run(source({ itemsPerRun: 2 }), gatewayWith(5));

    expect(outcome).toMatchObject({ result: { imported: 2, pendingAfterLimit: 3 } });
  });
});
