import type { TriggerSubjectSuggestionScanResult } from "@post-anki/shared";
import { log } from "../shared/log.js";
import { LlmBudgetExceededError } from "../shared/spend-guard.js";
import type { ScanContext, ScanDeps, ScanState } from "./subject-suggestion-scan.types.js";
import { suggestNewSubjects } from "./subject-suggestion-new-subject.js";
import { suggestSubSubjects } from "./subject-suggestion-sub-subjects.js";
import {
  SUBJECT_SUGGESTION_MAX_POOL_BITS,
  SUBJECT_SUGGESTION_MIN_UNPLACED_BITS,
} from "./subject-suggestion.config.js";

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function runSubjectSuggestionScanWith(
  deps: ScanDeps,
  options: { ignoreDailyCap: boolean },
): Promise<TriggerSubjectSuggestionScanResult> {
  const unplaced = await deps.evidence.listUnplacedBits(SUBJECT_SUGGESTION_MAX_POOL_BITS);
  const lastRun = await deps.store.getLastRun();

  if (!options.ignoreDailyCap) {
    const ranToday = lastRun !== null && utcDay(lastRun.ranAt) === utcDay(deps.now());
    const grown = unplaced.length - (lastRun?.poolSize ?? 0);

    if (ranToday || grown < SUBJECT_SUGGESTION_MIN_UNPLACED_BITS) {
      return { created: 0, skipped: 0, calls: 0, budgetStopped: false };
    }
  }

  const state: ScanState = { calls: 0, created: 0, skipped: 0 };
  let budgetStopped = false;

  try {
    const subjects = await deps.evidence.listSubjects();
    const missing = subjects.filter((subject) => subject.embedding === null);
    const embeddings = new Map(
      subjects.flatMap((s) => (s.embedding ? [[s.id, s.embedding] as const] : [])),
    );

    let embedded = true;

    if (missing.length > 0) {
      try {
        for (const [id, embedding] of await deps.embedMissingSubjects(missing)) {
          embeddings.set(id, embedding);
        }
      } catch (err) {
        log.error({ err }, "subject_suggestion_subject_embedding_failed");
        embedded = false;
      }
    }

    if (embedded) {
      const ctx: ScanContext = { deps, state, subjects };

      await suggestNewSubjects(ctx, unplaced, embeddings);
      await suggestSubSubjects(ctx, await deps.evidence.countBitsBySubject());
    }
  } catch (err) {
    if (!(err instanceof LlmBudgetExceededError)) {
      throw err;
    }

    budgetStopped = true;
    log.warn({ calls: state.calls }, "subject_suggestion_budget_reached");
  }

  await deps.store.recordRun({
    trigger: options.ignoreDailyCap ? "manual" : "daily",
    calls: state.calls,
    created: state.created,
    poolSize: unplaced.length,
  });

  return { created: state.created, skipped: state.skipped, calls: state.calls, budgetStopped };
}
