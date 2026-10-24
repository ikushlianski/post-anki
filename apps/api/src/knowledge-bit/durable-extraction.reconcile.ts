import { log } from "../shared/log.js";
import { failProcessingSourcesWithEndedWorkflows } from "./knowledge-bit.repo.js";

// Independent of the flag: durable-owned rows can outlive a flag switched off. Read-only on the engine tables and a no-op when no such rows exist.
// Runs from the scheduled detect-bits job as well, so a crashed run is failed (and can be regenerated)
// even when no new extraction starts. Never throws: a failing query is logged and retried next call.
export async function reconcileDurableSources(): Promise<string[]> {
  try {
    const failed = await failProcessingSourcesWithEndedWorkflows(null);

    if (failed.length > 0) {
      log.warn({ failed }, "durable_extraction_scheduled_reconcile_marked_failed");
    }

    return failed;
  } catch (err) {
    log.error({ err }, "durable_extraction_scheduled_reconcile_failed");

    return [];
  }
}
