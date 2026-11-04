import { APIResponseError } from "@notionhq/client";
import { parsePhraseLines } from "@post-anki/core";
import { MAX_PHRASE_LINE_LENGTH, type NotionRunResult } from "@post-anki/shared";
import { findExistingImportKeys } from "../knowledge-source/phrase-knowledge-source.repo.js";
import { importPhraseLines } from "../knowledge-source/phrase-import.service.js";
import { log } from "../shared/log.js";
import {
  assertLlmBudgetAvailable,
  LlmBudgetCheckUnavailableError,
  LlmBudgetExceededError,
} from "../shared/spend-guard.js";
import { finishNotionRun, startNotionRun, type RunTrigger } from "./notion-ingestion-run.repo.js";
import { getNotionSourceRow, type NotionSourceRow } from "./notion-ingestion-source.repo.js";
import { NotionNotConnectedError, type NotionPageGateway, type NotionPageRead } from "./notion-page.gateway.js";

export const MAX_PAGE_BLOCKS = 500;

export type RunNotionSourceOutcome =
  | { kind: "already_running" }
  | { kind: "source_missing" }
  | { kind: "finished"; result: NotionRunResult };

type RunCounts = Omit<NotionRunResult, "status">;

const EMPTY_COUNTS: RunCounts = {
  read: 0,
  imported: 0,
  skippedExisting: 0,
  ignored: 0,
  removed: 0,
  removeFailed: 0,
  truncated: false,
  pendingAfterLimit: 0,
};

export const FINISH_FAILED_CODE = "run_finish_failed";

function errorCodeOf(err: unknown): string {
  if (err instanceof LlmBudgetCheckUnavailableError) {
    return "budget_check_unavailable";
  }

  if (err instanceof APIResponseError) {
    return `notion_${err.code}`;
  }

  return "run_failed";
}

interface Candidate {
  itemId: string;
  text: string;
  key: string;
  unsure: boolean;
}

function pickCandidates(items: { id: string; text: string }[]): { candidates: Candidate[]; ignored: number } {
  const candidates: Candidate[] = [];
  let ignored = 0;

  for (const item of items) {
    const parsed =
      item.text.length > MAX_PHRASE_LINE_LENGTH ? null : parsePhraseLines([item.text]).phrases[0];

    if (parsed) {
      candidates.push({ itemId: item.id, text: item.text, key: parsed.key, unsure: parsed.unsure });
    } else {
      ignored += 1;
    }
  }

  return { candidates, ignored };
}

async function importNew(
  source: NotionSourceRow,
  items: { id: string; text: string }[],
): Promise<{ counts: RunCounts; imported: Candidate[] }> {
  const { candidates, ignored } = pickCandidates(items);
  const existing = await findExistingImportKeys(candidates.map((candidate) => candidate.key));
  const seen = new Map<string, Candidate>();
  const fresh: Candidate[] = [];
  let skippedExisting = 0;

  for (const candidate of candidates) {
    const kept = seen.get(candidate.key);

    if (existing.has(candidate.key)) {
      skippedExisting += 1;
    } else if (kept) {
      skippedExisting += 1;

      if (candidate.unsure && !kept.unsure) {
        kept.text = candidate.text;
        kept.unsure = true;
      }
    } else {
      const entry = { ...candidate };

      seen.set(entry.key, entry);
      fresh.push(entry);
    }
  }

  const batch = fresh.slice(0, source.itemsPerRun);
  const counts: RunCounts = {
    ...EMPTY_COUNTS,
    read: items.length,
    skippedExisting,
    ignored,
    pendingAfterLimit: fresh.length - batch.length,
  };

  if (batch.length === 0) {
    return { counts, imported: [] };
  }

  const result = await importPhraseLines({
    lines: batch.map((candidate) => candidate.text),
    subjectId: source.subjectId,
  });
  const importedKeys = new Set(result.importedKeys);

  return {
    counts: { ...counts, imported: result.imported, skippedExisting: skippedExisting + result.skippedExisting },
    imported: batch.filter((candidate) => importedKeys.has(candidate.key)),
  };
}

async function removeImported(
  source: NotionSourceRow,
  gateway: NotionPageGateway,
  imported: Candidate[],
): Promise<{ removed: number; removeFailed: number }> {
  if (!source.removeAfterImport || imported.length === 0) {
    return { removed: 0, removeFailed: 0 };
  }

  const ids = imported.map((candidate) => candidate.itemId);
  const result = await gateway.removeItems(source.pageId, ids).catch((err: unknown) => {
    log.warn({ sourceId: source.id, err }, "notion_item_remove_error");

    return { removed: [], failed: ids };
  });

  for (const blockId of result.removed) {
    log.info({ sourceId: source.id, blockId }, "notion_item_removed");
  }

  for (const blockId of result.failed) {
    log.warn({ sourceId: source.id, blockId }, "notion_item_remove_failed");
  }

  return { removed: result.removed.length, removeFailed: result.failed.length };
}

async function executeRun(source: NotionSourceRow, gateway: NotionPageGateway): Promise<NotionRunResult> {
  try {
    await assertLlmBudgetAvailable();
  } catch (err) {
    if (err instanceof LlmBudgetExceededError) {
      return { status: "skipped_budget", ...EMPTY_COUNTS };
    }

    throw err;
  }

  let read: NotionPageRead;

  try {
    read = await gateway.readItems(source.pageId, MAX_PAGE_BLOCKS);
  } catch (err) {
    if (err instanceof NotionNotConnectedError) {
      return { status: "skipped_no_connection", ...EMPTY_COUNTS };
    }

    throw err;
  }

  const { counts, imported } = await importNew(source, read.items);
  const removal = await removeImported(source, gateway, imported);

  return {
    status: removal.removeFailed > 0 ? "partial" : "ok",
    ...counts,
    ...removal,
    truncated: read.truncated,
  };
}

async function closeRun(
  runId: string,
  status: NotionRunResult["status"],
  counts: RunCounts,
  errorCode: string | null,
  now: () => Date,
): Promise<void> {
  try {
    await finishNotionRun(runId, status, counts, errorCode, now());
    return;
  } catch (err) {
    log.error({ runId, err }, "notion_run_finish_failed");
  }

  try {
    await finishNotionRun(runId, "failed", EMPTY_COUNTS, FINISH_FAILED_CODE, now());
  } catch (err) {
    log.error({ runId, err }, "notion_run_finish_fallback_failed");
  }
}

export async function runNotionSource(
  source: NotionSourceRow,
  trigger: RunTrigger,
  gateway: NotionPageGateway,
  now: () => Date = () => new Date(),
): Promise<RunNotionSourceOutcome> {
  const started = await startNotionRun(source.id, trigger, now());

  if (started.kind !== "started") {
    return { kind: started.kind === "busy" ? "already_running" : "source_missing" };
  }

  const current = await getNotionSourceRow(source.id);

  if (!current) {
    return { kind: "source_missing" };
  }

  const runId = started.runId;

  let result: NotionRunResult;
  let errorCode: string | null = null;

  try {
    result = await executeRun(current, gateway);
  } catch (err) {
    errorCode = errorCodeOf(err);
    result = { status: "failed", ...EMPTY_COUNTS };
    log.error({ sourceId: current.id, errorCode }, "notion_source_run_failed");
  }

  const { status, ...counts } = result;

  await closeRun(runId, status, counts, errorCode, now);

  return { kind: "finished", result };
}
