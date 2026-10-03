import { containsQuestion } from "@post-anki/core";
import { log } from "../shared/log.js";
import { insertFactWithTopic } from "../facts/facts.repo.js";
import { listUnsyncedTaggedRows, type BizEducationRow } from "./biz-education.client.js";
import { classifyRow, type ClassificationResult } from "./classify-row.js";
import type { HierarchyTopic } from "./distiller.repo.js";
import { insertContentInboxRow, listHierarchyForClassification } from "./distiller.repo.js";
import { markRowSynced } from "./mark-row-synced.js";

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
}

export function defaultDistillerDeps(): DistillerDeps {
  return {
    fetchRows: listUnsyncedTaggedRows,
    listHierarchy: listHierarchyForClassification,
    classify: classifyRow,
    insertFact: insertFactWithTopic,
    insertInboxRow: insertContentInboxRow,
    markSynced: markRowSynced,
  };
}

export interface DistillResult {
  processed: string[];
  skipped: string[];
  failed: string[];
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

export async function distillBizEducation(
  deps: DistillerDeps = defaultDistillerDeps(),
): Promise<DistillResult> {
  const pulled = await deps.fetchRows();
  const result: DistillResult = { processed: [], skipped: [], failed: [], markSyncedFailed: [] };

  for (const row of pulled) {
    if (containsQuestion(row.text)) {
      result.skipped.push(row.id);
      continue;
    }

    try {
      await distillRow(row, deps);
      result.processed.push(row.id);
    } catch (err) {
      result.failed.push(row.id);
      log.error({ err, notionId: row.id }, "biz_education_distill_row_failed");
    }
  }

  for (const id of [...result.processed, ...result.skipped]) {
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
