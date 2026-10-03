import { containsQuestion } from "@post-anki/core";
import { log } from "../shared/log.js";
import { insertFactWithTopic } from "../facts/facts.repo.js";
import { listUnsyncedTaggedRows, type BizEducationRow } from "./biz-education.client.js";
import { classifyRow, type ClassificationResult } from "./classify-row.js";
import type { HierarchyTopic } from "./distiller.repo.js";
import {
  insertContentInboxRow,
  listHierarchyForClassification,
  recordDistillFailure,
} from "./distiller.repo.js";
import { markRowSynced } from "./mark-row-synced.js";

// Bounded retry count for a row that fails distillRow every run, matching
// AGENT_GENERATE_RETRIES's small-retry-bound convention (generate-with-retry.ts).
const MAX_DISTILL_FAILURES = 3;

export interface DistillerDeps {
  fetchRows: () => Promise<BizEducationRow[]>;
  listHierarchy: () => Promise<HierarchyTopic[]>;
  classify: (noteText: string, hierarchy: HierarchyTopic[]) => Promise<ClassificationResult>;
  insertFact: (input: {
    body: string;
    source: string;
    sourceRef: string;
    tags: string[];
    topicId: string;
  }) => Promise<void>;
  insertInboxRow: (input: {
    body: string;
    sourceRef: string;
    suggestedPlacement: string;
  }) => Promise<void>;
  markSynced: (pageId: string) => Promise<void>;
  recordFailure: (sourceRef: string) => Promise<number>;
}

export function defaultDistillerDeps(): DistillerDeps {
  return {
    fetchRows: listUnsyncedTaggedRows,
    listHierarchy: listHierarchyForClassification,
    classify: classifyRow,
    insertFact: insertFactWithTopic,
    insertInboxRow: insertContentInboxRow,
    markSynced: markRowSynced,
    recordFailure: recordDistillFailure,
  };
}

export interface DistillResult {
  processed: string[];
  skipped: string[];
  failed: string[];
  gaveUp: string[];
  markSyncedFailed: string[];
}

async function distillRow(row: BizEducationRow, deps: DistillerDeps): Promise<void> {
  const hierarchy = await deps.listHierarchy();
  const classification = await deps.classify(row.text, hierarchy);

  if (classification.matchedTopicId) {
    await deps.insertFact({
      body: row.text,
      source: "notion:biz-education",
      sourceRef: `notion:${row.id}`,
      tags: row.tags,
      topicId: classification.matchedTopicId,
    });

    return;
  }

  await deps.insertInboxRow({
    body: row.text,
    sourceRef: `notion:${row.id}`,
    suggestedPlacement: classification.suggestedPlacement ?? "",
  });
}

// Below the bound, leave the row unsynced so it retries next run. At the
// bound, route it to the content inbox and mark it synced so it stops
// occupying the 20-oldest-unsynced window.
async function handleDistillRowFailure(
  row: BizEducationRow,
  deps: DistillerDeps,
  result: DistillResult,
): Promise<void> {
  const sourceRef = `notion:${row.id}`;
  let failureCount: number;

  try {
    failureCount = await deps.recordFailure(sourceRef);
  } catch (err) {
    log.error({ err, notionId: row.id }, "biz_education_record_failure_failed");
    result.failed.push(row.id);

    return;
  }

  if (failureCount < MAX_DISTILL_FAILURES) {
    result.failed.push(row.id);

    return;
  }

  try {
    await deps.insertInboxRow({
      body: row.text,
      sourceRef,
      suggestedPlacement: `Distilling failed ${failureCount} runs in a row; needs manual placement.`,
    });
    result.gaveUp.push(row.id);
  } catch (err) {
    log.error({ err, notionId: row.id }, "biz_education_give_up_inbox_insert_failed");
    result.failed.push(row.id);
  }
}

export async function distillBizEducation(
  deps: DistillerDeps = defaultDistillerDeps(),
): Promise<DistillResult> {
  const pulled = await deps.fetchRows();
  const result: DistillResult = {
    processed: [],
    skipped: [],
    failed: [],
    gaveUp: [],
    markSyncedFailed: [],
  };

  for (const row of pulled) {
    if (containsQuestion(row.text)) {
      result.skipped.push(row.id);
      continue;
    }

    try {
      await distillRow(row, deps);
      result.processed.push(row.id);
    } catch (err) {
      log.error({ err, notionId: row.id }, "biz_education_distill_row_failed");
      await handleDistillRowFailure(row, deps, result);
    }
  }

  for (const id of [...result.processed, ...result.skipped, ...result.gaveUp]) {
    try {
      await deps.markSynced(id);
    } catch (err) {
      result.markSyncedFailed.push(id);
      log.error({ err, notionId: id }, "biz_education_mark_synced_failed");
    }
  }

  log.info(result, "biz_education_distill_done");

  return result;
}
